import { useEffect, useState, useCallback, useRef } from "react";
import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  getDocs,
  where,
  serverTimestamp,
  limit,
} from "./firebase";
import "./App.css";
import QuizHome from "./quiz/QuizHome";
import QuizPlayer from "./quiz/QuizPlayer";
import {
  collectNicknameMatches,
  choosePreferredNicknameMatch,
  getNicknameMatchCurrentTotal,
} from "./memberIdentity";
import {
  getRoutineForStorageLoad,
  rolloverRoutineDone,
} from "./routineState";
import { shouldShowMemberEventName } from "./eventVisibility";
import {
  addChallengeGoalOption,
  getChallengeTitle,
  normalizeChallengeGoalOptions,
  removeChallengeGoalOption,
} from "./challengeGoalOptions";
import {
  createCompletedChallengeItem,
  createPlannedChallengeItems,
  getChallengeProgress,
  normalizeChallengeItem,
  toggleChallengeItemDone,
} from "./challengeProgress";
/* ── 유틸 ── */
// 새벽 2시 기준: 2시 이전이면 전날로 취급
function getEffectiveDate() {
  const now = new Date();
  const adjusted = new Date(now);
  if (now.getHours() < 2) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted;
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

const todayKey = () => formatLocalDateKey(getEffectiveDate());

function weekKey() {
  const d = getEffectiveDate();
  const day = d.getDay();
  // 월요일 기준 (일요일=0 → 전 주로)
  d.setDate(d.getDate() - ((day + 6) % 7));
  return formatLocalDateKey(d);
}

function legacyWeekKey() {
  const d = getEffectiveDate();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return formatUtcDateKey(d);
}

function nextMondayLabel() {
  const d = getEffectiveDate();
  const day = d.getDay();
  const daysUntilMon = (8 - day) % 7 || 7;
  const next = new Date(d);
  next.setDate(next.getDate() + daysUntilMon);
  return `${next.getMonth() + 1}/${next.getDate()}(월)`;
}

function previousDayKeyFrom(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return formatLocalDateKey(d);
}

function weekKeyForDate(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return formatLocalDateKey(d);
}

function legacyWeekKeyForDate(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return formatUtcDateKey(d);
}

function isValidUid(uid) {
  return (
    typeof uid === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)
  );
}

function migrateStoredUidKeys(oldUid, nextUid) {
  if (!oldUid || oldUid === nextUid) return;

  const keyPairs = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    let nextKey = "";
    if (key.startsWith(`todoRoom_daily_${oldUid}_`)) {
      nextKey = key.replace(`todoRoom_daily_${oldUid}_`, `todoRoom_daily_${nextUid}_`);
    } else if (key.startsWith(`todoRoom_weekly_${oldUid}_`)) {
      nextKey = key.replace(`todoRoom_weekly_${oldUid}_`, `todoRoom_weekly_${nextUid}_`);
    } else if (key === `todoRoom:routine:${oldUid}`) {
      nextKey = `todoRoom:routine:${nextUid}`;
    }

    if (nextKey) keyPairs.push([key, nextKey]);
  }

  keyPairs.forEach(([oldKey, nextKey]) => {
    if (!localStorage.getItem(nextKey)) {
      localStorage.setItem(nextKey, localStorage.getItem(oldKey) || "");
    }
  });
}

function getUid() {
  let uid = localStorage.getItem("todoRoom_uid");
  if (!isValidUid(uid)) {
    const nextUid = crypto.randomUUID();
    migrateStoredUidKeys(uid, nextUid);
    uid = nextUid;
    localStorage.setItem("todoRoom_uid", nextUid);
  }
  return uid;
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}

function canWriteRemote() {
  return !isLocalDevHost();
}

function writeSetDoc(...args) {
  if (!canWriteRemote()) return Promise.resolve(false);
  return setDoc(...args);
}

function writeAddDoc(...args) {
  if (!canWriteRemote()) return Promise.resolve(false);
  return addDoc(...args);
}

function writeDeleteDoc(...args) {
  if (!canWriteRemote()) return Promise.resolve(false);
  return deleteDoc(...args);
}

function getSavedNickname() {
  return localStorage.getItem("todoRoom_nickname") || "";
}

function getSavedAvatar() {
  return localStorage.getItem("todoRoom_avatar") || "";
}

function loadStoredTodos(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredTodos(key, todos) {
  localStorage.setItem(key, JSON.stringify(todos));
}

function loadStoredEvents(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => ({
      id: e.id,
      name: typeof e.name === "string" ? e.name : "",
      date: typeof e.date === "string" ? e.date : "",
      isPublic: !!e.isPublic,
    }));
  } catch {
    return [];
  }
}

function saveStoredEvents(key, events) {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch { }
}

function loadStoredChallenges(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => ({
      id: c.id,
      title: typeof c.title === "string" ? c.title : "",
      goal: typeof c.goal === "number" && c.goal > 0 ? c.goal : null,
      items: Array.isArray(c.items)
        ? c.items.map(normalizeChallengeItem)
        : [],
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    }));
  } catch {
    return [];
  }
}

function saveStoredChallenges(key, challenges) {
  try {
    localStorage.setItem(key, JSON.stringify(challenges));
  } catch { }
}

const CHALLENGE_GOAL_OPTIONS_KEY = "todoRoom_challengeGoalOptions";

function loadChallengeGoalOptions() {
  try {
    const raw = localStorage.getItem(CHALLENGE_GOAL_OPTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeChallengeGoalOptions(parsed);
  } catch {
    return [];
  }
}

function saveChallengeGoalOptions(options) {
  try {
    localStorage.setItem(
      CHALLENGE_GOAL_OPTIONS_KEY,
      JSON.stringify(normalizeChallengeGoalOptions(options))
    );
  } catch { }
}

// {큰제목} / (소제목) 마커 파싱 — 괄호는 출력에서 제거.
function parseChallengeItemText(text) {
  const regex = /(\{[^}]+\}|\([^)]+\))/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      const plain = text.slice(last, m.index);
      if (plain.trim()) parts.push({ type: "plain", text: plain });
    }
    const raw = m[0];
    const inner = raw.slice(1, -1).trim();
    if (inner) {
      parts.push({ type: raw.startsWith("{") ? "big" : "small", text: inner });
    }
    last = m.index + raw.length;
  }
  if (last < text.length) {
    const tail = text.slice(last);
    if (tail.trim()) parts.push({ type: "plain", text: tail });
  }
  return parts.length ? parts : [{ type: "plain", text }];
}

function RichChallengeText({ text }) {
  const parts = parseChallengeItemText(text || "");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={`ctext-${p.type}`}>{p.text}</span>
      ))}
    </>
  );
}

function computeDayDiff(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = getEffectiveDate();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

function formatDDay(diff) {
  if (diff === null || diff === undefined) return "";
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${-diff}`;
}

function pickClosestEvent(events) {
  let best = null;
  let bestDiff = Infinity;
  (events || []).forEach((e) => {
    const diff = computeDayDiff(e.date);
    if (diff === null) return;
    if (diff < 0) return;
    if (diff < bestDiff) {
      best = e;
      bestDiff = diff;
    }
  });
  return best ? { event: best, diff: bestDiff } : null;
}

function normalizeNickname(nickname) {
  return nickname?.trim() || "";
}

function getTodoCount(todos) {
  return Array.isArray(todos) ? todos.length : 0;
}

function getMemberTodoTotal(member) {
  return getTodoCount(member?.todos) + getTodoCount(member?.weeklyTodos);
}

function getUpdatedAtValue(updatedAt) {
  if (!updatedAt) return 0;
  if (typeof updatedAt === "number") return updatedAt;
  if (typeof updatedAt.seconds === "number") return updatedAt.seconds;
  return 0;
}

function hasSameNickname(record, nickname) {
  const normalizedNickname = normalizeNickname(nickname);
  const recordNickname = normalizeNickname(record?.nickname);
  return !!normalizedNickname && recordNickname === normalizedNickname;
}

function choosePreferredRecord(a, b, todoKey = "todos") {
  if (!a) return b;
  if (!b) return a;

  const aTodoCount = getTodoCount(a[todoKey]);
  const bTodoCount = getTodoCount(b[todoKey]);

  if (aTodoCount !== bTodoCount) {
    return bTodoCount > aTodoCount ? b : a;
  }

  if (!!a.avatar !== !!b.avatar) {
    return b.avatar ? b : a;
  }

  return getUpdatedAtValue(b.updatedAt) > getUpdatedAtValue(a.updatedAt) ? b : a;
}

function mergeRecordsByNickname(records, todoKey = "todos") {
  const merged = new Map();

  records.forEach((record) => {
    const nicknameKey = normalizeNickname(record.nickname);
    const key = nicknameKey ? `nick:${nicknameKey}` : `id:${record.id}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...record,
        [todoKey]: Array.isArray(record[todoKey]) ? record[todoKey] : [],
      });
      return;
    }

    const preferred = choosePreferredRecord(existing, record, todoKey);
    const fallback = preferred === existing ? record : existing;

    merged.set(key, {
      ...existing,
      ...preferred,
      avatar: preferred.avatar || fallback.avatar || "",
      [todoKey]:
        getTodoCount(preferred[todoKey]) >= getTodoCount(fallback[todoKey])
          ? preferred[todoKey] || []
          : fallback[todoKey] || [],
    });
  });

  return Array.from(merged.values());
}

function getRecordIdentityKey(record) {
  const nicknameKey = normalizeNickname(record?.nickname);
  return nicknameKey ? `nick:${nicknameKey}` : `id:${record?.id}`;
}

// Attach routine data to display members by matching nickname.
// `todayKey` is used to know whether the friend's done flags are still valid today.
function attachRoutines(displayMembers, routineMembers, todayKey) {
  if (!routineMembers || !routineMembers.length) return displayMembers;
  const routineMap = new Map();
  routineMembers.forEach((rm) => {
    const key = normalizeNickname(rm.nickname);
    if (key) routineMap.set(key, rm);
  });
  return displayMembers.map((m) => {
    const key = normalizeNickname(m.nickname);
    const r = key ? routineMap.get(key) : null;
    if (!r) return m;
    const stale = (r.doneDate || "") !== todayKey;
    const items = (r.items || []).map((it) => ({
      ...it,
      done: stale ? false : !!it.done,
    }));
    return {
      ...m,
      routineItems: items,
      routineDoneDate: stale ? "" : (r.doneDate || ""),
    };
  });
}

// Attach challenge data to display members by matching nickname.
function attachChallenges(displayMembers, challengeMembers) {
  if (!challengeMembers || !challengeMembers.length) return displayMembers;
  const map = new Map();
  challengeMembers.forEach((cm) => {
    const key = normalizeNickname(cm.nickname);
    if (key) map.set(key, cm);
  });
  return displayMembers.map((m) => {
    const key = normalizeNickname(m.nickname);
    const cm = key ? map.get(key) : null;
    if (!cm) return m;
    return { ...m, challenges: cm.challenges || [] };
  });
}

// Attach event data to display members by matching nickname.
function attachEvents(displayMembers, eventMembers) {
  if (!eventMembers || !eventMembers.length) return displayMembers;
  const map = new Map();
  eventMembers.forEach((em) => {
    const key = normalizeNickname(em.nickname);
    if (key) map.set(key, em);
  });
  return displayMembers.map((m) => {
    const key = normalizeNickname(m.nickname);
    const em = key ? map.get(key) : null;
    if (!em) return m;
    return { ...m, events: em.events || [] };
  });
}

function mergeDisplayMembers(dailyMembers, weeklyMembers) {
  const merged = new Map();

  dailyMembers.forEach((member) => {
    const nicknameKey = normalizeNickname(member.nickname);
    const key = nicknameKey ? `nick:${nicknameKey}` : `id:${member.id}`;
    merged.set(key, {
      ...member,
      todos: member.todos || [],
      weeklyTodos: [],
      isMe: false,
    });
  });

  weeklyMembers.forEach((member) => {
    const nicknameKey = normalizeNickname(member.nickname);
    const key = nicknameKey ? `nick:${nicknameKey}` : `id:${member.id}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        id: member.id,
        nickname: member.nickname,
        avatar: member.avatar,
        todos: [],
        weeklyTodos: member.todos || [],
        isMe: false,
      });
      return;
    }

    const preferred = choosePreferredRecord(existing, member, "todos");
    merged.set(key, {
      ...existing,
      id: preferred.id || existing.id,
      nickname: preferred.nickname || existing.nickname,
      avatar: existing.avatar || member.avatar || "",
      weeklyTodos:
        getTodoCount(existing.weeklyTodos) >= getTodoCount(member.todos)
          ? existing.weeklyTodos
          : member.todos || [],
      isMe: false,
    });
  });

  return Array.from(merged.values());
}

function chooseSelfRecord(records, uid, nickname, todoKey = "todos") {
  const selfCandidates = records.filter(
    (record) => record.id === uid || hasSameNickname(record, nickname)
  );
  const ownRecord = selfCandidates.find((record) => record.id === uid) || null;

  if (ownRecord) {
    return { preferred: ownRecord, selfCandidates };
  }

  const preferred = selfCandidates.reduce((best, candidate) => {
    if (!best) return candidate;
    return choosePreferredRecord(best, candidate, todoKey);
  }, null);

  return { preferred, selfCandidates };
}


function resetTodosForNewDay(todos) {
  return (todos || [])
    .filter((todo) => !todo.done)
    .map((todo) => ({
      ...todo,
      done: false,
      completedAt: null,
    }));
}

function buildFallbackDailyRecords(currentRecords, previousRecords) {
  const mergedCurrentRecords = mergeRecordsByNickname(currentRecords);
  const currentKeys = new Set(mergedCurrentRecords.map(getRecordIdentityKey));

  return mergeRecordsByNickname(previousRecords)
    .filter((record) => !currentKeys.has(getRecordIdentityKey(record)))
    .map((record) => ({
      ...record,
      todos: resetTodosForNewDay(record.todos || []),
    }));
}

async function findRecentDailyFallbackRecords(currentDateKey) {
  const historySnap = await getDocs(
    query(collection(db, historyDatesCol()), orderBy("date", "desc"))
  );

  const fallbackRecordsByKey = new Map();

  for (const historyDoc of historySnap.docs) {
    const historyDate = historyDoc.data().date;
    if (!historyDate || historyDate >= currentDateKey) continue;

    const dailySnap = await getDocs(collection(db, dailyCol(historyDate)));
    dailySnap.forEach((docSnap) => {
      const record = { id: docSnap.id, ...docSnap.data() };
      const key = getRecordIdentityKey(record);

      if (!fallbackRecordsByKey.has(key)) {
        fallbackRecordsByKey.set(key, record);
      }
    });
  }

  return Array.from(fallbackRecordsByKey.values());
}

async function findRecentDailyMatchByNickname(targetNickname) {
  if (!targetNickname) return null;

  const historySnap = await getDocs(
    query(collection(db, historyDatesCol()), orderBy("date", "desc"))
  );

  let bestMatch = null;

  for (const historyDoc of historySnap.docs) {
    const historyDate = historyDoc.data().date;
    const matchSnap = await getDocs(
      query(
        collection(db, dailyCol(historyDate)),
        where("nickname", "==", targetNickname)
      )
    );

    const validDocs = matchSnap.docs.filter((docSnap) => isValidUid(docSnap.id));

    if (validDocs.length) {
      const bestDoc = validDocs.reduce((best, current) => {
        if (!best) return current;
        const bestData = best.data();
        const currentData = current.data();
        return choosePreferredRecord(bestData, currentData) === currentData ? current : best;
      }, null);
      const nextMatch = {
        id: bestDoc.id,
        date: historyDate,
        data: bestDoc.data(),
      };
      bestMatch = !bestMatch
        ? nextMatch
        : choosePreferredRecord(bestMatch.data, nextMatch.data) === nextMatch.data
          ? nextMatch
          : bestMatch;
    }
  }

  return bestMatch;
}

const AVATAR_LIST = [
  "🥹", "💓", "🌿", "😴", "😺", "😻", "🐱", "🐤",
  "👻", "🌙", "🐰", "🍧", "🍕", "🥚", "🐮", "🐷",
  "🐙", "🦋", "🌸", "🌻", "🍀", "⭐", "🔥", "💎",
];

function getBadge(doneCount) {
  if (doneCount >= 7) return { emoji: "👑", label: "투두 마스터" };
  if (doneCount >= 5) return { emoji: "🔥", label: "집중 루티너" };
  if (doneCount >= 3) return { emoji: "🏅", label: "3개 달성 루티너" };
  if (doneCount >= 1) return { emoji: "🌱", label: "시동 걸림" };
  return { emoji: "", label: "" };
}

/* ── Firestore 경로 ── */
const dailyCol = (date) => `daily/${date}/users`;
const weeklyCol = (wk) => `weekly/${wk}/users`;
const notiCol = (date) => `daily/${date}/notifications`;
const historyDatesCol = () => "historyDates";
const routineCol = () => "routines";
const eventsCol = () => "events";
const challengesCol = () => "challenges";

/* ── 루틴 상수 ── */
const ROUTINE_SECTIONS = [
  { id: "morning", label: "아침", emoji: "🌅" },
  { id: "lunch", label: "점심", emoji: "🌞" },
  { id: "evening", label: "저녁", emoji: "🌙" },
  { id: "anytime", label: "아무때나", emoji: "⏰" },
];

const routineStorageKeyFor = (uid) => (uid ? `todoRoom:routine:${uid}` : "");
function loadStoredRoutine(key) {
  if (!key) return { items: [], doneDate: "" };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { items: [], doneDate: "" };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      doneDate: parsed.doneDate || "",
    };
  } catch {
    return { items: [], doneDate: "" };
  }
}
function saveStoredRoutine(key, value) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

function clearTodoRoomBrowserStorage() {
  const prefixes = ["todoRoom_", "todoRoom:"];
  const removed = [];

  [localStorage, sessionStorage].forEach((storage) => {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }

    keys.forEach((key) => {
      storage.removeItem(key);
      removed.push(key);
    });
  });

  return removed;
}

async function clearTodoRoomIndexedDb() {
  if (!window.indexedDB || typeof window.indexedDB.databases !== "function") {
    return [];
  }

  const databases = await window.indexedDB.databases();
  const names = databases
    .map((database) => database.name)
    .filter(Boolean)
    .filter((name) => /firebase|firestore|todo-room|todoRoom/i.test(name));

  await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          const request = window.indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        })
    )
  );

  return names;
}

/* ── 자동 백업 (localStorage 기반 안전망) ── */
const BACKUP_KEY = "todoRoom_backups_v1";
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_BACKUPS = 7;

function loadBackups() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveBackups(backups) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(backups)); }
  catch (err) { console.warn("backup save failed (storage full?)", err); }
}
async function captureBackupSnapshot(currentDayKey, currentWeekKey) {
  const cols = [
    ["routines", routineCol()],
    ["daily", dailyCol(currentDayKey)],
    ["weekly", weeklyCol(currentWeekKey)],
  ];
  const data = {};
  for (const [tag, path] of cols) {
    try {
      const snap = await getDocs(collection(db, path));
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      data[tag] = rows;
    } catch (err) {
      console.warn("backup read failed:", path, err);
      data[tag] = [];
    }
  }
  return { timestamp: Date.now(), iso: new Date().toISOString(), data };
}

/* ─────────────────────────────── App ─────────────────────────────── */
export default function App() {
  const profileRef = useRef({
    nickname: getSavedNickname(),
    avatar: getSavedAvatar(),
  });

  const [uid, setUid] = useState(() => getUid());
  const [currentDayKey, setCurrentDayKey] = useState(() => todayKey());
  const [currentWeekKey, setCurrentWeekKey] = useState(() => weekKey());
  const [nickname, setNickname] = useState(getSavedNickname);
  const [avatar, setAvatar] = useState(getSavedAvatar);
  const [nicknameConfirmed, setNicknameConfirmed] = useState(!!getSavedNickname());

  const dailyStorageKey = `todoRoom_daily_${uid}_${currentDayKey}`;
  const weeklyStorageKey = `todoRoom_weekly_${uid}_${currentWeekKey}`;
  const routineStorageKey = routineStorageKeyFor(uid);
  const eventsStorageKey = `todoRoom_events_${uid}`;
  const challengesStorageKey = `todoRoom_challenges_${uid}`;
  const [profileRecoveryChecked, setProfileRecoveryChecked] = useState(
    !!getSavedNickname()
  );
  const [nickInput, setNickInput] = useState(getSavedNickname());
  const [avatarPick, setAvatarPick] = useState(getSavedAvatar() || AVATAR_LIST[0]);

  // 투두
  const [todoText, setTodoText] = useState("");
  const [weeklyTodoText, setWeeklyTodoText] = useState("");
  const [myDaily, setMyDaily] = useState(() => loadStoredTodos(dailyStorageKey));
  const [myWeekly, setMyWeekly] = useState(() => loadStoredTodos(weeklyStorageKey));

  // 이벤트 (D-day)
  const [events, setEvents] = useState(() => loadStoredEvents(eventsStorageKey));
  const [eventPopoverOpen, setEventPopoverOpen] = useState(false);

  // 챌린지 (장기 누적 진도)
  const [challenges, setChallenges] = useState(() =>
    loadStoredChallenges(challengesStorageKey)
  );

  // 루틴 (반복되는 매일 습관 — 매일 자정에 done만 리셋, 항목은 영구)
  const [myRoutine, setMyRoutine] = useState({ items: [], doneDate: "" });
  const myRoutineRef = useRef(myRoutine);
  const previousRoutineStorageKeyRef = useRef(routineStorageKey);
  const [routineText, setRoutineText] = useState("");
  const [routineSection, setRoutineSection] = useState("morning");
  const [routineCelebrated, setRoutineCelebrated] = useState(false);

  // 다른 멤버
  const [members, setMembers] = useState([]);
  const [weeklyMembers, setWeeklyMembers] = useState([]);
  const [routineMembers, setRoutineMembers] = useState([]);
  const [eventMembers, setEventMembers] = useState([]);
  const [challengeMembers, setChallengeMembers] = useState([]);

  // 알림
  const [toasts, setToasts] = useState([]);

  // 탭
  const [tab, setTab] = useState("today"); // today | history
  const [historyDates, setHistoryDates] = useState([]);
  const [historyData, setHistoryData] = useState(null);
  const [historyWeeklyData, setHistoryWeeklyData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showIdleMembers, setShowIdleMembers] = useState(false);
  const [membersReadyKey, setMembersReadyKey] = useState("");
  const skipDailyStorageSaveRef = useRef(false);
  const skipWeeklyStorageSaveRef = useRef(false);
  const legacyWeekKeyValue = legacyWeekKey();
  const currentMembersReadyKey = `${uid}:${nickname}:${currentDayKey}:${currentWeekKey}:${legacyWeekKeyValue}`;
  const membersReady = membersReadyKey === currentMembersReadyKey;
  const [quizConfig, setQuizConfig] = useState(null);

  // (위클리 항상 표시)

  useEffect(() => {
    myRoutineRef.current = myRoutine;
  }, [myRoutine]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDayKey = todayKey();
      const nextWeekKey = weekKey();

      setCurrentDayKey((prev) => (prev === nextDayKey ? prev : nextDayKey));
      setCurrentWeekKey((prev) => (prev === nextWeekKey ? prev : nextWeekKey));
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    skipDailyStorageSaveRef.current = true;
    const timer = window.setTimeout(() => {
      setMyDaily(loadStoredTodos(dailyStorageKey));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dailyStorageKey]);

  useEffect(() => {
    skipWeeklyStorageSaveRef.current = true;
    const timer = window.setTimeout(() => {
      setMyWeekly(loadStoredTodos(weeklyStorageKey));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [weeklyStorageKey]);

  useEffect(() => {
    setEvents(loadStoredEvents(eventsStorageKey));
  }, [eventsStorageKey]);

  useEffect(() => {
    saveStoredEvents(eventsStorageKey, events);
  }, [eventsStorageKey, events]);

  useEffect(() => {
    setChallenges(loadStoredChallenges(challengesStorageKey));
  }, [challengesStorageKey]);

  useEffect(() => {
    saveStoredChallenges(challengesStorageKey, challenges);
  }, [challengesStorageKey, challenges]);

  const syncDuplicateNicknameDocs = useCallback(
    async (collectionPath, nextNickname, payload) => {
      const normalizedNickname = normalizeNickname(nextNickname);
      if (!normalizedNickname) return;

      const sameNicknameSnap = await getDocs(
        query(collection(db, collectionPath), where("nickname", "==", normalizedNickname))
      );

      await Promise.all(
        sameNicknameSnap.docs
          .filter((docSnap) => docSnap.id !== uid && isValidUid(docSnap.id))
          .map((docSnap) => writeSetDoc(doc(db, collectionPath, docSnap.id), payload))
      );
    },
    [uid]
  );

  const loadNicknameMatches = useCallback(async (rawNickname) => {
    const normalizedNickname = normalizeNickname(rawNickname);
    if (!normalizedNickname) return [];
    if (isLocalDevHost()) return [];
    const weeklyKeys =
      currentWeekKey === legacyWeekKeyValue
        ? [currentWeekKey]
        : [currentWeekKey, legacyWeekKeyValue];

    const [dailyMatches, weeklyMatchGroups, eventMatches] = await Promise.all([
      getDocs(
        query(
          collection(db, dailyCol(currentDayKey)),
          where("nickname", "==", normalizedNickname)
        )
      ),
      Promise.all(
        weeklyKeys.map((wk) =>
          getDocs(
            query(
              collection(db, weeklyCol(wk)),
              where("nickname", "==", normalizedNickname)
            )
          )
        )
      ),
      getDocs(
        query(
          collection(db, eventsCol()),
          where("nickname", "==", normalizedNickname)
        )
      ),
    ]);

    const dailyRecords = dailyMatches.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    const weeklyRecords = weeklyMatchGroups.flatMap((weeklyMatches) =>
      weeklyMatches.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
    );
    const eventRecords = eventMatches.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    return collectNicknameMatches({
      dailyRecords,
      weeklyRecords,
      eventRecords,
      recentMatch: null,
    });
  }, [currentDayKey, currentWeekKey, legacyWeekKeyValue]);

  const resolveNicknameSession = useCallback(
    async (rawNickname, fallbackAvatar = avatarPick) => {
      const normalizedNickname = normalizeNickname(rawNickname);
      if (!normalizedNickname) return false;

      try {
        const matches = await loadNicknameMatches(normalizedNickname);
        const bestMatch = matches.reduce((best, candidate) => {
          if (!best) return candidate;
          return choosePreferredNicknameMatch(best, candidate);
        }, null);

        const nextUid = bestMatch?.id || uid;
        const nextAvatar =
          bestMatch?.avatar || fallbackAvatar || avatar || AVATAR_LIST[0];

        if (nextUid !== uid) {
          localStorage.setItem("todoRoom_uid", nextUid);
          setUid(nextUid);
        }

        if (bestMatch) {
          setMyDaily(bestMatch.hasDailyDoc ? bestMatch.dailyTodos : []);
          setMyWeekly(bestMatch.hasWeeklyDoc ? bestMatch.weeklyTodos : []);
          if (bestMatch.hasEventsDoc) setEvents(bestMatch.events || []);
        }

        setNickname(normalizedNickname);
        setNickInput(normalizedNickname);
        setAvatar(nextAvatar);
        setAvatarPick(nextAvatar || AVATAR_LIST[0]);
        setNicknameConfirmed(true);
        localStorage.setItem("todoRoom_nickname", normalizedNickname);
        localStorage.setItem("todoRoom_avatar", nextAvatar || "");
        return true;
      } catch (error) {
        console.error("Nickname resolve failed:", error);
        const nextAvatar = fallbackAvatar || avatar || AVATAR_LIST[0];

        setNickname(normalizedNickname);
        setNickInput(normalizedNickname);
        setAvatar(nextAvatar);
        setAvatarPick(nextAvatar || AVATAR_LIST[0]);
        setNicknameConfirmed(true);
        localStorage.setItem("todoRoom_nickname", normalizedNickname);
        localStorage.setItem("todoRoom_avatar", nextAvatar || "");
        return false;
      }
    },
    [avatar, avatarPick, loadNicknameMatches, uid]
  );

  /* ── 닉네임 확정: 같은 닉네임이면 기존 uid에 연결 ── */
  const confirmNickname = async () => {
    const normalizedNickname = normalizeNickname(nickInput);
    if (!normalizedNickname) return;

    await resolveNicknameSession(normalizedNickname, avatarPick);
  };

  /* ── Firestore 데일리 동기화 ── */
  const syncMyDaily = useCallback(
    (todos) => {
      if (!nicknameConfirmed || !uid) return;
      const date = currentDayKey;
      const payload = {
        nickname,
        avatar,
        todos,
        updatedAt: serverTimestamp(),
      };

      void writeSetDoc(doc(db, dailyCol(date), uid), payload).catch((error) => {
        console.error("Failed to sync daily todos", error);
      });
      void syncDuplicateNicknameDocs(dailyCol(date), nickname, payload).catch((error) => {
        console.error("Failed to sync duplicate daily todos", error);
      });
      // 날짜 기록
      void writeSetDoc(doc(db, historyDatesCol(), date), { date }).catch((error) => {
        console.error("Failed to sync history date", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed, currentDayKey, syncDuplicateNicknameDocs]
  );

  const syncMyWeekly = useCallback(
    (todos) => {
      if (!nicknameConfirmed || !uid) return;
      const weeklyKeys = Array.from(new Set([currentWeekKey, legacyWeekKeyValue]));
      const payload = {
        nickname,
        avatar,
        todos,
        updatedAt: serverTimestamp(),
      };

      weeklyKeys.forEach((wk) => {
        void writeSetDoc(doc(db, weeklyCol(wk), uid), payload).catch((error) => {
          console.error("Failed to sync weekly todos", error);
        });
        void syncDuplicateNicknameDocs(weeklyCol(wk), nickname, payload).catch((error) => {
          console.error("Failed to sync duplicate weekly todos", error);
        });
      });
    },
    [
      uid,
      nickname,
      avatar,
      nicknameConfirmed,
      currentWeekKey,
      legacyWeekKeyValue,
      syncDuplicateNicknameDocs,
    ]
  );

  /* ── Firestore 이벤트(D-day) 동기화 ── */
  const syncMyEvents = useCallback(
    (eventsArr) => {
      if (!nicknameConfirmed || !uid) return;
      const payload = {
        nickname,
        avatar,
        events: eventsArr || [],
        updatedAt: serverTimestamp(),
      };
      void writeSetDoc(doc(db, eventsCol(), uid), payload).catch((error) => {
        console.error("Failed to sync events", error);
      });
      void syncDuplicateNicknameDocs(eventsCol(), nickname, payload).catch((error) => {
        console.error("Failed to sync duplicate events", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed, syncDuplicateNicknameDocs]
  );

  useEffect(() => {
    if (!nicknameConfirmed) return;
    const unsub = onSnapshot(collection(db, eventsCol()), (snap) => {
      const all = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        all.push({
          id: d.id,
          nickname: data.nickname || "",
          avatar: data.avatar || "",
          events: Array.isArray(data.events) ? data.events : [],
        });
      });

      const selfEventCandidates = all.filter(
        (m) => m.id === uid || hasSameNickname(m, nickname)
      );
      const preferredSelfEvent = selfEventCandidates.reduce((best, candidate) => {
        if (!best) return candidate;
        return choosePreferredRecord(best, candidate, "events");
      }, null);

      if (preferredSelfEvent?.events?.length) {
        setEvents((current) => {
          if (JSON.stringify(current) === JSON.stringify(preferredSelfEvent.events)) {
            return current;
          }
          return preferredSelfEvent.events;
        });

        const currentEventRecord = all.find((m) => m.id === uid);
        if (
          preferredSelfEvent.id !== uid &&
          (!currentEventRecord ||
            getTodoCount(currentEventRecord.events) < getTodoCount(preferredSelfEvent.events))
        ) {
          void writeSetDoc(doc(db, eventsCol(), uid), {
            nickname,
            avatar: avatar || preferredSelfEvent.avatar || "",
            events: preferredSelfEvent.events,
            updatedAt: serverTimestamp(),
          }).catch((error) => {
            console.error("Failed to merge duplicate events", error);
          });
        }
      }

      setEventMembers(all.filter((m) => m.id !== uid && !hasSameNickname(m, nickname)));
    }, (error) => {
      console.error("Failed to subscribe event members", error);
    });
    return () => unsub();
  }, [uid, nickname, avatar, nicknameConfirmed]);

  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (isLocalDevHost()) return;
    const unsub = onSnapshot(doc(db, eventsCol(), uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const remote = Array.isArray(data.events) ? data.events : [];
      setEvents(remote);
    }, (error) => {
      console.error("Failed to subscribe own events", error);
    });
    return () => unsub();
  }, [uid, nicknameConfirmed]);

  /* ── Firestore 챌린지 동기화 ── */
  const syncMyChallenges = useCallback(
    (next) => {
      if (!nicknameConfirmed || !uid) return;
      const payload = {
        nickname,
        avatar,
        challenges: next || [],
        updatedAt: serverTimestamp(),
      };
      void writeSetDoc(doc(db, challengesCol(), uid), payload).catch((error) => {
        console.error("Failed to sync challenges", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed]
  );

  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (isLocalDevHost()) return;
    const unsub = onSnapshot(doc(db, challengesCol(), uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const remote = Array.isArray(data.challenges) ? data.challenges : [];
      setChallenges(remote);
    }, (error) => {
      console.error("Failed to subscribe own challenges", error);
    });
    return () => unsub();
  }, [uid, nicknameConfirmed]);

  useEffect(() => {
    if (!nicknameConfirmed) return;
    const unsub = onSnapshot(collection(db, challengesCol()), (snap) => {
      const all = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        all.push({
          id: d.id,
          nickname: data.nickname || "",
          avatar: data.avatar || "",
          challenges: Array.isArray(data.challenges) ? data.challenges : [],
        });
      });
      setChallengeMembers(all.filter((m) => m.id !== uid));
    }, (error) => {
      console.error("Failed to subscribe challenge members", error);
    });
    return () => unsub();
  }, [uid, nicknameConfirmed]);

  /* ── Firestore 루틴 동기화 ── */
  const syncMyRoutine = useCallback(
    (next) => {
      if (!nicknameConfirmed || !uid) return;
      const payload = {
        nickname,
        avatar,
        items: next.items || [],
        doneDate: next.doneDate || currentDayKey,
        updatedAt: serverTimestamp(),
      };
      void writeSetDoc(doc(db, routineCol(), uid), payload).catch((error) => {
        console.error("Failed to sync routine", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed, currentDayKey]
  );

  // Load own routine from localStorage on uid change, with daily rollover applied
  useEffect(() => {
    if (!routineStorageKey) return;
    const stored = loadStoredRoutine(routineStorageKey);
    const sameStorageKey = previousRoutineStorageKeyRef.current === routineStorageKey;
    const next = getRoutineForStorageLoad({
      stored,
      current: myRoutineRef.current,
      sameStorageKey,
      currentDayKey,
    });
    previousRoutineStorageKeyRef.current = routineStorageKey;
    setMyRoutine(next);
    setRoutineCelebrated(false);
    const changed =
      stored.doneDate !== currentDayKey ||
      (sameStorageKey &&
        (!stored.items || stored.items.length === 0) &&
        (myRoutineRef.current.items || []).length > 0);
    if (changed) {
      saveStoredRoutine(routineStorageKey, next);
      // Don't sync an empty payload to Firestore — would wipe items written from another device.
      if (next.items.length > 0) syncMyRoutine(next);
    }
  }, [routineStorageKey, currentDayKey, syncMyRoutine]);

  // Subscribe to ALL routine docs (other members) so we can show their summaries
  useEffect(() => {
    if (!nicknameConfirmed) return;
    const unsub = onSnapshot(collection(db, routineCol()), (snap) => {
      const all = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        all.push({
          id: d.id,
          nickname: data.nickname || "",
          avatar: data.avatar || "",
          items: Array.isArray(data.items) ? data.items : [],
          doneDate: data.doneDate || "",
        });
      });
      setRoutineMembers(all.filter((m) => m.id !== uid));
    }, (error) => {
      console.error("Failed to subscribe routine members", error);
    });
    return () => unsub();
  }, [uid, nicknameConfirmed]);

  // Subscribe to own routine doc in Firestore (so multi-device stays in sync)
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (isLocalDevHost()) return;
    const unsub = onSnapshot(doc(db, routineCol(), uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const { items: rolled, changed } = rolloverRoutineDone(items, data.doneDate || "", currentDayKey);
      const next = { items: rolled, doneDate: currentDayKey };
      setMyRoutine(next);
      setRoutineCelebrated(false);
      saveStoredRoutine(routineStorageKey, next);
      // Never write back an empty payload — would wipe a legit doc that has items elsewhere
      if (changed && rolled.length > 0) syncMyRoutine(next);
    });
    return () => unsub();
  }, [uid, nicknameConfirmed, currentDayKey, routineStorageKey, syncMyRoutine]);

  useEffect(() => {
    if (!routineStorageKey) return;
    saveStoredRoutine(routineStorageKey, myRoutine);
  }, [routineStorageKey, myRoutine]);

  const addRoutine = () => {
    const text = routineText.trim();
    if (!text) return;
    const next = {
      items: [
        ...(myRoutine.items || []),
        {
          id: Date.now(),
          text,
          section: routineSection,
          done: false,
          createdAt: Date.now(),
        },
      ],
      doneDate: currentDayKey,
    };
    setMyRoutine(next);
    syncMyRoutine(next);
    setRoutineText("");
  };

  // 3-state cycle (matches TodoItem): 진행 전 → 진행중 → 완료 → (다시 진행 전)
  const cycleRoutine = (id) => {
    let completedItem = null;
    const next = {
      ...myRoutine,
      doneDate: currentDayKey,
      items: (myRoutine.items || []).map((it) => {
        if (it.id !== id) return it;
        // 진행 전 → 진행중
        if (!it.started && !it.done) return { ...it, started: true };
        // 진행중 → 완료
        if (it.started && !it.done) {
          completedItem = it;
          return { ...it, done: true, completedAt: Date.now() };
        }
        // 완료 → 진행 전 (되돌리기)
        return { ...it, started: false, done: false, completedAt: null };
      }),
    };
    if (completedItem) {
      writeAddDoc(collection(db, notiCol(currentDayKey)), {
        message: `${nickname}님이 '${completedItem.text}'을(를) 완수하였습니다! (루틴)`,
        createdAt: serverTimestamp(),
      });
    }
    setMyRoutine(next);
    syncMyRoutine(next);
  };

  const deleteRoutine = (id) => {
    const next = {
      ...myRoutine,
      items: (myRoutine.items || []).filter((it) => it.id !== id),
    };
    setMyRoutine(next);
    syncMyRoutine(next);
  };

  // Celebration pulse fires once when the LAST item is checked off
  const routineDoneCount = (myRoutine.items || []).filter((i) => i.done).length;
  const routineTotalCount = (myRoutine.items || []).length;
  const routineAllDone = routineTotalCount > 0 && routineDoneCount === routineTotalCount;
  useEffect(() => {
    if (routineAllDone) setRoutineCelebrated(true);
    else setRoutineCelebrated(false);
  }, [routineAllDone]);

  useEffect(() => {
    if (!dailyStorageKey) return;
    if (skipDailyStorageSaveRef.current) {
      skipDailyStorageSaveRef.current = false;
      return;
    }
    saveStoredTodos(dailyStorageKey, myDaily);
  }, [dailyStorageKey, myDaily]);

  useEffect(() => {
    if (!weeklyStorageKey) return;
    if (skipWeeklyStorageSaveRef.current) {
      skipWeeklyStorageSaveRef.current = false;
      return;
    }
    saveStoredTodos(weeklyStorageKey, myWeekly);
  }, [weeklyStorageKey, myWeekly]);

  /* ── 로컬 프로필이 비었을 때 기존 uuid로 Firestore 복구 ── */
  useEffect(() => {
    if (nicknameConfirmed) return;
    if (isLocalDevHost()) {
      setProfileRecoveryChecked(true);
      return;
    }

    const oldUid = uid;
    if (!oldUid) return;

    let cancelled = false;

    const recoverProfile = async () => {
      try {
        const weeklyKeys =
          currentWeekKey === legacyWeekKeyValue
            ? [currentWeekKey]
            : [currentWeekKey, legacyWeekKeyValue];
        const [dailySnap, weeklySnaps] = await Promise.all([
          getDoc(doc(db, dailyCol(currentDayKey), oldUid)),
          Promise.all(
            weeklyKeys.map((wk) => getDoc(doc(db, weeklyCol(wk), oldUid)))
          ),
        ]);

        if (cancelled) return;

        const dailyData = dailySnap.exists() ? dailySnap.data() : null;
        const weeklyData = weeklySnaps.reduce((best, snap) => {
          if (!snap.exists()) return best;
          const candidate = snap.data();
          if (!best) return candidate;
          return choosePreferredRecord(
            { ...best, todos: best.todos || [] },
            { ...candidate, todos: candidate.todos || [] }
          ) === candidate
            ? candidate
            : best;
        }, null);
        let profileData = dailyData || weeklyData;

        if (!profileData) {
          const historySnap = await getDocs(
            query(collection(db, historyDatesCol()), orderBy("date", "desc"))
          );

          for (const historyDoc of historySnap.docs) {
            const historyDate = historyDoc.data().date;
            const historyUserSnap = await getDoc(doc(db, dailyCol(historyDate), oldUid));

            if (historyUserSnap.exists()) {
              profileData = historyUserSnap.data();
              break;
            }
          }
        }

        if (cancelled) return;

        const recoveredNickname = profileData?.nickname?.trim();
        const recoveredAvatar =
          dailyData?.avatar || weeklyData?.avatar || profileData?.avatar || "";

        if (!recoveredNickname) return;

        // 닉네임/아바타를 설정 화면에 미리 채움 (확인 버튼 누르면 마이그레이션)
        setNickInput(recoveredNickname);
        setAvatarPick(recoveredAvatar || AVATAR_LIST[0]);
      } catch (error) {
        console.error("Failed to recover profile", error);
      } finally {
        if (!cancelled) {
          setProfileRecoveryChecked(true);
        }
      }
    };

    void recoverProfile();

    return () => {
      cancelled = true;
    };
  }, [nicknameConfirmed, uid, currentDayKey, currentWeekKey, legacyWeekKeyValue]);

  /* ── 같은 닉네임의 더 좋은 문서가 있으면 그 uid로 재연결 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !nickname.trim()) return;
    if (isLocalDevHost()) return;

    let cancelled = false;

    const reconnectUid = async () => {
      try {
        const matches = await loadNicknameMatches(nickname);

        if (cancelled || !matches.length) return;

        const bestMatch = matches.reduce((best, candidate) => {
          if (!best) return candidate;
          return choosePreferredNicknameMatch(best, candidate);
        }, null);
        const currentMatch = matches.find((candidate) => candidate.id === uid);
        const shouldReconnect =
          bestMatch &&
          bestMatch.id !== uid &&
          (
            !currentMatch ||
            getNicknameMatchCurrentTotal(bestMatch) >
            getNicknameMatchCurrentTotal(currentMatch) ||
            (
              getNicknameMatchCurrentTotal(bestMatch) ===
              getNicknameMatchCurrentTotal(currentMatch) &&
              getTodoCount(bestMatch.recentTodos) >
              getTodoCount(currentMatch.recentTodos)
            ) ||
            (
              getNicknameMatchCurrentTotal(bestMatch) ===
              getNicknameMatchCurrentTotal(currentMatch) &&
              getTodoCount(bestMatch.recentTodos) ===
              getTodoCount(currentMatch.recentTodos) &&
              getTodoCount(bestMatch.events) >
              getTodoCount(currentMatch.events)
            ) ||
            (!avatar && !!bestMatch.avatar)
          );

        if (!shouldReconnect) return;

        localStorage.setItem("todoRoom_uid", bestMatch.id);
        if (bestMatch.avatar) {
          localStorage.setItem("todoRoom_avatar", bestMatch.avatar);
          setAvatar(bestMatch.avatar);
          setAvatarPick(bestMatch.avatar);
        }

        setUid(bestMatch.id);
        setMyDaily(bestMatch.hasDailyDoc ? bestMatch.dailyTodos : []);
        setMyWeekly(bestMatch.hasWeeklyDoc ? bestMatch.weeklyTodos : []);
        if (bestMatch.hasEventsDoc) setEvents(bestMatch.events || []);
      } catch (err) {
        console.error("Nickname reconnect failed:", err);
      }
    };

    void reconnectUid();
    return () => { cancelled = true; };
  }, [uid, nicknameConfirmed, nickname, avatar, loadNicknameMatches]);

  /* ── 새 날짜 첫 진입 시 어제 미완료 투두 이어받기 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (isLocalDevHost()) return;

    const carryKey = `todoRoom_dailyCarry_${uid}_${currentDayKey}`;

    let cancelled = false;

    const carryOverTodos = async () => {
      try {
        const today = currentDayKey;
        const todayRef = doc(db, dailyCol(today), uid);
        const todaySnap = await getDoc(todayRef);
        const todayTodos = todaySnap.exists() ? todaySnap.data().todos || [] : [];

        if (cancelled) return;
        if (todayTodos.length > 0) {
          localStorage.setItem(carryKey, "done");
          return;
        }

        const prevSnap = await getDoc(doc(db, dailyCol(previousDayKeyFrom(today)), uid));
        const sourceData = prevSnap.exists() ? prevSnap.data() : null;

        if (cancelled) return;

        if (!sourceData) return;

        const carryTodos = resetTodosForNewDay(sourceData.todos || []);

        if (!carryTodos.length) return;

        const nextAvatar = sourceData.avatar || avatar;

        if (nextAvatar && nextAvatar !== avatar) {
          setAvatar(nextAvatar);
          setAvatarPick(nextAvatar);
          localStorage.setItem("todoRoom_avatar", nextAvatar);
        }

        setMyDaily(carryTodos);
        await writeSetDoc(todayRef, {
          nickname: sourceData.nickname || nickname,
          avatar: nextAvatar,
          todos: carryTodos,
          updatedAt: serverTimestamp(),
        });
        await writeSetDoc(doc(db, historyDatesCol(), today), { date: today });
        localStorage.setItem(carryKey, "done");
      } catch (error) {
        console.error("Failed to carry over daily todos", error);
      }
    };

    void carryOverTodos();

    return () => {
      cancelled = true;
    };
  }, [uid, nicknameConfirmed, nickname, avatar, currentDayKey]);

  /* ── 실시간 리스너 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (isLocalDevHost()) {
      setMembersReadyKey(currentMembersReadyKey);
      return;
    }

    const date = currentDayKey;
    const weeklyKeys =
      currentWeekKey === legacyWeekKeyValue
        ? [currentWeekKey]
        : [currentWeekKey, legacyWeekKeyValue];

    // 데일리 멤버 리스너
    const dailyDocsBySource = new Map();
    let cancelled = false;
    let dailyLoaded = false;
    let fallbackLoaded = false;
    const weeklyLoadedKeys = new Set();

    const finalizeMembersReady = () => {
      if (cancelled) return;
      if (
        dailyLoaded &&
        weeklyLoadedKeys.size === weeklyKeys.length
      ) {
        setMembersReadyKey(currentMembersReadyKey);
      }
    };

    const applyDailyMembers = () => {
      const todayRecords = dailyDocsBySource.get("today") || [];
      const fallbackSourceRecords = dailyDocsBySource.get("fallback") || [];
      const fallbackRecords = buildFallbackDailyRecords(todayRecords, fallbackSourceRecords);
      const all = mergeRecordsByNickname([...todayRecords, ...fallbackRecords]);

      const { preferred: preferredSelf, selfCandidates } = chooseSelfRecord(
        all,
        uid,
        nickname
      );

      if (preferredSelf) {
        setMyDaily(preferredSelf.todos || []);
      } else {
        setMyDaily([]);
      }

      setMembers(
        mergeRecordsByNickname(
          all.filter((member) => !selfCandidates.some((self) => self.id === member.id))
        )
      );
    };

    const unsubDaily = onSnapshot(
      collection(db, dailyCol(date)),
      (snap) => {
        const all = [];
        snap.forEach((d) => {
          all.push({ id: d.id, ...d.data() });
        });
        dailyDocsBySource.set("today", all);
        dailyLoaded = true;
        applyDailyMembers();
        finalizeMembersReady();
      },
      (error) => {
        console.error("Failed to subscribe daily todos", error);
        dailyLoaded = true;
        finalizeMembersReady();
      }
    );

    void findRecentDailyFallbackRecords(currentDayKey)
      .then((records) => {
        if (cancelled) return;
        dailyDocsBySource.set("fallback", records);
        fallbackLoaded = true;
        applyDailyMembers();
        finalizeMembersReady();
      })
      .catch((error) => {
        console.error("Failed to load fallback daily todos", error);
        fallbackLoaded = true;
        finalizeMembersReady();
      });

    // 위클리 멤버 리스너
    const weeklyDocsByKey = new Map();
    const applyWeeklyMembers = () => {
      const mergedWeeklyRecords = new Map();

      weeklyDocsByKey.forEach((records) => {
        records.forEach((record) => {
          const existing = mergedWeeklyRecords.get(record.id);
          if (!existing) {
            mergedWeeklyRecords.set(record.id, record);
            return;
          }

          mergedWeeklyRecords.set(
            record.id,
            choosePreferredRecord(existing, record)
          );
        });
      });

      const all = Array.from(mergedWeeklyRecords.values());
      const { preferred: preferredSelf, selfCandidates } = chooseSelfRecord(
        all,
        uid,
        nickname
      );

      if (preferredSelf) {
        setMyWeekly(preferredSelf.todos || []);
      } else {
        setMyWeekly([]);
      }

      setWeeklyMembers(
        mergeRecordsByNickname(
          all.filter((member) => !selfCandidates.some((self) => self.id === member.id))
        )
      );
    };

    const weeklyUnsubs = weeklyKeys.map((weeklyKey) =>
      onSnapshot(
        collection(db, weeklyCol(weeklyKey)),
        (snap) => {
          const all = [];
          snap.forEach((d) => {
            all.push({ id: d.id, ...d.data() });
          });
          weeklyDocsByKey.set(weeklyKey, all);
          weeklyLoadedKeys.add(weeklyKey);
          applyWeeklyMembers();
          finalizeMembersReady();
        },
        (error) => {
          console.error("Failed to subscribe weekly todos", error);
          weeklyLoadedKeys.add(weeklyKey);
          finalizeMembersReady();
        }
      )
    );

    // 알림 리스너 (최근 3개)
    const unsubNoti = onSnapshot(
      query(
        collection(db, notiCol(date)),
        orderBy("createdAt", "desc"),
        limit(3)
      ),
      (snap) => {
        const notes = [];
        snap.forEach((d) => notes.push({ id: d.id, ...d.data() }));
        setToasts(notes);
      },
      (error) => {
        console.error("Failed to subscribe notifications", error);
      }
    );

    // 히스토리 날짜 리스너 (과거순 정렬)
    let historyAutoLoaded = false;
    const unsubHistory = onSnapshot(
      query(collection(db, historyDatesCol()), orderBy("date", "asc")),
      (snap) => {
        const dates = [];
        snap.forEach((d) => dates.push(d.data().date));
        const filtered = dates.filter((d) => d !== currentDayKey);
        setHistoryDates(filtered);

        // 어제 기록 자동 로드 (최초 1회)
        if (!historyAutoLoaded && filtered.length > 0) {
          historyAutoLoaded = true;
          const yesterday = filtered[filtered.length - 1];
          loadHistory(yesterday);
        }
      },
      (error) => {
        console.error("Failed to subscribe history dates", error);
      }
    );

    return () => {
      cancelled = true;
      unsubDaily();
      weeklyUnsubs.forEach((unsubscribe) => unsubscribe());
      unsubNoti();
      unsubHistory();
    };
  }, [
    uid,
    nicknameConfirmed,
    nickname,
    currentDayKey,
    currentWeekKey,
    legacyWeekKeyValue,
    currentMembersReadyKey,
  ]);

  /* ── 프로필 변경 시 Firestore 업데이트 ── */
  useEffect(() => {
    if (!nicknameConfirmed) return;
    const prevProfile = profileRef.current;
    const profileChanged =
      prevProfile.nickname !== nickname || prevProfile.avatar !== avatar;

    if (!profileChanged) return;

    profileRef.current = { nickname, avatar };
    syncMyDaily(myDaily);
    syncMyWeekly(myWeekly);
    syncMyEvents(events);
  }, [
    nickname,
    avatar,
    nicknameConfirmed,
    myDaily,
    myWeekly,
    events,
    syncMyDaily,
    syncMyWeekly,
    syncMyEvents,
  ]);

  /* ── 투두 추가 ── */
  const addDaily = () => {
    const text = todoText.trim();
    if (!text) return;
    const next = [
      ...myDaily,
      { id: Date.now(), text, done: false, started: false, createdAt: Date.now() },
    ];
    setMyDaily(next);
    syncMyDaily(next);
    setTodoText("");
  };

  const addWeekly = () => {
    const text = weeklyTodoText.trim();
    if (!text) return;
    const next = [
      ...myWeekly,
      { id: Date.now(), text, done: false, started: false, createdAt: Date.now() },
    ];
    setMyWeekly(next);
    syncMyWeekly(next);
    setWeeklyTodoText("");
  };

  /* ── 투두 3단계 순환: 진행 전 → 진행중 → 완료 ── */
  const cycleDaily = (id) => {
    const next = myDaily.map((t) => {
      if (t.id !== id) return t;
      // 진행 전 → 진행중
      if (!t.started && !t.done) return { ...t, started: true };
      // 진행중 → 완료
      if (t.started && !t.done) {
        writeAddDoc(collection(db, notiCol(currentDayKey)), {
          message: `${nickname}님이 '${t.text}'을(를) 완수하였습니다!`,
          createdAt: serverTimestamp(),
        });
        return { ...t, done: true, completedAt: Date.now() };
      }
      // 완료 → 진행 전 (되돌리기)
      return { ...t, started: false, done: false, completedAt: null };
    });
    setMyDaily(next);
    syncMyDaily(next);
  };

  const deleteDaily = (id) => {
    const next = myDaily.filter((t) => t.id !== id);
    setMyDaily(next);
    syncMyDaily(next);
  };

  /* ── 이벤트(D-day) ── */
  const addEvent = ({ name, date, isPublic }) => {
    const trimmed = (name || "").trim();
    if (!trimmed || !date) return;
    const next = [
      ...events,
      { id: Date.now(), name: trimmed, date, isPublic: !!isPublic },
    ];
    setEvents(next);
    syncMyEvents(next);
  };

  const updateEvent = (id, patch) => {
    const next = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    setEvents(next);
    syncMyEvents(next);
  };

  const deleteEvent = (id) => {
    const next = events.filter((e) => e.id !== id);
    setEvents(next);
    syncMyEvents(next);
  };

  /* ── 챌린지(장기 누적 진도) ── */
  const addChallenge = ({ title, goal }) => {
    const trimmed = (title || "").trim();
    if (!trimmed) return;
    const goalNum = Number.isFinite(goal) && goal > 0 ? Math.floor(goal) : null;
    const next = [
      ...challenges,
      {
        id: Date.now(),
        title: trimmed,
        goal: goalNum,
        items: [],
        createdAt: Date.now(),
      },
    ];
    setChallenges(next);
    syncMyChallenges(next);
  };

  const deleteChallenge = (id) => {
    const next = challenges.filter((c) => c.id !== id);
    setChallenges(next);
    syncMyChallenges(next);
  };

  const addChallengeItem = (challengeId, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const now = Date.now();
    const next = challenges.map((c) =>
      c.id === challengeId
        ? {
            ...c,
            items: [
              ...c.items,
              createCompletedChallengeItem(trimmed, now),
            ],
          }
        : c
    );
    setChallenges(next);
    syncMyChallenges(next);
  };

  const addChallengeItemsBulk = (challengeId, names) => {
    const trimmed = (names || [])
      .map((n) => (n || "").trim())
      .filter(Boolean);
    if (trimmed.length === 0) return;
    const now = Date.now();
    const newItems = createPlannedChallengeItems(trimmed, now);
    const next = challenges.map((c) =>
      c.id === challengeId
        ? { ...c, items: [...c.items, ...newItems] }
        : c
    );
    setChallenges(next);
    syncMyChallenges(next);
  };

  const toggleChallengeItem = (challengeId, itemId) => {
    const now = Date.now();
    const next = challenges.map((c) =>
      c.id === challengeId
        ? {
            ...c,
            items: c.items.map((it) =>
              it.id === itemId ? toggleChallengeItemDone(it, now) : it
            ),
          }
        : c
    );
    setChallenges(next);
    syncMyChallenges(next);
  };

  const deleteChallengeItem = (challengeId, itemId) => {
    const next = challenges.map((c) =>
      c.id === challengeId
        ? { ...c, items: c.items.filter((it) => it.id !== itemId) }
        : c
    );
    setChallenges(next);
    syncMyChallenges(next);
  };

  const cycleWeekly = (id) => {
    const next = myWeekly.map((t) => {
      if (t.id !== id) return t;
      if (!t.started && !t.done) return { ...t, started: true };
      if (t.started && !t.done) {
        writeAddDoc(collection(db, notiCol(currentDayKey)), {
          message: `${nickname}님이 '${t.text}'을(를) 완수하였습니다! (주간)`,
          createdAt: serverTimestamp(),
        });
        return { ...t, done: true, completedAt: Date.now() };
      }
      return { ...t, started: false, done: false, completedAt: null };
    });
    setMyWeekly(next);
    syncMyWeekly(next);
  };

  const deleteWeekly = (id) => {
    const next = myWeekly.filter((t) => t.id !== id);
    setMyWeekly(next);
    syncMyWeekly(next);
  };

  /* ── 히스토리 조회 ── */
  async function loadHistory(date) {
    setSelectedDate(date);
    const wk = weekKeyForDate(date);
    const legacyWk = legacyWeekKeyForDate(date);
    const weeklyKeys = Array.from(new Set([wk, legacyWk]));

    const [dailySnap, ...weeklySnaps] = await Promise.all([
      getDocs(collection(db, dailyCol(date))),
      ...weeklyKeys.map((k) => getDocs(collection(db, weeklyCol(k)))),
    ]);

    const dailyData = [];
    dailySnap.forEach((d) => dailyData.push({ id: d.id, ...d.data() }));
    setHistoryData(mergeRecordsByNickname(dailyData));

    const allWeeklyRecords = weeklySnaps.flatMap((snap) => {
      const records = [];
      snap.forEach((d) => records.push({ id: d.id, ...d.data() }));
      return records;
    });
    setHistoryWeeklyData(mergeRecordsByNickname(allWeeklyRecords));
  }

  /* ── 합산 ── */
  const visibleWeekly = myWeekly;
  const dailyDoneCount = myDaily.filter((t) => t.done).length;
  const totalDoneCount =
    dailyDoneCount + visibleWeekly.filter((t) => t.done).length;
  const badge = getBadge(totalDoneCount);
  const closestEvent = pickClosestEvent(events);

  // 전체 멤버 (나 포함) 카드 데이터
  // Expose admin helpers on window so you can list/delete ghost users from the dev console.
  // Usage:
  //   __listGhosts()                         → 같은 닉네임 가진 다른 uid 문서 모두 출력
  //   __deleteGhost('UID')                   → 해당 uid의 daily/weekly/routine 문서 삭제
  //   __deleteAllGhosts()                    → 본인 제외 같은 닉네임 모두 삭제 (확인 prompt 포함)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!uid || !nickname) return;
    const myKey = normalizeNickname(nickname);
    const collectGhosts = async () => {
      const cols = [
        ["daily", dailyCol(currentDayKey)],
        ["weekly", weeklyCol(currentWeekKey)],
        ["routines", routineCol()],
      ];
      const map = new Map();
      await Promise.all(
        cols.map(async ([tag, path]) => {
          try {
            const snap = await getDocs(collection(db, path));
            snap.forEach((d) => {
              const data = d.data() || {};
              if (d.id === uid) return;
              if (normalizeNickname(data.nickname) !== myKey) return;
              const entry = map.get(d.id) || { id: d.id, nickname: data.nickname, in: [] };
              entry.in.push(tag);
              map.set(d.id, entry);
            });
          } catch (err) {
            console.warn("listGhosts read failed", path, err);
          }
        })
      );
      return Array.from(map.values());
    };
    window.__listGhosts = async () => {
      const list = await collectGhosts();
      console.table(list.map((g) => ({ uid: g.id, nickname: g.nickname, in: g.in.join(",") })));
      return list;
    };
    window.__deleteGhost = async (ghostUid) => {
      if (!ghostUid) return console.error("ghostUid 필요");
      if (ghostUid === uid) return console.error("자신은 못 지움");
      const paths = [
        dailyCol(currentDayKey),
        weeklyCol(currentWeekKey),
        routineCol(),
      ];
      for (const path of paths) {
        try {
          await writeDeleteDoc(doc(db, path, ghostUid));
          console.log("deleted", path, ghostUid);
        } catch (err) {
          console.warn("delete failed", path, err);
        }
      }
    };
    window.__deleteAllGhosts = async () => {
      const list = await collectGhosts();
      if (!list.length) return console.log("지울 ghost 없음");
      console.table(list.map((g) => ({ uid: g.id, nickname: g.nickname, in: g.in.join(",") })));
      if (!confirm(`${list.length}개 ghost uid 삭제할까요?`)) return;
      for (const g of list) {
        await window.__deleteGhost(g.id);
      }
      alert("완료. 새로고침");
      location.reload();
    };
    // List every member document so you can spot ghosts even when nickname spelling differs.
    window.__listAll = async () => {
      console.log("내 uid:", uid, "/ 내 닉네임:", JSON.stringify(nickname));
      const cols = [
        ["daily", dailyCol(currentDayKey)],
        ["weekly", weeklyCol(currentWeekKey)],
        ["routines", routineCol()],
      ];
      const result = {};
      for (const [tag, path] of cols) {
        try {
          const snap = await getDocs(collection(db, path));
          const rows = [];
          snap.forEach((d) => {
            const data = d.data() || {};
            rows.push({
              uid: d.id,
              nickname: JSON.stringify(data.nickname || ""),
              isMe: d.id === uid ? "✓" : "",
              count: Array.isArray(data.todos) ? data.todos.length : (Array.isArray(data.items) ? data.items.length : 0),
            });
          });
          result[tag] = rows;
          console.log(`\n=== ${tag} (${rows.length}) ===`);
          console.table(rows);
        } catch (err) {
          console.warn(tag, "read failed", err);
        }
      }
      return result;
    };
    // --- 자동 백업 helpers (anyone can run from console) ---
    window.__listBackups = () => {
      const backups = loadBackups();
      const rows = Object.entries(backups).map(([key, b]) => ({
        date: key,
        savedAt: b.iso,
        routines: (b.data?.routines || []).length,
        daily: (b.data?.daily || []).length,
        weekly: (b.data?.weekly || []).length,
      }));
      console.table(rows);
      return rows;
    };
    window.__viewBackup = (key) => {
      const backups = loadBackups();
      const b = backups[key];
      if (!b) return console.error("백업 없음:", key);
      console.log(b);
      return b;
    };
    window.__backupNow = async () => {
      const snapshot = await captureBackupSnapshot(currentDayKey, currentWeekKey);
      const backups = loadBackups();
      const key = snapshot.iso.slice(0, 10);
      backups[key] = snapshot;
      const keys = Object.keys(backups).sort();
      while (keys.length > MAX_BACKUPS) { delete backups[keys.shift()]; }
      saveBackups(backups);
      console.log("✓ 백업 저장됨:", key, "(routines:", snapshot.data.routines.length, ")");
      return snapshot;
    };
    window.__downloadBackup = (key) => {
      const backups = loadBackups();
      const b = key ? backups[key] : Object.values(backups).sort((a, b) => b.timestamp - a.timestamp)[0];
      if (!b) return console.error("백업 없음");
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todoRoom-backup-${b.iso.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
    window.__restoreBackup = async (key) => {
      const backups = loadBackups();
      const b = backups[key];
      if (!b) return console.error("백업 없음:", key);
      if (!confirm(`${key} 백업으로 모든 멤버 데이터를 복원할까요? (현재 Firestore 데이터 덮어씀)`)) return;
      const cols = {
        routines: routineCol(),
        daily: dailyCol(currentDayKey),
        weekly: weeklyCol(currentWeekKey),
      };
      let restored = 0;
      for (const [tag, path] of Object.entries(cols)) {
        const rows = b.data[tag] || [];
        for (const row of rows) {
          const { id, ...payload } = row;
          try {
            await setDoc(doc(db, path, id), payload);
            restored++;
          } catch (err) { console.warn("restore failed:", tag, id, err); }
        }
      }
      alert(`복원 완료 (${restored}개 문서). 새로고침합니다.`);
      location.reload();
    };

    window.__resetTodoRoomLocal = async () => {
      const removedStorageKeys = clearTodoRoomBrowserStorage();
      const removedDatabases = await clearTodoRoomIndexedDb();
      console.table({
        removedStorageKeys: removedStorageKeys.length,
        removedDatabases: removedDatabases.join(", ") || "(none)",
      });
      alert("todo-room 로컬 데이터 삭제 완료. 새로고침합니다.");
      location.reload();
    };

    // --- 멤버 루틴 직접 편집 (복구용 admin) ---
    // __viewMemberRoutine('UID')                   → 해당 uid의 현재 루틴 상태 출력
    // __addMemberRoutine('UID', '텍스트', 'morning')→ 새 루틴 항목 추가
    // __setMemberRoutine('UID', [items배열])       → items 통째로 교체
    // __clearMemberRoutine('UID')                  → 그 멤버 루틴 비우기
    window.__viewMemberRoutine = async (targetUid) => {
      if (!targetUid) return console.error("uid 필요");
      const snap = await getDoc(doc(db, routineCol(), targetUid));
      if (!snap.exists()) { console.log("문서 없음"); return null; }
      const data = snap.data();
      console.log("nickname:", data.nickname, "doneDate:", data.doneDate);
      console.table((data.items || []).map((it, i) => ({
        i, text: it.text, section: it.section, done: !!it.done, started: !!it.started,
      })));
      return data;
    };
    window.__setMemberRoutine = async (targetUid, items, opts = {}) => {
      if (!targetUid) return console.error("uid 필요");
      const snap = await getDoc(doc(db, routineCol(), targetUid));
      const current = snap.exists() ? snap.data() : {};
      const payload = {
        nickname: opts.nickname || current.nickname || "",
        avatar: opts.avatar || current.avatar || "",
        items: Array.isArray(items) ? items : [],
        doneDate: opts.doneDate || current.doneDate || currentDayKey,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, routineCol(), targetUid), payload);
      console.log("✓ updated", targetUid, "items:", payload.items.length);
      return payload;
    };
    window.__addMemberRoutine = async (targetUid, text, section = "anytime") => {
      if (!targetUid || !text) return console.error("uid 와 text 필요");
      const snap = await getDoc(doc(db, routineCol(), targetUid));
      const current = snap.exists() ? snap.data() : {};
      const items = Array.isArray(current.items) ? current.items.slice() : [];
      items.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        text,
        section,
        done: false,
        started: false,
        createdAt: Date.now(),
      });
      await window.__setMemberRoutine(targetUid, items, current);
    };
    window.__clearMemberRoutine = async (targetUid) => {
      if (!targetUid) return console.error("uid 필요");
      if (!confirm(`${targetUid} 루틴 다 지울까요?`)) return;
      await window.__setMemberRoutine(targetUid, []);
    };
  }, [uid, nickname, currentDayKey, currentWeekKey]);

  // 앱 로드시 자동 백업 — 마지막 백업이 24시간보다 오래되면 새 스냅샷 저장
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    if (typeof window === "undefined") return;
    const tryAutoBackup = async () => {
      const backups = loadBackups();
      const lastTs = Math.max(0, ...Object.values(backups).map((b) => b.timestamp || 0));
      if (Date.now() - lastTs < BACKUP_INTERVAL_MS) return;
      console.log("[auto-backup] 24h 경과 → 새 스냅샷 저장 중...");
      try {
        const snapshot = await captureBackupSnapshot(currentDayKey, currentWeekKey);
        const key = snapshot.iso.slice(0, 10);
        backups[key] = snapshot;
        const keys = Object.keys(backups).sort();
        while (keys.length > MAX_BACKUPS) { delete backups[keys.shift()]; }
        saveBackups(backups);
        console.log(
          `[auto-backup] ✓ ${key} 저장 (routines: ${snapshot.data.routines.length}, daily: ${snapshot.data.daily.length}, weekly: ${snapshot.data.weekly.length})`
        );
      } catch (err) {
        console.warn("[auto-backup] failed:", err);
      }
    };
    // 페이지 로드 직후엔 다른 구독들 정착 후 살짝 늦게 실행
    const t = setTimeout(tryAutoBackup, 3000);
    return () => clearTimeout(t);
  }, [uid, nicknameConfirmed, currentDayKey, currentWeekKey]);

  // Strip out anything that represents me — either my uid directly, or a "ghost" member
  // sharing my nickname. The self card injection above is the single source of truth for self.
  const myNicknameKey = normalizeNickname(nickname);
  const isSelfMember = (m) =>
    (uid && m.id === uid) ||
    (myNicknameKey && normalizeNickname(m.nickname) === myNicknameKey);
  const otherMembers = attachChallenges(
    attachEvents(
      attachRoutines(
        mergeDisplayMembers(members, weeklyMembers).filter((m) => !isSelfMember(m)),
        routineMembers.filter((m) => !isSelfMember(m)),
        currentDayKey
      ),
      eventMembers.filter((m) => !isSelfMember(m))
    ),
    challengeMembers.filter((m) => !isSelfMember(m))
  );
  const allMembers = [
    {
      id: uid,
      nickname,
      avatar,
      todos: myDaily,
      weeklyTodos: myWeekly,
      routineItems: (myRoutine.items || []).map((it) => ({ ...it })),
      routineDoneDate: myRoutine.doneDate || currentDayKey,
      events,
      challenges,
      isMe: true,
    },
    ...otherMembers,
  ].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    // 투두 있는 멤버 우선
    const aTodos = getMemberTodoTotal(a);
    const bTodos = getMemberTodoTotal(b);
    if (aTodos > 0 && bTodos === 0) return -1;
    if (aTodos === 0 && bTodos > 0) return 1;
    return 0;
  });
  const visibleMembers = allMembers.filter(
    (member) => member.isMe || getMemberTodoTotal(member) > 0
  );
  const idleMembers = allMembers.filter(
    (member) => !member.isMe && getMemberTodoTotal(member) === 0
  );

  if (!nicknameConfirmed && !profileRecoveryChecked) {
    return (
      <main className="room">
        <div className="nickname-setup">
          <h1>TO-DO ROOM</h1>
          <p className="setup-desc">기존 데이터 찾는 중...</p>
        </div>
      </main>
    );
  }

  /* ── 닉네임 미설정 화면 ── */
  if (!nicknameConfirmed) {
    return (
      <main className="room">
        <div className="nickname-setup">
          <h1>TO-DO ROOM</h1>
          <p className="setup-desc">아바타와 닉네임을 설정하세요</p>

          <div className="avatar-preview">{avatarPick}</div>

          <div className="avatar-grid">
            {AVATAR_LIST.map((em) => (
              <button
                key={em}
                className={`avatar-option ${avatarPick === em ? "selected" : ""}`}
                onClick={() => setAvatarPick(em)}
              >
                {em}
              </button>
            ))}
          </div>

          <input
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmNickname()}
            placeholder="닉네임 입력"
            autoFocus
            className="nickname-input"
          />
          <button className="btn-primary" onClick={confirmNickname}>
            입장하기
          </button>
        </div>
      </main>
    );
  }

  /* ── 메인 렌더 ── */
  return (
    <main className="room">
      <header className="room-header">
        <h1>TO-DO ROOM</h1>
        <p>{currentDayKey}</p>
        <div className="my-info">
          <span className="my-avatar-header">{avatar}</span>
          <span className="my-nickname">{nickname}</span>
          {badge.emoji && (
            <span className="my-badge">
              {badge.emoji} {badge.label}
            </span>
          )}
        </div>
      </header>

      {/* 탭 */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === "today" ? "active" : ""}`}
          onClick={() => setTab("today")}
        >
          오늘
        </button>



        <button
          className={`tab-btn ${tab === "challenge" ? "active" : ""}`}
          onClick={() => setTab("challenge")}
        >
          챌린지
        </button>
        <button
          className={`tab-btn ${tab === "quiz" ? "active" : ""}`}
          onClick={() => setTab("quiz")}
        >
          퀴즈
        </button>
        <button
          className={`tab-btn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          기록
        </button>
      </div>

      {tab === "today" ? (
        <div className="room-layout">
          {/* 투두 입력 (모바일에서 최상단) */}
          <section className="my-panel my-panel-input">
            <div className="me-card">
              <div className="me-card-header">
                <span className="me-label">내 프로필</span>
                <button
                  className="btn-small"
                  onClick={async () => {
                    const n = prompt("닉네임 변경", nickname);
                    if (!n?.trim() || n.trim() === nickname) return;
                    await resolveNicknameSession(n.trim(), avatar || avatarPick);
                  }}
                >
                  닉네임 변경
                </button>
              </div>
              <div className="me-nickname-display">
                <span className="me-avatar-inline">{avatar}</span>
                {nickname}
              </div>

              <div className="todo-input-row">
                <input
                  value={todoText}
                  onChange={(e) => setTodoText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDaily()}
                  placeholder="오늘 할일 입력"
                />
                <button className="btn-add" onClick={addDaily}>
                  추가
                </button>
              </div>
            </div>
          </section>

          {/* 멤버 패널 */}
          <section className="member-panel">
            <h2>MEMBERS</h2>
            {!membersReady ? (
              <div className="member-loading">
                <div className="member-loading-card" />
                <div className="member-loading-card" />
                <div className="member-loading-card" />
              </div>
            ) : (
              <>
                <div className="member-list">
                  {visibleMembers.map((m) => (
                    <MemberCard key={m.id} member={m} />
                  ))}
                </div>

                {idleMembers.length > 0 && (
                  <div className="member-group">
                    <button
                      className="member-group-toggle"
                      onClick={() => setShowIdleMembers((prev) => !prev)}
                    >
                      투두 0인 멤버 {idleMembers.length}명 {showIdleMembers ? "접기" : "보기"}
                    </button>
                    {showIdleMembers && (
                      <div className="member-list member-list-idle">
                        {idleMembers.map((m) => (
                          <MemberCard key={m.id} member={m} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 완수 로그 */}
            {toasts.length > 0 && (
              <div className="noti-log">
                <div className="noti-log-title">ACTIVITY</div>
                {toasts.map((toast) => (
                  <div key={toast.id} className="noti-log-item">
                    <span className="noti-log-icon">🎉</span>
                    <span className="noti-log-msg">{toast.message}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 내 투두 목록 */}
          <section className="my-panel my-panel-todos">
            {/* 데일리 투두 */}
            <div className="todo-panel todo-panel-daily">
              <button
                type="button"
                className="todo-panel-star"
                onClick={() => setEventPopoverOpen(true)}
                aria-label="이벤트 편집"
              >
                ✴︎
              </button>
              <h2>
                오늘의 TO-DO{" "}
                <span className="count-badge">
                  {dailyDoneCount}/{myDaily.length}
                </span>
              </h2>
              {closestEvent && (
                <div className="event-dday-line">
                  <span className="event-dday-name">{closestEvent.event.name}</span>
                  <span className="event-dday-tag">{formatDDay(closestEvent.diff)}</span>
                </div>
              )}

              <p className="reset-notice">매일 새벽 2시에 초기화됩니다</p>

              {myDaily.length === 0 ? (
                <div className="empty">아직 투두가 없어요.</div>
              ) : (
                <div className="todo-list">
                  {myDaily.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onCycle={cycleDaily}
                      onDelete={deleteDaily}
                    />
                  ))}
                </div>
              )}

              {eventPopoverOpen && (
                <EventPopover
                  events={events}
                  onAddEvent={addEvent}
                  onUpdateEvent={updateEvent}
                  onDeleteEvent={deleteEvent}
                  onClose={() => setEventPopoverOpen(false)}
                />
              )}
            </div>

            {/* 위클리 투두 (항상 표시) */}
            <div className="todo-panel weekly">
              <h2>
                주간 TO-DO{" "}
                <span className="count-badge">
                  {visibleWeekly.filter((t) => t.done).length}/{visibleWeekly.length}
                </span>
              </h2>
              <p className="reset-notice">
                매주 월요일 새벽 2시에 초기화됩니다 · 다음 초기화: {nextMondayLabel()}
              </p>

              <div className="todo-input-row">
                <input
                  value={weeklyTodoText}
                  onChange={(e) => setWeeklyTodoText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWeekly()}
                  placeholder="이번 주 할일 입력"
                />
                <button className="btn-add" onClick={addWeekly}>
                  추가
                </button>
              </div>

              {visibleWeekly.length === 0 ? (
                <div className="empty">주간 투두가 없어요.</div>
              ) : (
                <div className="todo-list">
                  {visibleWeekly.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onCycle={cycleWeekly}
                      onDelete={deleteWeekly}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 루틴 (매일 자정에 체크 풀림) */}
            <RoutineCard
              routine={myRoutine}
              routineText={routineText}
              routineSection={routineSection}
              setRoutineText={setRoutineText}
              setRoutineSection={setRoutineSection}
              addRoutine={addRoutine}
              cycleRoutine={cycleRoutine}
              deleteRoutine={deleteRoutine}
              celebrated={routineCelebrated}
            />
          </section>
        </div>
      ) : tab === "challenge" ? (
        <ChallengePanel
          challenges={challenges}
          onAddChallenge={addChallenge}
          onDeleteChallenge={deleteChallenge}
          onAddItem={addChallengeItem}
          onAddItemsBulk={addChallengeItemsBulk}
          onToggleItem={toggleChallengeItem}
          onDeleteItem={deleteChallengeItem}
        />
      ) : tab === "quiz" ? (
        quizConfig ? (
          <QuizPlayer
            subject={quizConfig.subject}
            level={quizConfig.level}
            uid={uid}
            nickname={nickname}
            onExit={() => setQuizConfig(null)}
          />
        ) : (
          <QuizHome
            uid={uid}
            onStart={(subject, level) => {
              setQuizConfig({ subject, level });
            }}
          />
        )
      ) : (
        <HistoryPanel
          dates={historyDates}
          selectedDate={selectedDate}
          data={historyData}
          weeklyData={historyWeeklyData}
          onSelect={loadHistory}
        />
      )}
    </main >
  );
}

/* ─────────────── RoutineDonut ─────────────── */
function RoutineDonut({ done, total, isComplete }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = total ? done / total : 0;
  const offset = circumference * (1 - progress);
  return (
    <svg
      className={`routine-donut${isComplete ? " complete" : ""}`}
      viewBox="0 0 36 36"
      width="32"
      height="32"
      aria-label={`${done}/${total}`}
    >
      <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--routine-track, #e8eadf)" strokeWidth="3.5" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="var(--routine-fill, #6bb38a)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x="18" y="21" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor">
        {isComplete ? "✓" : `${done}/${total}`}
      </text>
    </svg>
  );
}

/* ─────────────── RoutineItem ─────────────── */
function RoutineItem({ item, onCycle, onDelete }) {
  // 3-state cycle: 진행 전 → 진행중 → 완료 (TodoItem과 동일)
  const status = item.done ? "done" : item.started ? "doing" : "ready";
  const statusLabel = { ready: "진행 전", doing: "진행중", done: "완료" };
  return (
    <div className={`routine-item ${status}`}>
      <button
        type="button"
        className={`todo-cycle-btn routine-cycle ${status}`}
        onClick={() => onCycle(item.id)}
        aria-label={statusLabel[status]}
      />
      <span className="routine-text">{item.text}</span>
      <span className={`todo-status-label ${status}`}>{statusLabel[status]}</span>
      <button
        type="button"
        className="routine-del"
        onClick={() => onDelete(item.id)}
        aria-label="삭제"
      >
        ×
      </button>
    </div>
  );
}

/* ─────────────── RoutineCard ─────────────── */
function RoutineCard({
  routine,
  routineText,
  routineSection,
  setRoutineText,
  setRoutineSection,
  addRoutine,
  cycleRoutine,
  deleteRoutine,
  celebrated,
}) {
  const items = routine.items || [];
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const isComplete = total > 0 && done === total;
  return (
    <div className={`todo-panel routine${celebrated ? " celebrated" : ""}`}>
      <div className="routine-donut-anchor">
        <RoutineDonut done={done} total={total} isComplete={isComplete} />
      </div>
      <h2>
        루틴
        {isComplete && <span className="routine-finish-badge">🌿 완료!</span>}
      </h2>
      <p className="reset-notice">매일 자정에 체크가 자동으로 풀려요.</p>

      <div className="routine-input-row">
        <select
          className="routine-section-select"
          value={routineSection}
          onChange={(e) => setRoutineSection(e.target.value)}
          aria-label="시간대"
        >
          {ROUTINE_SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>
        <input
          value={routineText}
          onChange={(e) => setRoutineText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRoutine()}
          placeholder="반복할 습관 입력"
        />
        <button className="btn-add" onClick={addRoutine}>추가</button>
      </div>

      {total === 0 ? (
        <div className="empty">아직 등록한 루틴이 없어요.</div>
      ) : (
        ROUTINE_SECTIONS.map((s) => {
          const sectionItems = items.filter((i) => i.section === s.id);
          if (sectionItems.length === 0) return null;
          return (
            <div key={s.id} className="routine-section">
              <div className="routine-section-divider">
                <span>{s.emoji} {s.label}</span>
              </div>
              <div className="routine-list">
                {sectionItems.map((item) => (
                  <RoutineItem
                    key={item.id}
                    item={item}
                    onCycle={cycleRoutine}
                    onDelete={deleteRoutine}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ─────────────── EventPopover ─────────────── */
function EventPopover({
  events,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onClose,
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const submit = () => {
    if (!name.trim() || !date) return;
    onAddEvent({ name: name.trim(), date, isPublic });
    setName("");
    setDate("");
    setIsPublic(false);
  };

  const sortedEvents = [...events].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return (
    <div className="event-popover-overlay" onClick={onClose}>
      <div
        className="event-popover"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="이벤트 편집"
      >
        <div className="event-popover-head">
          <span>이벤트</span>
          <button className="event-popover-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="event-form">
          <label className="event-public-toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <span>공개</span>
          </label>
          <div className="event-form-row">
            <input
              className="event-name-input"
              placeholder="이벤트 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="event-add-btn" onClick={submit} aria-label="추가">
              +
            </button>
          </div>

        </div>

        {sortedEvents.length === 0 ? (
          <div className="empty">등록된 이벤트가 없어요.</div>
        ) : (
          <div className="event-list">
            {sortedEvents.map((e) => {
              const diff = computeDayDiff(e.date);
              return (
                <div key={e.id} className="event-row">
                  <span className="event-row-name">{e.name}</span>
                  <span className="event-row-date">{e.date}</span>
                  <span className="event-row-dday">{formatDDay(diff)}</span>
                  <button
                    type="button"
                    className={`event-row-visibility ${e.isPublic ? "public" : "private"}`}
                    onClick={() => onUpdateEvent(e.id, { isPublic: !e.isPublic })}
                    aria-label="공개 여부 전환"
                  >
                    {e.isPublic ? "공개" : "비공개"}
                  </button>
                  <button
                    type="button"
                    className="event-row-del"
                    onClick={() => onDeleteEvent(e.id)}
                    aria-label="이벤트 삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── ChallengePanel ─────────────── */
function ChallengePanel({
  challenges,
  onAddChallenge,
  onDeleteChallenge,
  onAddItem,
  onAddItemsBulk,
  onToggleItem,
  onDeleteItem,
}) {
  const [title, setTitle] = useState("");
  const [goalOptions, setGoalOptions] = useState(loadChallengeGoalOptions);
  const [selectedGoalId, setSelectedGoalId] = useState(""); // "" = 누적형
  const [customMode, setCustomMode] = useState(false);
  const [customGoalName, setCustomGoalName] = useState("");
  const selectedGoal = goalOptions.find((option) => option.id === selectedGoalId) || null;

  const submit = () => {
    const challengeTitle = getChallengeTitle(selectedGoal?.label, title);
    if (!challengeTitle) return;
    onAddChallenge({
      title: challengeTitle,
      goal: null,
    });
    setTitle("");
    setSelectedGoalId("");
  };

  const confirmCustom = () => {
    const nextLabel = customGoalName.trim();
    if (!nextLabel) return;
    const next = addChallengeGoalOption(goalOptions, nextLabel);
    const added = next.find((option) => option.label === nextLabel);
    setGoalOptions(next);
    saveChallengeGoalOptions(next);
    setSelectedGoalId(added?.id || "");
    setCustomMode(false);
    setCustomGoalName("");
  };

  const deleteSelectedGoal = () => {
    if (!selectedGoalId) return;
    const next = removeChallengeGoalOption(goalOptions, selectedGoalId);
    setGoalOptions(next);
    saveChallengeGoalOptions(next);
    setSelectedGoalId("");
  };

  const cancelCustom = () => {
    setCustomMode(false);
    setCustomGoalName("");
  };

  return (
    <div className="challenge-panel">
      <div className="challenge-add">
        {customMode ? (
          <div className="challenge-goal-custom">
            <input
              className="challenge-goal-input"
              placeholder="목표명"
              value={customGoalName}
              onChange={(e) => setCustomGoalName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCustom();
                if (e.key === "Escape") cancelCustom();
              }}
              autoFocus
            />
            <button
              type="button"
              className="challenge-goal-ok"
              onClick={confirmCustom}
              aria-label="목표 저장"
            >
              ✓
            </button>
            <button
              type="button"
              className="challenge-goal-back"
              onClick={cancelCustom}
              aria-label="취소"
            >
              ×
            </button>
          </div>
        ) : (
          <select
            className={`challenge-goal-select${selectedGoalId ? "" : " placeholder"}`}
            value={selectedGoalId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__new__") {
                setCustomMode(true);
              } else {
                setSelectedGoalId(v);
              }
            }}
            aria-label="목표"
          >
            <option value="">목표</option>
            {goalOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            <option value="__new__">+ 새 목표 추가</option>
          </select>
        )}
        {!customMode && selectedGoalId && (
          <button
            type="button"
            className="challenge-goal-back"
            onClick={deleteSelectedGoal}
            aria-label="목표 삭제"
          >
            ×
          </button>
        )}
        <input
          className="challenge-title-input"
          placeholder={selectedGoal ? "세부 제목을 적거나 바로 +" : "직접 입력 (예: 중국어 교재)"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          className="challenge-add-btn"
          onClick={submit}
          aria-label="챌린지 추가"
        >
          +
        </button>
      </div>
      <p className="challenge-hint">
        목표를 안 고르면 누적형으로 만들어져요 (끝없이 쌓임)
      </p>

      {challenges.length === 0 ? (
        <div className="empty">아직 챌린지가 없어요.</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onDelete={() => onDeleteChallenge(c.id)}
              onAddItem={(name) => onAddItem(c.id, name)}
              onAddItemsBulk={(names) => onAddItemsBulk(c.id, names)}
              onToggleItem={(itemId) => onToggleItem(c.id, itemId)}
              onDeleteItem={(itemId) => onDeleteItem(c.id, itemId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── ChallengeCard ─────────────── */
function ChallengeCard({
  challenge,
  onDelete,
  onAddItem,
  onAddItemsBulk,
  onToggleItem,
  onDeleteItem,
}) {
  const [text, setText] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const items = (challenge.items || []).map(normalizeChallengeItem);
  const progress = getChallengeProgress(items);
  const hasChecklist = progress.hasChecklist;
  const complete = hasChecklist && progress.done >= progress.total;
  const prevCompleteRef = useRef(complete);

  useEffect(() => {
    if (!prevCompleteRef.current && complete) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 3200);
      prevCompleteRef.current = complete;
      return () => clearTimeout(t);
    }
    prevCompleteRef.current = complete;
  }, [complete]);

  const submit = () => {
    if (!text.trim()) return;
    onAddItem(text);
    setText("");
  };

  const submitBulk = () => {
    const lines = bulkText.split("\n");
    onAddItemsBulk(lines);
    setBulkText("");
    setBulkOpen(false);
  };

  const sortedItems = [...items].sort(
    (a, b) => (b.createdAt || b.doneAt || 0) - (a.createdAt || a.doneAt || 0)
  );

  return (
    <div
      className={`challenge-card${complete ? " complete" : ""}${
        celebrating ? " celebrating" : ""
      }`}
    >
      {celebrating && (
        <div className="challenge-celebrate" aria-live="polite">
          🎉 목표 달성!
        </div>
      )}
      <div className="challenge-card-head">
        <span className="challenge-card-title">
          <RichChallengeText text={challenge.title} />
        </span>
        <span className="challenge-card-count">
          {hasChecklist ? `${progress.done}/${progress.total}` : `${progress.done}개`}
        </span>
        <button
          type="button"
          className="challenge-card-del"
          onClick={onDelete}
          aria-label="챌린지 삭제"
        >
          ×
        </button>
      </div>

      {hasChecklist && (
        <div className="challenge-progress">
          <div
            className="challenge-progress-fill"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}

      <div className="challenge-item-input-row">
        <input
          className="challenge-item-input"
          placeholder="완료한 항목 (예: 5장 문법)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          type="button"
          className="challenge-add-btn"
          onClick={submit}
          aria-label="기록 추가"
        >
          +
        </button>
      </div>

      <button
        type="button"
        className="challenge-bulk-toggle"
        onClick={() => setBulkOpen((v) => !v)}
      >
        {bulkOpen ? "닫기" : "목차 일괄입력"}
      </button>

      {bulkOpen && (
        <div className="challenge-bulk">
          <textarea
            className="challenge-bulk-input"
            placeholder={"한 줄에 하나씩\n예)\n챕터 1\n챕터 2\n챕터 3"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
          />
          <button
            type="button"
            className="challenge-bulk-submit"
            onClick={submitBulk}
          >
            {bulkText.split("\n").filter((l) => l.trim()).length}개 등록
          </button>
        </div>
      )}

      {sortedItems.length > 0 && (
        <ul className="challenge-item-list">
          {sortedItems.slice(0, 8).map((it) => (
            <li key={it.id} className={`challenge-item-row${it.done ? " done" : ""}`}>
              {hasChecklist && (
                <input
                  type="checkbox"
                  className="challenge-item-check"
                  checked={!!it.done}
                  onChange={() => onToggleItem(it.id)}
                  aria-label="목차 완료"
                />
              )}
              <span className="challenge-item-name">
                <RichChallengeText text={it.name} />
              </span>
              {it.doneAt && (
                <span className="challenge-item-date">
                  {new Date(it.doneAt).toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
              )}
              <button
                type="button"
                className="challenge-item-del"
                onClick={() => onDeleteItem(it.id)}
                aria-label="기록 삭제"
              >
                ×
              </button>
            </li>
          ))}
          {sortedItems.length > 8 && (
            <li className="challenge-item-more">
              … +{sortedItems.length - 8}개 더
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ─────────────── TodoItem ─────────────── */
function TodoItem({ todo, onCycle, onDelete }) {
  // 상태: 진행 전 → 진행중 → 완료
  const status = todo.done ? "done" : todo.started ? "doing" : "ready";
  const statusLabel = { ready: "진행 전", doing: "진행중", done: "완료" };

  return (
    <div className={`todo-item ${status}`}>
      <button
        className={`todo-cycle-btn ${status}`}
        onClick={() => onCycle(todo.id)}
      />

      <div className="todo-text">{todo.text}</div>

      <span className={`todo-status-label ${status}`}>
        {statusLabel[status]}
      </span>

      <button className="todo-delete" onClick={() => onDelete(todo.id)}>
        ×
      </button>
    </div>
  );
}

/* ─────────────── MemberCard ─────────────── */
function MemberCard({ member }) {
  const visibleWeeklyTodos = member.weeklyTodos || [];
  const routineItems = member.routineItems || [];
  const memberChallenges = member.challenges || [];
  const dailyDone = (member.todos || []).filter((t) => t.done).length;
  const weeklyDone = visibleWeeklyTodos.filter((t) => t.done).length;
  const totalDone = dailyDone + weeklyDone;
  const badge = getBadge(totalDone);
  const [routineExpanded, setRoutineExpanded] = useState(false);
  const closestEvent = pickClosestEvent(member.events || []);
  const showEventName = closestEvent && shouldShowMemberEventName(closestEvent.event);

  // Per-section counts for routine summary
  const routineCounts = ROUTINE_SECTIONS.reduce((acc, s) => {
    acc[s.id] = { done: 0, total: 0 };
    return acc;
  }, {});
  routineItems.forEach((it) => {
    const s = routineCounts[it.section] ? it.section : "anytime";
    routineCounts[s].total += 1;
    if (it.done) routineCounts[s].done += 1;
  });
  const routineTotal = routineItems.length;
  const routineDoneSum = routineItems.filter((it) => it.done).length;
  const routineAllDone = routineTotal > 0 && routineDoneSum === routineTotal;

  return (
    <div className={`member-card ${member.isMe ? "is-me" : ""}`}>
      <div className="member-head">
        <div className="member-name-row">
          <div className="member-avatar">
            {member.avatar || member.nickname?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <strong>
              {member.nickname}
              {member.isMe && <span className="me-tag">나</span>}
            </strong>
            {badge.emoji && (
              <span className="badge">
                {badge.emoji} {badge.label}
              </span>
            )}

          </div>
        </div>

        <div className="member-count">
          {totalDone}/{(member.todos || []).length + visibleWeeklyTodos.length}
        </div>
      </div>

      {closestEvent && (
        <div className="member-event-line">
          {showEventName && (
            <span className="member-event-name">{closestEvent.event.name}</span>
          )}
          <span className="member-event-dday">{formatDDay(closestEvent.diff)}</span>
        </div>
      )}

      <div className="member-todo-title">TODAY</div>
      <MiniTodoList todos={member.todos || []} />

      {visibleWeeklyTodos.length > 0 && (
        <>
          <div className="member-todo-title">WEEKLY</div>
          <MiniTodoList todos={visibleWeeklyTodos} />
        </>
      )}

      {routineTotal > 0 && (
        <>
          <div className="member-todo-title member-routine-title">
            ROUTINE
            {routineAllDone && <span className="member-routine-complete"> · 🌿 완료</span>}
          </div>
          <button
            type="button"
            className={`member-routine-summary${routineExpanded ? " expanded" : ""}`}
            onClick={() => setRoutineExpanded((v) => !v)}
            aria-label={routineExpanded ? "루틴 접기" : "루틴 펼치기"}
          >
            <span className="member-routine-counts">
              {ROUTINE_SECTIONS.map((s) => {
                const c = routineCounts[s.id];
                if (c.total === 0) return null;
                return (
                  <span key={s.id} className="member-routine-chip">
                    {s.emoji} {c.done}/{c.total}
                  </span>
                );
              })}
            </span>
            <span className="member-routine-toggle">{routineExpanded ? "▴" : "▾"}</span>
          </button>
          {routineExpanded && (
            <div className="member-routine-list">
              {ROUTINE_SECTIONS.map((s) => {
                const sItems = routineItems.filter((i) => (i.section || "anytime") === s.id);
                if (!sItems.length) return null;
                return (
                  <div key={s.id} className="member-routine-group">
                    <div className="member-routine-group-label">
                      {s.emoji} {s.label}
                    </div>
                    {sItems.map((it) => {
                      const st = it.done ? "done" : it.started ? "doing" : "ready";
                      return (
                        <div key={it.id} className={`mini-todo ${st}`}>
                          <span className={`todo-dot ${st}`} />
                          <span className={st === "done" ? "mini-text done" : "mini-text"}>
                            {it.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {memberChallenges.length > 0 && (
        <>
          <div className="member-todo-title">CHALLENGE</div>
          <div className="member-challenge-list">
            {memberChallenges.slice(0, 3).map((c) => {
              const progress = getChallengeProgress(c.items || []);
              return (
                <div key={c.id} className="member-challenge-row">
                  <span className="member-challenge-title">{c.title}</span>
                  <span className="member-challenge-count">
                    {progress.hasChecklist ? `${progress.done}/${progress.total}` : `${progress.done}개`}
                  </span>
                  {progress.hasChecklist && (
                    <div className="member-challenge-bar">
                      <div
                        className="member-challenge-bar-fill"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {memberChallenges.length > 3 && (
              <div className="member-challenge-more">
                … +{memberChallenges.length - 3}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────── MiniTodoList ─────────────── */
function MiniTodoList({ todos }) {
  if (!todos.length) {
    return <div className="mini-empty">아직 투두 없음</div>;
  }
  return (
    <div className="member-mini-todos">
      {todos.map((todo) => (
        <div className="mini-todo" key={todo.id}>
          <span
            className={`todo-dot ${todo.done ? "done" : todo.started ? "doing" : "ready"
              }`}
          />
          <span className={todo.done ? "mini-text done" : "mini-text"}>
            {todo.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── HistoryPanel ─────────────── */
function HistoryPanel({ dates, selectedDate, data, weeklyData, onSelect }) {
  const mergedMembers = (() => {
    const map = new Map();
    (data || []).forEach((m) => {
      const key = m.nickname || m.id;
      map.set(key, { ...m, todos: m.todos || [], weeklyTodos: [] });
    });
    (weeklyData || []).forEach((m) => {
      const key = m.nickname || m.id;
      if (map.has(key)) {
        map.get(key).weeklyTodos = m.todos || [];
      } else {
        map.set(key, { ...m, todos: [], weeklyTodos: m.todos || [] });
      }
    });
    return Array.from(map.values()).filter(
      (m) => m.todos.length > 0 || m.weeklyTodos.length > 0
    );
  })();

  return (
    <div className="history-panel">
      <h2>과거 기록</h2>

      {dates.length === 0 ? (
        <div className="empty">아직 과거 기록이 없어요.</div>
      ) : (
        <div className="history-months">
          {Object.entries(
            dates.reduce((acc, date) => {
              const month = date.slice(0, 7);
              if (!acc[month]) acc[month] = [];
              acc[month].push(date);
              return acc;
            }, {})
          ).map(([month, monthDates]) => (
            <div key={month} className="history-month-group">
              <div className="history-month-label">
                {parseInt(month.slice(5))}월
              </div>
              <div className="history-dates">
                {monthDates.map((date) => (
                  <button
                    key={date}
                    className={`history-date-btn ${selectedDate === date ? "active" : ""}`}
                    onClick={() => onSelect(date)}
                  >
                    {parseInt(date.slice(8))}일
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDate && (
        <div className="history-content">
          <h3>{selectedDate} 기록</h3>
          {mergedMembers.length === 0 ? (
            <div className="empty">해당 날짜에 기록이 없어요.</div>
          ) : (
            mergedMembers.map((member) => (
              <div key={member.id} className="history-member">
                <div className="history-member-name">
                  <div className="member-avatar small">
                    {member.avatar || member.nickname?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <strong>{member.nickname}</strong>
                  <span className="history-count">
                    {member.todos.filter((t) => t.done).length}/
                    {member.todos.length} 완료
                  </span>
                </div>
                {member.todos.length > 0 && (
                  <div className="history-todos">
                    {member.todos.map((t) => (
                      <div
                        key={t.id}
                        className={`history-todo ${t.done ? "done" : ""}`}
                      >
                        <span className="history-check">{t.done ? "✓" : "○"}</span>
                        {t.text}
                      </div>
                    ))}
                  </div>
                )}
                {member.weeklyTodos.length > 0 && (
                  <>
                    <div className="history-section-label">주간</div>
                    <div className="history-todos">
                      {member.weeklyTodos.map((t) => (
                        <div
                          key={t.id}
                          className={`history-todo ${t.done ? "done" : ""}`}
                        >
                          <span className="history-check">{t.done ? "✓" : "○"}</span>
                          {t.text}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

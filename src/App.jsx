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

function getNicknameMatchCurrentTotal(match) {
  return getTodoCount(match?.dailyTodos) + getTodoCount(match?.weeklyTodos);
}

function getNicknameMatchUpdatedAt(match) {
  return Math.max(
    getUpdatedAtValue(match?.dailyUpdatedAt),
    getUpdatedAtValue(match?.weeklyUpdatedAt),
    getUpdatedAtValue(match?.recentUpdatedAt)
  );
}

function choosePreferredNicknameMatch(a, b) {
  if (!a) return b;
  if (!b) return a;

  const aCurrentTotal = getNicknameMatchCurrentTotal(a);
  const bCurrentTotal = getNicknameMatchCurrentTotal(b);

  if (aCurrentTotal !== bCurrentTotal) {
    return bCurrentTotal > aCurrentTotal ? b : a;
  }

  const aRecentCount = getTodoCount(a.recentTodos);
  const bRecentCount = getTodoCount(b.recentTodos);

  if (aRecentCount !== bRecentCount) {
    return bRecentCount > aRecentCount ? b : a;
  }

  const aDailyCount = getTodoCount(a.dailyTodos);
  const bDailyCount = getTodoCount(b.dailyTodos);

  if (aDailyCount !== bDailyCount) {
    return bDailyCount > aDailyCount ? b : a;
  }

  if (!!a.avatar !== !!b.avatar) {
    return b.avatar ? b : a;
  }

  return getNicknameMatchUpdatedAt(b) > getNicknameMatchUpdatedAt(a) ? b : a;
}

function collectNicknameMatches(dailyRecords, weeklyRecords, recentMatch) {
  const matches = new Map();

  const ensureMatch = (id) => {
    if (!matches.has(id)) {
      matches.set(id, {
        id,
        nickname: "",
        avatar: "",
        dailyTodos: [],
        weeklyTodos: [],
        recentTodos: [],
        hasDailyDoc: false,
        hasWeeklyDoc: false,
        dailyUpdatedAt: null,
        weeklyUpdatedAt: null,
        recentUpdatedAt: null,
      });
    }

    return matches.get(id);
  };

  dailyRecords.forEach((record) => {
    if (!isValidUid(record.id)) return;
    const match = ensureMatch(record.id);
    match.nickname = record.nickname || match.nickname;
    match.avatar = match.avatar || record.avatar || "";
    match.dailyTodos = Array.isArray(record.todos) ? record.todos : [];
    match.hasDailyDoc = true;
    match.dailyUpdatedAt = record.updatedAt || match.dailyUpdatedAt;
  });

  weeklyRecords.forEach((record) => {
    if (!isValidUid(record.id)) return;
    const match = ensureMatch(record.id);
    const nextWeeklyTodos = Array.isArray(record.todos) ? record.todos : [];

    if (!match.hasWeeklyDoc) {
      match.nickname = record.nickname || match.nickname;
      match.avatar = match.avatar || record.avatar || "";
      match.weeklyTodos = nextWeeklyTodos;
      match.hasWeeklyDoc = true;
      match.weeklyUpdatedAt = record.updatedAt || match.weeklyUpdatedAt;
      return;
    }

    const existingWeeklyRecord = {
      nickname: match.nickname,
      avatar: match.avatar,
      todos: match.weeklyTodos,
      updatedAt: match.weeklyUpdatedAt,
    };
    const preferredWeeklyRecord = choosePreferredRecord(
      existingWeeklyRecord,
      record
    );

    if (preferredWeeklyRecord === record) {
      match.nickname = record.nickname || match.nickname;
      match.avatar = record.avatar || match.avatar || "";
      match.weeklyTodos = nextWeeklyTodos;
      match.weeklyUpdatedAt = record.updatedAt || match.weeklyUpdatedAt;
    }
  });

  if (recentMatch?.id && isValidUid(recentMatch.id)) {
    const match = ensureMatch(recentMatch.id);
    const recentData = recentMatch.data || {};
    match.nickname = recentData.nickname || match.nickname;
    match.avatar = match.avatar || recentData.avatar || "";
    match.recentTodos = Array.isArray(recentData.todos) ? recentData.todos : [];
    match.recentUpdatedAt = recentData.updatedAt || match.recentUpdatedAt;
  }

  return Array.from(matches.values());
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

// Reset all `done` flags if the date has changed since they were last set.
function rolloverRoutineDone(items, doneDate, todayKey) {
  if (doneDate === todayKey) return { items, changed: false };
  const next = items.map((it) => ({ ...it, done: false }));
  return { items: next, changed: true };
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

  // 루틴 (반복되는 매일 습관 — 매일 자정에 done만 리셋, 항목은 영구)
  const [myRoutine, setMyRoutine] = useState({ items: [], doneDate: "" });
  const [routineText, setRoutineText] = useState("");
  const [routineSection, setRoutineSection] = useState("morning");
  const [routineCelebrated, setRoutineCelebrated] = useState(false);

  // 다른 멤버
  const [members, setMembers] = useState([]);
  const [weeklyMembers, setWeeklyMembers] = useState([]);
  const [routineMembers, setRoutineMembers] = useState([]);

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

    const [dailyMatches, weeklyMatchGroups] = await Promise.all([
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

    return collectNicknameMatches(dailyRecords, weeklyRecords, null);
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
    const { items, changed } = rolloverRoutineDone(stored.items, stored.doneDate, currentDayKey);
    const next = { items, doneDate: currentDayKey };
    setMyRoutine(next);
    setRoutineCelebrated(false);
    if (changed) {
      saveStoredRoutine(routineStorageKey, next);
      syncMyRoutine(next);
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
      if (changed) {
        saveStoredRoutine(routineStorageKey, next);
        syncMyRoutine(next);
      } else {
        saveStoredRoutine(routineStorageKey, next);
      }
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

  const toggleRoutine = (id) => {
    const completedItem = (myRoutine.items || []).find(
      (it) => it.id === id && !it.done
    );
    const next = {
      ...myRoutine,
      doneDate: currentDayKey,
      items: (myRoutine.items || []).map((it) =>
        it.id === id ? { ...it, done: !it.done } : it
      ),
    };
    if (completedItem) {
      writeAddDoc(collection(db, notiCol(currentDayKey)), {
        message: `${nickname}님이 '${completedItem.text}'을(를) 완수하였습니다!`,
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
  }, [nickname, avatar, nicknameConfirmed, myDaily, myWeekly, syncMyDaily, syncMyWeekly]);

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
  }, [uid, nickname, currentDayKey, currentWeekKey]);

  // Strip out anything that represents me — either my uid directly, or a "ghost" member
  // sharing my nickname. The self card injection above is the single source of truth for self.
  const myNicknameKey = normalizeNickname(nickname);
  const isSelfMember = (m) =>
    (uid && m.id === uid) ||
    (myNicknameKey && normalizeNickname(m.nickname) === myNicknameKey);
  const otherMembers = attachRoutines(
    mergeDisplayMembers(members, weeklyMembers).filter((m) => !isSelfMember(m)),
    routineMembers.filter((m) => !isSelfMember(m)),
    currentDayKey
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
          className={`tab-btn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          기록
        </button>
        <button
          className={`tab-btn ${tab === "quiz" ? "active" : ""}`}
          onClick={() => setTab("quiz")}
        >
          퀴즈
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
            <div className="todo-panel">
              <h2>
                오늘의 TO-DO{" "}
                <span className="count-badge">
                  {dailyDoneCount}/{myDaily.length}
                </span>
              </h2>
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
              toggleRoutine={toggleRoutine}
              deleteRoutine={deleteRoutine}
              celebrated={routineCelebrated}
            />
          </section>
        </div>
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
function RoutineItem({ item, onToggle, onDelete }) {
  // 체크 스타일/크기를 TodoItem(todo-cycle-btn)과 통일 — done 색만 다른 게 의도(루틴=초록)
  const stateClass = item.done ? "done" : "ready";
  return (
    <div className={`routine-item ${stateClass}`}>
      <button
        type="button"
        className={`todo-cycle-btn routine-cycle ${stateClass}`}
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? "되돌리기" : "완료"}
      />
      <span className="routine-text">{item.text}</span>
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
  toggleRoutine,
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
                    onToggle={toggleRoutine}
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
  const dailyDone = (member.todos || []).filter((t) => t.done).length;
  const weeklyDone = visibleWeeklyTodos.filter((t) => t.done).length;
  const totalDone = dailyDone + weeklyDone;
  const badge = getBadge(totalDone);
  const [routineExpanded, setRoutineExpanded] = useState(false);

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
                    {sItems.map((it) => (
                      <div
                        key={it.id}
                        className={`mini-todo${it.done ? " done" : ""}`}
                      >
                        <span className={`todo-dot ${it.done ? "done" : "ready"}`} />
                        <span className={it.done ? "mini-text done" : "mini-text"}>
                          {it.text}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
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

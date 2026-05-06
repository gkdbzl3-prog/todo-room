import { useEffect, useState, useCallback, useRef } from "react";
import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
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

function getUid() {
  let uid = localStorage.getItem("todoRoom_uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("todoRoom_uid", uid);
  }
  return uid;
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
    const match = ensureMatch(record.id);
    match.nickname = record.nickname || match.nickname;
    match.avatar = match.avatar || record.avatar || "";
    match.dailyTodos = Array.isArray(record.todos) ? record.todos : [];
    match.hasDailyDoc = true;
    match.dailyUpdatedAt = record.updatedAt || match.dailyUpdatedAt;
  });

  weeklyRecords.forEach((record) => {
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

  if (recentMatch?.id) {
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

    if (!matchSnap.empty) {
      const bestDoc = matchSnap.docs.reduce((best, current) => {
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
  "🥹","💓","🌿","😴","😺","😻","🐱","🐤",
  "👻","🌙","🐰","🍧","🍕","🥚","🐮","🐷",
  "🐙","🦋","🌸","🌻","🍀","⭐","🔥","💎",
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

  // 다른 멤버
  const [members, setMembers] = useState([]);
  const [weeklyMembers, setWeeklyMembers] = useState([]);

  // 알림
  const [toasts, setToasts] = useState([]);

  // 탭
  const [tab, setTab] = useState("today"); // today | history
  const [historyDates, setHistoryDates] = useState([]);
  const [historyData, setHistoryData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showIdleMembers, setShowIdleMembers] = useState(false);
  const [membersReadyKey, setMembersReadyKey] = useState("");
  const skipDailyStorageSaveRef = useRef(false);
  const skipWeeklyStorageSaveRef = useRef(false);
  const legacyWeekKeyValue = legacyWeekKey();
  const currentMembersReadyKey = `${uid}:${nickname}:${currentDayKey}:${currentWeekKey}:${legacyWeekKeyValue}`;
  const membersReady = membersReadyKey === currentMembersReadyKey;

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
          .filter((docSnap) => docSnap.id !== uid)
          .map((docSnap) => setDoc(doc(db, collectionPath, docSnap.id), payload))
      );
    },
    [uid]
  );

  const loadNicknameMatches = useCallback(async (rawNickname) => {
    const normalizedNickname = normalizeNickname(rawNickname);
    if (!normalizedNickname) return [];
    const weeklyKeys =
      currentWeekKey === legacyWeekKeyValue
        ? [currentWeekKey]
        : [currentWeekKey, legacyWeekKeyValue];

    const [dailyMatches, weeklyMatchGroups, recentMatch] = await Promise.all([
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
      findRecentDailyMatchByNickname(normalizedNickname),
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

    return collectNicknameMatches(dailyRecords, weeklyRecords, recentMatch);
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

      void setDoc(doc(db, dailyCol(date), uid), payload).catch((error) => {
        console.error("Failed to sync daily todos", error);
      });
      void syncDuplicateNicknameDocs(dailyCol(date), nickname, payload).catch((error) => {
        console.error("Failed to sync duplicate daily todos", error);
      });
      // 날짜 기록
      void setDoc(doc(db, historyDatesCol(), date), { date }).catch((error) => {
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
        void setDoc(doc(db, weeklyCol(wk), uid), payload).catch((error) => {
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
        let sourceData = prevSnap.exists() ? prevSnap.data() : null;

        if (cancelled) return;

        if (!sourceData && nickname.trim()) {
          const recentMatch = await findRecentDailyMatchByNickname(nickname.trim());
          if (!cancelled && recentMatch) {
            sourceData = recentMatch.data;
          }
        }

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
        await setDoc(todayRef, {
          nickname: sourceData.nickname || nickname,
          avatar: nextAvatar,
          todos: carryTodos,
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, historyDatesCol(), today), { date: today });
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
        fallbackLoaded &&
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
        addDoc(collection(db, notiCol(currentDayKey)), {
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
        addDoc(collection(db, notiCol(currentDayKey)), {
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
    const snap = await getDocs(collection(db, dailyCol(date)));
    const data = [];
    snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
    setHistoryData(mergeRecordsByNickname(data));
  }

  /* ── 합산 ── */
  const dailyDoneCount = myDaily.filter((t) => t.done).length;
  const totalDoneCount =
    dailyDoneCount + myWeekly.filter((t) => t.done).length;
  const badge = getBadge(totalDoneCount);

  // 전체 멤버 (나 포함) 카드 데이터
  const otherMembers = mergeDisplayMembers(members, weeklyMembers);
  const allMembers = [
    { id: uid, nickname, avatar, todos: myDaily, weeklyTodos: myWeekly, isMe: true },
    ...otherMembers,
  ].sort((a, b) => {
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
      </div>

      {tab === "today" ? (
        <div className="room-layout">
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

          {/* 내 투두 */}
          <section className="my-panel">
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
                  {myWeekly.filter((t) => t.done).length}/{myWeekly.length}
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

              {myWeekly.length === 0 ? (
                <div className="empty">주간 투두가 없어요.</div>
              ) : (
                <div className="todo-list">
                  {myWeekly.map((todo) => (
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
          </section>
        </div>
      ) : (
        /* 히스토리 탭 */
        <HistoryPanel
          dates={historyDates}
          selectedDate={selectedDate}
          data={historyData}
          onSelect={loadHistory}
        />
      )}
    </main>
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
  const dailyDone = (member.todos || []).filter((t) => t.done).length;
  const weeklyDone = (member.weeklyTodos || []).filter((t) => t.done).length;
  const totalDone = dailyDone + weeklyDone;
  const badge = getBadge(totalDone);

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
          {dailyDone}/{(member.todos || []).length}
        </div>
      </div>

      <div className="member-todo-title">TODAY</div>
      <MiniTodoList todos={member.todos || []} />

      {(member.weeklyTodos || []).length > 0 && (
        <>
          <div className="member-todo-title">WEEKLY</div>
          <MiniTodoList todos={member.weeklyTodos} />
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
            className={`todo-dot ${
              todo.done ? "done" : todo.started ? "doing" : "ready"
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
function HistoryPanel({ dates, selectedDate, data, onSelect }) {
  return (
    <div className="history-panel">
      <h2>과거 기록</h2>

      {dates.length === 0 ? (
        <div className="empty">아직 과거 기록이 없어요.</div>
      ) : (
        <div className="history-dates">
          {dates.map((date) => (
            <button
              key={date}
              className={`history-date-btn ${
                selectedDate === date ? "active" : ""
              }`}
              onClick={() => onSelect(date)}
            >
              {date}
            </button>
          ))}
        </div>
      )}

      {selectedDate && data && (
        <div className="history-content">
          <h3>{selectedDate} 기록</h3>
          {data.length === 0 ? (
            <div className="empty">해당 날짜에 기록이 없어요.</div>
          ) : (
            data.map((member) => (
              <div key={member.id} className="history-member">
                <div className="history-member-name">
                  <div className="member-avatar small">
                    {member.avatar || member.nickname?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <strong>{member.nickname}</strong>
                  <span className="history-count">
                    {(member.todos || []).filter((t) => t.done).length}/
                    {(member.todos || []).length} 완료
                  </span>
                </div>
                <div className="history-todos">
                  {(member.todos || []).map((t) => (
                    <div
                      key={t.id}
                      className={`history-todo ${t.done ? "done" : ""}`}
                    >
                      <span className="history-check">
                        {t.done ? "✓" : "○"}
                      </span>
                      {t.text}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

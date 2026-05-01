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

const todayKey = () => getEffectiveDate().toISOString().slice(0, 10);

function weekKey() {
  const d = getEffectiveDate();
  const day = d.getDay();
  // 월요일 기준 (일요일=0 → 전 주로)
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function nextMondayLabel() {
  const d = getEffectiveDate();
  const day = d.getDay();
  const daysUntilMon = (8 - day) % 7 || 7;
  const next = new Date(d);
  next.setDate(next.getDate() + daysUntilMon);
  return `${next.getMonth() + 1}/${next.getDate()}(월)`;
}

function previousDayKey() {
  const d = getEffectiveDate();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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

function resetTodosForNewDay(todos) {
  return (todos || [])
    .filter((todo) => !todo.done)
    .map((todo) => ({
      ...todo,
      started: false,
      done: false,
      completedAt: null,
    }));
}

async function findRecentDailyMatchByNickname(targetNickname) {
  if (!targetNickname) return null;

  const historySnap = await getDocs(
    query(collection(db, historyDatesCol()), orderBy("date", "desc"), limit(14))
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
  const dayKeyRef = useRef(todayKey());
  const weekKeyRef = useRef(weekKey());

  const [nickname, setNickname] = useState(getSavedNickname);
  const [avatar, setAvatar] = useState(getSavedAvatar);
  const [nicknameConfirmed, setNicknameConfirmed] = useState(!!getSavedNickname());

  // 닉네임 = Firestore 문서 ID (로그인 전에는 null)
  const uid = nicknameConfirmed ? nickname : null;
  const dailyStorageKey = uid ? `todoRoom_daily_${uid}_${dayKeyRef.current}` : null;
  const weeklyStorageKey = uid ? `todoRoom_weekly_${uid}_${weekKeyRef.current}` : null;
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

  // (위클리 항상 표시)

  /* ── 닉네임 확정 (+ 기존 uuid 데이터 마이그레이션) ── */
  const confirmNickname = async () => {
    const n = nickInput.trim();
    if (!n) return;

    const oldUid = localStorage.getItem("todoRoom_uid");
    const date = todayKey();
    const wk = weekKey();

    try {
      // 1) 기존 uuid 문서 → 닉네임 문서로 마이그레이션
      if (oldUid && oldUid !== n) {
        const [oldDailySnap, oldWeeklySnap] = await Promise.all([
          getDoc(doc(db, dailyCol(date), oldUid)),
          getDoc(doc(db, weeklyCol(wk), oldUid)),
        ]);

        if (oldDailySnap.exists()) {
          const data = oldDailySnap.data();
          const existSnap = await getDoc(doc(db, dailyCol(date), n));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null, data
          );
          await setDoc(doc(db, dailyCol(date), n), {
            ...(merged || data),
            nickname: n, avatar: avatarPick, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, dailyCol(date), oldUid));
        }

        if (oldWeeklySnap.exists()) {
          const data = oldWeeklySnap.data();
          const existSnap = await getDoc(doc(db, weeklyCol(wk), n));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null, data
          );
          await setDoc(doc(db, weeklyCol(wk), n), {
            ...(merged || data),
            nickname: n, avatar: avatarPick, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, weeklyCol(wk), oldUid));
        }
      }

      // 2) 같은 닉네임의 다른 uuid 문서 정리 (다른 기기에서 생성된 것)
      const [dailyMatches, weeklyMatches] = await Promise.all([
        getDocs(query(collection(db, dailyCol(date)), where("nickname", "==", n))),
        getDocs(query(collection(db, weeklyCol(wk)), where("nickname", "==", n))),
      ]);

      for (const snap of dailyMatches.docs) {
        if (snap.id === n) continue;
        const existSnap = await getDoc(doc(db, dailyCol(date), n));
        const merged = choosePreferredRecord(
          existSnap.exists() ? existSnap.data() : null, snap.data()
        );
        await setDoc(doc(db, dailyCol(date), n), {
          ...(merged || snap.data()),
          nickname: n, avatar: avatarPick, updatedAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, dailyCol(date), snap.id));
      }

      for (const snap of weeklyMatches.docs) {
        if (snap.id === n) continue;
        const existSnap = await getDoc(doc(db, weeklyCol(wk), n));
        const merged = choosePreferredRecord(
          existSnap.exists() ? existSnap.data() : null, snap.data()
        );
        await setDoc(doc(db, weeklyCol(wk), n), {
          ...(merged || snap.data()),
          nickname: n, avatar: avatarPick, updatedAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, weeklyCol(wk), snap.id));
      }

      // 3) 닉네임 기반 문서에서 투두 로드
      const [myDSnap, myWSnap] = await Promise.all([
        getDoc(doc(db, dailyCol(date), n)),
        getDoc(doc(db, weeklyCol(wk), n)),
      ]);
      if (myDSnap.exists() && Array.isArray(myDSnap.data().todos)) {
        setMyDaily(myDSnap.data().todos);
      }
      if (myWSnap.exists() && Array.isArray(myWSnap.data().todos)) {
        setMyWeekly(myWSnap.data().todos);
      }
    } catch (err) {
      console.error("Migration failed:", err);
    }

    // uuid 기반 키 제거
    localStorage.removeItem("todoRoom_uid");

    setNickname(n);
    setAvatar(avatarPick);
    setNicknameConfirmed(true);
    localStorage.setItem("todoRoom_nickname", n);
    localStorage.setItem("todoRoom_avatar", avatarPick);
  };

  /* ── Firestore 데일리 동기화 ── */
  const syncMyDaily = useCallback(
    (todos) => {
      if (!nicknameConfirmed || !uid) return;
      const date = todayKey();
      void setDoc(doc(db, dailyCol(date), uid), {
        nickname,
        avatar,
        todos,
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Failed to sync daily todos", error);
      });
      // 날짜 기록
      void setDoc(doc(db, historyDatesCol(), date), { date }).catch((error) => {
        console.error("Failed to sync history date", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed]
  );

  const syncMyWeekly = useCallback(
    (todos) => {
      if (!nicknameConfirmed || !uid) return;
      const wk = weekKey();
      void setDoc(doc(db, weeklyCol(wk), uid), {
        nickname,
        avatar,
        todos,
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Failed to sync weekly todos", error);
      });
    },
    [uid, nickname, avatar, nicknameConfirmed]
  );

  useEffect(() => {
    if (dailyStorageKey) saveStoredTodos(dailyStorageKey, myDaily);
  }, [dailyStorageKey, myDaily]);

  useEffect(() => {
    if (weeklyStorageKey) saveStoredTodos(weeklyStorageKey, myWeekly);
  }, [weeklyStorageKey, myWeekly]);

  /* ── 로컬 프로필이 비었을 때 기존 uuid로 Firestore 복구 ── */
  useEffect(() => {
    if (nicknameConfirmed) return;

    const oldUid = localStorage.getItem("todoRoom_uid");
    if (!oldUid) {
      setProfileRecoveryChecked(true);
      return;
    }

    let cancelled = false;

    const recoverProfile = async () => {
      try {
        const [dailySnap, weeklySnap] = await Promise.all([
          getDoc(doc(db, dailyCol(todayKey()), oldUid)),
          getDoc(doc(db, weeklyCol(weekKey()), oldUid)),
        ]);

        if (cancelled) return;

        const dailyData = dailySnap.exists() ? dailySnap.data() : null;
        const weeklyData = weeklySnap.exists() ? weeklySnap.data() : null;
        let profileData = dailyData || weeklyData;

        if (!profileData) {
          const historySnap = await getDocs(
            query(collection(db, historyDatesCol()), orderBy("date", "desc"), limit(7))
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
  }, [nicknameConfirmed]);

  /* ── 자동 로그인 시 기존 uuid 문서 → 닉네임 문서 마이그레이션 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;
    const oldUid = localStorage.getItem("todoRoom_uid");
    if (!oldUid || oldUid === uid) {
      localStorage.removeItem("todoRoom_uid");
      return;
    }

    let cancelled = false;

    const migrateOldUid = async () => {
      try {
        const date = todayKey();
        const wk = weekKey();
        const [oldDailySnap, oldWeeklySnap] = await Promise.all([
          getDoc(doc(db, dailyCol(date), oldUid)),
          getDoc(doc(db, weeklyCol(wk), oldUid)),
        ]);

        if (cancelled) return;

        if (oldDailySnap.exists()) {
          const existSnap = await getDoc(doc(db, dailyCol(date), uid));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null,
            oldDailySnap.data()
          );
          await setDoc(doc(db, dailyCol(date), uid), {
            ...(merged || oldDailySnap.data()),
            nickname, avatar, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, dailyCol(date), oldUid));
        }

        if (oldWeeklySnap.exists()) {
          const existSnap = await getDoc(doc(db, weeklyCol(wk), uid));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null,
            oldWeeklySnap.data()
          );
          await setDoc(doc(db, weeklyCol(wk), uid), {
            ...(merged || oldWeeklySnap.data()),
            nickname, avatar, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, weeklyCol(wk), oldUid));
        }

        // 같은 닉네임의 다른 uuid 문서도 정리
        const [dailyMatches, weeklyMatches] = await Promise.all([
          getDocs(query(collection(db, dailyCol(date)), where("nickname", "==", nickname))),
          getDocs(query(collection(db, weeklyCol(wk)), where("nickname", "==", nickname))),
        ]);

        for (const snap of dailyMatches.docs) {
          if (snap.id === uid) continue;
          const existSnap = await getDoc(doc(db, dailyCol(date), uid));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null, snap.data()
          );
          await setDoc(doc(db, dailyCol(date), uid), {
            ...(merged || snap.data()),
            nickname, avatar, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, dailyCol(date), snap.id));
        }

        for (const snap of weeklyMatches.docs) {
          if (snap.id === uid) continue;
          const existSnap = await getDoc(doc(db, weeklyCol(wk), uid));
          const merged = choosePreferredRecord(
            existSnap.exists() ? existSnap.data() : null, snap.data()
          );
          await setDoc(doc(db, weeklyCol(wk), uid), {
            ...(merged || snap.data()),
            nickname, avatar, updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, weeklyCol(wk), snap.id));
        }

        localStorage.removeItem("todoRoom_uid");
      } catch (err) {
        console.error("Auto-migration failed:", err);
      }
    };

    void migrateOldUid();
    return () => { cancelled = true; };
  }, [uid, nicknameConfirmed, nickname, avatar]);

  /* ── 새 날짜 첫 진입 시 어제 미완료 투두 이어받기 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;

    const carryKey = `todoRoom_dailyCarry_${uid}_${todayKey()}`;

    let cancelled = false;

    const carryOverTodos = async () => {
      try {
        const today = todayKey();
        const todayRef = doc(db, dailyCol(today), uid);
        const todaySnap = await getDoc(todayRef);
        const todayTodos = todaySnap.exists() ? todaySnap.data().todos || [] : [];

        if (cancelled) return;
        if (todayTodos.length > 0) {
          localStorage.setItem(carryKey, "done");
          return;
        }

        const prevSnap = await getDoc(doc(db, dailyCol(previousDayKey()), uid));
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
  }, [uid, nicknameConfirmed, nickname, avatar]);

  /* ── 실시간 리스너 ── */
  useEffect(() => {
    if (!nicknameConfirmed || !uid) return;

    const date = todayKey();
    const wk = weekKey();

    // 데일리 멤버 리스너
    const unsubDaily = onSnapshot(
      collection(db, dailyCol(date)),
      (snap) => {
        const all = [];
        snap.forEach((d) => {
          all.push({ id: d.id, ...d.data() });
        });

        const selfCandidates = all.filter(
          (member) => member.id === uid || hasSameNickname(member, nickname)
        );
        const preferredSelf = selfCandidates.reduce((best, candidate) => {
          if (!best) return candidate;
          return choosePreferredRecord(best, candidate);
        }, null);

        if (preferredSelf) {
          setMyDaily(preferredSelf.todos || []);
        }

        setMembers(
          mergeRecordsByNickname(
            all.filter((member) => !selfCandidates.some((self) => self.id === member.id))
          )
        );
      },
      (error) => {
        console.error("Failed to subscribe daily todos", error);
      }
    );

    // 위클리 멤버 리스너
    const unsubWeekly = onSnapshot(
      collection(db, weeklyCol(wk)),
      (snap) => {
        const all = [];
        snap.forEach((d) => {
          all.push({ id: d.id, ...d.data() });
        });

        const selfCandidates = all.filter(
          (member) => member.id === uid || hasSameNickname(member, nickname)
        );
        const preferredSelf = selfCandidates.reduce((best, candidate) => {
          if (!best) return candidate;
          return choosePreferredRecord(best, candidate);
        }, null);

        if (preferredSelf) {
          setMyWeekly(preferredSelf.todos || []);
        }

        setWeeklyMembers(
          mergeRecordsByNickname(
            all.filter((member) => !selfCandidates.some((self) => self.id === member.id))
          )
        );
      },
      (error) => {
        console.error("Failed to subscribe weekly todos", error);
      }
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

    // 히스토리 날짜 리스너
    const unsubHistory = onSnapshot(
      query(collection(db, historyDatesCol()), orderBy("date", "desc")),
      (snap) => {
        const dates = [];
        snap.forEach((d) => dates.push(d.data().date));
        setHistoryDates(dates.filter((d) => d !== todayKey()));
      },
      (error) => {
        console.error("Failed to subscribe history dates", error);
      }
    );

    return () => {
      unsubDaily();
      unsubWeekly();
      unsubNoti();
      unsubHistory();
    };
  }, [uid, nicknameConfirmed, nickname]);

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
        addDoc(collection(db, notiCol(todayKey())), {
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
        addDoc(collection(db, notiCol(todayKey())), {
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
  const loadHistory = async (date) => {
    setSelectedDate(date);
    const snap = await getDocs(collection(db, dailyCol(date)));
    const data = [];
    snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
    setHistoryData(mergeRecordsByNickname(data));
  };

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
    const aTodos = (a.todos?.length || 0) + (a.weeklyTodos?.length || 0);
    const bTodos = (b.todos?.length || 0) + (b.weeklyTodos?.length || 0);
    if (aTodos > 0 && bTodos === 0) return -1;
    if (aTodos === 0 && bTodos > 0) return 1;
    return 0;
  });

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
        <p>{todayKey()}</p>
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
            <div className="member-list">
              {allMembers.map((m) => (
                <MemberCard key={m.id} member={m} />
              ))}
            </div>

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
                    const newNick = n.trim();
                    const oldNick = nickname;
                    const date = todayKey();
                    const wk = weekKey();

                    try {
                      const [dSnap, wSnap] = await Promise.all([
                        getDoc(doc(db, dailyCol(date), oldNick)),
                        getDoc(doc(db, weeklyCol(wk), oldNick)),
                      ]);
                      if (dSnap.exists()) {
                        await setDoc(doc(db, dailyCol(date), newNick), {
                          ...dSnap.data(), nickname: newNick, updatedAt: serverTimestamp(),
                        });
                        await deleteDoc(doc(db, dailyCol(date), oldNick));
                      }
                      if (wSnap.exists()) {
                        await setDoc(doc(db, weeklyCol(wk), newNick), {
                          ...wSnap.data(), nickname: newNick, updatedAt: serverTimestamp(),
                        });
                        await deleteDoc(doc(db, weeklyCol(wk), oldNick));
                      }
                    } catch (err) {
                      console.error("Nickname change migration failed:", err);
                    }

                    setNickname(newNick);
                    localStorage.setItem("todoRoom_nickname", newNick);
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

import { useEffect, useState, useCallback, useRef } from "react";
import {
  db,
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  getDocs,
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
  const uidRef = useRef(getUid());
  const profileRef = useRef({
    nickname: getSavedNickname(),
    avatar: getSavedAvatar(),
  });
  const dayKeyRef = useRef(todayKey());
  const weekKeyRef = useRef(weekKey());
  const uid = uidRef.current;
  const dailyStorageKey = `todoRoom_daily_${uid}_${dayKeyRef.current}`;
  const weeklyStorageKey = `todoRoom_weekly_${uid}_${weekKeyRef.current}`;

  const [nickname, setNickname] = useState(getSavedNickname);
  const [avatar, setAvatar] = useState(getSavedAvatar);
  const [nicknameConfirmed, setNicknameConfirmed] = useState(!!getSavedNickname());
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

  /* ── 닉네임 확정 ── */
  const confirmNickname = () => {
    const n = nickInput.trim();
    if (!n) return;
    setNickname(n);
    setAvatar(avatarPick);
    setNicknameConfirmed(true);
    localStorage.setItem("todoRoom_nickname", n);
    localStorage.setItem("todoRoom_avatar", avatarPick);
  };

  /* ── Firestore 데일리 동기화 ── */
  const syncMyDaily = useCallback(
    (todos) => {
      if (!nicknameConfirmed) return;
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
      if (!nicknameConfirmed) return;
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
    saveStoredTodos(dailyStorageKey, myDaily);
  }, [dailyStorageKey, myDaily]);

  useEffect(() => {
    saveStoredTodos(weeklyStorageKey, myWeekly);
  }, [weeklyStorageKey, myWeekly]);

  /* ── 앱 시작 시 모든 멤버 완료 항목 정리 ── */
  useEffect(() => {
    if (!nicknameConfirmed) return;
    const date = todayKey();
    getDocs(collection(db, dailyCol(date))).then((snap) => {
      snap.forEach((d) => {
        const data = d.data();
        const todos = data.todos || [];
        const active = todos.filter((t) => !t.done);
        if (active.length !== todos.length) {
          setDoc(doc(db, dailyCol(date), d.id), {
            ...data, todos: active, updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      });
    });
  }, [nicknameConfirmed]);

  /* ── 실시간 리스너 ── */
  useEffect(() => {
    if (!nicknameConfirmed) return;

    const date = todayKey();
    const wk = weekKey();

    // 데일리 멤버 리스너
    const unsubDaily = onSnapshot(
      collection(db, dailyCol(date)),
      (snap) => {
        const all = [];
        snap.forEach((d) => {
          const data = d.data();
          if (d.id === uid) {
            setMyDaily(data.todos || []);
          }
          all.push({ id: d.id, ...data });
        });
        setMembers(all.filter((m) => m.id !== uid));
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
          const data = d.data();
          if (d.id === uid) {
            setMyWeekly(data.todos || []);
          }
          all.push({ id: d.id, ...data });
        });
        setWeeklyMembers(all.filter((m) => m.id !== uid));
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
  }, [uid, nicknameConfirmed]);

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
    setHistoryData(data);
  };

  /* ── 합산 ── */
  const dailyDoneCount = myDaily.filter((t) => t.done).length;
  const totalDoneCount =
    dailyDoneCount + myWeekly.filter((t) => t.done).length;
  const badge = getBadge(totalDoneCount);

  // 전체 멤버 (나 포함) 카드 데이터
  const allMembers = [
    { id: uid, nickname, avatar, todos: myDaily, weeklyTodos: myWeekly, isMe: true },
    ...members.map((m) => {
      const wm = weeklyMembers.find((w) => w.id === m.id);
      return {
        ...m,
        weeklyTodos: wm?.todos || [],
        isMe: false,
      };
    }),
    // 위클리에만 있는 멤버
    ...weeklyMembers
      .filter((w) => !members.find((m) => m.id === w.id))
      .map((w) => ({
        id: w.id,
        nickname: w.nickname,
        todos: [],
        weeklyTodos: w.todos || [],
        isMe: false,
      })),
  ];

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
                  onClick={() => {
                    const n = prompt("닉네임 변경", nickname);
                    if (n?.trim()) {
                      setNickname(n.trim());
                      localStorage.setItem("todoRoom_nickname", n.trim());
                    }
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

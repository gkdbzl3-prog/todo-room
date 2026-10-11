// 멤버 카드 목록을 만드는 순수 로직. 오늘 daily 문서, 이번 주 weekly 문서,
// 그리고 루틴 문서를 닉네임 기준으로 합친다.
//
// 루틴을 세 번째 근거로 넣은 이유: daily도 weekly도 없는 멤버는 아무리 최근에
// 와 있었어도 이 목록에 아예 들어오지 못해서 grace가 판단할 기회조차 없었다.
// 하루끝님 카드가 사라진 실제 경로다(2026-10-12). 루틴 문서는 닉네임당 하나라
// 날짜가 바뀌어도 남아 있고 updatedAt도 있다.
//
// 다만 루틴 문서는 영구히 남으므로 "존재한다"만으로 띄우면 떠난 사람이 영원히
// 방에 남는다. 그래서 들여올 때 grace를 먼저 통과시킨다 — 근거는 items가
// 있다는 사실이 아니라 updatedAt이다.

export function normalizeNickname(nickname) {
  return nickname?.trim() || "";
}

export function getTodoCount(todos) {
  return Array.isArray(todos) ? todos.length : 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "최근에 와 있었다"로 인정하는 기간. 멤버 카드를 띄울 근거이자 ghost 정리의
// 보호 기간이다. 24시간 → 1주일 → 한 달로 늘려왔다.
//
// 1주일도 짧았다. 하루끝님이 2026-10-06부터 엿새 동안 접속을 못 하는 사이
// 주가 바뀌었고, 멤버 목록이 읽는 두 곳(오늘 daily, 이번 주 weekly) 모두에서
// 빠지면서 카드가 사라졌다. 며칠 바쁜 사람이 방에서 지워진 것처럼 보이는 게
// 이 앱에서는 데이터가 좀 오래 남는 것보다 나쁘다.
export const MEMBER_PRESENCE_GRACE_MS = 30 * MS_PER_DAY;

// Firestore Timestamp / epoch millis / {seconds} 중 어느 모양으로 와도 밀리초로.
export function getUpdatedAtMillis(updatedAt) {
  if (!updatedAt) return null;
  if (typeof updatedAt.toMillis === "function") return updatedAt.toMillis();
  if (typeof updatedAt === "number") return updatedAt;
  if (typeof updatedAt.seconds === "number") return updatedAt.seconds * 1000;
  return null;
}

// 오늘 투두가 없는 멤버의 카드를 띄울 유일한 근거. updatedAt을 흘리면 영구히
// false가 되므로 mergeDisplayMembers가 반드시 그 값을 들고 와야 한다.
export function isMemberRecentlyActive(
  member,
  now = Date.now(),
  graceMs = MEMBER_PRESENCE_GRACE_MS
) {
  const millis = getUpdatedAtMillis(member?.updatedAt);
  return !!millis && now - millis < graceMs;
}

export function getUpdatedAtValue(updatedAt) {
  if (!updatedAt) return 0;
  if (typeof updatedAt === "number") return updatedAt;
  if (typeof updatedAt.seconds === "number") return updatedAt.seconds;
  return 0;
}

export function choosePreferredRecord(a, b, todoKey = "todos") {
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

export function mergeDisplayMembers(
  dailyMembers,
  weeklyMembers,
  routineMembers = [],
  now = Date.now()
) {
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
        // updatedAt은 반드시 들고 와야 한다. 오늘 daily 문서가 없는 멤버의 카드는
        // 24시간 grace(isRecentlyActive)만이 살려주고, 그 판단은 updatedAt에만
        // 의존한다. 여기서 흘리면 어제 활동한 사람도 grace 없이 바로 사라진다.
        updatedAt: member.updatedAt,
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
      // 두 문서 중 더 최근에 쓰인 쪽을 활동 시각으로 본다.
      updatedAt:
        getUpdatedAtValue(member.updatedAt) > getUpdatedAtValue(existing.updatedAt)
          ? member.updatedAt
          : existing.updatedAt,
      isMe: false,
    });
  });

  // 루틴은 투두를 주지 않는다. 활동 시각만 보태고, daily/weekly 어디에도 없는
  // 사람은 grace를 통과할 때만 새로 들여온다.
  (routineMembers || []).forEach((member) => {
    const nicknameKey = normalizeNickname(member.nickname);
    const key = nicknameKey ? `nick:${nicknameKey}` : `id:${member.id}`;
    const existing = merged.get(key);

    if (existing) {
      // 비교는 getUpdatedAtMillis로 한다. 세 가지 모양(Timestamp/숫자/{seconds})을
      // 모두 밀리초로 맞춰주는 쪽이라 단위가 섞이지 않는다.
      const next = getUpdatedAtMillis(member.updatedAt);
      const prev = getUpdatedAtMillis(existing.updatedAt);
      if (next && (!prev || next > prev)) {
        merged.set(key, { ...existing, updatedAt: member.updatedAt });
      }
      return;
    }

    if (!isMemberRecentlyActive(member, now)) return;

    merged.set(key, {
      id: member.id,
      nickname: member.nickname,
      avatar: member.avatar || "",
      todos: [],
      weeklyTodos: [],
      updatedAt: member.updatedAt,
      // 루틴 문서 id는 uid가 아니라 `nick_<인코딩된 닉네임>`이다. ghost 정리는
      // 이 id로 daily/weekly/routines/events/challenges 문서를 지우므로, 그 경로에
      // 이 멤버가 들어가면 남의 루틴 문서를 지운다. 호출하는 쪽이 걸러낼 수 있게
      // 표시를 남긴다.
      fromRoutineOnly: true,
      isMe: false,
    });
  });

  return Array.from(merged.values());
}

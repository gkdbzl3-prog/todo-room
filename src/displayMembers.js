// 멤버 카드 목록을 만드는 순수 로직. 오늘 daily 문서와 이번 주 weekly 문서를
// 닉네임 기준으로 합친다.

export function normalizeNickname(nickname) {
  return nickname?.trim() || "";
}

export function getTodoCount(todos) {
  return Array.isArray(todos) ? todos.length : 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "최근에 와 있었다"로 인정하는 기간. 멤버 카드를 띄울 근거이자 ghost 정리의
// 보호 기간이다. 예전엔 24시간이었는데, 하루만 안 들어와도 카드가 사라져
// 서로 뭘 하는지 안 보인다는 신고가 있었다. 이제 1주일.
export const MEMBER_PRESENCE_GRACE_MS = 7 * MS_PER_DAY;

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

export function mergeDisplayMembers(dailyMembers, weeklyMembers) {
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

  return Array.from(merged.values());
}

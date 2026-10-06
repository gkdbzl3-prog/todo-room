// 멤버 카드 목록을 만드는 순수 로직. 오늘 daily 문서와 이번 주 weekly 문서를
// 닉네임 기준으로 합친다.

export function normalizeNickname(nickname) {
  return nickname?.trim() || "";
}

export function getTodoCount(todos) {
  return Array.isArray(todos) ? todos.length : 0;
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

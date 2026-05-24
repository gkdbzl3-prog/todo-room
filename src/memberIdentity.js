function normalizeNickname(nickname) {
  return nickname?.trim() || "";
}

function isValidUid(uid) {
  return (
    typeof uid === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)
  );
}

function getTodoCount(todos) {
  return Array.isArray(todos) ? todos.length : 0;
}

function getEventCount(events) {
  return Array.isArray(events) ? events.length : 0;
}

function getUpdatedAtValue(updatedAt) {
  if (!updatedAt) return 0;
  if (typeof updatedAt === "number") return updatedAt;
  if (typeof updatedAt.seconds === "number") return updatedAt.seconds;
  return 0;
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

export function getNicknameMatchCurrentTotal(match) {
  return getTodoCount(match?.dailyTodos) + getTodoCount(match?.weeklyTodos);
}

function getNicknameMatchUpdatedAt(match) {
  return Math.max(
    getUpdatedAtValue(match?.dailyUpdatedAt),
    getUpdatedAtValue(match?.weeklyUpdatedAt),
    getUpdatedAtValue(match?.eventUpdatedAt),
    getUpdatedAtValue(match?.recentUpdatedAt)
  );
}

export function choosePreferredNicknameMatch(a, b) {
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

  const aEventCount = getEventCount(a.events);
  const bEventCount = getEventCount(b.events);

  if (aEventCount !== bEventCount) {
    return bEventCount > aEventCount ? b : a;
  }

  if (!!a.avatar !== !!b.avatar) {
    return b.avatar ? b : a;
  }

  return getNicknameMatchUpdatedAt(b) > getNicknameMatchUpdatedAt(a) ? b : a;
}

export function collectNicknameMatches({
  dailyRecords,
  weeklyRecords,
  eventRecords = [],
  recentMatch,
}) {
  const matches = new Map();

  const ensureMatch = (id) => {
    if (!matches.has(id)) {
      matches.set(id, {
        id,
        nickname: "",
        avatar: "",
        dailyTodos: [],
        weeklyTodos: [],
        events: [],
        recentTodos: [],
        hasDailyDoc: false,
        hasWeeklyDoc: false,
        hasEventsDoc: false,
        dailyUpdatedAt: null,
        weeklyUpdatedAt: null,
        eventUpdatedAt: null,
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
    const preferredWeeklyRecord = choosePreferredRecord(existingWeeklyRecord, record);

    if (preferredWeeklyRecord === record) {
      match.nickname = record.nickname || match.nickname;
      match.avatar = record.avatar || match.avatar || "";
      match.weeklyTodos = nextWeeklyTodos;
      match.weeklyUpdatedAt = record.updatedAt || match.weeklyUpdatedAt;
    }
  });

  eventRecords.forEach((record) => {
    if (!isValidUid(record.id)) return;
    const match = ensureMatch(record.id);
    const nextEvents = Array.isArray(record.events) ? record.events : [];

    if (!match.hasEventsDoc || nextEvents.length >= match.events.length) {
      match.nickname = record.nickname || match.nickname;
      match.avatar = match.avatar || record.avatar || "";
      match.events = nextEvents;
      match.hasEventsDoc = true;
      match.eventUpdatedAt = record.updatedAt || match.eventUpdatedAt;
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

  return Array.from(matches.values()).filter((match) => normalizeNickname(match.nickname));
}

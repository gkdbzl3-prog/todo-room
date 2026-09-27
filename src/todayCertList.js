// 인증용 모아보기 목록.
//
// 오늘 하루를 인증할 때 화면 세 군데(오늘의 TO-DO, 주간 투두의 📌 항목, 루틴)를
// 번갈아 봐야 했다. 그 셋을 한 줄짜리 읽기 전용 목록으로 합친다.
//
// 중복은 호출 측이 넘기는 값으로 이미 걸러진다: 오늘 투두에는 루틴 detail에서
// 올라온 항목(fromRoutine)이 섞여 있고, 루틴 쪽에는 isRoutineCountable로 그
// 부모를 빼고 넘긴다. 그래서 같은 일이 두 줄로 나오지 않는다.

function toArray(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

// TodoItem과 같은 규칙 — 여기서 갈라지면 같은 항목이 두 곳에서 다른 상태로 보인다.
export function certStatus(item) {
  if (item?.done) return "done";
  if (item?.started) return "doing";
  return "ready";
}

function toRow(item, source) {
  return {
    key: `${source}-${item.id}`,
    id: item.id,
    text: item.text,
    status: certStatus(item),
    source,
  };
}

export function buildCertList({ dailyTodos, weeklyTodos, routineItems, dayKey } = {}) {
  const rows = [];

  toArray(dailyTodos).forEach((todo) => {
    rows.push(toRow(todo, todo.fromRoutine ? "routine" : "daily"));
  });

  // 주간 항목은 "오늘 카운트"로 찍은 것만 오늘 인증 대상이다.
  toArray(weeklyTodos)
    .filter((todo) => dayKey && todo.countedAt === dayKey)
    .forEach((todo) => rows.push(toRow(todo, "weekly")));

  toArray(routineItems).forEach((item) => rows.push(toRow(item, "routine")));

  return rows;
}

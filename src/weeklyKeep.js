// 주간 TO-DO는 주가 바뀌어도 초기화하지 않는다.
//
// 예전에는 월요일 새벽 2시에 지난주 목록을 버리고 미완수 항목만 done=false로
// 넘겼다. 매주 완수 기록이 사라지는 게 문제라서, 이제는 지난주 목록을 그대로
// 이어받는다. 주차별 문서 구조(weekly/<주차>/users)는 그대로 둔다 — 멤버 카드와
// 과거 기록이 그걸 읽으므로, 새 주 문서를 지난주 내용으로 채우는 방식이다.

function toArray(todos) {
  return Array.isArray(todos) ? todos.filter(Boolean) : [];
}

function signature(todo) {
  return [
    todo?.id ?? "",
    todo?.text ?? "",
    todo?.done ? 1 : 0,
    todo?.completedAt ?? "",
    todo?.countedAt ?? "",
  ].join(":");
}

// 지난주 목록을 기준으로 삼고, 이번 주 문서에 같은 id가 이미 있으면 이번 주
// 쪽을 쓴다. 이어받기가 돌기 전에 사용자가 이미 체크했거나 새로 적었을 수 있다.
export function mergeWeeklyForNewWeek(prevTodos, currentTodos) {
  const prev = toArray(prevTodos);
  const current = toArray(currentTodos);
  const currentById = new Map(current.map((todo) => [todo.id, todo]));
  const kept = prev.map((todo) => currentById.get(todo.id) ?? todo);
  const prevIds = new Set(prev.map((todo) => todo.id));

  return [...kept, ...current.filter((todo) => !prevIds.has(todo.id))];
}

// 병합 결과가 이번 주 문서와 같으면 쓰지 않는다. 항목 수만 비교하면
// "지난주 완수 1개 복원 + 이번 주 신규 1개" 같은 경우를 놓친다.
export function sameWeeklyTodos(a, b) {
  const left = toArray(a);
  const right = toArray(b);
  if (left.length !== right.length) return false;
  return left.every((todo, i) => signature(todo) === signature(right[i]));
}

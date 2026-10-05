// 주간 TO-DO는 주가 바뀌면 "완수한 것만" 버리고 나머지를 그대로 이어받는다.
//
// 예전에는 월요일 새벽 2시에 지난주 목록을 통째로 버렸다(완수 기록이 매주
// 사라지는 게 문제라 한동안 아무것도 안 버리게 뒀다). 그랬더니 끝낸 항목이
// 계속 쌓여 목록이 지저분해져서, 지금은 둘의 중간이다 — 미완수는 계속 넘기고
// 완수한 항목만 새 주에 들어올 때 정리한다.
//
// "완수"의 기준은 completedAt이다. 이번 주에 체크한 항목은 남기고(진행 상황이
// 보여야 한다), 새 주가 시작되기 전에 체크한 항목만 버린다. 주차별 문서 구조
// (weekly/<주차>/users)는 그대로 둔다 — 멤버 카드와 과거 기록이 그걸 읽으므로,
// 지난주 문서는 손대지 않고 새 주 문서를 채우는 방식이다.

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

// 새 주로 넘기지 않을 항목: 이 주가 시작되기 전에 완수한 것.
// completedAt이 없는 옛 완수 항목도 지난주 것으로 본다 — 언제 끝냈는지 모르면
// 이번 주에 한 건 아니다.
function isStaleDone(todo, weekStart) {
  if (!todo?.done) return false;
  if (!Number.isFinite(weekStart)) return false;
  const at = Number(todo.completedAt);
  return !Number.isFinite(at) || at < weekStart;
}

// 지난주 목록을 기준으로 삼고, 이번 주 문서에 같은 id가 이미 있으면 이번 주
// 쪽을 쓴다. 이어받기가 돌기 전에 사용자가 이미 체크했거나 새로 적었을 수 있다.
export function mergeWeeklyForNewWeek(prevTodos, currentTodos, weekStart) {
  const prev = toArray(prevTodos);
  const current = toArray(currentTodos);
  const currentById = new Map(current.map((todo) => [todo.id, todo]));
  // 이번 주 쪽으로 바꾼 뒤에 걸러낸다 — 지난주에 끝낸 항목을 이번 주에 다시
  // 체크했다면(또는 되돌렸다면) 그건 이번 주 기록이므로 남아야 한다.
  const kept = prev
    .map((todo) => currentById.get(todo.id) ?? todo)
    .filter((todo) => !isStaleDone(todo, weekStart));
  const prevIds = new Set(prev.map((todo) => todo.id));

  return [
    ...kept,
    ...current.filter((todo) => !prevIds.has(todo.id) && !isStaleDone(todo, weekStart)),
  ];
}

// 병합 결과가 이번 주 문서와 같으면 쓰지 않는다. 항목 수만 비교하면
// "지난주 완수 1개 복원 + 이번 주 신규 1개" 같은 경우를 놓친다.
export function sameWeeklyTodos(a, b) {
  const left = toArray(a);
  const right = toArray(b);
  if (left.length !== right.length) return false;
  return left.every((todo, i) => signature(todo) === signature(right[i]));
}

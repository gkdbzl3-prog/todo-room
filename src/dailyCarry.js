// 오늘 TO-DO의 하루 이월 규칙.
//
// App.jsx 안에 있던 순수 로직을 떼어냈다. 이월은 Firestore 왕복이 여러 번 걸려
// 수 초가 걸리는데, 그 사이 사용자는 이미 입력창에 새 항목을 적을 수 있다.
// 그때 "이월 시작 시점에 읽어둔 오늘 목록"만 기준으로 병합하면 사용자가 방금
// 적은 항목이 빠진 배열로 문서를 통째로 덮어써서 서로를 지운다.
// 그래서 병합 기준에는 그 사이 늘어난 로컬 항목도 함께 들어가야 한다.

function toArray(todos) {
  return Array.isArray(todos) ? todos.filter(Boolean) : [];
}

function idSet(todos) {
  return new Set(toArray(todos).map((todo) => todo.id));
}

// 다음 날로 넘길 항목만 남긴다. 완료된 항목과 "오늘만"(oneOff) 항목은 제외하고,
// 넘어가는 항목은 진행 상태를 초기화한다.
export function resetTodosForNewDay(todos) {
  return toArray(todos)
    .filter((todo) => !todo.done && !todo.oneOff)
    .map((todo) => ({
      ...todo,
      done: false,
      completedAt: null,
    }));
}

// 이월이 도는 동안 화면에서 늘어난 항목만 골라낸다.
// 날짜가 막 넘어간 순간에는 화면 상태에 아직 어제 목록이 남아 있을 수 있으므로,
// 이월 원본(sourceTodos)에 있던 항목은 "새로 적은 항목"으로 치지 않는다.
export function collectLocalAdditions(remoteToday, localTodos, sourceTodos) {
  const known = idSet(remoteToday);
  const fromSource = idSet(sourceTodos);

  return toArray(localTodos).filter(
    (todo) => !known.has(todo.id) && !fromSource.has(todo.id)
  );
}

// 오늘 문서에 써야 할 최종 목록.
// added는 remoteToday 대비 늘어난 항목 수 — 0이면 쓸 내용이 없다는 뜻이라
// 불필요한 덮어쓰기를 건너뛸 수 있다.
export function buildCarryMerge({ remoteToday, localTodos, sourceTodos, carryCandidates }) {
  const base = toArray(remoteToday);
  const additions = collectLocalAdditions(remoteToday, localTodos, sourceTodos);
  const withLocal = [...base, ...additions];
  const seen = idSet(withLocal);
  const carried = toArray(carryCandidates).filter((todo) => !seen.has(todo.id));

  return {
    todos: [...withLocal, ...carried],
    added: additions.length + carried.length,
  };
}

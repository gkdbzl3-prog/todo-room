function normalizeTodos(todos) {
  return Array.isArray(todos) ? todos : [];
}

function todoSignature(todos) {
  return normalizeTodos(todos)
    .map((todo) =>
      [
        todo?.id ?? "",
        todo?.text ?? "",
        todo?.started ? 1 : 0,
        todo?.done ? 1 : 0,
        todo?.completedAt ?? "",
      ].join(":")
    )
    .join("|");
}

// 원격 스냅샷이 방금 한 로컬 수정을 되돌리지 않게 한다.
// pendingTodos(= 아직 원격에서 되돌아오지 않은 로컬 목록)가 있으면, 원격이 그
// 내용과 같아질 때까지 로컬을 진실로 삼는다. 주간·오늘 목록이 함께 쓴다.
export function getOwnTodosFromRemote(currentTodos, preferredSelf, pendingTodos = null) {
  const pending = Array.isArray(pendingTodos) ? pendingTodos : null;
  const remoteTodos = preferredSelf ? normalizeTodos(preferredSelf.todos) : null;

  if (pending) {
    if (remoteTodos && todoSignature(remoteTodos) === todoSignature(pending)) {
      return { todos: remoteTodos, pendingTodos: null };
    }

    return { todos: pending, pendingTodos: pending };
  }

  if (!preferredSelf) {
    return { todos: normalizeTodos(currentTodos), pendingTodos: null };
  }

  return { todos: remoteTodos || [], pendingTodos: null };
}

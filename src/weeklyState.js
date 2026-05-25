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

export function getOwnWeeklyTodosFromRemote(currentTodos, preferredSelf, pendingTodos = null) {
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

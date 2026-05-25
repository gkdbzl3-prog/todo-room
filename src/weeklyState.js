export function getOwnWeeklyTodosFromRemote(currentTodos, preferredSelf) {
  if (!preferredSelf) {
    return Array.isArray(currentTodos) ? currentTodos : [];
  }

  return Array.isArray(preferredSelf.todos) ? preferredSelf.todos : [];
}

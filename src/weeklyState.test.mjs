import assert from "node:assert/strict";
import { getOwnTodosFromRemote } from "./weeklyState.js";

const localTodos = [{ id: 1, text: "주간 입력", done: false }];
const remoteTodos = [{ id: 2, text: "원격", done: false }];
const pendingTodos = [{ id: 3, text: "방금 입력", done: false }];

assert.deepEqual(
  getOwnTodosFromRemote(localTodos, null),
  { todos: localTodos, pendingTodos: null }
);
assert.deepEqual(
  getOwnTodosFromRemote(localTodos, { todos: remoteTodos }),
  { todos: remoteTodos, pendingTodos: null }
);
assert.deepEqual(
  getOwnTodosFromRemote(localTodos, { todos: remoteTodos }, pendingTodos),
  { todos: pendingTodos, pendingTodos }
);
assert.deepEqual(
  getOwnTodosFromRemote(localTodos, { todos: pendingTodos }, pendingTodos),
  { todos: pendingTodos, pendingTodos: null }
);
assert.deepEqual(
  getOwnTodosFromRemote(null, { todos: null }),
  { todos: [], pendingTodos: null }
);

console.log("weekly state tests passed");

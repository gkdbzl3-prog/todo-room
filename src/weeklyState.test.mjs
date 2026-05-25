import assert from "node:assert/strict";
import { getOwnWeeklyTodosFromRemote } from "./weeklyState.js";

const localTodos = [{ id: 1, text: "주간 입력", done: false }];

assert.deepEqual(getOwnWeeklyTodosFromRemote(localTodos, null), localTodos);
assert.deepEqual(
  getOwnWeeklyTodosFromRemote(localTodos, { todos: [{ id: 2, text: "원격", done: false }] }),
  [{ id: 2, text: "원격", done: false }]
);
assert.deepEqual(getOwnWeeklyTodosFromRemote(null, { todos: null }), []);

console.log("weekly state tests passed");

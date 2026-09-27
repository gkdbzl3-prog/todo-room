import assert from "node:assert/strict";
import { mergeWeeklyForNewWeek, sameWeeklyTodos } from "./weeklyKeep.js";

const doneItem = { id: 1, text: "완수한 것", done: true, completedAt: "2026-09-25" };
const openItem = { id: 2, text: "남은 것", done: false, completedAt: null };

// 지난주 완수 항목이 사라지지 않는다 — 초기화를 없앤 핵심.
assert.deepEqual(
  mergeWeeklyForNewWeek([doneItem, openItem], []),
  [doneItem, openItem]
);

// 이어받기 전에 넘어와 있던 미완수 항목은 이번 주 쪽(최신 상태)을 쓴다.
const carriedOpen = { id: 2, text: "남은 것", done: true, completedAt: "2026-09-28" };
assert.deepEqual(
  mergeWeeklyForNewWeek([doneItem, openItem], [carriedOpen]),
  [doneItem, carriedOpen]
);

// 이어받기 전에 새로 적은 항목은 뒤에 붙는다.
const fresh = { id: 3, text: "방금 적음", done: false };
assert.deepEqual(
  mergeWeeklyForNewWeek([doneItem], [fresh]),
  [doneItem, fresh]
);

// 지난주 문서가 없으면 이번 주 목록 그대로.
assert.deepEqual(mergeWeeklyForNewWeek(null, [fresh]), [fresh]);
assert.deepEqual(mergeWeeklyForNewWeek(undefined, undefined), []);

// 쓸 필요가 없는 경우를 걸러낸다.
assert.equal(sameWeeklyTodos([doneItem], [doneItem]), true);
assert.equal(sameWeeklyTodos([doneItem], [openItem]), false);
// 개수는 같지만 내용이 다른 경우도 잡는다.
assert.equal(sameWeeklyTodos([doneItem, openItem], [doneItem, carriedOpen]), false);
assert.equal(sameWeeklyTodos(null, []), true);

console.log("weekly keep tests passed");

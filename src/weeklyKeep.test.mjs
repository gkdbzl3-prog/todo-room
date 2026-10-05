import assert from "node:assert/strict";
import { mergeWeeklyForNewWeek, sameWeeklyTodos } from "./weeklyKeep.js";

// 2026-09-28(월) 새벽 2시 = 이번 주 시작
const weekStart = new Date("2026-09-28T02:00:00").getTime();
const lastWeek = new Date("2026-09-25T10:00:00").getTime();
const thisWeek = new Date("2026-09-29T10:00:00").getTime();

const doneLastWeek = { id: 1, text: "완수한 것", done: true, completedAt: lastWeek };
const openItem = { id: 2, text: "남은 것", done: false, completedAt: null };

// 지난주에 끝낸 항목은 새 주로 넘기지 않는다. 미완수는 그대로 넘어간다.
assert.deepEqual(
  mergeWeeklyForNewWeek([doneLastWeek, openItem], [], weekStart),
  [openItem]
);

// 이번 주에 체크한 항목은 남는다 — 진행 상황이 보여야 한다.
const doneThisWeek = { id: 3, text: "이번 주에 끝냄", done: true, completedAt: thisWeek };
assert.deepEqual(
  mergeWeeklyForNewWeek([openItem], [doneThisWeek], weekStart),
  [openItem, doneThisWeek]
);

// 지난주에 끝낸 항목을 이번 주에 다시 체크했으면 이번 주 기록이므로 남는다.
const recheck = { id: 1, text: "완수한 것", done: true, completedAt: thisWeek };
assert.deepEqual(
  mergeWeeklyForNewWeek([doneLastWeek, openItem], [recheck], weekStart),
  [recheck, openItem]
);

// 지난주에 끝낸 걸 이번 주에 되돌렸으면(미완수) 그대로 남는다.
const reopened = { id: 1, text: "완수한 것", done: false, completedAt: null };
assert.deepEqual(
  mergeWeeklyForNewWeek([doneLastWeek], [reopened], weekStart),
  [reopened]
);

// completedAt이 없는 옛 완수 항목도 지난주 것으로 본다.
assert.deepEqual(
  mergeWeeklyForNewWeek([{ id: 4, text: "옛 완수", done: true }], [], weekStart),
  []
);

// 이어받기 전에 새로 적은 항목은 뒤에 붙는다.
const fresh = { id: 5, text: "방금 적음", done: false };
assert.deepEqual(
  mergeWeeklyForNewWeek([openItem], [fresh], weekStart),
  [openItem, fresh]
);

// 지난주 문서가 없으면 이번 주 목록 그대로(완수 정리만 적용).
assert.deepEqual(mergeWeeklyForNewWeek(null, [fresh], weekStart), [fresh]);
assert.deepEqual(mergeWeeklyForNewWeek(undefined, undefined, weekStart), []);

// 주 시작 시각을 모르면 아무것도 버리지 않는다 — 잘못 지우는 쪽이 더 나쁘다.
assert.deepEqual(
  mergeWeeklyForNewWeek([doneLastWeek, openItem], [], null),
  [doneLastWeek, openItem]
);

// 쓸 필요가 없는 경우를 걸러낸다.
assert.equal(sameWeeklyTodos([doneLastWeek], [doneLastWeek]), true);
assert.equal(sameWeeklyTodos([doneLastWeek], [openItem]), false);
// 개수는 같지만 내용이 다른 경우도 잡는다.
assert.equal(sameWeeklyTodos([doneLastWeek, openItem], [doneLastWeek, recheck]), false);
assert.equal(sameWeeklyTodos(null, []), true);

console.log("weekly keep tests passed");

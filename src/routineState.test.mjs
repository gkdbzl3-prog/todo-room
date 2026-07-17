import assert from "node:assert/strict";
import { getRoutineForStorageLoad } from "./routineState.js";

const current = {
  items: [
    {
      id: 1,
      text: "집안일",
      started: true,
      done: true,
      section: "morning",
      note: "설거지, 청소",
      noteState: { 설거지: "done" },
      off: true,
    },
  ],
  doneDate: "2026-05-24",
};

const next = getRoutineForStorageLoad({
  stored: { items: [], doneDate: "" },
  current,
  sameStorageKey: true,
  currentDayKey: "2026-05-25",
});

assert.equal(next.doneDate, "2026-05-25");
assert.equal(next.items.length, 1);
assert.equal(next.items[0].text, "집안일");
assert.equal(next.items[0].started, false);
assert.equal(next.items[0].done, false);
// 새벽 2시 이월 시 detail(note)과 그 진행 상태(noteState)는 함께 초기화된다.
assert.equal(next.items[0].note, "");
assert.deepEqual(next.items[0].noteState, {});
// off("잠시 쉬는 루틴")는 날짜가 바뀌어도 유지된다.
assert.equal(next.items[0].off, true);

console.log("routine state tests passed");

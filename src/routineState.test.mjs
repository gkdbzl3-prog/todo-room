import assert from "node:assert/strict";
import { getRoutineForStorageLoad } from "./routineState.js";

const current = {
  items: [
    { id: 1, text: "물 마시기", started: true, done: true, section: "morning", note: "찬물로" },
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
assert.equal(next.items[0].text, "물 마시기");
assert.equal(next.items[0].started, false);
assert.equal(next.items[0].done, false);
// 새벽 2시 이월 시 detail(note)도 초기화된다.
assert.equal(next.items[0].note, "");

console.log("routine state tests passed");

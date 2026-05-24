import assert from "node:assert/strict";
import {
  createCompletedChallengeItem,
  createPlannedChallengeItems,
  getChallengeProgress,
  normalizeChallengeItem,
  toggleChallengeItemDone,
} from "./challengeProgress.js";

const legacy = normalizeChallengeItem({ id: 1, name: "기존 기록", doneAt: 10 });
assert.equal(legacy.done, true);
assert.equal(legacy.doneAt, 10);
assert.equal(legacy.kind, "completed");

const planned = createPlannedChallengeItems(["1강", "2강"], 100);
assert.equal(planned.length, 2);
assert.equal(planned[0].done, false);
assert.equal(planned[0].doneAt, null);
assert.equal(planned[0].kind, "planned");

const completed = createCompletedChallengeItem("복습", 200);
assert.equal(completed.done, true);
assert.equal(completed.doneAt, 200);
assert.equal(completed.kind, "completed");

const toggled = toggleChallengeItemDone(planned[0], 300);
assert.equal(toggled.done, true);
assert.equal(toggled.doneAt, 300);
assert.equal(toggled.kind, "planned");

assert.deepEqual(getChallengeProgress([planned[0], toggled]), {
  done: 1,
  total: 2,
  pct: 50,
  hasChecklist: true,
});

assert.deepEqual(getChallengeProgress([completed]), {
  done: 1,
  total: 1,
  pct: 100,
  hasChecklist: false,
});

console.log("challenge progress tests passed");

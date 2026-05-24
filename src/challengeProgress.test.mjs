import assert from "node:assert/strict";
import {
  createCompletedChallengeItem,
  createPlannedChallengeItems,
  getChallengeGoalLabel,
  getChallengeProgress,
  groupChallengeCardsByGoal,
  groupChallengesByGoal,
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

assert.equal(getChallengeGoalLabel("{코딩}(1회독)"), "코딩");
assert.equal(getChallengeGoalLabel("{코딩}(리액트)"), "코딩");
assert.equal(getChallengeGoalLabel("영단어"), "영단어");

const grouped = groupChallengesByGoal([
  {
    id: "a",
    title: "{코딩}(1회독)",
    items: [planned[0]],
  },
  {
    id: "b",
    title: "{코딩}(리액트)",
    items: [toggled],
  },
  {
    id: "c",
    title: "영단어",
    items: [completed],
  },
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].id, "goal:코딩");
assert.equal(grouped[0].title, "코딩");
assert.deepEqual(getChallengeProgress(grouped[0].items), {
  done: 1,
  total: 2,
  pct: 50,
  hasChecklist: true,
});
assert.equal(grouped[1].id, "goal:영단어");
assert.equal(grouped[1].title, "영단어");

const cardGroups = groupChallengeCardsByGoal([
  { id: "a", title: "{코딩}(1회독)", items: [] },
  { id: "b", title: "{코딩}(리액트)", items: [] },
  { id: "c", title: "영단어", items: [] },
]);
assert.equal(cardGroups.length, 2);
assert.equal(cardGroups[0].title, "코딩");
assert.equal(cardGroups[0].hasGoal, true);
assert.equal(cardGroups[0].challenges.length, 2);
assert.equal(cardGroups[0].challenges[0].displayTitle, "1회독");
assert.equal(cardGroups[0].challenges[1].displayTitle, "리액트");
assert.equal(cardGroups[1].title, "영단어");
assert.equal(cardGroups[1].hasGoal, false);
assert.equal(cardGroups[1].challenges[0].displayTitle, "영단어");

console.log("challenge progress tests passed");

import assert from "node:assert/strict";
import {
  createCompletedChallengeItem,
  createPlannedChallengeItems,
  getChallengeGoalLabel,
  getChallengeProgress,
  groupChallengeCardsByGoal,
  groupChallengesByGoal,
  groupItemsBySection,
  normalizeChallengeItem,
  parseBulkChallengeInput,
  parseNumericValue,
  sortChallengeItemsForDisplay,
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
  hasNumeric: false,
  numericMax: 0,
  numericGoal: 0,
});

assert.deepEqual(getChallengeProgress([completed]), {
  done: 1,
  total: 1,
  pct: 100,
  hasChecklist: false,
  hasNumeric: false,
  numericMax: 0,
  numericGoal: 0,
});

// 수치 모드: goal과 value 기반 진척
assert.equal(parseNumericValue("150"), 150);
assert.equal(parseNumericValue("12.5"), 12.5);
assert.equal(parseNumericValue("150쪽"), null);
assert.equal(parseNumericValue(" 200 "), 200);

const numItem1 = createCompletedChallengeItem("150", 1000);
const numItem2 = createCompletedChallengeItem("250", 2000);
assert.equal(numItem1.value, 150);
assert.equal(numItem2.value, 250);
assert.equal(createCompletedChallengeItem("일반 텍스트").value, null);

assert.deepEqual(getChallengeProgress([numItem1, numItem2], 912), {
  done: 2,
  total: 2,
  pct: 27,
  hasChecklist: false,
  hasNumeric: true,
  numericMax: 250,
  numericGoal: 912,
});

// goal이 없으면 numeric 모드 비활성
assert.equal(getChallengeProgress([numItem1, numItem2], null).hasNumeric, false);

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
  hasNumeric: false,
  numericMax: 0,
  numericGoal: 0,
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

assert.deepEqual(
  sortChallengeItemsForDisplay(createPlannedChallengeItems(["첫번째", "두번째", "세번째"], 500)).map(
    (item) => item.name
  ),
  ["첫번째", "두번째", "세번째"]
);

assert.deepEqual(
  sortChallengeItemsForDisplay([
    createCompletedChallengeItem("먼저 기록", 500),
    createCompletedChallengeItem("나중 기록", 700),
  ]).map((item) => item.name),
  ["먼저 기록", "나중 기록"]
);

// 섹션 헤더 파싱
assert.deepEqual(
  parseBulkChallengeInput("[필사]\n1\n2\n[듣기]\n1\n2"),
  [
    { name: "1", section: "필사" },
    { name: "2", section: "필사" },
    { name: "1", section: "듣기" },
    { name: "2", section: "듣기" },
  ]
);

// 헤더 없으면 전부 section=null
assert.deepEqual(
  parseBulkChallengeInput("a\nb"),
  [
    { name: "a", section: null },
    { name: "b", section: null },
  ]
);

// 헤더 + 헤더 위 항목은 section=null
assert.deepEqual(
  parseBulkChallengeInput("intro\n[A]\n1"),
  [
    { name: "intro", section: null },
    { name: "1", section: "A" },
  ]
);

// createPlannedChallengeItems가 {name, section} 받기
const sectioned = createPlannedChallengeItems(
  [
    { name: "1", section: "필사" },
    { name: "2", section: "듣기" },
  ],
  10000
);
assert.equal(sectioned[0].section, "필사");
assert.equal(sectioned[1].section, "듣기");

// 문자열도 여전히 받음 (backward compat)
const plain = createPlannedChallengeItems(["a", "b"], 20000);
assert.equal(plain[0].section, null);

// 섹션 묶기
const sectionGrouped = groupItemsBySection([
  { id: 1, name: "1", section: "필사", createdAt: 100 },
  { id: 2, name: "2", section: "필사", createdAt: 101 },
  { id: 3, name: "1", section: "듣기", createdAt: 200 },
  { id: 4, name: "x", createdAt: 50 }, // section 없음
]);
assert.equal(sectionGrouped.length, 3);
assert.equal(sectionGrouped[0].section, null); // 가장 먼저 (createdAt 50)
assert.equal(sectionGrouped[1].section, "필사");
assert.equal(sectionGrouped[2].section, "듣기");
assert.equal(sectionGrouped[1].items.length, 2);

console.log("challenge progress tests passed");

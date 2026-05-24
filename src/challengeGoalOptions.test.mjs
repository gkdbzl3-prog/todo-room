import assert from "node:assert/strict";
import {
  addChallengeGoalOption,
  getChallengeTitle,
  normalizeChallengeGoalOptions,
  removeChallengeGoalOption,
} from "./challengeGoalOptions.js";

assert.deepEqual(normalizeChallengeGoalOptions(["행정법"])[0], {
  id: "target:행정법",
  label: "행정법",
});

assert.deepEqual(
  normalizeChallengeGoalOptions([{ id: "admin-law", label: "행정법" }])[0],
  { id: "admin-law", label: "행정법" }
);

const next = addChallengeGoalOption([], "한국사");
assert.equal(next.length, 1);
assert.equal(next[0].label, "한국사");

assert.equal(addChallengeGoalOption(next, "한국사").length, 1);

assert.deepEqual(removeChallengeGoalOption(next, next[0].id), []);

assert.equal(getChallengeTitle("한국사", "  1회독  "), "{한국사}(1회독)");
assert.equal(getChallengeTitle("한국사", ""), "{한국사}");
assert.equal(getChallengeTitle("", "1회독"), "1회독");

console.log("challenge goal option tests passed");

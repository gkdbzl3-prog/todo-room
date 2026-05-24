import assert from "node:assert/strict";
import {
  collectNicknameMatches,
  choosePreferredNicknameMatch,
} from "./memberIdentity.js";

const uidWithEvents = "11111111-1111-4111-8111-111111111111";
const uidWithoutEvents = "22222222-2222-4222-8222-222222222222";

const matches = collectNicknameMatches({
  dailyRecords: [
    {
      id: uidWithoutEvents,
      nickname: "쫑",
      avatar: "",
      todos: [],
      updatedAt: { seconds: 10 },
    },
  ],
  weeklyRecords: [],
  eventRecords: [
    {
      id: uidWithEvents,
      nickname: "쫑",
      avatar: "🌿",
      events: [{ id: 1, name: "시험", date: "2026-06-01", isPublic: true }],
      updatedAt: { seconds: 20 },
    },
  ],
  recentMatch: null,
});

const preferred = matches.reduce((best, candidate) => {
  if (!best) return candidate;
  return choosePreferredNicknameMatch(best, candidate);
}, null);

assert.equal(preferred.id, uidWithEvents);
assert.equal(preferred.avatar, "🌿");
assert.equal(preferred.hasEventsDoc, true);
assert.deepEqual(preferred.events, [
  { id: 1, name: "시험", date: "2026-06-01", isPublic: true },
]);

console.log("member identity tests passed");

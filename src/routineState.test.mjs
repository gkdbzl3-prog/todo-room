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
// detail 조각도 투두와 같은 규칙으로 이월된다: 못 끝낸 것만 다음 날로 넘어간다.
// "설거지"는 done이라 빠지고 "청소"만 남는다.
assert.equal(next.items[0].note, "청소");
// 진행 상태는 초기화된다 — 넘어온 조각은 다시 "진행 전"에서 시작한다.
assert.deepEqual(next.items[0].noteState, {});
// off("잠시 쉬는 루틴")는 날짜가 바뀌어도 유지된다.
assert.equal(next.items[0].off, true);

/* ── detail 이월 규칙 ── */
const rolled = (items) =>
  getRoutineForStorageLoad({
    stored: { items: [], doneDate: "" },
    current: { items, doneDate: "2026-05-24" },
    sameStorageKey: true,
    currentDayKey: "2026-05-25",
  }).items[0];

// 조각이 전부 done이면 detail은 비워진다.
assert.equal(
  rolled([{ id: 2, text: "집안일", note: "설거지, 청소", noteState: { 설거지: "done", 청소: "done" } }]).note,
  "",
);

// "doing"은 못 끝낸 것이므로 이월된다.
assert.equal(
  rolled([{ id: 3, text: "집안일", note: "설거지, 청소", noteState: { 설거지: "doing" } }]).note,
  "설거지, 청소",
);

// detail이 없으면 그대로 빈 값.
assert.equal(rolled([{ id: 4, text: "운동", note: "", noteState: {} }]).note, "");

// 루틴 이름이 detail에 섞여 있으면 부모 이름이므로 이월 대상에서 빠진다.
assert.equal(
  rolled([{ id: 5, text: "집안일", note: "집안일, 청소", noteState: {} }]).note,
  "청소",
);

// off 루틴의 detail도 같은 규칙으로 남는다 — off는 카운트에서만 빠질 뿐이다.
assert.equal(
  rolled([{ id: 6, text: "집안일", note: "설거지", noteState: {}, off: true }]).note,
  "설거지",
);

console.log("routine state tests passed");

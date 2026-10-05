import assert from "node:assert/strict";
import {
  appendRoutineNoteParts,
  getRoutineForStorageLoad,
  parseRoutineTagInput,
} from "./routineState.js";

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

/* ── "[집안일] 설거지" 입력 파싱 ── */
const taggedRoutines = [
  { id: 10, text: "집안일" },
  { id: 11, text: "쉬는루틴", off: true },
];

assert.deepEqual(parseRoutineTagInput("[집안일] 설거지", taggedRoutines), {
  text: "설거지",
  routineId: 10,
  routineName: "집안일",
});
// 공백과 대소문자는 무시하고 맞춘다.
assert.equal(parseRoutineTagInput("[ 집안일 ]설거지", taggedRoutines).routineId, 10);
// 이름이 어느 루틴과도 안 맞으면 적은 그대로 평범한 투두다.
assert.deepEqual(parseRoutineTagInput("[없는루틴] 설거지", taggedRoutines), {
  text: "[없는루틴] 설거지",
});
// 쉬는 중인 루틴은 대상이 아니다 — detail에 넣어도 오늘 목록에 안 뜬다.
assert.deepEqual(parseRoutineTagInput("[쉬는루틴] 설거지", taggedRoutines), {
  text: "[쉬는루틴] 설거지",
});
// 내용 없이 이름만 적었으면 예약이 아니다.
assert.deepEqual(parseRoutineTagInput("[집안일]", taggedRoutines), { text: "[집안일]" });
// 대괄호가 없으면 그냥 투두.
assert.deepEqual(parseRoutineTagInput("  장보기  ", taggedRoutines), { text: "장보기" });
assert.deepEqual(parseRoutineTagInput("", taggedRoutines), { text: "" });
assert.deepEqual(parseRoutineTagInput("[집안일] 설거지", null), {
  text: "[집안일] 설거지",
});

/* ── detail 조각 붙이기 ── */
const appended = appendRoutineNoteParts(
  { id: 10, text: "집안일", note: "청소", noteState: { 청소: "doing" } },
  "설거지",
);
assert.equal(appended.added, true);
assert.equal(appended.item.note, "청소, 설거지", "기존 detail 뒤에 붙는다");
assert.deepEqual(appended.item.noteState, { 청소: "doing" }, "새 조각은 진행 전");
assert.equal(appended.item.done, false);

// 쉼표는 detail과 같은 구분자다.
assert.equal(
  appendRoutineNoteParts({ id: 10, text: "집안일" }, "설거지, 빨래").item.note,
  "설거지, 빨래",
);

// 이미 있는 조각이면 아무것도 안 붙고 완료 상태도 그대로다.
const dupAppend = appendRoutineNoteParts(
  { id: 10, text: "집안일", note: "설거지", noteState: { 설거지: "done" }, done: true },
  " 설거지 ",
);
assert.equal(dupAppend.added, false);
assert.equal(dupAppend.item.done, true);

// 루틴 이름과 같은 조각은 부모 이름이므로 붙지 않는다.
assert.equal(appendRoutineNoteParts({ id: 10, text: "집안일" }, "집안일").added, false);

// 다 끝낸 루틴에 새 조각이 붙으면 미완료로 돌아간다.
const reopened = appendRoutineNoteParts(
  {
    id: 10,
    text: "집안일",
    note: "청소",
    noteState: { 청소: "done" },
    started: true,
    done: true,
    completedAt: 111,
  },
  "설거지",
);
assert.equal(reopened.item.done, false);
assert.equal(reopened.item.completedAt, null);
assert.equal(reopened.item.started, true, "끝낸 조각이 남아 있으니 진행 중이다");

console.log("routine state tests passed");

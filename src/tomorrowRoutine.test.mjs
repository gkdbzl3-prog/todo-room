import assert from "node:assert/strict";
import {
  applyTomorrowRoutineParts,
  formatRoutineTomorrowText,
  parseRoutineTomorrowInput,
  splitTomorrowTodos,
} from "./tomorrowRoutine.js";

/* ── 입력 파싱: "[집안일] 설거지" ── */

const routines = [
  { id: 10, text: "집안일" },
  { id: 11, text: "쉬는루틴", off: true },
];

assert.deepEqual(parseRoutineTomorrowInput("[집안일] 설거지", routines), {
  text: "설거지",
  routineId: 10,
  routineName: "집안일",
});
// 공백과 대소문자는 무시하고 맞춘다.
assert.equal(parseRoutineTomorrowInput("[ 집안일 ]설거지", routines).routineId, 10);
// 이름이 어느 루틴과도 안 맞으면 적은 그대로 평범한 투두다.
assert.deepEqual(parseRoutineTomorrowInput("[없는루틴] 설거지", routines), {
  text: "[없는루틴] 설거지",
});
// 쉬는 중인 루틴은 대상이 아니다 — detail에 넣어도 오늘 목록에 안 뜬다.
assert.deepEqual(parseRoutineTomorrowInput("[쉬는루틴] 설거지", routines), {
  text: "[쉬는루틴] 설거지",
});
// 내용 없이 이름만 적었으면 예약이 아니다.
assert.deepEqual(parseRoutineTomorrowInput("[집안일]", routines), { text: "[집안일]" });
// 대괄호가 없으면 그냥 투두.
assert.deepEqual(parseRoutineTomorrowInput("  장보기  ", routines), { text: "장보기" });
assert.deepEqual(parseRoutineTomorrowInput("", routines), { text: "" });
assert.deepEqual(parseRoutineTomorrowInput("[집안일] 설거지", null), {
  text: "[집안일] 설거지",
});

/* ── 표시 텍스트 ── */

assert.equal(
  formatRoutineTomorrowText({ text: "설거지", routineName: "집안일" }),
  "[집안일] 설거지",
);
// 루틴에 안 묶인 항목은 이름표 없이 그대로.
assert.equal(formatRoutineTomorrowText({ text: "장보기" }), "장보기");

/* ── 분리 ── */

const mixed = [
  { id: 1, text: "장보기" },
  { id: 2, text: "설거지", routineId: 10, routineName: "집안일" },
  { id: 3, text: "", routineId: 10, routineName: "집안일" },
];
const split = splitTomorrowTodos(mixed);
assert.deepEqual(
  split.plain.map((t) => t.id),
  [1, 3],
  "루틴 id가 없거나 텍스트가 빈 건 일반 투두로 간다",
);
assert.deepEqual(split.routineBound.map((t) => t.id), [2]);
assert.deepEqual(splitTomorrowTodos(null), { plain: [], routineBound: [] });

/* ── 루틴 detail로 병합 ── */

const applied = applyTomorrowRoutineParts(
  [{ id: 10, text: "집안일", note: "청소", noteState: { 청소: "doing" } }],
  [{ id: 2, text: "설거지", routineId: 10, routineName: "집안일" }],
);
assert.equal(applied.changed, true);
assert.equal(applied.items[0].note, "청소, 설거지", "기존 detail 뒤에 붙는다");
assert.deepEqual(applied.items[0].noteState, { 청소: "doing" }, "새 조각은 진행 전");
assert.equal(applied.items[0].started, true);
assert.equal(applied.items[0].done, false);
assert.deepEqual(applied.leftovers, []);

// detail이 비어 있던 루틴에도 붙는다.
assert.equal(
  applyTomorrowRoutineParts(
    [{ id: 10, text: "집안일", note: "", noteState: {} }],
    [{ id: 2, text: "설거지", routineId: 10 }],
  ).items[0].note,
  "설거지",
);

// id 타입이 달라도(문자열 vs 숫자) 같은 루틴으로 본다 — Firestore를 거치면 섞인다.
assert.equal(
  applyTomorrowRoutineParts(
    [{ id: 10, text: "집안일", note: "", noteState: {} }],
    [{ id: 2, text: "설거지", routineId: "10" }],
  ).items[0].note,
  "설거지",
);

// 예약 텍스트에 쉼표가 있으면 detail과 같은 규칙으로 쪼갠다.
assert.equal(
  applyTomorrowRoutineParts(
    [{ id: 10, text: "집안일", note: "", noteState: {} }],
    [{ id: 2, text: "설거지, 빨래", routineId: 10 }],
  ).items[0].note,
  "설거지, 빨래",
);

// 이미 있는 조각은 중복으로 붙지 않는다. 아무것도 안 붙으면 changed도 false.
const dup = applyTomorrowRoutineParts(
  [
    {
      id: 10,
      text: "집안일",
      note: "설거지",
      noteState: { 설거지: "done" },
      started: true,
      done: true,
    },
  ],
  [{ id: 2, text: " 설거지 ", routineId: 10 }],
);
assert.equal(dup.items[0].note, "설거지");
assert.equal(dup.items[0].done, true, "중복이면 완료 상태를 건드리지 않는다");
assert.equal(dup.changed, false);

// 루틴 이름과 같은 조각은 부모 이름이므로 붙지 않는다.
assert.equal(
  applyTomorrowRoutineParts(
    [{ id: 10, text: "집안일", note: "", noteState: {} }],
    [{ id: 2, text: "집안일", routineId: 10 }],
  ).changed,
  false,
);

// 다 끝낸 루틴에 새 조각이 붙으면 미완료로 돌아간다.
const reopened = applyTomorrowRoutineParts(
  [
    {
      id: 10,
      text: "집안일",
      note: "청소",
      noteState: { 청소: "done" },
      started: true,
      done: true,
      completedAt: 111,
    },
  ],
  [{ id: 2, text: "설거지", routineId: 10 }],
);
assert.equal(reopened.items[0].done, false);
assert.equal(reopened.items[0].completedAt, null);
assert.equal(reopened.items[0].started, true, "끝낸 조각이 남아 있으니 진행 중이다");

/* ── 붙일 곳이 없을 때는 일반 투두로 흘려보낸다 ── */

// 루틴이 지워졌다.
const gone = applyTomorrowRoutineParts(
  [{ id: 99, text: "운동", note: "", noteState: {} }],
  [{ id: 2, text: "설거지", routineId: 10, routineName: "집안일" }],
);
assert.equal(gone.changed, false);
assert.deepEqual(gone.leftovers.map((t) => t.id), [2]);

// 쉬는 중(off)인 루틴 — 붙이면 오늘 투두로 안 올라와 조용히 사라진다.
const resting = applyTomorrowRoutineParts(
  [{ id: 10, text: "집안일", note: "", noteState: {}, off: true }],
  [{ id: 2, text: "설거지", routineId: 10, routineName: "집안일" }],
);
assert.equal(resting.changed, false);
assert.equal(resting.items[0].note, "");
assert.deepEqual(resting.leftovers.map((t) => t.id), [2]);

/* ── 빈 입력 ── */

const empty = applyTomorrowRoutineParts([{ id: 10, text: "집안일" }], []);
assert.equal(empty.changed, false);
assert.deepEqual(empty.leftovers, []);
assert.deepEqual(applyTomorrowRoutineParts(null, null), {
  items: [],
  leftovers: [],
  changed: false,
});

console.log("tomorrow routine tests passed");

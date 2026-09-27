import assert from "node:assert/strict";
import { buildCertList, certStatus } from "./todayCertList.js";

const DAY = "2026-09-27";

// 상태는 TodoItem과 같은 규칙: done > started > 나머지.
{
  assert.equal(certStatus({ done: true, started: true }), "done");
  assert.equal(certStatus({ started: true }), "doing");
  assert.equal(certStatus({}), "ready");
  assert.equal(certStatus(null), "ready");
}

// 세 갈래를 한 리스트로 모은다: 오늘 투두 → 주간 📌 → 루틴.
// 주간은 오늘 카운트로 찍은 것(countedAt === dayKey)만 들어온다.
{
  const rows = buildCertList({
    dailyTodos: [
      { id: 1, text: "택배 부치기", started: true },
      { id: 2, text: "강의 시청", done: true },
    ],
    weeklyTodos: [
      { id: 10, text: "가계부 정리", countedAt: DAY },
      { id: 11, text: "안 찍은 주간 항목", countedAt: "" },
      { id: 12, text: "다른 날 찍은 항목", countedAt: "2026-09-26" },
    ],
    routineItems: [{ id: 20, text: "스트레칭" }],
    dayKey: DAY,
  });

  assert.deepEqual(
    rows.map((r) => [r.text, r.source, r.status]),
    [
      ["택배 부치기", "daily", "doing"],
      ["강의 시청", "daily", "done"],
      ["가계부 정리", "weekly", "ready"],
      ["스트레칭", "routine", "ready"],
    ]
  );
}

// 루틴 detail에서 올라온 오늘 투두는 출처가 루틴으로 찍힌다.
// (호출 측이 effectiveDaily를 넘기므로 이 항목은 dailyTodos에 섞여 들어온다.
//  routineItems에는 isRoutineCountable로 걸러 부모가 안 들어오니 중복되지 않는다.)
{
  const rows = buildCertList({
    dailyTodos: [
      { id: 1, text: "직접 적은 것" },
      { id: "rt-5-설거지", text: "집안일 · 설거지", fromRoutine: 5 },
    ],
    routineItems: [{ id: 6, text: "스트레칭" }],
    dayKey: DAY,
  });

  assert.deepEqual(
    rows.map((r) => [r.text, r.source]),
    [
      ["직접 적은 것", "daily"],
      ["집안일 · 설거지", "routine"],
      ["스트레칭", "routine"],
    ]
  );
}

// React key는 출처까지 넣어 만든다 — 주간과 오늘이 같은 id를 가질 수 있다.
{
  const rows = buildCertList({
    dailyTodos: [{ id: 7, text: "오늘 쪽" }],
    weeklyTodos: [{ id: 7, text: "주간 쪽", countedAt: DAY }],
    dayKey: DAY,
  });

  assert.deepEqual(rows.map((r) => r.key), ["daily-7", "weekly-7"]);
  assert.equal(new Set(rows.map((r) => r.key)).size, 2);
}

// 빠진 입력과 빈 입력은 빈 배열 — 호출 측이 없을 때 패널을 숨길 수 있어야 한다.
{
  assert.deepEqual(buildCertList({ dayKey: DAY }), []);
  assert.deepEqual(buildCertList({}), []);
  assert.deepEqual(
    buildCertList({ weeklyTodos: [{ id: 1, text: "안 찍음" }], dayKey: DAY }),
    []
  );
}

console.log("todayCertList tests passed");

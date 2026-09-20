import assert from "node:assert/strict";
import {
  buildCarryMerge,
  collectLocalAdditions,
  resetTodosForNewDay,
} from "./dailyCarry.js";

const texts = (todos) => todos.map((todo) => todo.text);

// 완료/오늘만 항목은 넘기지 않고, 넘어가는 항목은 진행 상태를 초기화한다.
{
  const carried = resetTodosForNewDay([
    { id: 1, text: "택배 부치기", done: false, started: true, completedAt: 5 },
    { id: 2, text: "시사 요약 인증", done: true, completedAt: 123 },
    { id: 3, text: "오늘만 볼 것", done: false, oneOff: true },
  ]);

  assert.deepEqual(carried, [
    { id: 1, text: "택배 부치기", done: false, started: true, completedAt: null },
  ]);
}

// Regression (2026-09-01 실제 데이터): 08-31에 미완료였던 "택배 부치기"·"강의 시청"이
// 09-01 문서에서 사라지고, 사용자가 그날 새로 적은 "여성외과"만 남았다.
// 이월이 도는 동안 들어온 입력과 이월 항목이 둘 다 살아남아야 한다.
{
  const sourceTodos = [
    { id: 1, text: "택배 부치기", done: false },
    { id: 2, text: "강의 시청", done: false },
    { id: 3, text: "시사 요약 인증", done: true },
  ];

  const merged = buildCarryMerge({
    // 이월이 시작될 때 오늘 문서는 아직 없었다.
    remoteToday: [],
    // 그 사이 사용자가 "여성외과"를 적었다.
    localTodos: [{ id: 9, text: "여성외과", done: false }],
    sourceTodos,
    carryCandidates: resetTodosForNewDay(sourceTodos),
  });

  assert.deepEqual(texts(merged.todos), ["여성외과", "택배 부치기", "강의 시청"]);
  assert.equal(merged.added, 3);
}

// 날짜가 막 넘어간 순간에는 화면에 아직 어제 목록이 남아 있다. 그 항목들을
// "새로 적은 항목"으로 착각해 완료 상태 그대로 끌어오면 안 된다.
{
  const sourceTodos = [
    { id: 1, text: "택배 부치기", done: false },
    { id: 2, text: "시사 요약 인증", done: true, completedAt: 123 },
  ];

  const merged = buildCarryMerge({
    remoteToday: [],
    // 어제 목록이 그대로 남아 있는 상태.
    localTodos: sourceTodos,
    sourceTodos,
    carryCandidates: resetTodosForNewDay(sourceTodos),
  });

  assert.deepEqual(texts(merged.todos), ["택배 부치기"]);
  assert.equal(merged.todos[0].done, false);
  assert.equal(merged.added, 1);
}

// 이미 이월된 항목은 다시 붙지 않는다 — 진입할 때마다 중복이 생기면 안 된다.
{
  const sourceTodos = [{ id: 1, text: "택배 부치기", done: false }];
  const remoteToday = [
    { id: 1, text: "택배 부치기", done: true },
    { id: 9, text: "여성외과", done: false },
  ];

  const merged = buildCarryMerge({
    remoteToday,
    localTodos: remoteToday,
    sourceTodos,
    carryCandidates: resetTodosForNewDay(sourceTodos),
  });

  assert.equal(merged.added, 0);
  assert.deepEqual(merged.todos, remoteToday);
}

// 이월할 것도 새로 적은 것도 없으면 added가 0 — 원격 쓰기를 건너뛰면 된다.
{
  const remoteToday = [{ id: 9, text: "여성외과", done: false }];
  const merged = buildCarryMerge({
    remoteToday,
    localTodos: remoteToday,
    sourceTodos: [],
    carryCandidates: [],
  });

  assert.equal(merged.added, 0);
  assert.deepEqual(merged.todos, remoteToday);
}

// 원본이 없을 때(이월 소스를 못 찾은 날)도 로컬 입력은 그대로 보존된다.
{
  const additions = collectLocalAdditions(
    [],
    [{ id: 9, text: "여성외과" }],
    null
  );

  assert.deepEqual(texts(additions), ["여성외과"]);
}

console.log("dailyCarry tests passed");

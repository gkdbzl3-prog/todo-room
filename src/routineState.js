export const normalizeLabel = (s) => (s || "").normalize("NFC").trim().toLowerCase();

/* detail 조각 목록이 바뀐 뒤 항목의 진행 상태를 다시 맞춘다.
   note를 고쳐 쓰든 조각을 새로 붙이든 규칙은 같아야 하므로 여기 한 군데만 둔다:
   현재 조각에 해당하는 noteState 키만 남기고, 전부 done일 때만 완료로 본다.
   조각이 하나라도 새로 붙으면 allDone이 깨지므로 끝냈던 루틴은 미완료로 돌아간다. */
export function recalcRoutineNoteState(item, parts) {
  const prev = item?.noteState && typeof item.noteState === "object" ? item.noteState : {};
  const partSet = new Set(parts);
  const state = {};
  Object.keys(prev).forEach((k) => {
    if (partSet.has(k)) state[k] = prev[k];
  });
  const allDone = parts.length > 0 && parts.every((p) => state[p] === "done");
  return {
    ...item,
    note: parts.join(", "),
    noteState: state,
    started: allDone || parts.some((p) => state[p]),
    done: allDone,
    completedAt: allDone ? item?.completedAt || Date.now() : null,
  };
}

/* ── 루틴 detail → 오늘의 TO-DO ──
   루틴 "집안일"의 detail에 "설거지, 청소"를 적으면 그 내용이 오늘 투두로 올라간다.
   detail에 루틴 이름 자신이 섞여 있으면("집안일, 청소") 그건 부모 이름이므로 뺀다. */
export function parseRoutineNoteParts(item) {
  const raw = (item?.note || "").trim();
  if (!raw) return [];
  const ownName = normalizeLabel(item?.text);
  const seen = new Set();
  const parts = [];
  raw.split(",").forEach((chunk) => {
    const text = chunk.trim();
    const key = normalizeLabel(text);
    if (!key || key === ownName || seen.has(key)) return;
    seen.add(key);
    parts.push(text);
  });
  return parts;
}

export function rolloverRoutineDone(items, doneDate, todayKey) {
  const safeItems = Array.isArray(items) ? items : [];
  if (doneDate === todayKey) return { items: safeItems, changed: false };
  // detail(note) 조각은 투두와 같은 규칙으로 이월한다 — 못 끝낸 것만 다음 날로
  // 넘기고 done인 조각은 버린다(resetTodosForNewDay와 같은 취급). 넘어온 조각은
  // 다시 "진행 전"이어야 하므로 noteState는 비운다.
  // off는 "잠시 쉬는 루틴" 설정이라 날짜가 바뀌어도 유지된다.
  const next = safeItems.map((it) => {
    const state = it.noteState && typeof it.noteState === "object" ? it.noteState : {};
    const carried = parseRoutineNoteParts(it).filter((part) => state[part] !== "done");
    return {
      ...it,
      started: false,
      done: false,
      completedAt: null,
      note: carried.join(", "),
      noteState: {},
    };
  });
  return { items: next, changed: true };
}

export function getRoutineForStorageLoad({
  stored,
  current,
  sameStorageKey,
  currentDayKey,
}) {
  const storedItems = Array.isArray(stored?.items) ? stored.items : [];
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const shouldKeepCurrent =
    sameStorageKey && storedItems.length === 0 && currentItems.length > 0;
  const source = shouldKeepCurrent
    ? { items: currentItems, doneDate: current?.doneDate || "" }
    : { items: storedItems, doneDate: stored?.doneDate || "" };
  const { items } = rolloverRoutineDone(source.items, source.doneDate, currentDayKey);

  return { items, doneDate: currentDayKey };
}

/* ── "[집안일] 설거지" 입력 → 루틴 detail 예약 ──
   오늘의 TO-DO와 미리 세우는 TO-DO가 같은 문법을 쓴다. 이름이 어느 루틴과도
   안 맞으면 손대지 않는다 — 적은 그대로 평범한 투두가 된다.
   쉬는 중(off)인 루틴은 detail을 넣어도 오늘 목록에 안 뜨므로 대상에서 뺀다. */
export function parseRoutineTagInput(raw, routineItems) {
  const input = (raw || "").trim();
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(input);
  if (!match) return { text: input };

  const wanted = normalizeLabel(match[1]);
  const rest = match[2].trim();
  if (!wanted || !rest) return { text: input };

  const routine = (Array.isArray(routineItems) ? routineItems : []).find(
    (it) => !it?.off && normalizeLabel(it?.text) === wanted
  );
  if (!routine) return { text: input };

  return { text: rest, routineId: routine.id, routineName: (routine.text || "").trim() };
}

/* 루틴 detail 뒤에 조각을 붙인다. detail의 구분자는 쉼표라 입력도 같은 규칙으로
   쪼갠다. 이미 있는 조각과 부모 이름은 빼므로, 붙을 게 없으면 item을 그대로 둔다
   (중복 입력이 끝낸 루틴을 미완료로 되돌리지 않게). */
export function appendRoutineNoteParts(item, texts) {
  const parts = parseRoutineNoteParts(item);
  const seen = new Set(parts.map(normalizeLabel));
  const ownName = normalizeLabel(item?.text);
  let added = false;

  (Array.isArray(texts) ? texts : [texts]).forEach((raw) => {
    (raw || "").split(",").forEach((chunk) => {
      const text = chunk.trim();
      const key = normalizeLabel(text);
      if (!key || key === ownName || seen.has(key)) return;
      seen.add(key);
      parts.push(text);
      added = true;
    });
  });

  if (!added) return { item, added: false };
  return { item: recalcRoutineNoteState(item, parts), added: true };
}

const normalizeLabel = (s) => (s || "").normalize("NFC").trim().toLowerCase();

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

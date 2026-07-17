export function rolloverRoutineDone(items, doneDate, todayKey) {
  const safeItems = Array.isArray(items) ? items : [];
  if (doneDate === todayKey) return { items: safeItems, changed: false };
  // note(detail)와 그 진행 상태(noteState)는 매일 새로 쓰는 값이라 같이 비운다.
  // off는 "잠시 쉬는 루틴" 설정이라 날짜가 바뀌어도 유지된다.
  const next = safeItems.map((it) => ({
    ...it,
    started: false,
    done: false,
    completedAt: null,
    note: "",
    noteState: {},
  }));
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

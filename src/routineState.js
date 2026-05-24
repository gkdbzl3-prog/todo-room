export function rolloverRoutineDone(items, doneDate, todayKey) {
  const safeItems = Array.isArray(items) ? items : [];
  if (doneDate === todayKey) return { items: safeItems, changed: false };
  const next = safeItems.map((it) => ({
    ...it,
    started: false,
    done: false,
    completedAt: null,
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

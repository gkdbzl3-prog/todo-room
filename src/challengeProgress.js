export function normalizeChallengeItem(item) {
  const done = typeof item?.done === "boolean" ? item.done : typeof item?.doneAt === "number";
  const kind = item?.kind === "planned" ? "planned" : "completed";
  return {
    id: item?.id,
    name: typeof item?.name === "string" ? item.name : "",
    kind,
    done,
    doneAt: done && typeof item?.doneAt === "number" ? item.doneAt : null,
    createdAt:
      typeof item?.createdAt === "number"
        ? item.createdAt
        : typeof item?.doneAt === "number"
          ? item.doneAt
          : Date.now(),
  };
}

export function createCompletedChallengeItem(name, now = Date.now()) {
  return {
    id: now,
    name,
    kind: "completed",
    done: true,
    doneAt: now,
    createdAt: now,
  };
}

export function createPlannedChallengeItems(names, now = Date.now()) {
  return (names || []).map((name, index) => ({
    id: now + index,
    name,
    kind: "planned",
    done: false,
    doneAt: null,
    createdAt: now + index,
  }));
}

export function toggleChallengeItemDone(item, now = Date.now()) {
  const normalized = normalizeChallengeItem(item);
  const nextDone = !normalized.done;
  return {
    ...normalized,
    done: nextDone,
    doneAt: nextDone ? now : null,
  };
}

export function getChallengeProgress(items) {
  const normalized = (items || []).map(normalizeChallengeItem);
  const total = normalized.length;
  const done = normalized.filter((item) => item.done).length;
  const hasChecklist = normalized.some((item) => item.kind === "planned");
  return {
    done,
    total,
    pct: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    hasChecklist,
  };
}

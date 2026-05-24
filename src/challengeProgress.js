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

export function getChallengeGoalLabel(title) {
  const text = String(title || "").trim();
  const match = text.match(/^\{([^}]+)\}/);
  return (match?.[1] || text).trim();
}

export function parseChallengeTitle(title) {
  const text = String(title || "").trim();
  const match = text.match(/^\{([^}]+)\}(?:\(([^)]+)\))?(.*)$/);
  if (!match) {
    return {
      hasGoal: false,
      goalLabel: text,
      detailLabel: text,
    };
  }

  const goalLabel = String(match[1] || "").trim();
  const detailLabel = `${match[2] || ""}${match[3] || ""}`.trim();
  return {
    hasGoal: !!goalLabel,
    goalLabel,
    detailLabel: detailLabel || goalLabel,
  };
}

export function groupChallengesByGoal(challenges) {
  const groups = new Map();

  (challenges || []).forEach((challenge) => {
    const label = getChallengeGoalLabel(challenge?.title);
    if (!label) return;
    const key = `goal:${label}`;
    const current = groups.get(key);
    const items = (challenge?.items || []).map(normalizeChallengeItem);

    if (current) {
      current.items.push(...items);
      return;
    }

    groups.set(key, {
      id: key,
      title: label,
      items: [...items],
    });
  });

  return Array.from(groups.values());
}

export function groupChallengeCardsByGoal(challenges) {
  const groups = new Map();

  (challenges || []).forEach((challenge) => {
    const parsed = parseChallengeTitle(challenge?.title);
    const key = parsed.hasGoal ? `goal:${parsed.goalLabel}` : `single:${challenge?.id}`;
    const title = parsed.hasGoal ? parsed.goalLabel : parsed.detailLabel;
    const current = groups.get(key);
    const challengeWithDisplayTitle = {
      ...challenge,
      displayTitle: parsed.detailLabel,
    };

    if (current) {
      current.challenges.push(challengeWithDisplayTitle);
      return;
    }

    groups.set(key, {
      id: key,
      title,
      hasGoal: parsed.hasGoal,
      challenges: [challengeWithDisplayTitle],
    });
  });

  return Array.from(groups.values());
}

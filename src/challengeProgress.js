export function normalizeChallengeItem(item) {
  const done = typeof item?.done === "boolean" ? item.done : typeof item?.doneAt === "number";
  const kind = item?.kind === "planned" ? "planned" : "completed";
  const value =
    typeof item?.value === "number" && Number.isFinite(item.value) ? item.value : null;
  const section =
    typeof item?.section === "string" && item.section.trim() ? item.section.trim() : null;
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
    value,
    section,
  };
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
export function parseNumericValue(text) {
  const trimmed = String(text ?? "").trim();
  if (!NUMERIC_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function createCompletedChallengeItem(name, now = Date.now()) {
  const trimmed = typeof name === "string" ? name : String(name ?? "");
  return {
    id: now,
    name: trimmed,
    kind: "completed",
    done: true,
    doneAt: now,
    createdAt: now,
    value: parseNumericValue(trimmed),
  };
}

export function createPlannedChallengeItems(entries, now = Date.now()) {
  return (entries || []).map((entry, index) => {
    const name = typeof entry === "string" ? entry : (entry?.name ?? "");
    const section =
      typeof entry === "object" && entry !== null && typeof entry.section === "string"
        ? entry.section
        : null;
    return {
      id: now + index,
      name,
      kind: "planned",
      done: false,
      doneAt: null,
      createdAt: now + index,
      section: section && section.trim() ? section.trim() : null,
    };
  });
}

// `[섹션이름]` 한 줄 헤더 + 그 아래 항목 → {name, section}[]로 파싱.
// 헤더 없으면 모든 항목 section=null.
export function parseBulkChallengeInput(text) {
  const lines = String(text || "").split("\n");
  const result = [];
  let currentSection = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^\[(.+)\]$/);
    if (headerMatch) {
      const label = headerMatch[1].trim();
      currentSection = label || null;
      continue;
    }
    result.push({ name: trimmed, section: currentSection });
  }
  return result;
}

// 표시용: 섹션별로 묶고, 같은 섹션 안에서는 createdAt 오름차순.
// 섹션 순서는 그 안의 최소 createdAt 기준 (= 입력 순서).
export function groupItemsBySection(items) {
  const sorted = [...(items || [])]
    .map(normalizeChallengeItem)
    .sort((a, b) => (a.createdAt || a.doneAt || 0) - (b.createdAt || b.doneAt || 0));
  const groups = new Map();
  for (const item of sorted) {
    const key = item.section || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.entries()).map(([section, list]) => ({
    section: section || null,
    items: list,
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

export function getChallengeProgress(items, goal = null) {
  const normalized = (items || []).map(normalizeChallengeItem);
  const total = normalized.length;
  const done = normalized.filter((item) => item.done).length;
  const hasChecklist = normalized.some((item) => item.kind === "planned");
  const numericGoal =
    typeof goal === "number" && Number.isFinite(goal) && goal > 0 ? goal : 0;
  const values = normalized
    .map((item) => item.value)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const numericMax = values.length > 0 ? Math.max(...values) : 0;
  const hasNumeric = numericGoal > 0;
  const numericPct = hasNumeric
    ? Math.min(100, Math.max(0, Math.round((numericMax / numericGoal) * 100)))
    : 0;
  return {
    done,
    total,
    pct: hasNumeric
      ? numericPct
      : total > 0
        ? Math.min(100, Math.round((done / total) * 100))
        : 0,
    hasChecklist,
    hasNumeric,
    numericMax,
    numericGoal,
  };
}

export function challengeHasCover(challenge) {
  return typeof challenge?.coverUrl === "string" && challenge.coverUrl.trim().length > 0;
}

// 체크리스트 전부 완료 또는 수치 목표 도달 시 완료.
// 단, 수치형(독서 등)은 페이지를 다 채워도 인증 사진(표지)이 없으면 완료로 치지 않는다.
export function isChallengeComplete(challenge) {
  const p = getChallengeProgress(challenge?.items || [], challenge?.goal);
  const checklistComplete = p.hasChecklist && p.total > 0 && p.done >= p.total;
  const numericComplete =
    p.hasNumeric && p.numericMax >= p.numericGoal && p.numericGoal > 0;
  return checklistComplete || (numericComplete && challengeHasCover(challenge));
}

export function sortChallengeItemsForDisplay(items) {
  return [...(items || [])].map(normalizeChallengeItem).sort((a, b) => {
    return (a.createdAt || a.doneAt || 0) - (b.createdAt || b.doneAt || 0);
  });
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

function hasFilledCell(cells) {
  return Array.isArray(cells) && cells.some(Boolean);
}

function hasLabels(labels) {
  return labels && typeof labels === "object" && Object.keys(labels).length > 0;
}

export function hasTrackerTomorrowPlan(data) {
  return Boolean(
    data &&
      (hasFilledCell(data.tomorrowCells) ||
        hasLabels(data.tomorrowLabels) ||
        data.tomorrowStart)
  );
}

export function buildTrackerCarryPatch(todayData, previousSources) {
  const sources = (previousSources || []).filter(Boolean);
  const patch = {};
  const todayPlanCells = Array.isArray(todayData?.planCells) ? todayData.planCells : [];

  if (!todayPlanCells.some(Boolean)) {
    const source = sources.find((data) => hasFilledCell(data.tomorrowCells));
    if (source) patch.planCells = source.tomorrowCells;
  }
  if (!todayData?.planStart) {
    const source = sources.find((data) => data.tomorrowStart);
    if (source) patch.planStart = source.tomorrowStart;
  }
  if (!hasLabels(todayData?.planLabels)) {
    const source = sources.find((data) => hasLabels(data.tomorrowLabels));
    if (source) patch.planLabels = source.tomorrowLabels;
  }

  return patch;
}

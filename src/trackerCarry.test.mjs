import assert from "node:assert/strict";
import { buildTrackerCarryPatch } from "./trackerCarry.js";

const emptyCells = new Array(64).fill("");

// Regression: profile recovery may reconnect the same nickname to a different
// uid. The direct previous-day uid document is then empty/missing, but the
// nickname-matched tracker document still owns the plan that must carry.
{
  const patch = buildTrackerCarryPatch(
    { planCells: emptyCells, planLabels: {}, planStart: "" },
    [
      {},
      {
        tomorrowCells: emptyCells,
        tomorrowLabels: {},
        tomorrowStart: "09:00",
      },
    ]
  );

  assert.deepEqual(patch, { planStart: "09:00" });
}

// Existing plan values stay authoritative; rollover only fills empty fields.
{
  const plannedCells = [...emptyCells];
  plannedCells[0] = "p";
  const tomorrowCells = [...emptyCells];
  tomorrowCells[4] = "b";

  const patch = buildTrackerCarryPatch(
    {
      planCells: plannedCells,
      planLabels: { 0: "기존 계획" },
      planStart: "08:00",
    },
    [
      {
        tomorrowCells,
        tomorrowLabels: { 1: "새 계획" },
        tomorrowStart: "09:00",
      },
    ]
  );

  assert.deepEqual(patch, {});
}

console.log("tracker carry tests passed");

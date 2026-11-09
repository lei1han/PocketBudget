const store = require("scripts/store");
const calc = require("scripts/calc");
const util = require("scripts/util");

const COLOR_OK = "#007AFF";
const COLOR_WARN = "#D32F2F";
const COLOR_TRACK_LIGHT = "#E5E5EA";
const COLOR_TRACK_DARK = "#3A3A3C";

function computeRingMetrics(snap) {
  const budget = Number(snap.budget) || 0;
  const remaining = Number(snap.remaining) || 0;
  const occupied = Number(snap.occupied) || 0;
  const over = remaining < 0;
  let sweepRatio = 0;
  if (over) {
    sweepRatio = 1;
  } else if (budget > 0) {
    sweepRatio = Math.max(0, Math.min(remaining / budget, 1));
  } else if (remaining > 0) {
    sweepRatio = 1;
  }
  return {
    yearMonth: snap.yearMonth,
    budget: budget,
    occupied: occupied,
    remaining: remaining,
    over: over,
    sweepRatio: sweepRatio,
    noBudget: !(budget > 0),
    hasSpend: occupied > 0
  };
}

function loadSnapshot() {
  const data = store.load();
  const ym = util.currentYearMonth();
  const snap = calc.monthSnapshot(data, ym);
  const metrics = computeRingMetrics(snap);
  return Object.assign(
    {
      centerText: util.formatMoney(snap.remaining),
      subtitle: metrics.over ? "超支" : metrics.noBudget && metrics.hasSpend ? "未设预算" : "本月剩余"
    },
    metrics
  );
}

module.exports = {
  COLOR_OK,
  COLOR_WARN,
  COLOR_TRACK_LIGHT,
  COLOR_TRACK_DARK,
  computeRingMetrics,
  loadSnapshot
};

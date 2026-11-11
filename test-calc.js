
const Module = require("module");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname);

const orig = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id.startsWith("scripts/")) {
    return orig.call(this, path.join(root, id + ".js"));
  }
  return orig.apply(this, arguments);
};

// stub JSBox globals used by store on load - store not needed for calc tests
global.$file = {};
global.$cache = { get(){return null;}, set(){} };
global.$data = (o) => o;
global.$color = (x) => x;
global.$font = () => ({});
global.$ui = {};
global.$layout = { fill: 0 };

const util = require("scripts/util");
const calc = require("scripts/calc");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}
function almost(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, msg + " got " + a + " expected " + b);
}

// split installment tail to last
let am = util.splitInstallmentAmounts(100, 3);
almost(am[0], 33.33, "p0");
almost(am[1], 33.33, "p1");
almost(am[2], 33.34, "p2");
almost(am[0]+am[1]+am[2], 100, "sum");

am = util.splitInstallmentAmounts(10, 4);
almost(am.reduce((s,x)=>s+x,0), 10, "sum10");

// budget carry
let data = {
  version: 1,
  budgets: [{ yearMonth: "2026-10", amount: 3000 }],
  expenses: [],
  installments: [],
  installmentItems: []
};
almost(calc.effectiveBudget(data, "2026-11"), 3000, "carry");
almost(calc.effectiveBudget(data, "2026-10"), 3000, "exact");
almost(calc.effectiveBudget(data, "2026-09"), 0, "none");

// ensure current - mock current via injecting? ensure uses util.currentYearMonth()
// We test setBudget lock with a fake "current" by using year months relative to real current
const cur = util.currentYearMonth();
const past = util.addMonths(cur, -1);
let r = calc.setBudget(data, past, 1000);
assert(r.ok, "past budget editable");
data = r.data;
almost(calc.effectiveBudget(data, past), 1000, "past budget set");
r = calc.setBudget(data, cur, 5000);
assert(r.ok, "current budget ok");
data = r.data;

// expenses + surplus
r = calc.addExpense(data, 200, "lunch", new Date(cur + "-15T12:00:00"));
assert(r.ok, "add expense");
data = r.data;
let snap = calc.monthSnapshot(data, cur);
almost(snap.expense, 200, "exp");
almost(snap.monthSurplus, 4800, "surplus");

const bulkMonths = [past, cur];
r = calc.setBudgetsBulk(data, bulkMonths, 8888);
assert(r.ok, "bulk set budgets");
data = r.data;
almost(calc.effectiveBudget(data, past), 8888, "bulk past");
almost(calc.effectiveBudget(data, cur), 8888, "bulk cur");
r = calc.setBudgetsBulk(data, [], 100);
assert(!r.ok, "bulk empty months");
r = calc.setBudget(data, cur, 5000);
data = r.data;

// installment
r = calc.createInstallment(data, 900, 3, cur, "phone");
assert(r.ok, "create ins");
data = r.data;
snap = calc.monthSnapshot(data, cur);
almost(snap.installment, 300, "ins month1");
almost(snap.occupied, 500, "occ");

const next1 = util.addMonths(cur, 1);
const next2 = util.addMonths(cur, 2);
almost(calc.installmentSum(data, next1), 300, "ins m2");
almost(calc.installmentSum(data, next2), 300, "ins m3");

// end installment - cancel future
const planId = data.installments[0].id;
r = calc.endInstallment(data, planId);
assert(r.ok, "end");
data = r.data;
almost(calc.installmentSum(data, cur), 300, "keep current");
almost(calc.installmentSum(data, next1), 0, "cancel future1");
almost(calc.installmentSum(data, next2), 0, "cancel future2");
assert(data.installments[0].status === "ended", "status ended");

// full delete installment - rollback all months
data = {
  version: 1,
  budgets: [{ yearMonth: cur, amount: 5000 }],
  expenses: [],
  installments: [],
  installmentItems: []
};
r = calc.createInstallment(data, 900, 3, cur, "del-test");
assert(r.ok, "create ins for delete");
data = r.data;
const delPlanId = data.installments[0].id;
almost(calc.installmentSum(data, cur), 300, "pre-delete m0");
almost(calc.installmentSum(data, next1), 300, "pre-delete m1");
almost(calc.installmentSum(data, next2), 300, "pre-delete m2");
r = calc.deleteInstallment(data, delPlanId);
assert(r.ok, "delete ins");
data = r.data;
assert(data.installments.length === 0, "no plans");
assert(data.installmentItems.length === 0, "no items");
almost(calc.installmentSum(data, cur), 0, "after delete m0");
almost(calc.installmentSum(data, next1), 0, "after delete m1");
almost(calc.installmentSum(data, next2), 0, "after delete m2");
r = calc.deleteInstallment(data, delPlanId);
assert(!r.ok, "delete missing");

// endInstallment still only deactivates future (not full delete)
data = {
  version: 1,
  budgets: [{ yearMonth: cur, amount: 5000 }],
  expenses: [],
  installments: [],
  installmentItems: []
};
r = calc.createInstallment(data, 600, 2, cur, "end-only");
data = r.data;
const endOnlyId = data.installments[0].id;
r = calc.endInstallment(data, endOnlyId);
data = r.data;
assert(data.installments.length === 1, "end keeps plan");
assert(data.installmentItems.length === 2, "end keeps items");
almost(calc.installmentSum(data, cur), 300, "end keep current item");
const futureEnd = util.addMonths(cur, 1);
almost(calc.installmentSum(data, futureEnd), 0, "end cancel future");

// overspend negative cumulative
data = {
  version: 1,
  budgets: [
    { yearMonth: util.addMonths(cur, -1), amount: 1000 },
    { yearMonth: cur, amount: 1000 }
  ],
  expenses: [
    { id: "1", amount: 1500, note: "", at: new Date().toISOString(), yearMonth: util.addMonths(cur, -1) },
    { id: "2", amount: 800, note: "", at: new Date().toISOString(), yearMonth: cur }
  ],
  installments: [],
  installmentItems: []
};
let cum = calc.cumulativeSurplus(data, cur);
// past: 1000-1500 = -500; current: 1000-800 = 200; cum = -300
almost(cum.pastSum, -500, "past");
almost(cum.currentSurplus, 200, "curSur");
almost(cum.cumulative, -300, "cum");

// delete expense
r = calc.deleteExpense(data, "2");
assert(r.ok);
almost(calc.expenseSum(r.data, cur), 0, "deleted");

// import validate
const store = require("scripts/store");
let v = store.validateImport({ version: 1, budgets: [], expenses: [], installments: [], installmentItems: [] });
assert(v.ok, "validate");
v = store.validateImport({ version: 2, budgets: [], expenses: [], installments: [], installmentItems: [] });
assert(!v.ok, "bad ver");

assert(util.compareSemver("1.0.6", "1.0.5") > 0, "semver gt");
assert(util.compareSemver("v1.0.5", "1.0.5") === 0, "semver v");
assert(util.compareSemver("1.0.0", "1.0.1") < 0, "semver lt");

const upd = require("scripts/update");
const fake = { tag_name: "v2.0.0", assets: [{ name: "PocketBudget.box", browser_download_url: "https://example.com/a.box" }] };
assert(upd.versionFromRelease(fake) === "2.0.0", "release ver");
assert(upd.findBoxAsset(fake).browser_download_url.indexOf("example.com") > 0, "find asset");
assert(upd.httpStatus({ response: { statusCode: 200 } }) === 200, "httpStatus nested");
assert(upd.httpStatus({ statusCode: 404 }) === 404, "httpStatus direct");
assert(upd.httpStatus({}) === null, "httpStatus none");
assert(
  upd.formatHttpFailure({ response: { statusCode: 503 } }, "获取 Release").indexOf("503") > 0,
  "http fail code"
);
assert(
  upd.formatHttpFailure({}).indexOf("undefined") < 0,
  "no undefined in err"
);
const gh = {
  response: { statusCode: 200 },
  data: { tag_name: "v1.0.6", assets: [] }
};
assert(upd.parseReleasePayload(gh).tag_name === "v1.0.6", "parse release");

const widgetData = require("scripts/widget-data");
let m = widgetData.computeRingMetrics({
  budget: 1000,
  remaining: 400,
  occupied: 600,
  yearMonth: "2026-11"
});
assert(Math.abs(m.sweepRatio - 0.4) < 0.001, "widget ratio remain");
m = widgetData.computeRingMetrics({ budget: 100, remaining: -20, occupied: 120, yearMonth: "2026-11" });
assert(m.over && m.sweepRatio === 1, "widget over");

// 每月起始：1 为自然月；N 日为发薪月（当月 N 日至次月 N-1 日）
assert(util.normalizeMonthStartDay(undefined) === 1, "start default");
assert(util.normalizeMonthStartDay(0) === 1, "start zero");
assert(util.normalizeMonthStartDay(5.9) === 5, "start floor");
assert(util.normalizeMonthStartDay(99) === 31, "start cap");
assert(util.normalizeMonthStartDay("5") === 5, "start string");

assert(util.yearMonthFromDate(new Date(2026, 10, 5, 8), 5) === "2026-11", "payday on day");
assert(util.yearMonthFromDate(new Date(2026, 10, 4, 23), 5) === "2026-10", "before payday");
assert(util.yearMonthFromDate(new Date(2026, 11, 4, 12), 5) === "2026-11", "until next eve");
assert(util.yearMonthFromDate(new Date(2026, 0, 4, 12), 5) === "2025-12", "year boundary");
assert(util.yearMonthFromDate(new Date(2026, 10, 1, 0), 1) === "2026-11", "natural start");
assert(util.yearMonthFromDate(new Date(2026, 10, 30, 23), 1) === "2026-11", "natural end");
assert(util.yearMonthFromDate(new Date(2026, 1, 27, 12), 31) === "2026-01", "short month before");
assert(util.yearMonthFromDate(new Date(2026, 1, 28, 0), 31) === "2026-02", "short month start");
assert(util.yearMonthFromDate(new Date(2026, 2, 30, 12), 31) === "2026-02", "short month span");
assert(util.yearMonthFromDate(new Date(2026, 2, 31, 0), 31) === "2026-03", "next full start");
assert(util.yearMonthFromDate(new Date(2024, 1, 28, 12), 31) === "2024-01", "leap before last");
assert(util.yearMonthFromDate(new Date(2024, 1, 29, 0), 31) === "2024-02", "leap last day");

const mid = util.monthTimeProgress(new Date(2026, 10, 11, 12, 0, 0), 5);
assert(mid.yearMonth === "2026-11", "progress month");
assert(mid.daysLeft === 24, "days until payday");
assert(mid.isStartDay === false, "not payday");
assert(mid.totalDays === 30, "nov cycle length");
assert(mid.percent === 22, "mid percent");
assert(util.monthTimeProgressText(mid) === "已过 22% · 距发薪还有 24 天", "mid caption");

const payday = util.monthTimeProgress(new Date(2026, 10, 5, 0, 0, 0), 5);
assert(payday.isStartDay === true, "is payday");
assert(payday.daysLeft === 30, "full cycle left");
assert(payday.percent === 0, "payday percent");
assert(util.monthTimeProgressText(payday) === "今天发薪 · 距下次还有 30 天", "payday caption");

const yearEnd = util.monthTimeProgress(new Date(2026, 0, 4, 12, 0, 0), 5);
assert(yearEnd.yearMonth === "2025-12", "progress year wrap");
assert(yearEnd.daysLeft === 1, "progress year days");
assert(yearEnd.totalDays === 31, "dec cycle length");

const shortEve = util.monthTimeProgress(new Date(2026, 2, 30, 12, 0, 0), 31);
assert(shortEve.yearMonth === "2026-02", "short progress month");
assert(shortEve.daysLeft === 1, "short days until 31st");

const eve = util.monthTimeProgress(new Date(2026, 11, 4, 23, 0, 0), 5);
assert(eve.yearMonth === "2026-11", "eve month");
assert(eve.daysLeft === 1, "one day left");
assert(eve.percent === 99, "eve percent capped");

const naturalStart = util.monthTimeProgress(new Date(2026, 10, 1, 0, 30, 0), 1);
assert(naturalStart.isStartDay === true, "natural first day");
assert(naturalStart.daysLeft === 30, "natural days");
assert(util.monthTimeProgressText(naturalStart) === "本月开始 · 距下月还有 30 天", "natural start caption");

const naturalMid = util.monthTimeProgress(new Date(2026, 10, 11, 12, 0, 0), 1);
assert(naturalMid.daysLeft === 20, "natural days left");
assert(naturalMid.percent === 35, "natural percent");
assert(util.monthTimeProgressText(naturalMid) === "已过 35% · 距下月还有 20 天", "natural caption");

util.setMonthStartDay(5);
assert(util.getMonthStartDay() === 5, "stored start");
assert(util.currentYearMonth() === util.yearMonthFromDate(new Date(), 5), "current follows start");
util.setMonthStartDay(1);
assert(util.currentYearMonth() === util.formatYearMonth(new Date()), "reset natural");

let cycle = {
  version: 1,
  budgets: [],
  expenses: [
    { id: "early", amount: 10, note: "", at: new Date(2026, 10, 3, 10).toISOString(), yearMonth: "2026-11" },
    { id: "late", amount: 20, note: "", at: new Date(2026, 10, 6, 10).toISOString(), yearMonth: "2026-11" },
    { id: "bad", amount: 1, note: "", at: "not-a-date", yearMonth: "2026-11" }
  ],
  installments: [],
  installmentItems: []
};
r = calc.setMonthStartDay(cycle, 5);
assert(r.ok, "set payday");
assert(r.data.monthStartDay === 5, "saved start");
assert(r.data.expenses[0].yearMonth === "2026-10", "rebucket early");
assert(r.data.expenses[1].yearMonth === "2026-11", "keep late");
assert(r.data.expenses[2].yearMonth === "2026-11", "keep invalid at");
r = calc.setMonthStartDay(cycle, 0);
assert(!r.ok, "reject 0");
r = calc.setMonthStartDay(cycle, 32);
assert(!r.ok, "reject 32");
r = calc.addExpense(
  { version: 1, monthStartDay: 5, budgets: [], expenses: [], installments: [], installmentItems: [] },
  12,
  "before",
  new Date(2026, 10, 3, 9)
);
assert(r.ok && r.expense.yearMonth === "2026-10", "expense before payday");
r = calc.addExpense(r.data, 8, "on", new Date(2026, 10, 5, 9));
assert(r.ok && r.expense.yearMonth === "2026-11", "expense on payday");

v = store.validateImport({
  version: 1,
  monthStartDay: 5,
  budgets: [],
  expenses: [],
  installments: [],
  installmentItems: []
});
assert(v.ok && v.data.monthStartDay === 5, "import start");
v = store.validateImport({ version: 1, budgets: [], expenses: [], installments: [], installmentItems: [] });
assert(v.ok && v.data.monthStartDay === 1, "import default start");
v = store.validateImport({
  version: 1,
  monthStartDay: 99,
  budgets: [],
  expenses: [],
  installments: [],
  installmentItems: []
});
assert(v.ok && v.data.monthStartDay === 31, "import clamp start");

const webdav = require("scripts/webdav-sync");
const cycleSnap = webdav.buildSnapshot(
  { version: 1, monthStartDay: 5, budgets: [], expenses: [], installments: [], installmentItems: [] },
  [],
  "3",
  "device"
);
assert(cycleSnap.schemaVersion === 2, "snapshot schema");
assert(cycleSnap.monthStartDay === 5, "snapshot start");
let snapValid = webdav.validateSnapshot(cycleSnap);
assert(snapValid.ok && snapValid.data.monthStartDay === 5, "snapshot roundtrip");
snapValid = webdav.validateSnapshot({
  schemaVersion: 1,
  revision: "1",
  version: 1,
  budgets: [],
  expenses: [],
  installments: [],
  installmentItems: []
});
assert(snapValid.ok && snapValid.data.monthStartDay === 1, "old snapshot defaults");
snapValid = webdav.validateSnapshot({
  schemaVersion: 3,
  revision: "1",
  version: 1,
  budgets: [],
  expenses: [],
  installments: [],
  installmentItems: []
});
assert(!snapValid.ok, "schema 3 rejected");

console.log("ALL TESTS PASSED");

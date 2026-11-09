
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
assert(!r.ok, "past budget locked");
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

console.log("ALL TESTS PASSED");

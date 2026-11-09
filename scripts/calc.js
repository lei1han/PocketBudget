const util = require("scripts/util");

function findBudgetEntry(data, yearMonth) {
  return (data.budgets || []).find(b => b.yearMonth === yearMonth) || null;
}

/** Explicit budget for month, or nearest previous month amount, else 0 */
function effectiveBudget(data, yearMonth) {
  const exact = findBudgetEntry(data, yearMonth);
  if (exact) return util.roundMoney(exact.amount);

  const priors = (data.budgets || [])
    .filter(b => b.yearMonth < yearMonth)
    .sort((a, b) => util.compareYearMonth(b.yearMonth, a.yearMonth));
  if (priors.length > 0) {
    return util.roundMoney(priors[0].amount);
  }
  return 0;
}

function hasExplicitBudget(data, yearMonth) {
  return !!findBudgetEntry(data, yearMonth);
}

function expenseSum(data, yearMonth) {
  return util.roundMoney(
    (data.expenses || [])
      .filter(e => e.yearMonth === yearMonth)
      .reduce((s, e) => s + Number(e.amount || 0), 0)
  );
}

function installmentSum(data, yearMonth) {
  return util.roundMoney(
    (data.installmentItems || [])
      .filter(it => it.yearMonth === yearMonth && it.active !== false)
      .reduce((s, it) => s + Number(it.amount || 0), 0)
  );
}

function occupied(data, yearMonth) {
  const exp = expenseSum(data, yearMonth);
  const ins = installmentSum(data, yearMonth);
  return {
    expense: exp,
    installment: ins,
    total: util.roundMoney(exp + ins)
  };
}

function monthSurplus(data, yearMonth) {
  const budget = effectiveBudget(data, yearMonth);
  const occ = occupied(data, yearMonth);
  return util.roundMoney(budget - occ.total);
}

function collectActiveMonths(data, currentMonth) {
  const set = {};
  (data.budgets || []).forEach(b => { set[b.yearMonth] = true; });
  (data.expenses || []).forEach(e => { set[e.yearMonth] = true; });
  (data.installmentItems || []).forEach(it => {
    if (it.active !== false) set[it.yearMonth] = true;
  });
  set[currentMonth] = true;
  return Object.keys(set).sort();
}

/**
 * 累计结余 = 历史已结束月结余之和 + 当月预览
 * 仅统计「活跃月」（有预算/消费/分期，或当月）
 */
function cumulativeSurplus(data, currentMonth) {
  const months = collectActiveMonths(data, currentMonth);
  let past = 0;
  let current = 0;
  const rows = [];
  months.forEach(ym => {
    const surplus = monthSurplus(data, ym);
    const budget = effectiveBudget(data, ym);
    const occ = occupied(data, ym);
    rows.push({
      yearMonth: ym,
      budget,
      expense: occ.expense,
      installment: occ.installment,
      occupied: occ.total,
      remaining: util.roundMoney(budget - occ.total),
      surplus,
      isCurrent: ym === currentMonth,
      isPast: ym < currentMonth
    });
    if (ym < currentMonth) past = util.roundMoney(past + surplus);
    if (ym === currentMonth) current = surplus;
  });
  return {
    cumulative: util.roundMoney(past + current),
    pastSum: past,
    currentSurplus: current,
    rows
  };
}

function monthSnapshot(data, yearMonth) {
  const budget = effectiveBudget(data, yearMonth);
  const occ = occupied(data, yearMonth);
  const surplus = util.roundMoney(budget - occ.total);
  const cum = cumulativeSurplus(data, util.currentYearMonth());
  return {
    yearMonth,
    budget,
    hasExplicitBudget: hasExplicitBudget(data, yearMonth),
    expense: occ.expense,
    installment: occ.installment,
    occupied: occ.total,
    remaining: util.roundMoney(budget - occ.total),
    monthSurplus: surplus,
    cumulative: cum.cumulative
  };
}

/** Ensure current month has an explicit budget by carrying previous if needed */
function ensureCurrentBudget(data) {
  const ym = util.currentYearMonth();
  if (hasExplicitBudget(data, ym)) {
    return { data, carried: false, amount: effectiveBudget(data, ym), from: null };
  }
  const priors = (data.budgets || [])
    .filter(b => b.yearMonth < ym)
    .sort((a, b) => util.compareYearMonth(b.yearMonth, a.yearMonth));
  if (priors.length === 0) {
    return { data, carried: false, amount: 0, from: null, needSet: true };
  }
  const amount = util.roundMoney(priors[0].amount);
  const next = Object.assign({}, data, {
    budgets: data.budgets.concat([{ yearMonth: ym, amount }])
  });
  return { data: next, carried: true, amount, from: priors[0].yearMonth, needSet: false };
}

function setBudget(data, yearMonth, amount) {
  const current = util.currentYearMonth();
  if (yearMonth < current) {
    return { ok: false, message: "历史月份预算已锁定，不可修改" };
  }
  const amt = util.roundMoney(amount);
  if (!(amt >= 0) || isNaN(amt)) {
    return { ok: false, message: "预算金额无效" };
  }
  const budgets = (data.budgets || []).filter(b => b.yearMonth !== yearMonth);
  budgets.push({ yearMonth, amount: amt });
  budgets.sort((a, b) => util.compareYearMonth(a.yearMonth, b.yearMonth));
  return { ok: true, data: Object.assign({}, data, { budgets }) };
}

function addExpense(data, amount, note, atDate) {
  const amt = util.roundMoney(amount);
  if (!(amt > 0) || isNaN(amt)) {
    return { ok: false, message: "消费金额须大于 0" };
  }
  const at = atDate instanceof Date ? atDate : new Date(atDate || Date.now());
  if (isNaN(at.getTime())) {
    return { ok: false, message: "时间无效" };
  }
  const exp = {
    id: util.uid("exp"),
    amount: amt,
    note: note ? String(note) : "",
    at: at.toISOString(),
    yearMonth: util.yearMonthFromDate(at)
  };
  return {
    ok: true,
    data: Object.assign({}, data, { expenses: (data.expenses || []).concat([exp]) }),
    expense: exp
  };
}

function deleteExpense(data, id) {
  const expenses = (data.expenses || []).filter(e => e.id !== id);
  if (expenses.length === (data.expenses || []).length) {
    return { ok: false, message: "未找到该消费" };
  }
  return { ok: true, data: Object.assign({}, data, { expenses }) };
}

function createInstallment(data, total, periods, startMonth, note) {
  const p = Math.floor(Number(periods));
  const amounts = util.splitInstallmentAmounts(total, p);
  if (!amounts) {
    return { ok: false, message: "总额或期数无效" };
  }
  if (!/^\d{4}-\d{2}$/.test(String(startMonth))) {
    return { ok: false, message: "首期月格式应为 YYYY-MM" };
  }
  const id = util.uid("ins");
  const plan = {
    id,
    total: util.roundMoney(total),
    periods: p,
    perAmount: amounts,
    startMonth,
    note: note ? String(note) : "",
    status: "active"
  };
  const items = [];
  for (let i = 0; i < p; i++) {
    items.push({
      id: util.uid("ini"),
      planId: id,
      yearMonth: util.addMonths(startMonth, i),
      seq: i + 1,
      amount: amounts[i],
      active: true
    });
  }
  return {
    ok: true,
    data: Object.assign({}, data, {
      installments: (data.installments || []).concat([plan]),
      installmentItems: (data.installmentItems || []).concat(items)
    }),
    plan
  };
}

function deleteInstallment(data, planId) {
  const plans = data.installments || [];
  if (!plans.some(p => p.id === planId)) {
    return { ok: false, message: "未找到分期计划" };
  }
  const installments = plans.filter(p => p.id !== planId);
  const installmentItems = (data.installmentItems || []).filter(it => it.planId !== planId);
  return {
    ok: true,
    data: Object.assign({}, data, { installments, installmentItems })
  };
}

function endInstallment(data, planId) {
  const current = util.currentYearMonth();
  const plans = (data.installments || []).map(p => {
    if (p.id !== planId) return p;
    return Object.assign({}, p, { status: "ended" });
  });
  const found = (data.installments || []).some(p => p.id === planId);
  if (!found) return { ok: false, message: "未找到分期计划" };
  const items = (data.installmentItems || []).map(it => {
    if (it.planId !== planId) return it;
    if (it.yearMonth > current) {
      return Object.assign({}, it, { active: false });
    }
    return it;
  });
  return {
    ok: true,
    data: Object.assign({}, data, { installments: plans, installmentItems: items })
  };
}

function expensesForMonth(data, yearMonth) {
  return (data.expenses || [])
    .filter(e => e.yearMonth === yearMonth)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function installmentItemsForPlan(data, planId) {
  return (data.installmentItems || [])
    .filter(it => it.planId === planId)
    .sort((a, b) => a.seq - b.seq);
}

module.exports = {
  findBudgetEntry,
  effectiveBudget,
  hasExplicitBudget,
  expenseSum,
  installmentSum,
  occupied,
  monthSurplus,
  collectActiveMonths,
  cumulativeSurplus,
  monthSnapshot,
  ensureCurrentBudget,
  setBudget,
  addExpense,
  deleteExpense,
  createInstallment,
  deleteInstallment,
  endInstallment,
  expensesForMonth,
  installmentItemsForPlan
};

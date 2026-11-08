function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatYearMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}

function currentYearMonth() {
  return formatYearMonth(new Date());
}

function addMonths(yearMonth, delta) {
  const parts = String(yearMonth).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(y, m - 1 + delta, 1);
  return formatYearMonth(d);
}

function compareYearMonth(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function uid(prefix) {
  const p = prefix || "id";
  return p + "_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(/,/g, "").trim());
  return n;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatMoney(n) {
  const x = roundMoney(n || 0);
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  return sign + "¥" + abs.toFixed(2);
}

function formatMoneyPlain(n) {
  return roundMoney(n || 0).toFixed(2);
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    " " +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

function yearMonthFromDate(date) {
  return formatYearMonth(date instanceof Date ? date : new Date(date));
}

function splitInstallmentAmounts(total, periods) {
  const p = Math.floor(Number(periods));
  const totalCents = Math.round(roundMoney(total) * 100);
  if (!(p > 0) || !(totalCents >= 0)) {
    return null;
  }
  const base = Math.floor(totalCents / p);
  const amounts = [];
  let used = 0;
  for (let i = 0; i < p; i++) {
    if (i === p - 1) {
      amounts.push((totalCents - used) / 100);
    } else {
      amounts.push(base / 100);
      used += base;
    }
  }
  return amounts;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

module.exports = {
  pad2,
  formatYearMonth,
  currentYearMonth,
  addMonths,
  compareYearMonth,
  uid,
  toNumber,
  roundMoney,
  formatMoney,
  formatMoneyPlain,
  formatDateTime,
  yearMonthFromDate,
  splitInstallmentAmounts,
  safeJsonParse
};

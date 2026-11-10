function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatYearMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}

/** 1 = 自然月；2–31 = 发薪日。缺省、非法值回到 1，超过 31 记为 31。 */
let monthStartDay = 1;

function normalizeMonthStartDay(value) {
  if (value === undefined || value === null || value === "") return 1;
  const n = Math.floor(Number(value));
  if (!isFinite(n) || n < 1) return 1;
  if (n > 31) return 31;
  return n;
}

function getMonthStartDay() {
  return monthStartDay;
}

function setMonthStartDay(value) {
  monthStartDay = normalizeMonthStartDay(value);
  return monthStartDay;
}

function daysInCalendarMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampStartDom(year, monthIndex, startDay) {
  const want = normalizeMonthStartDay(startDay);
  const dim = daysInCalendarMonth(year, monthIndex);
  return want > dim ? dim : want;
}

function resolveStartDay(startDay) {
  if (startDay === undefined || startDay === null || startDay === "") {
    return monthStartDay;
  }
  return normalizeMonthStartDay(startDay);
}

function currentYearMonth() {
  return yearMonthFromDate(new Date(), monthStartDay);
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

/**
 * 预算月编号取「周期开始所在的公历月」。
 * 起始日为 5 时：11 月 5 日–12 月 4 日 → 2026-11；11 月 4 日仍属 2026-10。
 * 若该月没有这一天（如 31 日遇到 2 月），从该月最后一天起算。
 */
function yearMonthFromDate(date, startDay) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return formatYearMonth(d);
  const daySetting = resolveStartDay(startDay);
  let year = d.getFullYear();
  let monthIndex = d.getMonth();
  const startDom = clampStartDom(year, monthIndex, daySetting);
  if (d.getDate() < startDom) {
    const prev = new Date(year, monthIndex - 1, 1);
    year = prev.getFullYear();
    monthIndex = prev.getMonth();
  }
  return year + "-" + pad2(monthIndex + 1);
}

function calendarDaysBetween(fromDate, toDate) {
  const fromUtc = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const toUtc = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((toUtc - fromUtc) / 86400000);
}

/** 当前预算月的时间进度：已过比例、距下次起始日（发薪日）的整天数。 */
function monthTimeProgress(date, startDay) {
  const now = date instanceof Date ? date : new Date(date);
  const resolved = resolveStartDay(startDay);
  const ym = yearMonthFromDate(now, resolved);
  const parts = String(ym).split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const start = new Date(year, monthIndex, clampStartDom(year, monthIndex, resolved), 0, 0, 0, 0);
  const nextYm = addMonths(ym, 1);
  const nextParts = String(nextYm).split("-");
  const nextYear = Number(nextParts[0]);
  const nextMonthIndex = Number(nextParts[1]) - 1;
  const nextStart = new Date(
    nextYear,
    nextMonthIndex,
    clampStartDom(nextYear, nextMonthIndex, resolved),
    0,
    0,
    0,
    0
  );
  const totalMs = nextStart.getTime() - start.getTime();
  let ratio = totalMs > 0 ? (now.getTime() - start.getTime()) / totalMs : 0;
  if (ratio < 0) ratio = 0;
  if (ratio > 1) ratio = 1;
  let percent = Math.round(ratio * 100);
  if (ratio < 1 && percent > 99) percent = 99;
  if (percent < 0) percent = 0;
  const daysLeft = calendarDaysBetween(now, nextStart);
  const isStartDay = calendarDaysBetween(start, now) === 0;
  return {
    yearMonth: ym,
    startDay: resolved,
    ratio: ratio,
    percent: percent,
    daysLeft: daysLeft,
    isStartDay: isStartDay,
    totalDays: calendarDaysBetween(start, nextStart)
  };
}

function monthTimeProgressText(progress) {
  if (!progress) return "";
  const days = progress.daysLeft;
  if (progress.startDay <= 1) {
    if (progress.isStartDay) return "本月开始 · 距下月还有 " + days + " 天";
    return "已过 " + progress.percent + "% · 距下月还有 " + days + " 天";
  }
  if (progress.isStartDay) return "今天发薪 · 距下次还有 " + days + " 天";
  return "已过 " + progress.percent + "% · 距发薪还有 " + days + " 天";
}

function monthStartLabel(startDay) {
  const day = normalizeMonthStartDay(startDay);
  if (day <= 1) return "自然月";
  return "每月 " + day + " 日";
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

function parseSemver(s) {
  const t = String(s || "")
    .trim()
    .replace(/^[vV]/, "");
  const m = t.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
}

/** @returns {number} 1 if a>b, -1 if a<b, 0 if equal */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

module.exports = {
  pad2,
  formatYearMonth,
  normalizeMonthStartDay,
  getMonthStartDay,
  setMonthStartDay,
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
  monthTimeProgress,
  monthTimeProgressText,
  monthStartLabel,
  splitInstallmentAmounts,
  safeJsonParse,
  parseSemver,
  compareSemver
};

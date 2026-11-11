const store = require("scripts/store");
const calc = require("scripts/calc");
const util = require("scripts/util");

let data = store.emptyData();
let bootNotices = [];

function getData() {
  return data;
}

function rememberMonthStart(next) {
  util.setMonthStartDay(next && next.monthStartDay);
  return next;
}

function setDataSilent(next) {
  data = rememberMonthStart(next);
  store.save(data);
  return data;
}

function setData(next) {
  data = rememberMonthStart(next);
  store.save(data);
  try {
    require("scripts/webdav-sync").afterLocalSave();
  } catch (e) {}
  return data;
}

function reload() {
  data = store.load();
  util.setMonthStartDay(data.monthStartDay);
  bootNotices = [];
  const ensured = calc.ensureCurrentBudget(data);
  if (ensured.carried) {
    data = ensured.data;
    store.save(data);
    try {
      require("scripts/webdav-sync").afterLocalSave();
    } catch (e) {}
    bootNotices.push(
      "已沿用 " + ensured.from + " 预算 " + util.formatMoney(ensured.amount) + " 至本月"
    );
  } else if (ensured.needSet) {
    bootNotices.push("本月尚未设置预算，当前按 ¥0.00 计算，请打开「预算 ›」设置");
  }
  return data;
}

function takeBootNotices() {
  const n = bootNotices.slice();
  bootNotices = [];
  return n;
}

module.exports = {
  getData,
  setData,
  setDataSilent,
  reload,
  takeBootNotices
};

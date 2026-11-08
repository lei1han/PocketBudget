const store = require("scripts/store");
const calc = require("scripts/calc");
const util = require("scripts/util");

let data = store.emptyData();
let bootNotices = [];

function getData() {
  return data;
}

function setData(next) {
  data = next;
  store.save(data);
  return data;
}

function reload() {
  data = store.load();
  bootNotices = [];
  const ensured = calc.ensureCurrentBudget(data);
  if (ensured.carried) {
    data = ensured.data;
    store.save(data);
    bootNotices.push(
      "已沿用 " + ensured.from + " 预算 " + util.formatMoney(ensured.amount) + " 至本月"
    );
  } else if (ensured.needSet) {
    bootNotices.push("本月尚未设置预算，当前按 ¥0.00 计算，请先「设预算」");
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
  reload,
  takeBootNotices
};

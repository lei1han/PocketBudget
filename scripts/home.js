const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");
const io = require("scripts/io");

let expensesUI = null;
let installmentsUI = null;
let surplusUI = null;

const COLOR_OK = "#007AFF";
const COLOR_WARN = "#D32F2F";
const COLOR_TRACK = "#E5E5EA";

function setDeps(deps) {
  expensesUI = deps.expenses;
  installmentsUI = deps.installments;
  surplusUI = deps.surplus;
}

function moneyColor(n) {
  if (n < 0) return $color(COLOR_WARN);
  if (n > 0) return $color("#2E7D32");
  return $color("secondaryLabel");
}

/** 占用比例与进度条展示信息；预算为 0 时不除零 */
function usageInfo(snap) {
  const budget = Number(snap.budget) || 0;
  const occupied = Number(snap.occupied) || 0;

  if (!(budget > 0)) {
    if (occupied <= 0) {
      return {
        barRatio: 0,
        fillColor: COLOR_OK,
        percentText: "0%",
        hint: "未设预算",
        over: false
      };
    }
    return {
      barRatio: 1,
      fillColor: COLOR_WARN,
      percentText: "—",
      hint: "未设预算 · 已占用 " + util.formatMoney(occupied),
      over: true
    };
  }

  const ratio = occupied / budget;
  const pctInt = Math.round(ratio * 100);
  const over = ratio > 1;
  if (over) {
    const overAmt = util.roundMoney(occupied - budget);
    return {
      barRatio: 1,
      fillColor: COLOR_WARN,
      percentText: ">" + pctInt + "%",
      hint: "超支 " + util.formatMoney(overAmt) + " · 已占用 " + util.formatMoney(occupied),
      over: true
    };
  }
  return {
    barRatio: Math.max(0, Math.min(ratio, 1)),
    fillColor: COLOR_OK,
    percentText: pctInt + "%",
    hint: "已占用 " + util.formatMoney(occupied) + " / " + util.formatMoney(budget),
    over: false
  };
}

function buildRows() {
  const data = state.getData();
  const ym = util.currentYearMonth();
  const snap = calc.monthSnapshot(data, ym);
  const overview = [
    {
      label: { text: "月份", textColor: $color("secondaryLabel") },
      value: { text: ym, textColor: $color("label") }
    },
    {
      label: { text: "当月预算", textColor: $color("secondaryLabel") },
      value: {
        text: util.formatMoney(snap.budget) + (snap.hasExplicitBudget ? "" : "（沿用）"),
        textColor: $color("label")
      }
    },
    {
      label: { text: "已占用 · 消费", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.expense), textColor: $color("label") }
    },
    {
      label: { text: "已占用 · 分期预扣", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.installment), textColor: $color("label") }
    },
    {
      label: { text: "已占用合计", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.occupied), textColor: $color("label") }
    },
    {
      label: { text: "剩余", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.remaining), textColor: moneyColor(snap.remaining) }
    },
    {
      label: { text: "本月结余", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.monthSurplus), textColor: moneyColor(snap.monthSurplus) }
    },
    {
      label: { text: "累计结余", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(snap.cumulative), textColor: moneyColor(snap.cumulative) }
    }
  ];
  const actions = [
    { label: { text: "记一笔", textColor: $color(COLOR_OK) }, value: { text: "›", textColor: $color("tertiaryLabel") } },
    { label: { text: "设预算", textColor: $color(COLOR_OK) }, value: { text: "›", textColor: $color("tertiaryLabel") } },
    { label: { text: "消费明细", textColor: $color("label") }, value: { text: "›", textColor: $color("tertiaryLabel") } },
    { label: { text: "分期", textColor: $color("label") }, value: { text: "›", textColor: $color("tertiaryLabel") } },
    { label: { text: "结余一览", textColor: $color("label") }, value: { text: "›", textColor: $color("tertiaryLabel") } },
    { label: { text: "导出 / 导入", textColor: $color("label") }, value: { text: "›", textColor: $color("tertiaryLabel") } }
  ];
  return [
    { title: "本月总览", rows: overview },
    { title: "功能", rows: actions }
  ];
}

function currentUsage() {
  const ym = util.currentYearMonth();
  const snap = calc.monthSnapshot(state.getData(), ym);
  return usageInfo(snap);
}

function applyUsageBar(info) {
  const title = $("usage-title");
  const percent = $("usage-percent");
  const hint = $("usage-hint");
  const fill = $("usage-fill");
  if (!fill) return;

  if (title) title.text = "预算占用";
  if (percent) {
    percent.text = info.percentText;
    percent.textColor = $color(info.over ? COLOR_WARN : COLOR_OK);
  }
  if (hint) {
    hint.text = info.hint;
    hint.textColor = $color(info.over ? COLOR_WARN : "secondaryLabel");
  }

  const ratio = info.barRatio > 0 ? info.barRatio : 0;
  fill.bgcolor = $color(info.fillColor);
  fill.hidden = ratio <= 0;
  fill.remakeLayout(function(make, view) {
    make.left.top.bottom.equalTo();
    if (ratio <= 0) {
      make.width.equalTo(0);
    } else {
      make.width.equalTo(view.super).multipliedBy(ratio);
    }
  });
}

function refresh() {
  applyUsageBar(currentUsage());
  const list = $("home-list");
  if (list) list.data = buildRows();
}

function promptSetBudget() {
  const ym = util.currentYearMonth();
  const data = state.getData();
  const current = calc.effectiveBudget(data, ym);
  $input.text({
    type: $kbType.decimal,
    placeholder: "本月预算金额",
    text: current ? util.formatMoneyPlain(current) : "",
    handler: function(text) {
      if (text === undefined || text === null) return;
      const n = util.toNumber(text);
      if (isNaN(n) || n < 0) {
        $ui.toast("请输入有效金额");
        return;
      }
      const result = calc.setBudget(state.getData(), ym, n);
      if (!result.ok) {
        $ui.alert(result.message);
        return;
      }
      state.setData(result.data);
      $ui.toast("预算已更新");
      refresh();
    }
  });
}

function promptAddExpense(onDone) {
  const form = require("scripts/expense-form");
  form.open(onDone);
}

function handleAction(key) {
  if (key === "add-expense") return promptAddExpense();
  if (key === "set-budget") return promptSetBudget();
  if (key === "expenses") return expensesUI && expensesUI.open();
  if (key === "installments") return installmentsUI && installmentsUI.open();
  if (key === "surplus") return surplusUI && surplusUI.open();
  if (key === "io") {
    return io.showMenu(function() {
      refresh();
    });
  }
}

function render() {
  const info = currentUsage();
  const initialRatio = info.barRatio > 0 ? info.barRatio : 0;

  $ui.render({
    props: {
      title: "PocketBudget"
    },
    views: [
      {
        type: "view",
        props: {
          id: "usage-card",
          bgcolor: $color("clear")
        },
        layout: function(make) {
          make.left.right.top.equalTo();
          make.height.equalTo(108);
        },
        views: [
          {
            type: "label",
            props: {
              id: "usage-title",
              text: "预算占用",
              font: $font(13),
              textColor: $color("secondaryLabel")
            },
            layout: function(make) {
              make.left.inset(20);
              make.top.inset(14);
            }
          },
          {
            type: "label",
            props: {
              id: "usage-percent",
              text: info.percentText,
              font: $font("bold", 28),
              textColor: $color(info.over ? COLOR_WARN : COLOR_OK),
              align: $align.right
            },
            layout: function(make) {
              make.right.inset(20);
              make.centerY.equalTo($("usage-title"));
            }
          },
          {
            type: "view",
            props: {
              id: "usage-track",
              bgcolor: $color(COLOR_TRACK),
              radius: 6
            },
            layout: function(make) {
              make.left.right.inset(20);
              make.top.equalTo($("usage-title").bottom).offset(14);
              make.height.equalTo(12);
            },
            views: [
              {
                type: "view",
                props: {
                  id: "usage-fill",
                  bgcolor: $color(info.fillColor),
                  radius: 6,
                  hidden: initialRatio <= 0
                },
                layout: function(make, view) {
                  make.left.top.bottom.equalTo();
                  if (initialRatio <= 0) {
                    make.width.equalTo(0);
                  } else {
                    make.width.equalTo(view.super).multipliedBy(initialRatio);
                  }
                }
              }
            ]
          },
          {
            type: "label",
            props: {
              id: "usage-hint",
              text: info.hint,
              font: $font(12),
              textColor: $color(info.over ? COLOR_WARN : "secondaryLabel"),
              lines: 1
            },
            layout: function(make) {
              make.left.right.inset(20);
              make.top.equalTo($("usage-track").bottom).offset(10);
            }
          }
        ]
      },
      {
        type: "list",
        props: {
          id: "home-list",
          rowHeight: 48,
          template: {
            props: { bgcolor: $color("clear") },
            views: [
              {
                type: "label",
                props: { id: "label", font: $font(16) },
                layout: function(make, view) {
                  make.left.inset(16);
                  make.centerY.equalTo(view.super);
                }
              },
              {
                type: "label",
                props: {
                  id: "value",
                  font: $font("bold", 16),
                  align: $align.right
                },
                layout: function(make, view) {
                  make.right.inset(16);
                  make.centerY.equalTo(view.super);
                  make.left.greaterThanOrEqualTo(view.prev.right).offset(12);
                }
              }
            ]
          },
          data: buildRows()
        },
        layout: function(make) {
          make.left.right.bottom.equalTo();
          make.top.equalTo($("usage-card").bottom);
        },
        events: {
          didSelect: function(sender, indexPath) {
            if (indexPath.section !== 1) return;
            const keys = ["add-expense", "set-budget", "expenses", "installments", "surplus", "io"];
            handleAction(keys[indexPath.row]);
          }
        }
      }
    ]
  });
}

module.exports = {
  setDeps,
  render,
  refresh,
  promptAddExpense,
  promptSetBudget,
  usageInfo
};

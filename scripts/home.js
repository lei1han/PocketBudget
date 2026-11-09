const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");
const widgetData = require("scripts/widget-data");
const widget = require("scripts/widget");

let expensesUI = null;
let installmentsUI = null;
let surplusUI = null;

const COLOR_OK = "#007AFF";
const COLOR_WARN = "#D32F2F";
const COLOR_PRIMARY_BTN = "#1C1C1E";
const PREVIEW_LIMIT = 4;
const PREVIEW_ROW_H = 52;

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

function formatAmountShort(n) {
  const x = util.roundMoney(n || 0);
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  const plain = abs % 1 === 0 ? String(Math.round(abs)) : abs.toFixed(2);
  return sign + plain;
}

function formatSignedSurplus(n) {
  const x = util.roundMoney(n || 0);
  const prefix = x > 0 ? "+" : x < 0 ? "" : "";
  return prefix + util.formatMoney(x).replace(/^-/, "");
}

function currentSnap() {
  const ym = util.currentYearMonth();
  return calc.monthSnapshot(state.getData(), ym);
}

function isDark() {
  try {
    return !!$device.isDarkMode;
  } catch (e) {
    return false;
  }
}

function drawRingForSnap(snap) {
  const metrics = widgetData.computeRingMetrics(snap);
  const size = 168;
  return widget.drawDonutRing(size, metrics, isDark());
}

function previewExpenses() {
  const ym = util.currentYearMonth();
  return calc.expensesForMonth(state.getData(), ym).slice(0, PREVIEW_LIMIT);
}

function surplusTapLine(snap) {
  return (
    "本月结余 " +
    formatSignedSurplus(snap.monthSurplus) +
    " · 累计 " +
    formatSignedSurplus(snap.cumulative)
  );
}

function budgetOccupiedLine(snap) {
  return (
    "预算 " +
    formatAmountShort(snap.budget) +
    " · 占用 " +
    formatAmountShort(snap.occupied)
  );
}

function applyTopCard(snap) {
  const ring = $("home-ring-img");
  const remaining = $("home-remaining");
  const sub = $("home-budget-occ");
  const surplusBtn = $("home-surplus-btn");
  if (ring) ring.image = drawRingForSnap(snap);
  if (remaining) {
    remaining.text = util.formatMoney(snap.remaining);
    remaining.textColor = moneyColor(snap.remaining);
  }
  if (sub) sub.text = budgetOccupiedLine(snap);
  if (surplusBtn) surplusBtn.title = surplusTapLine(snap);
}

function previewListHeight(itemCount) {
  const n = itemCount > 0 ? Math.min(itemCount, PREVIEW_LIMIT) : 1;
  return n * PREVIEW_ROW_H;
}

function buildPreviewListData(items) {
  const rows = items || previewExpenses();
  if (rows.length === 0) {
    return [
      {
        title: { text: "本月暂无消费", textColor: $color("secondaryLabel") },
        amount: { text: "", textColor: $color("clear") },
        date: { text: "", textColor: $color("clear") }
      }
    ];
  }
  return rows.map(function(e) {
    return {
      title: {
        text: e.note ? e.note : "消费",
        textColor: $color("label")
      },
      amount: {
        text: "-" + formatAmountShort(e.amount),
        textColor: $color("label")
      },
      date: {
        text: util.formatDateTime(e.at).slice(0, 10),
        textColor: $color("tertiaryLabel")
      }
    };
  });
}

const previewListTemplate = {
  views: [
    {
      type: "view",
      props: {
        bgcolor: $color("tertiarySystemFill"),
        radius: 6
      },
      layout: function(make, view) {
        make.left.inset(16);
        make.centerY.equalTo(view.super);
        make.width.height.equalTo(32);
      }
    },
    {
      type: "label",
      props: { id: "title", font: $font(16), lines: 1 },
      layout: function(make, view) {
        make.left.equalTo(60);
        make.centerY.equalTo(view.super);
        make.right.lessThanOrEqualTo(view.super).inset(100);
      }
    },
    {
      type: "label",
      props: { id: "amount", font: $font("semibold", 16), align: $align.right },
      layout: function(make, view) {
        make.right.inset(16);
        make.top.inset(10);
      }
    },
    {
      type: "label",
      props: { id: "date", font: $font(12), align: $align.right },
      layout: function(make, view) {
        make.right.inset(16);
        make.bottom.inset(10);
      }
    }
  ]
};

function applyPreview() {
  const list = $("home-preview-list");
  if (!list) return;
  const items = previewExpenses();
  list.data = buildPreviewListData(items);
  const height = previewListHeight(items.length);
  list.remakeLayout(function(make) {
    make.left.right.inset(16);
    make.top.equalTo(40);
    make.height.equalTo(height);
  });
}

function refresh() {
  applyTopCard(currentSnap());
  applyPreview();
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

function openSettings() {
  const settings = require("scripts/settings");
  settings.open(function() {
    refresh();
  });
}

function handleAction(key) {
  if (key === "add-expense") return promptAddExpense(refresh);
  if (key === "set-budget") return promptSetBudget();
  if (key === "expenses") return expensesUI && expensesUI.open();
  if (key === "installments") return installmentsUI && installmentsUI.open();
  if (key === "surplus") return surplusUI && surplusUI.open();
  if (key === "settings") return openSettings();
}

/** @deprecated 保留给 widget / 测试对 usageInfo 的引用 */
function usageInfo(snap) {
  const budget = Number(snap.budget) || 0;
  const occupied = Number(snap.occupied) || 0;
  if (!(budget > 0)) {
    if (occupied <= 0) {
      return { barRatio: 0, fillColor: COLOR_OK, percentText: "0%", hint: "未设预算", over: false };
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
      hint: "超支 " + util.formatMoney(overAmt),
      over: true
    };
  }
  return {
    barRatio: Math.max(0, Math.min(ratio, 1)),
    fillColor: COLOR_OK,
    percentText: pctInt + "%",
    hint: "",
    over: false
  };
}

function primaryButton(title, handler) {
  return {
    type: "button",
    props: {
      title: title,
      bgcolor: $color(COLOR_PRIMARY_BTN),
      titleColor: $color("#FFFFFF"),
      radius: 12,
      font: $font("semibold", 17)
    },
    layout: function(make) {
      make.height.equalTo(50);
    },
    events: { tapped: handler }
  };
}

function secondaryButton(title, handler) {
  return {
    type: "button",
    props: {
      title: title,
      bgcolor: $color("secondarySystemGroupedBackground"),
      titleColor: $color("label"),
      radius: 12,
      font: $font("semibold", 17)
    },
    layout: function(make) {
      make.height.equalTo(50);
    },
    events: { tapped: handler }
  };
}

function render() {
  const snap = currentSnap();
  const ringImg = drawRingForSnap(snap);

  $ui.render({
    props: {
      title: "PocketBudget",
      navButtons: [
        {
          icon: "gear",
          handler: function() {
            handleAction("settings");
          }
        }
      ]
    },
    views: [
      {
        type: "scroll",
        props: { id: "home-scroll", showsVerticalIndicator: true },
        layout: function(make) {
          make.edges.equalTo();
        },
        views: [
          {
            type: "view",
            props: {
              id: "home-top-card",
              bgcolor: $color("secondarySystemGroupedBackground"),
              radius: 16,
              clipsToBounds: true
            },
            layout: function(make) {
              make.left.right.inset(16);
              make.top.inset(12);
            },
            views: [
              {
                type: "image",
                props: {
                  id: "home-ring-img",
                  image: ringImg,
                  bgcolor: $color("clear")
                },
                layout: function(make) {
                  make.centerX.equalTo();
                  make.top.inset(20);
                  make.width.height.equalTo(120);
                }
              },
              {
                type: "label",
                props: {
                  id: "home-remaining-hint",
                  text: "剩余",
                  font: $font(12),
                  textColor: $color("secondaryLabel"),
                  align: $align.center
                },
                layout: function(make) {
                  make.centerX.equalTo($("home-ring-img"));
                  make.centerY.equalTo($("home-ring-img")).offset(-14);
                }
              },
              {
                type: "label",
                props: {
                  id: "home-remaining",
                  text: util.formatMoney(snap.remaining),
                  font: $font("bold", 20),
                  textColor: moneyColor(snap.remaining),
                  align: $align.center
                },
                layout: function(make) {
                  make.centerX.equalTo($("home-ring-img"));
                  make.centerY.equalTo($("home-ring-img")).offset(8);
                }
              },
              {
                type: "label",
                props: {
                  id: "home-budget-occ",
                  text: budgetOccupiedLine(snap),
                  font: $font(13),
                  textColor: $color("secondaryLabel"),
                  align: $align.center
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-ring-img").bottom).offset(12);
                }
              },
              {
                type: "view",
                props: {
                  bgcolor: $color("separator"),
                  alpha: 0.35
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-budget-occ").bottom).offset(12);
                  make.height.equalTo(0.5);
                }
              },
              {
                type: "button",
                props: {
                  id: "home-surplus-btn",
                  title: surplusTapLine(snap),
                  bgcolor: $color("clear"),
                  titleColor: $color("label"),
                  font: $font(14)
                },
                layout: function(make) {
                  make.left.right.equalTo();
                  make.top.equalTo($("home-budget-occ").bottom).offset(12);
                  make.height.equalTo(44);
                  make.bottom.inset(4);
                },
                events: {
                  tapped: function() {
                    handleAction("surplus");
                  }
                }
              }
            ]
          },
          {
            type: "view",
            layout: function(make) {
              make.left.right.inset(16);
              make.top.equalTo($("home-top-card").bottom).offset(16);
              make.height.equalTo(50);
            },
            views: [
              {
                type: "view",
                layout: function(make) {
                  make.left.top.bottom.equalTo();
                  make.width.equalTo(make.super).multipliedBy(0.48);
                },
                views: [primaryButton("记一笔", function() { handleAction("add-expense"); })]
              },
              {
                type: "view",
                layout: function(make) {
                  make.right.top.bottom.equalTo();
                  make.width.equalTo(make.super).multipliedBy(0.48);
                },
                views: [secondaryButton("消费明细", function() { handleAction("expenses"); })]
              }
            ]
          },
          {
            type: "view",
            props: { id: "home-preview-section" },
            layout: function(make) {
              make.left.right.equalTo();
              make.top.equalTo($("home-top-card").bottom).offset(82);
              make.bottom.inset(24);
            },
            views: [
              {
                type: "button",
                props: {
                  title: "本月明细  ›",
                  bgcolor: $color("clear"),
                  titleColor: $color("label"),
                  font: $font("semibold", 17),
                  align: $align.left
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo();
                  make.height.equalTo(40);
                },
                events: {
                  tapped: function() {
                    handleAction("expenses");
                  }
                }
              },
              {
                type: "list",
                props: {
                  id: "home-preview-list",
                  scrollEnabled: false,
                  separatorStyle: 0,
                  rowHeight: PREVIEW_ROW_H,
                  bgcolor: $color("secondarySystemGroupedBackground"),
                  radius: 12,
                  template: previewListTemplate,
                  data: buildPreviewListData()
                },
                layout: function(make) {
                  const items = previewExpenses();
                  make.left.right.inset(16);
                  make.top.equalTo(40);
                  make.height.equalTo(previewListHeight(items.length));
                }
              },
              {
                type: "button",
                props: {
                  title: "更多  ›",
                  bgcolor: $color("clear"),
                  titleColor: $color(COLOR_OK),
                  font: $font(15),
                  align: $align.center
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-preview-list").bottom).offset(8);
                  make.height.equalTo(36);
                },
                events: {
                  tapped: function() {
                    handleAction("expenses");
                  }
                }
              },
              {
                type: "view",
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-preview-list").bottom).offset(52);
                  make.height.equalTo(44);
                  make.bottom.equalTo(-8);
                },
                views: [
                  {
                    type: "button",
                    props: {
                      title: "分期",
                      bgcolor: $color("secondarySystemGroupedBackground"),
                      titleColor: $color("label"),
                      radius: 10,
                      font: $font(16)
                    },
                    layout: function(make) {
                      make.left.top.bottom.equalTo();
                      make.width.equalTo(make.super).multipliedBy(0.48);
                    },
                    events: {
                      tapped: function() {
                        handleAction("installments");
                      }
                    }
                  },
                  {
                    type: "button",
                    props: {
                      title: "预算",
                      bgcolor: $color("secondarySystemGroupedBackground"),
                      titleColor: $color("label"),
                      radius: 10,
                      font: $font(16)
                    },
                    layout: function(make) {
                      make.right.top.bottom.equalTo();
                      make.width.equalTo(make.super).multipliedBy(0.48);
                    },
                    events: {
                      tapped: function() {
                        handleAction("set-budget");
                      }
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    events: {
      appeared: function() {
        refresh();
      }
    }
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

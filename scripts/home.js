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
const COLOR_BTN_PRIMARY = "#2C2C2E";
const PREVIEW_LIMIT = 4;
const PREVIEW_ROW_H = 58;
const PREVIEW_HEADER_H = 42;
const PREVIEW_MORE_H = 52;
const SECONDARY_BTN_GAP = 8;
const CARD_RADIUS = 14;
const BTN_RADIUS = 12;

function setDeps(deps) {
  expensesUI = deps.expenses;
  installmentsUI = deps.installments;
  surplusUI = deps.surplus;
}

function moneyColor(n) {
  if (n < 0) return $color(COLOR_WARN);
  if (n > 0) return $color("#2E7D32");
  return $color("label");
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

function remainingCenterText(snap) {
  return "剩余 " + util.formatMoney(snap.remaining);
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
    formatSignedSurplus(snap.cumulative) +
    " ›"
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
    remaining.text = remainingCenterText(snap);
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
        subtitle: { text: "", textColor: $color("clear") },
        amount: { text: "", textColor: $color("clear") },
        date: { text: "", textColor: $color("clear") }
      }
    ];
  }
  return rows.map(function(e) {
    const note = e.note ? String(e.note).trim() : "";
    const title = note || "消费";
    return {
      title: { text: title, textColor: $color("label") },
      subtitle: { text: " ", textColor: $color("clear") },
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
        radius: 8
      },
      layout: function(make, view) {
        make.left.inset(14);
        make.centerY.equalTo(view.super);
        make.width.height.equalTo(34);
      }
    },
    {
      type: "label",
      props: { id: "title", font: $font(16), lines: 1 },
      layout: function(make, view) {
        make.left.equalTo(58);
        make.top.inset(11);
        make.right.lessThanOrEqualTo(view.super).inset(96);
      }
    },
    {
      type: "label",
      props: { id: "subtitle", font: $font(12), lines: 1 },
      layout: function(make, view) {
        make.left.equalTo(58);
        make.bottom.inset(11);
        make.right.lessThanOrEqualTo(view.super).inset(96);
      }
    },
    {
      type: "label",
      props: { id: "amount", font: $font("semibold", 16), align: $align.right },
      layout: function(make, view) {
        make.right.inset(14);
        make.top.inset(11);
      }
    },
    {
      type: "label",
      props: { id: "date", font: $font(12), align: $align.right },
      layout: function(make, view) {
        make.right.inset(14);
        make.bottom.inset(11);
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
    make.left.right.equalTo();
    make.top.equalTo($("home-preview-top-sep").bottom);
    make.height.equalTo(height);
  });
  const bottomSep = $("home-preview-bottom-sep");
  if (bottomSep) {
    bottomSep.remakeLayout(function(make) {
      make.left.right.equalTo();
      make.top.equalTo($("home-preview-list").bottom);
      make.height.equalTo(0.33);
    });
  }
  const more = $("home-preview-more");
  if (more) {
    more.remakeLayout(function(make) {
      make.left.right.bottom.equalTo();
      make.top.equalTo($("home-preview-bottom-sep").bottom);
      make.height.equalTo(PREVIEW_MORE_H);
    });
  }
  const card = $("home-preview-card");
  if (card) {
    card.remakeLayout(function(make) {
      make.left.right.inset(16);
      make.top.equalTo($("home-actions").bottom).offset(28);
    });
  }
  const secondary = $("home-secondary-actions");
  if (secondary) {
    secondary.remakeLayout(function(make) {
      make.left.right.inset(16);
      make.top.equalTo($("home-preview-card").bottom).offset(28);
      make.height.equalTo(44);
      make.bottom.inset(24);
    });
  }
  const content = $("home-content");
  if (content && content.layoutIfNeeded) content.layoutIfNeeded();
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

function render() {
  const snap = currentSnap();
  const ringImg = drawRingForSnap(snap);
  const previewItems = previewExpenses();

  $ui.render({
    props: {
      title: "PocketBudget",
      bgcolor: $color("systemGroupedBackground")
    },
    views: [
      {
        type: "scroll",
        props: {
          id: "home-scroll",
          showsVerticalIndicator: false,
          bgcolor: $color("systemGroupedBackground")
        },
        layout: function(make) {
          make.edges.equalTo();
        },
        views: [
          {
            type: "view",
            props: {
              id: "home-content",
              bgcolor: $color("clear")
            },
            layout: function(make, view) {
              make.top.left.right.equalTo(view.super);
              make.width.equalTo(view.super);
              make.bottom.equalTo(view.super);
            },
            views: [
              {
                type: "view",
                props: {
                  id: "home-top-card",
                  bgcolor: $color("systemBackground"),
                  radius: CARD_RADIUS,
                  clipsToBounds: true
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.inset(8);
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
                      make.top.inset(18);
                      make.width.height.equalTo(116);
                    }
                  },
                  {
                    type: "label",
                    props: {
                      id: "home-remaining",
                      text: remainingCenterText(snap),
                      font: $font("bold", 18),
                      textColor: moneyColor(snap.remaining),
                      align: $align.center,
                      lines: 2
                    },
                    layout: function(make) {
                      make.center.equalTo($("home-ring-img"));
                      make.width.lessThanOrEqualTo(108);
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
                      make.top.equalTo($("home-ring-img").bottom).offset(10);
                    }
                  },
                  {
                    type: "view",
                    props: {
                      id: "home-card-sep",
                      bgcolor: $color("separator"),
                      alpha: 0.55
                    },
                    layout: function(make) {
                      make.left.right.inset(16);
                      make.top.equalTo($("home-budget-occ").bottom).offset(14);
                      make.height.equalTo(0.33);
                    }
                  },
                  {
                    type: "button",
                    props: {
                      id: "home-surplus-btn",
                      title: surplusTapLine(snap),
                      bgcolor: $color("clear"),
                      titleColor: $color("label"),
                      font: $font(15)
                    },
                    layout: function(make) {
                      make.left.right.equalTo();
                      make.top.equalTo($("home-card-sep").bottom);
                      make.height.equalTo(46);
                      make.bottom.inset(2);
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
                props: { id: "home-actions" },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-top-card").bottom).offset(14);
                  make.height.equalTo(48);
                },
                views: [
                  {
                    type: "button",
                    props: {
                      title: "记一笔",
                      bgcolor: $color(COLOR_BTN_PRIMARY),
                      titleColor: $color("#FFFFFF"),
                      radius: BTN_RADIUS,
                      font: $font("semibold", 17)
                    },
                    layout: function(make, view) {
                      make.left.right.top.bottom.equalTo(view.super);
                    },
                    events: {
                      tapped: function() {
                        handleAction("add-expense");
                      }
                    }
                  }
                ]
              },
              {
                type: "view",
                props: {
                  id: "home-preview-card",
                  bgcolor: $color("systemBackground"),
                  radius: CARD_RADIUS,
                  clipsToBounds: true
                },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-actions").bottom).offset(28);
                },
                views: [
                  {
                    type: "view",
                    props: {
                      id: "home-preview-header"
                    },
                    layout: function(make) {
                      make.left.right.top.equalTo();
                      make.height.equalTo(PREVIEW_HEADER_H);
                    },
                    events: {
                      tapped: function() {
                        handleAction("expenses");
                      }
                    },
                    views: [
                      {
                        type: "label",
                        props: {
                          text: "本月明细",
                          font: $font("bold", 17),
                          textColor: $color("label")
                        },
                        layout: function(make, view) {
                          make.left.inset(14);
                          make.centerY.equalTo(view.super).offset(2);
                        }
                      },
                      {
                        type: "label",
                        props: {
                          text: "›",
                          font: $font(18),
                          textColor: $color("tertiaryLabel"),
                          align: $align.right
                        },
                        layout: function(make, view) {
                          make.right.inset(14);
                          make.centerY.equalTo(view.super).offset(2);
                        }
                      }
                    ]
                  },
                  {
                    type: "view",
                    props: {
                      id: "home-preview-top-sep",
                      bgcolor: $color("separator"),
                      alpha: 0.55
                    },
                    layout: function(make) {
                      make.left.right.equalTo();
                      make.top.equalTo($("home-preview-header").bottom);
                      make.height.equalTo(0.33);
                    }
                  },
                  {
                    type: "list",
                    props: {
                      id: "home-preview-list",
                      scrollEnabled: false,
                      separatorStyle: 1,
                      rowHeight: PREVIEW_ROW_H,
                      bgcolor: $color("systemBackground"),
                      template: previewListTemplate,
                      data: buildPreviewListData(previewItems)
                    },
                    layout: function(make) {
                      make.left.right.equalTo();
                      make.top.equalTo($("home-preview-top-sep").bottom);
                      make.height.equalTo(previewListHeight(previewItems.length));
                    },
                    events: {
                      didSelect: function() {
                        handleAction("expenses");
                      }
                    }
                  },
                  {
                    type: "view",
                    props: {
                      id: "home-preview-bottom-sep",
                      bgcolor: $color("separator"),
                      alpha: 0.55
                    },
                    layout: function(make) {
                      make.left.right.equalTo();
                      make.top.equalTo($("home-preview-list").bottom);
                      make.height.equalTo(0.33);
                    }
                  },
                  {
                    type: "button",
                    props: {
                      id: "home-preview-more",
                      title: "更多  ›",
                      bgcolor: $color("clear"),
                      titleColor: $color(COLOR_OK),
                      font: $font(16)
                    },
                    layout: function(make) {
                      make.left.right.bottom.equalTo();
                      make.top.equalTo($("home-preview-bottom-sep").bottom);
                      make.height.equalTo(PREVIEW_MORE_H);
                    },
                    events: {
                      tapped: function() {
                        handleAction("expenses");
                      }
                    }
                  }
                ]
              },
              {
                type: "view",
                props: { id: "home-secondary-actions" },
                layout: function(make) {
                  make.left.right.inset(16);
                  make.top.equalTo($("home-preview-card").bottom).offset(28);
                  make.height.equalTo(44);
                  make.bottom.inset(24);
                },
                views: [
                  {
                    type: "button",
                    props: {
                      id: "home-btn-installments",
                      title: "分期",
                      bgcolor: $color("systemBackground"),
                      borderWidth: 1,
                      borderColor: $color("opaqueSeparator"),
                      titleColor: $color("label"),
                      radius: 10,
                      font: $font("medium", 16)
                    },
                    layout: function(make, view) {
                      make.left.top.bottom.equalTo(view.super);
                      make.width
                        .equalTo(view.super)
                        .offset(-2 * SECONDARY_BTN_GAP)
                        .dividedBy(3);
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
                      id: "home-btn-budget",
                      title: "预算",
                      bgcolor: $color("systemBackground"),
                      borderWidth: 1,
                      borderColor: $color("opaqueSeparator"),
                      titleColor: $color("label"),
                      radius: 10,
                      font: $font("medium", 16)
                    },
                    layout: function(make, view) {
                      make.top.bottom.equalTo(view.super);
                      make.left
                        .equalTo($("home-btn-installments").right)
                        .offset(SECONDARY_BTN_GAP);
                      make.width.equalTo($("home-btn-installments"));
                    },
                    events: {
                      tapped: function() {
                        handleAction("set-budget");
                      }
                    }
                  },
                  {
                    type: "button",
                    props: {
                      id: "home-btn-settings",
                      title: "设置",
                      bgcolor: $color("systemBackground"),
                      borderWidth: 1,
                      borderColor: $color("opaqueSeparator"),
                      titleColor: $color("label"),
                      radius: 10,
                      font: $font("medium", 16)
                    },
                    layout: function(make, view) {
                      make.top.bottom.right.equalTo(view.super);
                      make.left
                        .equalTo($("home-btn-budget").right)
                        .offset(SECONDARY_BTN_GAP);
                      make.width.equalTo($("home-btn-installments"));
                    },
                    events: {
                      tapped: function() {
                        handleAction("settings");
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

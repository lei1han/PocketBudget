const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");

const SUMMARY_CARD_H = 96;
const MONTH_ROW_H = 88;
const CARD_RADIUS = 14;

function moneyColor(n) {
  if (n < 0) return $color("#D32F2F");
  if (n > 0) return $color("#2E7D32");
  return $color("secondaryLabel");
}

function formatAmountShort(n) {
  const x = util.roundMoney(n || 0);
  const plain = x % 1 === 0 ? String(Math.round(x)) : x.toFixed(2);
  return plain;
}

function formatSignedSurplus(n) {
  const x = util.roundMoney(n || 0);
  const prefix = x > 0 ? "+" : "";
  return prefix + util.formatMoney(x);
}

function formatSignedShort(n) {
  const x = util.roundMoney(n || 0);
  const prefix = x > 0 ? "+" : x < 0 ? "-" : "";
  const abs = Math.abs(x);
  const plain = abs % 1 === 0 ? String(Math.round(abs)) : abs.toFixed(2);
  return prefix + plain;
}

function monthDetailText(r) {
  const budget = "预算 " + formatAmountShort(r.budget);
  const spend =
    r.isCurrent
      ? "占用 " + formatAmountShort(r.occupied)
      : "支出 " + formatAmountShort(r.expense);
  const surplus = "结余 " + formatSignedShort(r.surplus);
  return budget + "　" + spend + "　" + surplus;
}

function buildMonthRows() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);
  return cum.rows
    .slice()
    .reverse()
    .map(function(r) {
      return {
        yearMonth: r.yearMonth,
        detail: monthDetailText(r),
        surplus: r.surplus
      };
    });
}

function buildMonthListData() {
  return buildMonthRows().map(function(row) {
    return {
      ym: { text: row.yearMonth, textColor: $color("label") },
      detail: { text: row.detail, textColor: $color("secondaryLabel") }
    };
  });
}

const monthListTemplate = {
  views: [
    {
      type: "label",
      props: { id: "ym", font: $font("semibold", 17), lines: 1 },
      layout: function(make) {
        make.left.right.inset(14);
        make.top.inset(18);
      }
    },
    {
      type: "label",
      props: { id: "detail", font: $font(13), lines: 2 },
      layout: function(make) {
        make.left.right.inset(14);
        make.bottom.inset(18);
      }
    }
  ]
};

function refreshView() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);
  const header = $("surplus-cumulative");
  const list = $("surplus-month-list");
  if (header) {
    header.text = "累计结余 " + formatSignedSurplus(cum.cumulative);
    header.textColor = moneyColor(cum.cumulative);
  }
  if (list) {
    const rows = buildMonthListData();
    list.data = rows;
    const count = rows.length > 0 ? rows.length : 1;
    list.remakeLayout(function(make) {
      make.left.right.inset(16);
      make.top.equalTo($("surplus-summary-card").bottom).offset(12);
      make.height.equalTo(count * MONTH_ROW_H);
      make.bottom.inset(20);
    });
  }
}

function open() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);
  const monthData = buildMonthListData();

  $ui.push({
    props: {
      title: "按月统计",
      bgcolor: $color("systemGroupedBackground")
    },
    views: [
      {
        type: "scroll",
        props: {
          showsVerticalIndicator: false,
          bgcolor: $color("systemGroupedBackground")
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {
              id: "surplus-summary-card",
              bgcolor: $color("systemBackground"),
              radius: CARD_RADIUS
            },
            layout: function(make) {
              make.left.right.inset(16);
              make.top.inset(8);
              make.height.equalTo(SUMMARY_CARD_H);
            },
            views: [
              {
                type: "label",
                props: {
                  id: "surplus-cumulative",
                  text: "累计结余 " + formatSignedSurplus(cum.cumulative),
                  font: $font("bold", 22),
                  textColor: moneyColor(cum.cumulative),
                  align: $align.center
                },
                layout: function(make) {
                  make.center.equalTo();
                  make.left.right.inset(16);
                }
              }
            ]
          },
          {
            type: "list",
            props: {
              id: "surplus-month-list",
              scrollEnabled: false,
              separatorStyle: 1,
              rowHeight: MONTH_ROW_H,
              bgcolor: $color("systemBackground"),
              radius: CARD_RADIUS,
              clipsToBounds: true,
              template: monthListTemplate,
              data: monthData
            },
            layout: function(make) {
              make.left.right.inset(16);
              make.top.equalTo($("surplus-summary-card").bottom).offset(12);
              make.height.equalTo(Math.max(monthData.length, 1) * MONTH_ROW_H);
              make.bottom.inset(20);
            }
          }
        ]
      }
    ],
    events: {
      appeared: function() {
        refreshView();
      }
    }
  });
}

module.exports = {
  open
};

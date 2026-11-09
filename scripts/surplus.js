const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");

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

function monthDetailText(r) {
  const budget = "预算 " + formatAmountShort(r.budget);
  const spend =
    r.isCurrent
      ? "占用 " + formatAmountShort(r.occupied)
      : "支出 " + formatAmountShort(r.expense);
  const surplus = "结余 " + formatSignedSurplus(r.surplus);
  return budget + " / " + spend + " / " + surplus;
}

function buildMonthRows() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);
  return cum.rows
    .slice()
    .reverse()
    .map(function(r) {
      const tag = r.isCurrent ? "" : "";
      return {
        yearMonth: r.yearMonth + tag,
        detail: monthDetailText(r),
        surplus: r.surplus
      };
    });
}

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
    list.removeAll();
    buildMonthRows().forEach(function(row) {
      list.add(makeMonthRow(row));
    });
  }
}

function makeMonthRow(row) {
  return {
    type: "view",
    props: { height: 56 },
    layout: function(make) {
      make.left.right.equalTo();
      make.height.equalTo(56);
    },
    views: [
      {
        type: "label",
        props: {
          text: row.yearMonth,
          font: $font(16),
          textColor: $color("label")
        },
        layout: function(make) {
          make.left.inset(16);
          make.centerY.equalTo();
        }
      },
      {
        type: "label",
        props: {
          text: row.detail,
          font: $font(12),
          textColor: $color("secondaryLabel"),
          align: $align.right,
          lines: 2
        },
        layout: function(make) {
          make.right.inset(16);
          make.left.greaterThanOrEqualTo(100);
          make.centerY.equalTo();
        }
      }
    ]
  };
}

function openSettings() {
  const settings = require("scripts/settings");
  settings.open(refreshView);
}

function open() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);

  $ui.push({
    props: {
      title: "按月统计",
      navButtons: [
        {
          icon: "gear",
          handler: function() {
            openSettings();
          }
        }
      ]
    },
    views: [
      {
        type: "scroll",
        props: { showsVerticalIndicator: true },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            props: {
              id: "surplus-summary-card",
              bgcolor: $color("secondarySystemGroupedBackground"),
              radius: 16
            },
            layout: function(make) {
              make.left.right.inset(16);
              make.top.inset(12);
              make.height.equalTo(72);
            },
            views: [
              {
                type: "label",
                props: {
                  id: "surplus-cumulative",
                  text: "累计结余 " + formatSignedSurplus(cum.cumulative),
                  font: $font("semibold", 18),
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
            type: "view",
            props: {
              id: "surplus-month-list",
              bgcolor: $color("secondarySystemGroupedBackground"),
              radius: 12
            },
            layout: function(make) {
              make.left.right.inset(16);
              make.top.equalTo($("surplus-summary-card").bottom).offset(12);
              make.bottom.inset(24);
            },
            views: buildMonthRows().map(makeMonthRow)
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

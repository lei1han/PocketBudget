const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");

function moneyColor(n) {
  if (n < 0) return $color("#D32F2F");
  if (n > 0) return $color("#2E7D32");
  return $color("secondaryLabel");
}

function buildData() {
  const current = util.currentYearMonth();
  const cum = calc.cumulativeSurplus(state.getData(), current);
  const header = [
    {
      title: { text: "累计结余", textColor: $color("secondaryLabel") },
      value: { text: util.formatMoney(cum.cumulative), textColor: moneyColor(cum.cumulative) }
    }
  ];
  const rows = cum.rows
    .slice()
    .reverse()
    .map(function(r) {
      const tag = r.isCurrent ? "（本月预览）" : "";
      return {
        title: {
          text: r.yearMonth + tag,
          textColor: $color("label")
        },
        value: {
          text: util.formatMoney(r.surplus),
          textColor: moneyColor(r.surplus)
        }
      };
    });
  return [
    { title: "汇总", rows: header },
    { title: "按月结余", rows: rows }
  ];
}

function open() {
  $ui.push({
    props: { title: "结余一览" },
    views: [
      {
        type: "list",
        props: {
          id: "surplus-list",
          rowHeight: 48,
          data: buildData(),
          template: {
            views: [
              {
                type: "label",
                props: { id: "title", font: $font(16) },
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
          }
        },
        layout: $layout.fill
      }
    ]
  });
}

module.exports = {
  open
};

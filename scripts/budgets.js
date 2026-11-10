const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");

const ROW_H = 48;
let onChanged = null;

function monthRows() {
  const data = state.getData();
  const current = util.currentYearMonth();
  const months = calc.collectActiveMonths(data, current);
  return months.map(function(ym) {
    const explicit = calc.findBudgetEntry(data, ym);
    const amount = calc.effectiveBudget(data, ym);
    return {
      yearMonth: ym,
      amount: amount,
      hasExplicit: !!explicit,
      isCurrent: ym === current
    };
  });
}

function buildListData() {
  return [
    {
      title: "",
      footer: {
        type: "label",
        props: {
          height: 72,
          text:
            "仅列出已有预算、消费或分期占用的月份，以及当前月。未单独设预算的月份显示沿用金额；修改后结余立即重算。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: monthRows().map(function(row) {
        const amtText = util.formatMoney(row.amount);
        const sub =
          row.hasExplicit ? amtText : amtText + "（沿用）";
        return {
          ym: {
            text: row.yearMonth + (row.isCurrent ? " · 本月" : ""),
            textColor: $color("label")
          },
          amount: { text: sub, textColor: $color("secondaryLabel") },
          yearMonth: row.yearMonth
        };
      })
    }
  ];
}

function refreshList() {
  const list = $("budgets-list");
  if (list) list.data = buildListData();
}

function promptSetMonth(ym) {
  const data = state.getData();
  const current = calc.effectiveBudget(data, ym);
  $input.text({
    type: $kbType.decimal,
    placeholder: ym + " 预算金额",
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
      refreshList();
      if (onChanged) onChanged();
    }
  });
}

function promptBulkSet() {
  const rows = monthRows();
  if (rows.length === 0) {
    $ui.toast("没有可设置的月份");
    return;
  }
  $input.text({
    type: $kbType.decimal,
    placeholder: "统一预算金额",
    handler: function(text) {
      if (text === undefined || text === null) return;
      const n = util.toNumber(text);
      if (isNaN(n) || n < 0) {
        $ui.toast("请输入有效金额");
        return;
      }
      const months = rows.map(function(r) {
        return r.yearMonth;
      });
      const result = calc.setBudgetsBulk(state.getData(), months, n);
      if (!result.ok) {
        $ui.alert(result.message);
        return;
      }
      state.setData(result.data);
      $ui.toast("已统一设为 " + util.formatMoney(n));
      refreshList();
      if (onChanged) onChanged();
    }
  });
}

function open(changedHandler) {
  onChanged = typeof changedHandler === "function" ? changedHandler : null;
  $ui.push({
    props: {
      title: "预算",
      bgcolor: $color("insetGroupedBackground"),
      navButtons: [
        {
          title: "统一设为…",
          handler: function() {
            promptBulkSet();
          }
        }
      ]
    },
    views: [
      {
        type: "list",
        props: {
          id: "budgets-list",
          style: 2,
          rowHeight: ROW_H,
          bgcolor: $color("insetGroupedBackground"),
          template: {
            views: [
              {
                type: "label",
                props: { id: "ym", font: $font(17) },
                layout: function(make, view) {
                  make.left.inset(16);
                  make.centerY.equalTo(view.super);
                  make.right.lessThanOrEqualTo(view.super).inset(120);
                }
              },
              {
                type: "label",
                props: { id: "amount", font: $font(15), align: $align.right },
                layout: function(make, view) {
                  make.right.inset(32);
                  make.centerY.equalTo(view.super);
                }
              }
            ]
          },
          data: buildListData()
        },
        layout: $layout.fill,
        events: {
          didSelect: function(sender, indexPath) {
            const row = sender.object(indexPath);
            if (!row || !row.yearMonth) return;
            promptSetMonth(row.yearMonth);
          }
        }
      }
    ],
    events: {
      appeared: function() {
        refreshList();
      }
    }
  });
}

module.exports = {
  open
};

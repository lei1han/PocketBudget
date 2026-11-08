const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");
const home = require("scripts/home");

let viewingMonth = util.currentYearMonth();

function listData() {
  const rows = calc.expensesForMonth(state.getData(), viewingMonth).map(function(e) {
    return {
      id: e.id,
      title: {
        text: util.formatMoney(e.amount) + (e.note ? "  " + e.note : ""),
        textColor: $color("label")
      },
      subtitle: {
        text: util.formatDateTime(e.at),
        textColor: $color("secondaryLabel")
      }
    };
  });
  if (rows.length === 0) {
    rows.push({
      id: null,
      title: { text: "本月暂无消费", textColor: $color("secondaryLabel") },
      subtitle: { text: "可点右上角「记一笔」", textColor: $color("tertiaryLabel") }
    });
  }
  return rows;
}

function refresh() {
  const list = $("expense-list");
  if (list) {
    list.data = listData();
  }
  const nav = $("expense-month");
  if (nav) nav.text = viewingMonth;
}

function changeMonth(delta) {
  viewingMonth = util.addMonths(viewingMonth, delta);
  refresh();
}

function deleteAt(indexPath) {
  const list = $("expense-list");
  const row = list.object(indexPath);
  if (!row || !row.id) {
    $ui.toast("无记录可删");
    return;
  }
  $ui.alert({
    title: "删除消费",
    message: "删除后结余立即重算，确认？",
    actions: [
      { title: "取消", style: "Cancel" },
      {
        title: "删除",
        style: "Destructive",
        handler: function() {
          const result = calc.deleteExpense(state.getData(), row.id);
          if (!result.ok) {
            $ui.alert(result.message);
            return;
          }
          state.setData(result.data);
          refresh();
          home.refresh();
          $ui.toast("已删除");
        }
      }
    ]
  });
}

function open() {
  viewingMonth = util.currentYearMonth();
  $ui.push({
    props: {
      title: "消费明细",
      navButtons: [
        {
          title: "记一笔",
          handler: function() {
            home.promptAddExpense(function() {
              refresh();
            });
          }
        }
      ]
    },
    views: [
      {
        type: "view",
        props: { id: "expense-bar" },
        layout: function(make) {
          make.left.right.top.equalTo();
          make.height.equalTo(44);
        },
        views: [
          {
            type: "button",
            props: { title: "‹ 上月", bgcolor: $color("clear"), titleColor: $color("#007AFF") },
            layout: function(make) {
              make.left.inset(8);
              make.centerY.equalTo();
              make.width.equalTo(72);
            },
            events: {
              tapped: function() { changeMonth(-1); }
            }
          },
          {
            type: "label",
            props: {
              id: "expense-month",
              text: viewingMonth,
              align: $align.center,
              font: $font("bold", 16)
            },
            layout: function(make) {
              make.center.equalTo();
            }
          },
          {
            type: "button",
            props: { title: "下月 ›", bgcolor: $color("clear"), titleColor: $color("#007AFF") },
            layout: function(make) {
              make.right.inset(8);
              make.centerY.equalTo();
              make.width.equalTo(72);
            },
            events: {
              tapped: function() { changeMonth(1); }
            }
          }
        ]
      },
      {
        type: "list",
        props: {
          id: "expense-list",
          rowHeight: 56,
          data: listData(),
          template: {
            views: [
              {
                type: "label",
                props: { id: "title", font: $font(16) },
                layout: function(make, view) {
                  make.left.right.inset(16);
                  make.top.inset(8);
                }
              },
              {
                type: "label",
                props: { id: "subtitle", font: $font(12) },
                layout: function(make, view) {
                  make.left.right.inset(16);
                  make.bottom.inset(8);
                }
              }
            ]
          },
          actions: [
            {
              title: "删除",
              color: $color("red"),
              handler: function(sender, indexPath) {
                deleteAt(indexPath);
              }
            }
          ]
        },
        layout: function(make, view) {
          make.left.right.bottom.equalTo();
          make.top.equalTo($("expense-bar").bottom);
        }
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
  open,
  refresh
};

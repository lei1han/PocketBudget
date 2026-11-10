const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");
const home = require("scripts/home");

function statusLabel(status) {
  return status === "ended" ? "已结束" : "进行中";
}

function listData() {
  const data = state.getData();
  const plans = (data.installments || []).slice().sort(function(a, b) {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return String(b.startMonth).localeCompare(String(a.startMonth));
  });
  if (plans.length === 0) {
    return [
      {
        id: null,
        title: { text: "暂无分期", textColor: $color("secondaryLabel") },
        subtitle: { text: "点右上角「新建」", textColor: $color("tertiaryLabel") }
      }
    ];
  }
  return plans.map(function(p) {
    return {
      id: p.id,
      title: {
        text: util.formatMoney(p.total) + " / " + p.periods + " 期 · " + statusLabel(p.status),
        textColor: $color("label")
      },
      subtitle: {
        text: "首期 " + p.startMonth + (p.note ? " · " + p.note : ""),
        textColor: $color("secondaryLabel")
      }
    };
  });
}

function refreshList() {
  const list = $("ins-list");
  if (list) list.data = listData();
}

function confirmDeleteInstallment(planId, onDone) {
  $ui.alert({
    title: "删除分期",
    message: "将删除该分期及全部期次预扣；历史月份预扣也会撤销，结余立即重算。确认？",
    actions: [
      { title: "取消", style: "Cancel" },
      {
        title: "删除",
        style: "Destructive",
        handler: function() {
          const result = calc.deleteInstallment(state.getData(), planId);
          if (!result.ok) {
            $ui.alert(result.message);
            return;
          }
          state.setData(result.data);
          refreshList();
          home.refresh();
          $ui.toast("已删除");
          if (onDone) onDone();
        }
      }
    ]
  });
}

function deleteAt(indexPath) {
  const list = $("ins-list");
  const row = list.object(indexPath);
  if (!row || !row.id) {
    $ui.toast("无记录可删");
    return;
  }
  confirmDeleteInstallment(row.id);
}

function promptCreate() {
  $input.text({
    type: $kbType.decimal,
    placeholder: "分期总金额",
    handler: function(totalText) {
      if (totalText === undefined || totalText === null) return;
      const total = util.toNumber(totalText);
      if (isNaN(total) || total <= 0) {
        $ui.toast("总额须大于 0");
        return;
      }
      $input.text({
        type: $kbType.number,
        placeholder: "期数（如 3 / 6 / 12）",
        handler: function(periodsText) {
          if (periodsText === undefined || periodsText === null) return;
          const periods = Math.floor(util.toNumber(periodsText));
          if (!(periods > 0)) {
            $ui.toast("期数须为正整数");
            return;
          }
          $ui.menu({
            items: ["首期从本月开始", "选择首期月份"],
            handler: function(title, idx) {
              if (idx === 0) {
                askNoteAndCreate(total, periods, util.currentYearMonth());
              } else {
                $picker.date({
                  props: { date: new Date() },
                  handler: function(date) {
                    if (!date) return;
                    askNoteAndCreate(total, periods, util.yearMonthFromDate(date));
                  }
                });
              }
            }
          });
        }
      });
    }
  });
}

function askNoteAndCreate(total, periods, startMonth) {
  $input.text({
    type: $kbType.default,
    placeholder: "备注（可留空）",
    text: "",
    handler: function(note) {
      if (note === undefined || note === null) note = "";
      const preview = util.splitInstallmentAmounts(total, periods);
      const msg =
        "总额 " +
        util.formatMoney(total) +
        "，" +
        periods +
        " 期\n首期 " +
        startMonth +
        "\n每期约 " +
        util.formatMoney(preview[0]) +
        "（尾差进末期 " +
        util.formatMoney(preview[preview.length - 1]) +
        "）";
      $ui.alert({
        title: "确认新建分期",
        message: msg,
        actions: [
          { title: "取消", style: "Cancel" },
          {
            title: "创建",
            handler: function() {
              const result = calc.createInstallment(state.getData(), total, periods, startMonth, note);
              if (!result.ok) {
                $ui.alert(result.message);
                return;
              }
              state.setData(result.data);
              $ui.toast("分期已创建");
              refreshList();
              home.refresh();
            }
          }
        ]
      });
    }
  });
}

function openDetail(planId) {
  const data = state.getData();
  const plan = (data.installments || []).find(function(p) { return p.id === planId; });
  if (!plan) {
    $ui.toast("计划不存在");
    return;
  }
  const items = calc.installmentItemsForPlan(data, planId);
  const rows = items.map(function(it) {
    const flag = it.active === false ? "已取消" : "预扣中";
    return {
      title: {
        text: "第 " + it.seq + " 期 · " + it.yearMonth + " · " + flag,
        textColor: it.active === false ? $color("tertiaryLabel") : $color("label")
      },
      value: {
        text: util.formatMoney(it.amount),
        textColor: it.active === false ? $color("tertiaryLabel") : $color("label")
      }
    };
  });

  const buttons = [];
  if (plan.status !== "ended") {
    buttons.push({
      title: "提前结束",
      handler: function() {
        $ui.alert({
          title: "提前结束分期",
          message: "将取消「当前月之后」未发生期次的预扣；已发生月份保留。",
          actions: [
            { title: "取消", style: "Cancel" },
            {
              title: "结束",
              style: "Destructive",
              handler: function() {
                const result = calc.endInstallment(state.getData(), planId);
                if (!result.ok) {
                  $ui.alert(result.message);
                  return;
                }
                state.setData(result.data);
                $ui.toast("已结束分期");
                $ui.pop();
                refreshList();
                home.refresh();
              }
            }
          ]
        });
      }
    });
  }
  buttons.push({
    title: "删除分期",
    handler: function() {
      confirmDeleteInstallment(planId, function() {
        $ui.pop();
      });
    }
  });

  $ui.push({
    props: {
      title: "分期详情",
      navButtons: buttons
    },
    views: [
      {
        type: "list",
        props: {
          data: [
            {
              title: "计划",
              rows: [
                {
                  title: { text: "总额", textColor: $color("secondaryLabel") },
                  value: { text: util.formatMoney(plan.total), textColor: $color("label") }
                },
                {
                  title: { text: "期数", textColor: $color("secondaryLabel") },
                  value: { text: String(plan.periods), textColor: $color("label") }
                },
                {
                  title: { text: "首期月", textColor: $color("secondaryLabel") },
                  value: { text: plan.startMonth, textColor: $color("label") }
                },
                {
                  title: { text: "状态", textColor: $color("secondaryLabel") },
                  value: { text: statusLabel(plan.status), textColor: $color("label") }
                },
                {
                  title: { text: "备注", textColor: $color("secondaryLabel") },
                  value: { text: plan.note || "—", textColor: $color("label") }
                }
              ]
            },
            { title: "各期预扣", rows: rows }
          ],
          rowHeight: 48,
          template: {
            views: [
              {
                type: "label",
                props: { id: "title", font: $font(17) },
                layout: function(make, view) {
                  make.left.inset(16);
                  make.centerY.equalTo(view.super);
                }
              },
              {
                type: "label",
                props: { id: "value", font: $font(17), align: $align.right },
                layout: function(make, view) {
                  make.right.inset(16);
                  make.centerY.equalTo(view.super);
                  make.left.greaterThanOrEqualTo(view.prev.right).offset(8);
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

function open() {
  $ui.push({
    props: {
      title: "分期",
      navButtons: [
        {
          title: "新建",
          handler: function() {
            promptCreate();
          }
        }
      ]
    },
    views: [
      {
        type: "list",
        props: {
          id: "ins-list",
          rowHeight: 56,
          data: listData(),
          actions: [
            {
              title: "删除",
              color: $color("red"),
              handler: function(sender, indexPath) {
                deleteAt(indexPath);
              }
            }
          ],
          template: {
            views: [
              {
                type: "label",
                props: { id: "title", font: $font(17) },
                layout: function(make, view) {
                  make.left.right.inset(16);
                  make.top.inset(8);
                }
              },
              {
                type: "label",
                props: { id: "subtitle", font: $font(13) },
                layout: function(make, view) {
                  make.left.right.inset(16);
                  make.bottom.inset(8);
                }
              }
            ]
          }
        },
        layout: $layout.fill,
        events: {
          didSelect: function(sender, indexPath) {
            const row = sender.object(indexPath);
            if (row && row.id) openDetail(row.id);
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
  open,
  refreshList
};

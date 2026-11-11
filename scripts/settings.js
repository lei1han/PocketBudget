const update = require("scripts/update");
const io = require("scripts/io");
const webdavSettings = require("scripts/webdav-settings");
const webdavSync = require("scripts/webdav-sync");
const state = require("scripts/state");
const calc = require("scripts/calc");
const util = require("scripts/util");

const SECTION_BUDGET = 0;
const SECTION_DATA = 1;
const SECTION_APP = 2;
const BOX_ASSET_LABEL = "PocketBudget.box";

let onChanged = null;

function refreshList() {
  const list = $("settings-list");
  if (list) list.data = buildData();
}

function monthStartRowText() {
  return util.monthStartLabel(state.getData().monthStartDay) + " ›";
}

function applyMonthStart(day) {
  const result = calc.setMonthStartDay(state.getData(), day);
  if (!result.ok) {
    $ui.alert(result.message);
    return;
  }
  state.setData(result.data);
  refreshList();
  if (onChanged) onChanged();
  const parts = [];
  parts.push(day === 1 ? "已改为自然月" : "已改为每月 " + day + " 日");
  if (result.reassigned > 0) parts.push("已重归 " + result.reassigned + " 笔消费");
  if (result.carried) parts.push("已沿用上月预算");
  $ui.toast(parts.join("，"));
}

function promptMonthStart() {
  const current = util.normalizeMonthStartDay(state.getData().monthStartDay);
  $input.text({
    type: $kbType.number,
    text: String(current),
    placeholder: "1–31，1 为自然月",
    handler: function(text) {
      if (text === undefined || text === null) return;
      const raw = String(text).trim();
      if (!/^\d+$/.test(raw)) {
        $ui.toast("请输入 1 到 31 的整数");
        return;
      }
      const day = Number(raw);
      if (day < 1 || day > 31) {
        $ui.toast("请输入 1 到 31 的整数");
        return;
      }
      if (day === current) return;
      const data = state.getData();
      const hasHistory =
        (data.expenses || []).length > 0 ||
        (data.budgets || []).length > 0 ||
        (data.installments || []).length > 0;
      const range =
        day === 1
          ? "改回自然月后，消费会按公历月重新归类。"
          : day <= 28
            ? "预算月改为每月 " + day + " 日至次月 " + (day - 1) + " 日。已有消费按记账时间重新归月。"
            : "预算月从每月 " +
              day +
              " 日开始；该月没有这一天时，从最后一天起算。已有消费按记账时间重新归月。";
      const sentence = range + "预算和分期仍挂在原来的月份编号上。";
      if (!hasHistory) {
        applyMonthStart(day);
        return;
      }
      $ui.alert({
        title: "更改每月起始",
        message: sentence,
        actions: [
          { title: "取消", style: "Cancel" },
          {
            title: "更改",
            handler: function() {
              applyMonthStart(day);
            }
          }
        ]
      });
    }
  });
}

function buildData() {
  return [
    {
      title: "预算",
      footer: {
        type: "label",
        props: {
          height: 112,
          text:
            "1 日为自然月。设为发薪日后，每个预算月从该日到次月前一日，例如 5 日即本月 5 日至次月 4 日。若某月没有这一天，则从该月最后一天起算。已有消费按记账时间重新归月。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: [
        {
          label: { text: "每月起始", textColor: $color("label") },
          value: {
            text: monthStartRowText(),
            textColor: $color("secondaryLabel")
          },
          action: "month-start"
        }
      ]
    },
    {
      title: "数据",
      footer: {
        type: "label",
        props: {
          height: 56,
          text: "导出 JSON（含常用备注）或从剪贴板/文件覆盖导入；也可用 WebDAV 同步 NAS。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: [
        {
          label: { text: "导出 JSON", textColor: $color("label") },
          value: { text: "›", textColor: $color("tertiaryLabel") },
          action: "export"
        },
        {
          label: { text: "导入数据", textColor: $color("label") },
          value: { text: "›", textColor: $color("tertiaryLabel") },
          action: "import"
        },
        {
          label: { text: "WebDAV 同步", textColor: $color("label") },
          value: {
            text: webdavSync.isConfigured() ? "已启用 ›" : "›",
            textColor: $color("tertiaryLabel")
          },
          action: "webdav"
        }
      ]
    },
    {
      title: "应用",
      footer: {
        type: "label",
        props: {
          height: 72,
          text:
            "从 GitHub Releases 检查更新并安装 " +
            BOX_ASSET_LABEL +
            "；预算数据仍在本地，不会上传。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: [
        {
          label: { text: "检查更新", textColor: $color("label") },
          value: {
            text: "v" + update.localVersion(),
            textColor: $color("secondaryLabel")
          },
          action: "check-update"
        }
      ]
    }
  ];
}

function open(changedHandler) {
  onChanged = typeof changedHandler === "function" ? changedHandler : null;
  $ui.push({
    props: {
      title: "设置",
      bgcolor: $color("insetGroupedBackground")
    },
    views: [
      {
        type: "list",
        props: {
          id: "settings-list",
          style: 2,
          rowHeight: 48,
          bgcolor: $color("insetGroupedBackground"),
          template: {
            views: [
              {
                type: "label",
                props: { id: "label", font: $font(17) },
                layout: function(make, view) {
                  make.left.inset(16);
                  make.centerY.equalTo(view.super);
                  make.right.lessThanOrEqualTo(view.super).inset(80);
                }
              },
              {
                type: "label",
                props: { id: "value", font: $font(17), align: $align.right },
                layout: function(make, view) {
                  make.right.inset(16);
                  make.centerY.equalTo(view.super);
                }
              }
            ]
          },
          data: buildData()
        },
        layout: $layout.fill,
        events: {
          didSelect: function(sender, indexPath) {
            const row = sender.object(indexPath);
            if (!row) return;
            if (indexPath.section === SECTION_BUDGET) {
              if (row.action === "month-start") promptMonthStart();
              return;
            }
            if (indexPath.section === SECTION_DATA) {
              if (row.action === "export") {
                io.exportJson(function() {
                  if (onChanged) onChanged();
                });
              } else if (row.action === "import") {
                io.showMenu(function() {
                  refreshList();
                  if (onChanged) onChanged();
                });
              } else if (row.action === "webdav") {
                webdavSettings.open(function() {
                  refreshList();
                  if (onChanged) onChanged();
                });
              }
              return;
            }
            if (indexPath.section === SECTION_APP) {
              if (row.action === "check-update") update.check();
            }
          }
        }
      }
    ]
  });
}

module.exports = {
  open
};

const update = require("scripts/update");
const io = require("scripts/io");
const webdavSettings = require("scripts/webdav-settings");
const webdavSync = require("scripts/webdav-sync");

const SECTION_DATA = 0;
const SECTION_APP = 1;
const BOX_ASSET_LABEL = "PocketBudget.box";

let onChanged = null;

function refreshList() {
  const list = $("settings-list");
  if (list) list.data = buildData();
}

function buildData() {
  return [
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

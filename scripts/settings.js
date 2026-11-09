const notePresets = require("scripts/note-presets");
const update = require("scripts/update");
const io = require("scripts/io");

const SECTION_PRESETS = 0;
const SECTION_DATA = 1;
const SECTION_APP = 2;
const BOX_ASSET_LABEL = "PocketBudget.box";

let presets = [];
let onChanged = null;

function refreshList() {
  const list = $("settings-list");
  if (list) list.data = buildData();
}

function buildData() {
  const rows = presets.map(function(text) {
    return {
      label: { text: text, textColor: $color("label") },
      value: { text: "›", textColor: $color("tertiaryLabel") }
    };
  });
  if (rows.length === 0) {
    rows.push({
      label: { text: "暂无预设，点右上角添加", textColor: $color("secondaryLabel") },
      value: { text: "", textColor: $color("clear") },
      empty: true
    });
  }
  return [
    {
      title: "常用备注",
      footer: {
        type: "label",
        props: {
          height: 56,
          text: "记一笔时可点选下列备注填入；修改后下次打开记一笔即生效。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: rows
    },
    {
      title: "数据",
      footer: {
        type: "label",
        props: {
          height: 56,
          text: "导出 JSON 或从剪贴板/文件覆盖导入本地全部预算数据。",
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

function promptAdd() {
  $input.text({
    type: $kbType.default,
    placeholder: "新备注，如 聚餐",
    handler: function(text) {
      if (text === undefined || text === null) return;
      const value = String(text).trim();
      if (!value) {
        $ui.toast("内容不能为空");
        return;
      }
      if (presets.indexOf(value) >= 0) {
        $ui.toast("已存在相同备注");
        return;
      }
      presets.push(value);
      presets = notePresets.save(presets);
      refreshList();
      $ui.toast("已添加");
    }
  });
}

function promptEdit(index) {
  const current = presets[index];
  if (!current) return;
  $input.text({
    type: $kbType.default,
    placeholder: "编辑备注",
    text: current,
    handler: function(text) {
      if (text === undefined || text === null) return;
      const value = String(text).trim();
      if (!value) {
        $ui.toast("内容不能为空");
        return;
      }
      if (value !== current && presets.indexOf(value) >= 0) {
        $ui.toast("已存在相同备注");
        return;
      }
      presets[index] = value;
      presets = notePresets.save(presets);
      refreshList();
      $ui.toast("已保存");
    }
  });
}

function deleteAt(indexPath) {
  const row = $("settings-list").object(indexPath);
  if (!row || row.empty) {
    $ui.toast("无可删项");
    return;
  }
  const index = indexPath.row;
  const name = presets[index];
  if (!name) return;
  $ui.alert({
    title: "删除备注",
    message: "确定删除「" + name + "」？",
    actions: [
      { title: "取消", style: "Cancel" },
      {
        title: "删除",
        style: "Destructive",
        handler: function() {
          presets.splice(index, 1);
          presets = notePresets.save(presets);
          refreshList();
          $ui.toast("已删除");
        }
      }
    ]
  });
}

function open(changedHandler) {
  onChanged = typeof changedHandler === "function" ? changedHandler : null;
  presets = notePresets.load();
  $ui.push({
    props: {
      title: "设置",
      navButtons: [
        {
          title: "添加",
          handler: function() {
            promptAdd();
          }
        }
      ]
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
          data: buildData(),
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
              }
              return;
            }
            if (indexPath.section === SECTION_APP) {
              if (row.action === "check-update") update.check();
              return;
            }
            if (indexPath.section !== SECTION_PRESETS) return;
            if (row.empty) return;
            promptEdit(indexPath.row);
          },
          swipeEnabled: function(sender, indexPath) {
            if (indexPath.section !== SECTION_PRESETS) return false;
            const row = sender.object(indexPath);
            return row && !row.empty;
          }
        }
      }
    ],
    events: {
      appeared: function() {
        presets = notePresets.load();
        refreshList();
      }
    }
  });
}

module.exports = {
  open
};

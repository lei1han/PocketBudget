const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");
const notePresets = require("scripts/note-presets");

const COLOR_OK = "#007AFF";

const SECTION_NOTE = 1;
const SECTION_TIME = 2;

let selectedAt = new Date();
let saveCallback = null;

function formatAtLabel(date) {
  return util.formatDateTime(date);
}

function setNote(text) {
  const input = $("exp-note");
  if (input) input.text = text || "";
}

function refreshTimeLabel() {
  const lab = $("exp-time-value");
  if (lab) lab.text = formatAtLabel(selectedAt);
}

function pickPresetMenu() {
  const presets = notePresets.load();
  if (!presets.length) {
    $ui.toast("暂无预设，请先在「备注」中添加");
    return;
  }
  $ui.menu({
    items: presets,
    handler: function(title, idx) {
      if (idx < 0 || title === undefined || title === null) return;
      setNote(String(title));
    }
  });
}

function noteSectionRows() {
  const presets = notePresets.load();
  const hasPresets = presets.length > 0;
  return [
    {
      label: {
        text: "选择常用备注",
        textColor: $color(hasPresets ? "label" : "secondaryLabel")
      },
      value: {
        text: hasPresets ? "›" : "暂无",
        textColor: $color(hasPresets ? "tertiaryLabel" : "secondaryLabel")
      },
      action: "pick-preset"
    },
    {
      type: "input",
      props: {
        id: "exp-note",
        type: $kbType.default,
        placeholder: "可空，或点上方选择常用备注",
        font: $font(17),
        bgcolor: $color("clear")
      },
      layout: function(make, view) {
        make.left.right.inset(16);
        make.top.bottom.inset(8);
        make.height.greaterThanOrEqualTo(36);
      }
    }
  ];
}

function buildListData() {
  return [
    {
      title: "金额",
      rows: [
        {
          type: "input",
          props: {
            id: "exp-amount",
            type: $kbType.decimal,
            placeholder: "必填，如 36.5",
            font: $font(17),
            textColor: $color("label"),
            bgcolor: $color("clear")
          },
          layout: function(make, view) {
            make.left.right.inset(16);
            make.top.bottom.inset(8);
            make.height.greaterThanOrEqualTo(36);
          },
          events: {
            ready: function(sender) {
              sender.focus();
            }
          }
        }
      ]
    },
    {
      title: "备注",
      rows: noteSectionRows()
    },
    {
      title: "时间",
      rows: [
        {
          type: "view",
          props: { bgcolor: $color("clear") },
          layout: function(make) {
            make.height.equalTo(44);
            make.width.equalTo();
          },
          views: [
            {
              type: "label",
              props: {
                id: "exp-time-value",
                text: formatAtLabel(selectedAt),
                font: $font(17),
                textColor: $color("label")
              },
              layout: function(make, view) {
                make.left.inset(16);
                make.centerY.equalTo(view.super);
              }
            },
            {
              type: "label",
              props: {
                text: "更改",
                font: $font(17),
                textColor: $color(COLOR_OK),
                align: $align.right
              },
              layout: function(make, view) {
                make.right.inset(16);
                make.centerY.equalTo(view.super);
              }
            }
          ]
        }
      ]
    }
  ];
}

function pickTime() {
  $picker.date({
    props: { date: selectedAt || new Date() },
    handler: function(date) {
      if (!date) return;
      selectedAt = date instanceof Date ? date : new Date(date);
      refreshTimeLabel();
    }
  });
}

function submit() {
  const amountInput = $("exp-amount");
  const noteInput = $("exp-note");
  const amountText = amountInput ? amountInput.text : "";
  const noteText = noteInput ? noteInput.text : "";
  const amount = util.toNumber(amountText);
  if (isNaN(amount) || amount <= 0) {
    $ui.toast("金额须大于 0");
    return;
  }
  const home = require("scripts/home");
  const result = calc.addExpense(state.getData(), amount, noteText || "", selectedAt);
  if (!result.ok) {
    $ui.alert(result.message);
    return;
  }
  state.setData(result.data);
  $ui.toast("已记账 " + util.formatMoney(amount));
  $ui.pop();
  home.refresh();
  if (saveCallback) {
    const cb = saveCallback;
    saveCallback = null;
    cb(result.expense);
  }
}

function onListSelect(indexPath) {
  if (indexPath.section === SECTION_NOTE) {
    const list = $("exp-form-list");
    const row = list && list.object(indexPath);
    if (row && row.action === "pick-preset") {
      pickPresetMenu();
    }
    return;
  }
  if (indexPath.section === SECTION_TIME) {
    pickTime();
  }
}

function open(onDone) {
  selectedAt = new Date();
  saveCallback = onDone || null;

  $ui.push({
    props: {
      title: "记一笔",
      navButtons: [
        {
          title: "记账",
          handler: function() {
            submit();
          }
        }
      ]
    },
    views: [
      {
        type: "list",
        props: {
          id: "exp-form-list",
          style: 2,
          rowHeight: 48,
          bgcolor: $color("insetGroupedBackground"),
          keyboardDismissMode: 1,
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
          data: buildListData()
        },
        layout: function(make) {
          make.left.right.top.equalTo();
          make.bottom.equalTo($("exp-save-bar").top);
        },
        events: {
          didSelect: function(sender, indexPath) {
            onListSelect(indexPath);
          }
        }
      },
      {
        type: "view",
        props: {
          id: "exp-save-bar",
          bgcolor: $color("insetGroupedBackground")
        },
        layout: function(make) {
          make.left.right.bottom.equalTo();
          make.height.equalTo(64);
        },
        views: [
          {
            type: "button",
            props: {
              id: "exp-save",
              title: "确认记账",
              bgcolor: $color(COLOR_OK),
              titleColor: $color("#FFFFFF"),
              font: $font("semibold", 17),
              radius: 12,
              clipsToBounds: true
            },
            layout: function(make, view) {
              make.left.right.inset(16);
              make.top.inset(8);
              make.height.equalTo(48);
            },
            events: {
              tapped: function() {
                submit();
              }
            }
          }
        ]
      }
    ]
  });
}

module.exports = {
  open
};

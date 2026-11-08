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

function presetRows() {
  return notePresets.load().map(function(title) {
    return {
      label: { text: title, textColor: $color(COLOR_OK) }
    };
  });
}

function noteSectionRows() {
  const rows = [];
  const presets = presetRows();
  if (presets.length > 0) {
    presets.forEach(function(row) {
      rows.push(row);
    });
  } else {
    rows.push({
      label: {
        text: "暂无预设，可在首页「设置」中添加",
        textColor: $color("secondaryLabel")
      },
      disabled: true
    });
  }
  rows.push({
    type: "input",
    props: {
      id: "exp-note",
      type: $kbType.default,
      placeholder: "可空，或点上方预设",
      font: $font(17),
      bgcolor: $color("clear")
    },
    layout: function(make, view) {
      make.left.right.inset(16);
      make.top.bottom.inset(8);
      make.height.greaterThanOrEqualTo(36);
    }
  });
  return rows;
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
    },
    {
      title: "操作",
      rows: [
        {
          type: "view",
          props: { bgcolor: $color("clear"), selectable: false },
          layout: function(make) {
            make.height.equalTo(56);
            make.width.equalTo();
          },
          views: [
            {
              type: "button",
              props: {
                title: "确认记账",
                bgcolor: $color(COLOR_OK),
                titleColor: $color("#FFFFFF"),
                font: $font("bold", 17),
                radius: 12,
                clipsToBounds: true
              },
              layout: function(make, view) {
                make.left.right.inset(0);
                make.top.bottom.inset(4);
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
    if (!row || row.disabled) return;
    const title = row.label && row.label.text;
    if (title) setNote(title);
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
    props: { title: "记一笔" },
    views: [
      {
        type: "list",
        props: {
          id: "exp-form-list",
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
                  make.right.lessThanOrEqualTo(view.super).inset(24);
                }
              }
            ]
          },
          data: buildListData()
        },
        layout: $layout.fill,
        events: {
          didSelect: function(sender, indexPath) {
            onListSelect(indexPath);
          }
        }
      }
    ]
  });
}

module.exports = {
  open
};

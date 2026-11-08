const util = require("scripts/util");
const calc = require("scripts/calc");
const state = require("scripts/state");

const PRESETS = ["餐饮", "交通", "日用", "购物", "娱乐", "其他"];
const COLOR_OK = "#007AFF";
const COLOR_CHIP = "#F2F2F7";
const COLOR_CHIP_ON = "#D6E4FF";

let selectedAt = new Date();
let selectedPreset = "";
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

function chipData() {
  return PRESETS.map(function(title) {
    const on = title === selectedPreset;
    return {
      title: {
        text: title,
        textColor: $color(on ? COLOR_OK : "label"),
        align: $align.center,
        font: $font(on ? "bold" : "medium", 14)
      },
      bg: {
        bgcolor: $color(on ? COLOR_CHIP_ON : COLOR_CHIP),
        radius: 8
      }
    };
  });
}

function refreshChips() {
  const matrix = $("exp-presets");
  if (matrix) matrix.data = chipData();
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

function open(onDone) {
  selectedAt = new Date();
  selectedPreset = "";
  saveCallback = onDone || null;

  $ui.push({
    props: { title: "记一笔" },
    views: [
      {
        type: "scroll",
        props: {
          showsVerticalIndicator: false,
          alwaysBounceVertical: true,
          keyboardDismissMode: 1
        },
        layout: $layout.fill,
        views: [
          {
            type: "view",
            layout: function(make) {
              make.left.right.top.bottom.equalTo();
              make.width.equalTo();
            },
            views: [
              {
                type: "label",
                props: {
                  id: "exp-amount-label",
                  text: "金额",
                  font: $font(13),
                  textColor: $color("secondaryLabel")
                },
                layout: function(make) {
                  make.left.inset(20);
                  make.top.inset(20);
                }
              },
              {
                type: "input",
                props: {
                  id: "exp-amount",
                  type: $kbType.decimal,
                  placeholder: "必填，如 36.5",
                  font: $font("bold", 28),
                  textColor: $color("label"),
                  bgcolor: $color(COLOR_CHIP),
                  radius: 10
                },
                layout: function(make) {
                  make.left.right.inset(20);
                  make.top.equalTo($("exp-amount-label").bottom).offset(8);
                  make.height.equalTo(52);
                },
                events: {
                  ready: function(sender) {
                    sender.focus();
                  }
                }
              },
              {
                type: "label",
                props: {
                  id: "exp-note-label",
                  text: "备注",
                  font: $font(13),
                  textColor: $color("secondaryLabel")
                },
                layout: function(make) {
                  make.left.inset(20);
                  make.top.equalTo($("exp-amount").bottom).offset(20);
                }
              },
              {
                type: "input",
                props: {
                  id: "exp-note",
                  type: $kbType.default,
                  placeholder: "可空，或点下方预设",
                  font: $font(16),
                  bgcolor: $color(COLOR_CHIP),
                  radius: 10
                },
                layout: function(make) {
                  make.left.right.inset(20);
                  make.top.equalTo($("exp-note-label").bottom).offset(8);
                  make.height.equalTo(44);
                }
              },
              {
                type: "label",
                props: {
                  id: "exp-preset-label",
                  text: "常用备注",
                  font: $font(13),
                  textColor: $color("secondaryLabel")
                },
                layout: function(make) {
                  make.left.inset(20);
                  make.top.equalTo($("exp-note").bottom).offset(16);
                }
              },
              {
                type: "matrix",
                props: {
                  id: "exp-presets",
                  columns: 3,
                  itemHeight: 36,
                  spacing: 8,
                  scrollEnabled: false,
                  template: {
                    props: { bgcolor: $color("clear") },
                    views: [
                      {
                        type: "view",
                        props: { id: "bg" },
                        layout: $layout.fill,
                        views: [
                          {
                            type: "label",
                            props: { id: "title" },
                            layout: function(make, view) {
                              make.center.equalTo(view.super);
                              make.left.right.inset(4);
                            }
                          }
                        ]
                      }
                    ]
                  },
                  data: chipData()
                },
                layout: function(make) {
                  make.left.right.inset(20);
                  make.top.equalTo($("exp-preset-label").bottom).offset(8);
                  make.height.equalTo(80);
                },
                events: {
                  didSelect: function(sender, indexPath) {
                    const title = PRESETS[indexPath.item];
                    selectedPreset = title;
                    setNote(title);
                    refreshChips();
                  }
                }
              },
              {
                type: "label",
                props: {
                  id: "exp-time-label",
                  text: "发生时间",
                  font: $font(13),
                  textColor: $color("secondaryLabel")
                },
                layout: function(make) {
                  make.left.inset(20);
                  make.top.equalTo($("exp-presets").bottom).offset(20);
                }
              },
              {
                type: "view",
                props: {
                  id: "exp-time-row",
                  bgcolor: $color(COLOR_CHIP),
                  radius: 10
                },
                layout: function(make) {
                  make.left.right.inset(20);
                  make.top.equalTo($("exp-time-label").bottom).offset(8);
                  make.height.equalTo(48);
                },
                views: [
                  {
                    type: "label",
                    props: {
                      id: "exp-time-value",
                      text: formatAtLabel(selectedAt),
                      font: $font(16),
                      textColor: $color("label")
                    },
                    layout: function(make, view) {
                      make.left.inset(14);
                      make.centerY.equalTo(view.super);
                    }
                  },
                  {
                    type: "label",
                    props: {
                      text: "更改 ›",
                      font: $font(14),
                      textColor: $color(COLOR_OK),
                      align: $align.right
                    },
                    layout: function(make, view) {
                      make.right.inset(14);
                      make.centerY.equalTo(view.super);
                    }
                  }
                ],
                events: {
                  tapped: function() {
                    pickTime();
                  }
                }
              },
              {
                type: "button",
                props: {
                  id: "exp-save",
                  title: "确认记账",
                  bgcolor: $color(COLOR_OK),
                  titleColor: $color("#FFFFFF"),
                  font: $font("bold", 17),
                  radius: 12
                },
                layout: function(make) {
                  make.left.right.inset(20);
                  make.top.equalTo($("exp-time-row").bottom).offset(28);
                  make.height.equalTo(50);
                  make.bottom.inset(40);
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
    ]
  });
}

module.exports = {
  open,
  PRESETS
};

const state = require("scripts/state");
const home = require("scripts/home");
const expenses = require("scripts/expenses");
const installments = require("scripts/installments");
const surplus = require("scripts/surplus");

function init() {
  home.setDeps({
    expenses: expenses,
    installments: installments,
    surplus: surplus
  });
  state.reload();
  home.render();
  const notices = state.takeBootNotices();
  if (notices.length > 0) {
    $delay(0.35, function() {
      $ui.alert({
        title: "提示",
        message: notices.join("\n")
      });
    });
  }
}

module.exports = {
  init
};

if (typeof $app !== "undefined" && $app.env === $env.widget) {
  require("scripts/widget").init();
} else {
  const app = require("scripts/app");
  app.init();
}

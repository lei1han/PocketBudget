const webdavSync = require("scripts/webdav-sync");

const COLOR_CTA = "#007AFF";

let onParentRefresh = null;

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function statusLine() {
  const meta = webdavSync.readMeta();
  if (!meta.lastSyncAt) return "尚未同步";
  try {
    const d = new Date(meta.lastSyncAt);
    const ts =
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes());
    return ts + " · " + (meta.lastSyncStatus || "—");
  } catch (e) {
    return meta.lastSyncStatus || "—";
  }
}

function refreshList() {
  const list = $("webdav-settings-list");
  if (list) list.data = buildData();
}

function buildData() {
  const prefs = webdavSync.readPrefs();
  const enabledText = prefs.enabled ? "开" : "关";
  const passwordText = webdavSync.getPassword() ? "已设置" : "未设置";
  const pathText = prefs.remotePath || webdavSync.DEFAULT_REMOTE_PATH;

  return [
    {
      title: "WebDAV",
      footer: {
        type: "label",
        props: {
          height: 72,
          text:
            "启用后打开 App 会拉取，本地保存后会推送。须 HTTPS；外网需 NAS 已可通过 HTTPS 或 VPN 访问。密码仅存钥匙串。",
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: [
        {
          label: { text: "启用同步", textColor: $color("label") },
          value: {
            text: enabledText,
            textColor: $color("secondaryLabel")
          },
          action: "toggle"
        },
        {
          label: { text: "服务器地址", textColor: $color("label") },
          value: {
            text: prefs.serverUrl ? truncate(prefs.serverUrl, 18) : "未设置",
            textColor: $color("secondaryLabel")
          },
          action: "url"
        },
        {
          label: { text: "用户名", textColor: $color("label") },
          value: {
            text: prefs.username || "未设置",
            textColor: $color("secondaryLabel")
          },
          action: "user"
        },
        {
          label: { text: "密码", textColor: $color("label") },
          value: { text: passwordText, textColor: $color("secondaryLabel") },
          action: "password"
        },
        {
          label: { text: "远程路径", textColor: $color("label") },
          value: { text: truncate(pathText, 22), textColor: $color("secondaryLabel") },
          action: "path"
        }
      ]
    },
    {
      title: "状态",
      footer: {
        type: "label",
        props: {
          height: 56,
          text: "最近同步：" + statusLine(),
          textColor: $color("secondaryLabel"),
          font: $font(13),
          lines: 0
        }
      },
      rows: [
        {
          label: { text: "测试连接", textColor: $color(COLOR_CTA) },
          value: { text: "", textColor: $color("clear") },
          action: "test"
        },
        {
          label: { text: "立即同步", textColor: $color(COLOR_CTA) },
          value: { text: "", textColor: $color("clear") },
          action: "sync"
        }
      ]
    }
  ];
}

function truncate(s, max) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function promptServerUrl() {
  const prefs = webdavSync.readPrefs();
  $input.text({
    type: $kbType.URL,
    placeholder: "https://nas.example.com/webdav",
    text: prefs.serverUrl || "",
    handler: function(text) {
      if (text === undefined || text === null) return;
      const value = String(text).trim();
      if (value && !/^https:\/\//i.test(value)) {
        $ui.toast("须使用 https:// 地址");
        return;
      }
      webdavSync.saveConfig({ serverUrl: value });
      refreshList();
    }
  });
}

function promptUsername() {
  const prefs = webdavSync.readPrefs();
  $input.text({
    type: $kbType.default,
    placeholder: "用户名",
    text: prefs.username || "",
    handler: function(text) {
      if (text === undefined || text === null) return;
      webdavSync.saveConfig({ username: String(text).trim() });
      refreshList();
    }
  });
}

function promptPassword() {
  $ui.push({
    props: {
      title: "WebDAV 密码",
      bgcolor: $color("insetGroupedBackground")
    },
    views: [
      {
        type: "view",
        props: {
          id: "webdav-pwd-card",
          bgcolor: $color("systemBackground"),
          radius: 14,
          clipsToBounds: true
        },
        layout: function(make) {
          make.left.right.inset(16);
          make.top.inset(24);
          make.height.equalTo(48);
        },
        views: [
          {
            type: "input",
            props: {
              id: "webdav-pwd-input",
              type: $kbType.default,
              secure: true,
              placeholder: "输入密码",
              font: $font(17),
              clearButtonMode: 1
            },
            layout: function(make, view) {
              make.left.right.inset(16);
              make.centerY.equalTo(view.super);
            }
          }
        ]
      },
      {
        type: "button",
        props: {
          title: "保存到钥匙串",
          bgcolor: $color(COLOR_CTA),
          titleColor: $color("#FFFFFF"),
          radius: 12,
          font: $font("semibold", 17),
          height: 48
        },
        layout: function(make) {
          make.left.right.inset(16);
          make.top.equalTo($("webdav-pwd-card").bottom).offset(24);
          make.height.equalTo(48);
        },
        events: {
          tapped: function() {
            const input = $("webdav-pwd-input");
            const value = input ? String(input.text || "").trim() : "";
            if (!value) {
              $ui.toast("密码不能为空");
              return;
            }
            webdavSync.setPassword(value);
            if (input) input.text = "";
            $ui.pop();
            refreshList();
            $ui.toast("密码已保存");
          }
        }
      }
    ]
  });
}

function promptRemotePath() {
  const prefs = webdavSync.readPrefs();
  $input.text({
    type: $kbType.default,
    placeholder: webdavSync.DEFAULT_REMOTE_PATH,
    text: prefs.remotePath || webdavSync.DEFAULT_REMOTE_PATH,
    handler: function(text) {
      if (text === undefined || text === null) return;
      let value = String(text).trim();
      if (!value) value = webdavSync.DEFAULT_REMOTE_PATH;
      if (!value.startsWith("/")) value = "/" + value;
      webdavSync.saveConfig({ remotePath: value });
      refreshList();
    }
  });
}

function handleToggle() {
  const prefs = webdavSync.readPrefs();
  prefs.enabled = !prefs.enabled;
  const check = webdavSync.validateEnable(prefs);
  if (!check.ok) {
    prefs.enabled = false;
    webdavSync.saveConfig(prefs);
    $ui.toast(check.message);
    refreshList();
    return;
  }
  webdavSync.saveConfig({ enabled: prefs.enabled });
  if (prefs.enabled) {
    const meta = webdavSync.readMeta();
    if (!meta.lastSyncedRemoteRevision) {
      webdavSync.markDirty();
    }
    $ui.toast("已启用");
    webdavSync.onAppAppear();
  } else {
    $ui.toast("已关闭");
  }
  refreshList();
  if (onParentRefresh) onParentRefresh();
}

function open(parentRefresh) {
  onParentRefresh = typeof parentRefresh === "function" ? parentRefresh : null;

  $ui.push({
    props: {
      title: "WebDAV 同步",
      bgcolor: $color("insetGroupedBackground")
    },
    views: [
      {
        type: "list",
        props: {
          id: "webdav-settings-list",
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
                  make.right.lessThanOrEqualTo(view.super).inset(100);
                }
              },
              {
                type: "label",
                props: { id: "value", font: $font(17), align: $align.right },
                layout: function(make, view) {
                  make.right.inset(16);
                  make.centerY.equalTo(view.super);
                  make.left.greaterThanOrEqualTo(view.super).inset(120);
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
            if (!row || !row.action) return;
            if (row.action === "toggle") {
              handleToggle();
              return;
            }
            if (row.action === "url") promptServerUrl();
            else if (row.action === "user") promptUsername();
            else if (row.action === "password") promptPassword();
            else if (row.action === "path") promptRemotePath();
            else if (row.action === "test") {
              webdavSync.testConnection(function(result) {
                refreshList();
                if (result.ok) $ui.toast(result.message || "连接成功");
                else $ui.alert(result.message || "连接失败");
              });
            } else if (row.action === "sync") {
              webdavSync.syncNow(function(result) {
                refreshList();
                if (onParentRefresh) onParentRefresh();
                if (result && result.ok) {
                  if (result.pulled) $ui.toast("已从云端更新");
                  else if (result.noop) $ui.toast("已是最新");
                  else $ui.toast("同步完成");
                } else if (result && result.message) {
                  $ui.toast(String(result.message).slice(0, 60));
                }
              });
            }
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
  open
};

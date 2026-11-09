const util = require("scripts/util");

const REPO = "lei1han/PocketBudget";
const RELEASES_LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
const ASSET_NAME = "PocketBudget.box";
const DEFAULT_NAME = "PocketBudget";

let checking = false;

function localVersion() {
  try {
    const cur = $addin.current;
    if (cur && cur.version) {
      const v = String(cur.version).trim();
      if (v) return v;
    }
  } catch (e) {}
  try {
    const file = $file.read("config.json");
    if (file && file.string) {
      const cfg = util.safeJsonParse(file.string);
      if (cfg && cfg.info && cfg.info.version) {
        return String(cfg.info.version).trim();
      }
    }
  } catch (e2) {}
  return "0.0.0";
}

function versionFromRelease(release) {
  if (!release) return "";
  let tag = String(release.tag_name || "").trim();
  if (!tag && release.name) tag = String(release.name).trim();
  return tag.replace(/^[vV]/, "");
}

function findBoxAsset(release) {
  const assets = release && release.assets;
  if (!Array.isArray(assets)) return null;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (a && a.name === ASSET_NAME && a.browser_download_url) return a;
  }
  return null;
}

function requestLatest(handler) {
  $http.get({
    url: RELEASES_LATEST,
    header: {
      Accept: "application/vnd.github+json",
      "User-Agent": "PocketBudget-JSBox/" + localVersion()
    },
    timeout: 30,
    handler: function(resp) {
      if (!resp || resp.error) {
        handler({ ok: false, message: "网络异常，请稍后重试" });
        return;
      }
      const code = resp.statusCode;
      if (code === 404) {
        handler({
          ok: false,
          message: "仓库尚无 GitHub Release，请先在 GitHub 发布带 " + ASSET_NAME + " 的版本"
        });
        return;
      }
      if (!(code >= 200 && code < 300)) {
        handler({ ok: false, message: "获取 Release 失败（HTTP " + code + "）" });
        return;
      }
      const data = resp.data;
      if (!data || typeof data !== "object") {
        handler({ ok: false, message: "Release 数据无效" });
        return;
      }
      handler({ ok: true, release: data });
    }
  });
}

function installBox(remoteVersion, downloadUrl) {
  $ui.loading(true);
  $http.download({
    url: downloadUrl,
    header: {
      Accept: "application/octet-stream",
      "User-Agent": "PocketBudget-JSBox/" + localVersion()
    },
    timeout: 120,
    handler: function(resp) {
      const data = resp && resp.data;
      if (!data) {
        $ui.loading(false);
        $ui.alert("下载失败，请检查网络后重试");
        return;
      }
      const cur = $addin.current;
      const saveOpts = {
        name: (cur && cur.name) || DEFAULT_NAME,
        data: data,
        version: remoteVersion,
        handler: function(success) {
          $ui.loading(false);
          if (!success) {
            $ui.alert("安装失败，可改用系统分享导入 " + ASSET_NAME);
            return;
          }
          $ui.alert({
            title: "更新完成",
            message: "已安装 v" + remoteVersion + "，确定后将重启应用。",
            actions: [
              {
                title: "确定",
                handler: function() {
                  $addin.restart();
                }
              }
            ]
          });
        }
      };
      if (cur) {
        if (cur.author) saveOpts.author = cur.author;
        if (cur.icon) saveOpts.icon = cur.icon;
        if (cur.category) saveOpts.category = cur.category;
        if (cur.website) saveOpts.website = cur.website;
      }
      $addin.save(saveOpts);
    }
  });
}

function promptUpgrade(remoteVersion, releaseNotes, downloadUrl) {
  const notes = releaseNotes ? "\n\n" + releaseNotes : "";
  $ui.alert({
    title: "发现新版本",
    message: "当前 v" + localVersion() + " → 最新 v" + remoteVersion + notes,
    actions: [
      { title: "取消", style: "Cancel" },
      {
        title: "下载并安装",
        handler: function() {
          installBox(remoteVersion, downloadUrl);
        }
      }
    ]
  });
}

function onReleaseFetched(release) {
  const remoteVersion = versionFromRelease(release);
  if (!remoteVersion) {
    $ui.toast("无法解析 Release 版本号");
    return;
  }
  const asset = findBoxAsset(release);
  if (!asset) {
    $ui.alert("最新 Release 中未找到附件「" + ASSET_NAME + "」");
    return;
  }
  const cmp = util.compareSemver(remoteVersion, localVersion());
  if (cmp <= 0) {
    $ui.toast("已是最新版本（v" + localVersion() + "）");
    return;
  }
  const notes = release.body ? String(release.body).trim().slice(0, 800) : "";
  promptUpgrade(remoteVersion, notes, asset.browser_download_url);
}

function check() {
  if (checking) return;
  checking = true;
  $ui.loading(true);
  requestLatest(function(result) {
    $ui.loading(false);
    checking = false;
    if (!result.ok) {
      $ui.alert(result.message);
      return;
    }
    onReleaseFetched(result.release);
  });
}

module.exports = {
  localVersion,
  check,
  versionFromRelease,
  findBoxAsset
};

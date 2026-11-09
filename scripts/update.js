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

function httpStatus(resp) {
  if (!resp) return null;
  const direct = resp.statusCode;
  if (typeof direct === "number" && !isNaN(direct)) return direct;
  const nested = resp.response && resp.response.statusCode;
  if (typeof nested === "number" && !isNaN(nested)) return nested;
  return null;
}

function formatHttpFailure(resp, action) {
  const label = action || "请求";
  if (!resp) return label + "失败：网络异常，请稍后重试";
  if (resp.error) {
    const e = resp.error;
    const detail =
      (e && (e.localizedDescription || e.message || e.domain)) || String(e);
    const code = httpStatus(resp);
    if (code != null) return label + "失败（HTTP " + code + "）：" + detail;
    return label + "失败：" + detail;
  }
  const code = httpStatus(resp);
  if (code != null) return label + "失败（HTTP " + code + "）";
  return label + "失败：网络异常（未收到 HTTP 状态码）";
}

function parseReleasePayload(resp) {
  if (!resp) return null;
  let data = resp.data;
  if (typeof data === "string") {
    data = util.safeJsonParse(data);
  }
  if (data && typeof data === "object" && (data.tag_name || data.name)) {
    return data;
  }
  return null;
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
      if (!resp) {
        handler({ ok: false, message: formatHttpFailure(null, "获取 Release") });
        return;
      }
      if (resp.error) {
        handler({ ok: false, message: formatHttpFailure(resp, "获取 Release") });
        return;
      }
      const code = httpStatus(resp);
      const release = parseReleasePayload(resp);

      if (code === 404) {
        handler({
          ok: false,
          message: "仓库尚无 GitHub Release，请先在 GitHub 发布带 " + ASSET_NAME + " 的版本"
        });
        return;
      }

      if (release) {
        if (code != null && (code < 200 || code >= 300)) {
          handler({
            ok: false,
            message: "获取 Release 失败（HTTP " + code + "）"
          });
          return;
        }
        handler({ ok: true, release: release });
        return;
      }

      if (code != null) {
        handler({
          ok: false,
          message: "获取 Release 失败（HTTP " + code + "）"
        });
        return;
      }

      handler({ ok: false, message: "Release 数据无效或无法解析" });
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
      if (!resp || resp.error) {
        $ui.loading(false);
        $ui.alert(formatHttpFailure(resp, "下载"));
        return;
      }
      const code = httpStatus(resp);
      const data = resp.data;
      if (!data) {
        $ui.loading(false);
        if (code != null) {
          $ui.alert("下载失败（HTTP " + code + "）");
        } else {
          $ui.alert("下载失败：未收到安装包数据");
        }
        return;
      }
      if (code != null && (code < 200 || code >= 300)) {
        $ui.loading(false);
        $ui.alert("下载失败（HTTP " + code + "）");
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
  findBoxAsset,
  httpStatus,
  formatHttpFailure,
  parseReleasePayload
};

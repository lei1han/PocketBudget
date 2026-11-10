const util = require("scripts/util");
const store = require("scripts/store");
const notePresets = require("scripts/note-presets");
const calc = require("scripts/calc");

const SCHEMA_VERSION = 1;
const PREFS_KEY = "webdav_sync_prefs";
const META_KEY = "webdav_sync_meta";
const KEYCHAIN_DOMAIN = "PocketBudget.webdav";
const KEYCHAIN_KEY = "password";
const DEFAULT_REMOTE_PATH = "/PocketBudget/pocketbudget.json";
const UA = "PocketBudget-WebDAV/1.4";

let saveSyncScheduled = false;
let syncInFlight = false;
let syncQueued = false;

function readPrefs() {
  try {
    const raw = $cache.get(PREFS_KEY);
    if (raw && typeof raw === "object") return raw;
  } catch (e) {}
  return {
    enabled: false,
    serverUrl: "",
    username: "",
    remotePath: DEFAULT_REMOTE_PATH
  };
}

function writePrefs(prefs) {
  try {
    $cache.set(PREFS_KEY, prefs);
  } catch (e) {}
}

function readMeta() {
  try {
    const raw = $cache.get(META_KEY);
    if (raw && typeof raw === "object") return raw;
  } catch (e) {}
  return {
    deviceId: "",
    localRevision: 0,
    lastSyncedRemoteRevision: "",
    dirty: false,
    lastSyncAt: "",
    lastSyncStatus: ""
  };
}

function writeMeta(meta) {
  try {
    $cache.set(META_KEY, meta);
  } catch (e) {}
}

function getPassword() {
  try {
    const v = $keychain.get(KEYCHAIN_KEY, KEYCHAIN_DOMAIN);
    if (v === undefined || v === null) return "";
    return String(v);
  } catch (e) {
    return "";
  }
}

function setPassword(value) {
  try {
    if (!value) {
      $keychain.remove(KEYCHAIN_KEY, { domain: KEYCHAIN_DOMAIN });
    } else {
      $keychain.set(KEYCHAIN_KEY, String(value), { domain: KEYCHAIN_DOMAIN });
    }
  } catch (e) {}
}

function ensureDeviceId(meta) {
  if (meta.deviceId) return meta.deviceId;
  const id =
    "d_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
  meta.deviceId = id;
  writeMeta(meta);
  return id;
}

function httpStatus(resp) {
  if (!resp) return null;
  const direct = resp.statusCode;
  if (typeof direct === "number" && !isNaN(direct)) return direct;
  const nested = resp.response && resp.response.statusCode;
  if (typeof nested === "number" && !isNaN(nested)) return nested;
  return null;
}

function responseBodyString(resp) {
  if (!resp) return "";
  const data = resp.data;
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.string) return String(data.string);
  try {
    return JSON.stringify(data);
  } catch (e) {
    return "";
  }
}

function isHttpsUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  return /^https:\/\//i.test(u);
}

function trimSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = trimSlash(String(base || "").trim());
  let p = String(path || "").trim();
  if (!p) p = DEFAULT_REMOTE_PATH;
  if (!p.startsWith("/")) p = "/" + p;
  return b + p;
}

function basicAuthHeader(username, password) {
  const token = String(username || "") + ":" + String(password || "");
  if (!$text || typeof $text.base64Encode !== "function") {
    return { ok: false, message: "认证编码不可用" };
  }
  try {
    const encoded = $text.base64Encode(token);
    if (!encoded) {
      return { ok: false, message: "认证编码失败" };
    }
    return { ok: true, header: "Basic " + encoded };
  } catch (e) {
    return { ok: false, message: "认证编码失败" };
  }
}

function friendlyHttpError(resp, action) {
  const code = httpStatus(resp);
  if (!resp) return (action || "请求") + "失败：网络异常";
  if (code === 401 || code === 403) return (action || "请求") + "失败：账号或密码错误（HTTP " + code + "）";
  if (code === 404) return (action || "请求") + "：远程文件不存在（HTTP 404）";
  if (code != null) return (action || "请求") + "失败（HTTP " + code + "）";
  if (resp.error) return (action || "请求") + "失败：网络异常";
  return (action || "请求") + "失败";
}

function webdavRequest(opts, handler) {
  const method = (opts.method || "GET").toUpperCase();
  const url = opts.url;
  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: "*/*"
    },
    opts.headers || {}
  );
  if (opts.auth) {
    const authHdr = basicAuthHeader(opts.auth.user, opts.auth.pass);
    if (!authHdr.ok) {
      handler({ error: { message: authHdr.message || "认证编码失败" } });
      return;
    }
    headers.Authorization = authHdr.header;
  }
  const req = {
    url: url,
    header: headers,
    timeout: opts.timeout || 45,
    handler: handler
  };
  if (opts.body != null) req.body = opts.body;
  if (typeof $http.request === "function") {
    req.method = method;
    $http.request(req);
    return;
  }
  if (method === "GET") {
    $http.get(req);
    return;
  }
  if (method === "HEAD" && typeof $http.head === "function") {
    $http.head(req);
    return;
  }
  if (method === "PUT" && typeof $http.post === "function") {
    $http.post(req);
    return;
  }
  handler({ error: { message: "不支持的 HTTP 方法：" + method } });
}

function requestAsync(method, url, options) {
  return new Promise(function(resolve) {
    webdavRequest(
      {
        method: method,
        url: url,
        headers: options.headers,
        auth: options.auth,
        body: options.body,
        timeout: options.timeout
      },
      function(resp) {
        resolve(resp || {});
      }
    );
  });
}

function parentPath(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/");
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "/";
  return p.slice(0, idx) || "/";
}

function pathSegments(dirPath) {
  const clean = String(dirPath || "/")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!clean) return [];
  return clean.split("/").filter(function(s) {
    return s.length > 0;
  });
}

function mkcolRecursive(baseUrl, dirPath, auth) {
  const segments = pathSegments(dirPath);
  if (segments.length === 0) {
    return Promise.resolve({ ok: true });
  }
  let chain = Promise.resolve({ ok: true });
  let built = "";
  segments.forEach(function(seg) {
    built += "/" + seg;
    const target = joinUrl(baseUrl, built);
    chain = chain.then(function() {
      return requestAsync("MKCOL", target, {
        auth: auth,
        headers: { "Content-Length": "0" }
      }).then(function(resp) {
        const code = httpStatus(resp);
        if (code === 201 || code === 405 || code === 200 || code === 204) {
          return { ok: true };
        }
        if (code === 404 || code === 409) {
          return { ok: true };
        }
        return { ok: false, resp: resp };
      });
    });
  });
  return chain;
}

function buildSnapshot(data, presets, revision, deviceId) {
  const base = store.exportObject(data);
  const list = Array.isArray(presets) ? presets : notePresets.load();
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    revision: String(revision),
    deviceId: deviceId || "",
    version: base.version,
    budgets: base.budgets,
    expenses: base.expenses,
    installments: base.installments,
    installmentItems: base.installmentItems,
    notePresets: {
      version: 1,
      presets: list.slice()
    }
  };
}

function validateSnapshot(obj) {
  if (!obj || typeof obj !== "object") {
    return { ok: false, message: "快照不是对象" };
  }
  if (obj.schemaVersion !== 1 && obj.schemaVersion !== "1") {
    return { ok: false, message: "不支持的 schemaVersion" };
  }
  const imported = store.validateImport(obj);
  if (!imported.ok) return imported;
  let presets = null;
  if (obj.notePresets && typeof obj.notePresets === "object") {
    if (!Array.isArray(obj.notePresets.presets)) {
      return { ok: false, message: "notePresets.presets 必须是数组" };
    }
    presets = obj.notePresets.presets;
  } else if (Array.isArray(obj.notePresets)) {
    presets = obj.notePresets;
  }
  if (obj.revision === undefined || obj.revision === null || String(obj.revision) === "") {
    return { ok: false, message: "快照缺少 revision" };
  }
  return { ok: true, data: imported.data, presets: presets, revision: String(obj.revision) };
}

function isConfigured() {
  const prefs = readPrefs();
  if (!prefs.enabled) return false;
  if (!isHttpsUrl(prefs.serverUrl)) return false;
  if (!String(prefs.username || "").trim()) return false;
  if (!getPassword()) return false;
  if (!String(prefs.remotePath || "").trim()) return false;
  return true;
}

function configSummary() {
  const prefs = readPrefs();
  const meta = readMeta();
  return { prefs: prefs, meta: meta };
}

function saveConfig(partial) {
  const prefs = readPrefs();
  Object.assign(prefs, partial || {});
  if (!prefs.remotePath) prefs.remotePath = DEFAULT_REMOTE_PATH;
  writePrefs(prefs);
  return prefs;
}

function recordSyncStatus(ok, message) {
  const meta = readMeta();
  meta.lastSyncAt = new Date().toISOString();
  if (ok) {
    meta.lastSyncStatus = message
      ? String(message).slice(0, 200)
      : "成功";
  } else {
    meta.lastSyncStatus = String(message || "失败").slice(0, 200);
  }
  writeMeta(meta);
  return meta;
}

function markDirty() {
  const meta = readMeta();
  meta.dirty = true;
  meta.localRevision = (Number(meta.localRevision) || 0) + 1;
  writeMeta(meta);
}

function clearDirtyAfterPush(remoteRevision) {
  const meta = readMeta();
  meta.dirty = false;
  meta.lastSyncedRemoteRevision = String(remoteRevision);
  writeMeta(meta);
}

function applyRemoteSnapshot(parsed) {
  const valid = validateSnapshot(parsed);
  if (!valid.ok) return valid;
  let data = valid.data;
  const ensured = calc.ensureCurrentBudget(data);
  data = ensured.data;
  const state = require("scripts/state");
  state.setDataSilent(data);
  if (valid.presets != null) {
    notePresets.save(valid.presets, { skipSync: true });
  }
  clearDirtyAfterPush(valid.revision);
  try {
    require("scripts/home").refresh();
  } catch (e) {}
  return { ok: true, carried: ensured.carried, needSet: ensured.needSet };
}

function getLocalSnapshot() {
  const state = require("scripts/state");
  const meta = readMeta();
  const deviceId = ensureDeviceId(meta);
  const rev = meta.localRevision || 1;
  return buildSnapshot(state.getData(), notePresets.load(), rev, deviceId);
}

function fetchRemote(auth, fileUrl) {
  return requestAsync("GET", fileUrl, { auth: auth }).then(function(resp) {
    const code = httpStatus(resp);
    if (code === 404) {
      return { ok: true, missing: true, code: code };
    }
    if (code == null || code < 200 || code >= 300) {
      return { ok: false, message: friendlyHttpError(resp, "拉取"), code: code, resp: resp };
    }
    const text = responseBodyString(resp).trim();
    if (!text) {
      return { ok: false, message: "远程响应为空，已保留本地", code: code };
    }
    const parsed = util.safeJsonParse(text);
    if (!parsed) {
      return { ok: false, message: "远程不是合法 JSON，已保留本地", code: code };
    }
    const valid = validateSnapshot(parsed);
    if (!valid.ok) {
      return { ok: false, message: valid.message + "，已保留本地", code: code };
    }
    return {
      ok: true,
      missing: false,
      snapshot: parsed,
      revision: valid.revision,
      valid: valid,
      code: code
    };
  });
}

function putSnapshot(auth, fileUrl, snapshot) {
  const text = JSON.stringify(snapshot, null, 2);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Overwrite: "T"
  };
  const body = $data({ string: text });
  return requestAsync("PUT", fileUrl, { auth: auth, body: body, headers: headers }).then(
    function(resp) {
      const code = httpStatus(resp);
      if (code == null || code < 200 || code >= 300) {
        return { ok: false, message: friendlyHttpError(resp, "上传"), code: code };
      }
      return { ok: true, code: code };
    }
  );
}

function pushLocal(auth, fileUrl) {
  const meta = readMeta();
  const deviceId = ensureDeviceId(meta);
  if (!meta.localRevision) meta.localRevision = 1;
  const snapshot = buildSnapshot(
    require("scripts/state").getData(),
    notePresets.load(),
    meta.localRevision,
    deviceId
  );
  const dir = parentPath(readPrefs().remotePath || DEFAULT_REMOTE_PATH);
  return mkcolRecursive(readPrefs().serverUrl, dir, auth)
    .then(function() {
      return putSnapshot(auth, fileUrl, snapshot);
    })
    .then(function(result) {
      if (result.ok) {
        clearDirtyAfterPush(snapshot.revision);
        recordSyncStatus(true, "已上传");
      } else {
        recordSyncStatus(false, result.message);
      }
      return result;
    });
}

function showConflict(remoteResult, onResolved) {
  $ui.alert({
    title: "同步冲突",
    message: "本地与云端在上次同步后都有修改。请选择要保留的版本。",
    actions: [
      {
        title: "取消",
        style: "Cancel",
        handler: function() {
          if (onResolved) onResolved({ ok: false, cancelled: true });
        }
      },
      {
        title: "使用云端",
        handler: function() {
          const applied = applyRemoteSnapshot(remoteResult.snapshot);
          if (!applied.ok) {
            $ui.toast(applied.message);
            recordSyncStatus(false, applied.message);
            if (onResolved) onResolved(applied);
            return;
          }
          recordSyncStatus(true, "已使用云端");
          $ui.toast("已使用云端数据");
          if (onResolved) onResolved({ ok: true, pulled: true });
        }
      },
      {
        title: "保留本地并上传",
        handler: function() {
          runPush(function(result) {
            if (onResolved) onResolved(result || { ok: true, pushed: true });
          });
        }
      }
    ]
  });
}

function decideAfterPull(remoteResult, onDone) {
  const meta = readMeta();
  const remoteRev = remoteResult.revision;
  const lastSynced = meta.lastSyncedRemoteRevision || "";
  const localDirty = !!meta.dirty;
  const remoteChanged = remoteRev !== lastSynced;

  if (!remoteChanged && !localDirty) {
    recordSyncStatus(true, "已是最新");
    if (onDone) onDone({ ok: true, noop: true });
    return;
  }

  if (remoteChanged && localDirty) {
    showConflict(remoteResult, onDone);
    return;
  }

  if (remoteChanged && !localDirty) {
    const applied = applyRemoteSnapshot(remoteResult.snapshot);
    if (!applied.ok) {
      recordSyncStatus(false, applied.message);
      if (onDone) onDone(applied);
      return;
    }
    recordSyncStatus(true, "已从云端更新");
    if (onDone) onDone({ ok: true, pulled: true });
    return;
  }

  if (!remoteChanged && localDirty) {
    runPush(onDone);
    return;
  }

  if (onDone) onDone({ ok: true });
}

function runPull(onDone) {
  if (!isConfigured()) {
    if (onDone) onDone({ ok: false, message: "未启用或未配置完整" });
    return;
  }
  const prefs = readPrefs();
  const auth = { user: prefs.username, pass: getPassword() };
  const fileUrl = joinUrl(prefs.serverUrl, prefs.remotePath);

  fetchRemote(auth, fileUrl).then(function(remoteResult) {
    if (!remoteResult.ok) {
      recordSyncStatus(false, remoteResult.message);
      if (onDone) onDone(remoteResult);
      return;
    }
    if (remoteResult.missing) {
      runPush(function(pushResult) {
        if (onDone) onDone(pushResult || { ok: true, pushed: true });
      });
      return;
    }
    decideAfterPull(remoteResult, onDone);
  });
}

function runPush(onDone) {
  if (!isConfigured()) {
    if (onDone) onDone({ ok: false, message: "未启用或未配置完整" });
    return;
  }
  const prefs = readPrefs();
  const auth = { user: prefs.username, pass: getPassword() };
  const fileUrl = joinUrl(prefs.serverUrl, prefs.remotePath);
  const meta = readMeta();
  if (!meta.localRevision) {
    meta.localRevision = 1;
    writeMeta(meta);
  }
  pushLocal(auth, fileUrl).then(function(result) {
    if (onDone) onDone(result);
  });
}

function finishSyncCycle(showLoading, onDone, result) {
  if (showLoading) $ui.loading(false);
  syncInFlight = false;
  if (onDone) onDone(result);
  if (syncQueued) {
    syncQueued = false;
    $delay(0.05, function() {
      runSyncCycle({ showLoading: false, queueIfBusy: true });
    });
  }
}

function runSyncCycle(opts) {
  opts = opts || {};
  if (!isConfigured()) {
    if (opts.onDone) opts.onDone({ ok: false, message: "未启用或未配置完整" });
    return;
  }
  if (syncInFlight) {
    if (opts.queueIfBusy) syncQueued = true;
    if (opts.onDone) {
      opts.onDone({
        ok: false,
        message: "同步进行中",
        queued: !!opts.queueIfBusy
      });
    }
    return;
  }
  syncInFlight = true;
  const showLoading = !!opts.showLoading;
  if (showLoading) $ui.loading(true);
  runPull(function(result) {
    finishSyncCycle(showLoading, opts.onDone, result);
  });
}

function syncNow(onDone) {
  runSyncCycle({ showLoading: true, queueIfBusy: false, onDone: onDone });
}

function onAppAppear() {
  if (!isConfigured()) return;
  $delay(0.2, function() {
    runSyncCycle({
      showLoading: false,
      queueIfBusy: true,
      onDone: function(result) {
        if (result && result.ok && result.pulled) {
          $ui.toast("已从云端同步");
        }
      }
    });
  });
}

function afterLocalSave() {
  if (!isConfigured()) return;
  markDirty();
  if (saveSyncScheduled) return;
  saveSyncScheduled = true;
  $delay(0.4, function() {
    saveSyncScheduled = false;
    runSyncCycle({ showLoading: false, queueIfBusy: true });
  });
}

function testConnection(onDone) {
  const prefs = readPrefs();
  if (!isHttpsUrl(prefs.serverUrl)) {
    const msg = "服务器地址须以 https:// 开头";
    recordSyncStatus(false, msg);
    if (onDone) onDone({ ok: false, message: msg });
    return;
  }
  if (!String(prefs.username || "").trim() || !getPassword()) {
    const msg = "请填写用户名和密码";
    recordSyncStatus(false, msg);
    if (onDone) onDone({ ok: false, message: msg });
    return;
  }
  const auth = { user: prefs.username, pass: getPassword() };
  const fileUrl = joinUrl(prefs.serverUrl, prefs.remotePath);
  $ui.loading(true);
  requestAsync("HEAD", fileUrl, { auth: auth })
    .then(function(headResp) {
      let code = httpStatus(headResp);
      if (code == null) {
        return fetchRemote(auth, fileUrl);
      }
      if (code === 401 || code === 403) {
        return { ok: false, message: friendlyHttpError(headResp, "连接") };
      }
      if (code === 404) {
        const dir = parentPath(prefs.remotePath || DEFAULT_REMOTE_PATH);
        return mkcolRecursive(prefs.serverUrl, dir, auth).then(function(mk) {
          if (!mk.ok) {
            return { ok: false, message: "无法创建远程目录" };
          }
          return { ok: true, message: "连接成功，远程尚无快照" };
        });
      }
      if (code >= 200 && code < 300) {
        return fetchRemote(auth, fileUrl).then(function(got) {
          if (!got.ok) return got;
          if (got.missing) return { ok: true, message: "连接成功" };
          return { ok: true, message: "连接成功，已找到远程快照" };
        });
      }
      return { ok: false, message: friendlyHttpError(headResp, "连接") };
    })
    .then(function(result) {
      $ui.loading(false);
      if (result.ok) {
        recordSyncStatus(true, result.message || "连接成功");
      } else {
        recordSyncStatus(false, result.message);
      }
      if (onDone) onDone(result);
    });
}

function validateEnable(prefs) {
  if (!prefs.enabled) return { ok: true };
  if (!isHttpsUrl(prefs.serverUrl)) {
    return { ok: false, message: "启用同步须使用 HTTPS 地址（https://）" };
  }
  if (!String(prefs.username || "").trim()) {
    return { ok: false, message: "请填写用户名" };
  }
  if (!getPassword()) {
    return { ok: false, message: "请填写密码" };
  }
  if (!String(prefs.remotePath || "").trim()) {
    return { ok: false, message: "请填写远程文件路径" };
  }
  return { ok: true };
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_REMOTE_PATH,
  readPrefs,
  writePrefs,
  readMeta,
  writeMeta,
  getPassword,
  setPassword,
  saveConfig,
  configSummary,
  isConfigured,
  markDirty,
  buildSnapshot,
  validateSnapshot,
  syncNow,
  onAppAppear,
  afterLocalSave,
  testConnection,
  validateEnable,
  runPull,
  runPush,
  recordSyncStatus
};

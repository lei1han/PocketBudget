const util = require("scripts/util");

const DATA_PATH = "data/budget-v1.json";
const CACHE_KEY = "budget_v1_mirror";
const VERSION = 1;

function emptyData() {
  return {
    version: VERSION,
    monthStartDay: 1,
    budgets: [],
    expenses: [],
    installments: [],
    installmentItems: []
  };
}

function ensureDir() {
  if (!$file.exists("data")) {
    $file.mkdir("data");
  }
}

function normalize(raw) {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: VERSION,
    monthStartDay: util.normalizeMonthStartDay(raw.monthStartDay),
    budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    installments: Array.isArray(raw.installments) ? raw.installments : [],
    installmentItems: Array.isArray(raw.installmentItems) ? raw.installmentItems : []
  };
}

function load() {
  ensureDir();
  if ($file.exists(DATA_PATH)) {
    const file = $file.read(DATA_PATH);
    if (file && file.string) {
      const parsed = util.safeJsonParse(file.string);
      if (parsed) {
        const data = normalize(parsed);
        mirrorCache(data);
        return data;
      }
    }
  }
  const cached = $cache.get(CACHE_KEY);
  if (cached) {
    return normalize(cached);
  }
  return emptyData();
}

function mirrorCache(data) {
  try {
    $cache.set(CACHE_KEY, data);
  } catch (e) {}
}

function save(data) {
  ensureDir();
  const payload = normalize(data);
  payload.version = VERSION;
  const ok = $file.write({
    data: $data({ string: JSON.stringify(payload, null, 2) }),
    path: DATA_PATH
  });
  mirrorCache(payload);
  try {
    if (typeof $app !== "undefined" && $app.env !== $env.widget && $widget && $widget.reloadTimeline) {
      $widget.reloadTimeline();
    }
  } catch (e) {}
  return !!ok;
}

function exportObject(data, notePresetList) {
  const payload = normalize(data);
  payload.version = VERSION;
  payload.exportedAt = new Date().toISOString();
  if (notePresetList !== undefined) {
    let presets = notePresetList;
    if (!Array.isArray(presets)) {
      const notePresets = require("scripts/note-presets");
      presets = notePresets.load();
    }
    payload.notePresets = { version: 1, presets: presets.slice() };
  }
  return payload;
}

function validateImport(obj) {
  if (!obj || typeof obj !== "object") {
    return { ok: false, message: "JSON 不是对象" };
  }
  if (obj.version !== 1 && obj.version !== "1") {
    return { ok: false, message: "仅支持 version=1 的备份" };
  }
  if (!Array.isArray(obj.budgets) || !Array.isArray(obj.expenses)) {
    return { ok: false, message: "缺少 budgets/expenses 数组" };
  }
  if (!Array.isArray(obj.installments) || !Array.isArray(obj.installmentItems)) {
    return { ok: false, message: "缺少 installments/installmentItems 数组" };
  }
  let presets = null;
  if (obj.notePresets != null) {
    if (typeof obj.notePresets === "object" && Array.isArray(obj.notePresets.presets)) {
      presets = obj.notePresets.presets;
    } else if (Array.isArray(obj.notePresets)) {
      presets = obj.notePresets;
    } else {
      return { ok: false, message: "notePresets 格式无效" };
    }
  }
  return { ok: true, data: normalize(obj), notePresets: presets };
}

module.exports = {
  DATA_PATH,
  VERSION,
  emptyData,
  load,
  save,
  exportObject,
  validateImport
};

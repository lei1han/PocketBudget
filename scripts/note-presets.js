const util = require("scripts/util");

const PRESETS_PATH = "data/note-presets-v1.json";
const CACHE_KEY = "note_presets_v1_mirror";
const DEFAULT_PRESETS = ["餐饮", "交通", "日用", "购物", "娱乐", "其他"];

function ensureDir() {
  if (!$file.exists("data")) {
    $file.mkdir("data");
  }
}

function normalizeList(arr) {
  const seen = {};
  const out = [];
  if (!Array.isArray(arr)) return out;
  arr.forEach(function(item) {
    const text = String(item || "").trim();
    if (!text || seen[text]) return;
    seen[text] = true;
    out.push(text);
  });
  return out;
}

function mirrorCache(list) {
  try {
    $cache.set(CACHE_KEY, list);
  } catch (e) {}
}

function load() {
  ensureDir();
  if ($file.exists(PRESETS_PATH)) {
    const file = $file.read(PRESETS_PATH);
    if (file && file.string) {
      const parsed = util.safeJsonParse(file.string);
      if (parsed && Array.isArray(parsed.presets)) {
        const list = normalizeList(parsed.presets);
        if (list.length > 0) {
          mirrorCache(list);
          return list.slice();
        }
      }
    }
  }
  const cached = $cache.get(CACHE_KEY);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return normalizeList(cached).slice();
  }
  return DEFAULT_PRESETS.slice();
}

function save(presets) {
  const list = normalizeList(presets);
  ensureDir();
  const payload = { version: 1, presets: list };
  $file.write({
    data: $data({ string: JSON.stringify(payload, null, 2) }),
    path: PRESETS_PATH
  });
  mirrorCache(list);
  return list;
}

module.exports = {
  DEFAULT_PRESETS,
  load,
  save
};

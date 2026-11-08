const store = require("scripts/store");
const state = require("scripts/state");
const util = require("scripts/util");
const calc = require("scripts/calc");

function exportJson(onDone) {
  const payload = store.exportObject(state.getData());
  const text = JSON.stringify(payload, null, 2);
  const name = "budget-export-" + util.currentYearMonth() + ".json";
  if (!$file.exists("data")) $file.mkdir("data");
  const tmp = "data/" + name;
  $file.write({
    data: $data({ string: text }),
    path: tmp
  });
  const fileData = $file.read(tmp);
  $share.sheet({
    items: [fileData, text],
    handler: function() {
      if (onDone) onDone(true);
    }
  });
}

function applyImportObject(obj) {
  const result = store.validateImport(obj);
  if (!result.ok) {
    $ui.alert({ title: "导入失败", message: result.message });
    return false;
  }
  let data = result.data;
  const ensured = calc.ensureCurrentBudget(data);
  data = ensured.data;
  state.setData(data);
  if (ensured.carried) {
    $ui.toast("导入成功，已沿用上月预算");
  } else if (ensured.needSet) {
    $ui.toast("导入成功，请设置本月预算");
  } else {
    $ui.toast("导入成功");
  }
  return true;
}

function importFromClipboard() {
  const text = $clipboard.text;
  if (!text || !String(text).trim()) {
    $ui.alert("剪贴板为空");
    return false;
  }
  const obj = util.safeJsonParse(String(text).trim());
  if (!obj) {
    $ui.alert("剪贴板内容不是合法 JSON");
    return false;
  }
  return applyImportObject(obj);
}

function importFromDrive(onSuccess) {
  $drive.open({
    types: ["public.json", "public.text", "public.data"],
    handler: function(data) {
      if (!data) return;
      let text = "";
      if (data.string) text = data.string;
      else if (typeof data === "string") text = data;
      if (!text) {
        $ui.alert("无法读取所选文件");
        return;
      }
      const obj = util.safeJsonParse(text);
      if (!obj) {
        $ui.alert("文件不是合法 JSON");
        return;
      }
      if (applyImportObject(obj) && onSuccess) onSuccess();
    }
  });
}

function showMenu(onChanged) {
  $ui.menu({
    items: ["导出 JSON", "从剪贴板导入", "从文件导入"],
    handler: function(title, idx) {
      if (idx === 0) {
        exportJson();
      } else if (idx === 1) {
        $ui.alert({
          title: "确认导入",
          message: "将用剪贴板 JSON 覆盖本地全部数据，是否继续？",
          actions: [
            { title: "取消", style: "Cancel" },
            {
              title: "覆盖导入",
              style: "Destructive",
              handler: function() {
                if (importFromClipboard() && onChanged) onChanged();
              }
            }
          ]
        });
      } else if (idx === 2) {
        $ui.alert({
          title: "确认导入",
          message: "将用所选文件覆盖本地全部数据，是否继续？",
          actions: [
            { title: "取消", style: "Cancel" },
            {
              title: "选择文件",
              handler: function() {
                importFromDrive(onChanged);
              }
            }
          ]
        });
      }
    }
  });
}

module.exports = {
  exportJson,
  importFromClipboard,
  importFromDrive,
  showMenu
};

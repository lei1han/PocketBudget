const widgetData = require("scripts/widget-data");

const ADDIN_NAME = "PocketBudget";
const WIDGET_URL = "jsbox://run?name=" + encodeURIComponent(ADDIN_NAME);

function drawDonutRing(pixelSize, metrics, isDark) {
  const size = Math.floor(pixelSize);
  const lineW = Math.max(7, Math.round(size * 0.11));
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - lineW) / 2 - 1;
  const track = isDark ? widgetData.COLOR_TRACK_DARK : widgetData.COLOR_TRACK_LIGHT;
  const arcColor = metrics.over ? widgetData.COLOR_WARN : widgetData.COLOR_OK;
  const start = -Math.PI / 2;
  const sweep = metrics.sweepRatio * Math.PI * 2;

  return $imagekit.render(
    {
      size: $size(size, size),
      opaque: false
    },
    function(ctx) {
      ctx.setLineWidth(lineW);
      ctx.setLineCap(1);
      ctx.beginPath();
      ctx.addArc(cx, cy, radius, 0, Math.PI * 2, 0);
      ctx.strokeColor = $color(track);
      ctx.strokePath();
      if (sweep > 0.001) {
        ctx.beginPath();
        ctx.addArc(cx, cy, radius, start, start + sweep, 0);
        ctx.strokeColor = $color(arcColor);
        ctx.strokePath();
      }
    }
  );
}

function smallWidgetView(ctx, metrics) {
  const pad = 8;
  const box = Math.min(ctx.displaySize.width, ctx.displaySize.height) - pad * 2;
  const ringSize = Math.max(64, Math.floor(box));
  const ring = drawDonutRing(ringSize * 2, metrics, ctx.isDarkMode);
  const centerColor = metrics.over
    ? { color: widgetData.COLOR_WARN }
    : { light: "#000000", dark: "#FFFFFF" };

  return {
    type: "zstack",
    props: {
      widgetURL: WIDGET_URL,
      padding: pad,
      frame: {
        maxWidth: ctx.displaySize.width,
        maxHeight: ctx.displaySize.height
      }
    },
    views: [
      {
        type: "image",
        props: {
          image: ring,
          resizable: true,
          scaledToFit: true,
          frame: { width: ringSize, height: ringSize }
        }
      },
      {
        type: "vstack",
        props: {
          spacing: 2,
          alignment: $widget.horizontalAlignment.center
        },
        views: [
          {
            type: "text",
            props: {
              text: metrics.centerText,
              bold: true,
              font: { size: 15, weight: "bold" },
              lineLimit: 1,
              minimumScaleFactor: 0.45,
              color: centerColor
            }
          }
        ]
      }
    ]
  };
}

function unsupportedFamilyView(ctx) {
  return {
    type: "vstack",
    props: {
      widgetURL: WIDGET_URL,
      padding: 12
    },
    views: [
      {
        type: "text",
        props: {
          text: "PocketBudget",
          bold: true,
          font: { size: 14 }
        }
      },
      {
        type: "text",
        props: {
          text: "请添加「小」尺寸小组件",
          font: { size: 12 },
          color: { light: "#666666", dark: "#AAAAAA" },
          lineLimit: 2
        }
      }
    ]
  };
}

function nextRefreshDate() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function init() {
  let snapshot;
  try {
    snapshot = widgetData.loadSnapshot();
  } catch (e) {
    snapshot = {
      centerText: "—",
      subtitle: "无法读取数据",
      sweepRatio: 0,
      over: false
    };
  }

  $widget.setTimeline({
    entries: [
      {
        date: new Date(),
        info: snapshot
      }
    ],
    policy: {
      afterDate: nextRefreshDate()
    },
    render: function(ctx) {
      const metrics = ctx.entry && ctx.entry.info ? ctx.entry.info : snapshot;
      if (ctx.family !== 0) {
        return unsupportedFamilyView(ctx);
      }
      return smallWidgetView(ctx, metrics);
    }
  });
}

module.exports = {
  init,
  drawDonutRing,
  WIDGET_URL
};

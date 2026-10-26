.pragma library

var EFFECTS = ["leaves", "snow", "sand", "lava", "flicker", "off"]

var LABELS = {
  leaves: "Cherry blossom",
  snow: "Snow",
  sand: "Sand",
  lava: "Lava lamp",
  flicker: "Flicker",
  off: "Off",
}

var ICONS = {
  leaves: "󰉊",
  snow: "󰼶",
  sand: "󰖝",
  lava: "󰈸",
  flicker: "\uDB81\uDDE2",
  off: "󰽤",
}

// Candle exposures for one seamless loop. Each frame re-lights only the
// brighter parts of the desktop picture by this much.
var FLICKER_GAINS = [
  1.00, 1.05, 0.96, 1.10, 1.03, 0.88, 0.76, 0.93,
  1.08, 1.16, 1.04, 0.95, 1.01, 0.86, 0.79, 0.94,
]
var FLICKER_CONTRAST = 3
var FLICKER_DARK_PERCENTILE = 0.08
var FLICKER_INTERVAL_MS = 110

function clamp(value, min, max) {
  var n = Number(value)
  if (!isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function cssRgba(r, g, b, a) {
  return "rgba("
    + Math.round(clamp(r, 0, 1) * 255) + ","
    + Math.round(clamp(g, 0, 1) * 255) + ","
    + Math.round(clamp(b, 0, 1) * 255) + ","
    + clamp(a, 0, 1).toFixed(3)
    + ")"
}

function normalizeEffect(value) {
  var key = String(value || "").toLowerCase()
  if (key === "blossom" || key === "petals" || key === "leaf") key = "leaves"
  if (key === "flake" || key === "snowing") key = "snow"
  if (key === "dust" || key === "wind") key = "sand"
  if (key === "fluid" || key === "lamp" || key === "goo") key = "lava"
  if (key === "candle") key = "flicker"
  if (EFFECTS.indexOf(key) === -1) return "leaves"
  return key
}

function nextEffect(current) {
  var key = normalizeEffect(current)
  var i = EFFECTS.indexOf(key)
  if (i < 0) i = 0
  return EFFECTS[(i + 1) % EFFECTS.length]
}

function labelFor(effect) {
  return LABELS[normalizeEffect(effect)] || "Mawari"
}

function iconFor(effect) {
  return ICONS[normalizeEffect(effect)] || ICONS.leaves
}

function pluginEntry(config, pluginId) {
  var plugins = config && Array.isArray(config.plugins) ? config.plugins : []
  var key = String(pluginId || "")
  var i
  for (i = 0; i < plugins.length; i++) {
    if (plugins[i] && String(plugins[i].id || "") === key) return plugins[i]
  }
  var bar = config && config.bar && config.bar.layout ? config.bar.layout : {}
  var sections = ["left", "center", "right"]
  for (i = 0; i < sections.length; i++) {
    var arr = bar[sections[i]] || []
    for (var j = 0; j < arr.length; j++) {
      if (arr[j] && String(arr[j].id || "") === key) return arr[j]
    }
  }
  return null
}

function settingsFromEntry(entry) {
  var src = entry && typeof entry === "object" ? entry : {}
  return {
    effect: normalizeEffect(src.effect || "leaves"),
    density: clamp(src.density === undefined ? 1 : src.density, 0.35, 2),
    wind: clamp(src.wind === undefined ? 1 : src.wind, 0, 2.5),
  }
}

function parseHyprOptionInt(raw, fallback) {
  try {
    var json = JSON.parse(String(raw || "{}"))
    var n = Number(json.int)
    if (isFinite(n) && n >= 0) return n
  } catch (e) {
  }
  return fallback
}

function parseSnapshot(text) {
  var parts = String(text || "").split(/\n---\n/)
  if (parts.length < 2) return { monitors: [], windows: [] }
  var monitors = []
  var clients = []
  try { monitors = JSON.parse(parts[0]) } catch (e) { monitors = [] }
  try { clients = JSON.parse(parts[1]) } catch (e) { clients = [] }
  if (!Array.isArray(monitors)) monitors = []
  if (!Array.isArray(clients)) clients = []
  return { monitors: monitors, windows: clients }
}

function monitorLayout(monitor) {
  var scale = Number(monitor && monitor.scale)
  if (!isFinite(scale) || scale <= 0) scale = 1
  return {
    id: monitor ? monitor.id : 0,
    name: String(monitor && monitor.name || ""),
    x: Number(monitor && monitor.x) || 0,
    y: Number(monitor && monitor.y) || 0,
    width: (Number(monitor && monitor.width) || 0) / scale,
    height: (Number(monitor && monitor.height) || 0) / scale,
    scale: scale,
    workspaceId: monitor && monitor.activeWorkspace ? Number(monitor.activeWorkspace.id) : 0,
  }
}

function monitorForScreen(monitors, screen) {
  var name = String(screen && screen.name || "")
  var i
  for (i = 0; i < monitors.length; i++) {
    if (String(monitors[i].name || "") === name) return monitorLayout(monitors[i])
  }
  for (i = 0; i < monitors.length; i++) {
    if (monitors[i].focused) return monitorLayout(monitors[i])
  }
  return monitors.length > 0 ? monitorLayout(monitors[0]) : null
}

function clientVisible(client) {
  if (!client) return false
  if (client.mapped === false || client.hidden === true || client.visible === false) return false
  var fs = Number(client.fullscreen)
  if (isFinite(fs) && fs > 0) return false
  if (String(client.class || "") === "org.omarchy.screensaver") return false
  var w = Number(client.size && client.size[0])
  var h = Number(client.size && client.size[1])
  return isFinite(w) && isFinite(h) && w >= 24 && h >= 24
}

function windowsOnMonitor(clients, monitor) {
  var out = []
  if (!monitor || !Array.isArray(clients)) return out
  for (var i = 0; i < clients.length; i++) {
    var client = clients[i]
    if (!clientVisible(client)) continue
    if (Number(client.monitor) !== Number(monitor.id)) continue
    var workspace = client.workspace || {}
    if (Number(workspace.id) !== Number(monitor.workspaceId)) continue
    var at = client.at || [0, 0]
    var size = client.size || [0, 0]
    var rect = {
      x: (Number(at[0]) || 0) - monitor.x,
      y: (Number(at[1]) || 0) - monitor.y,
      w: Number(size[0]) || 0,
      h: Number(size[1]) || 0,
    }
    if (rect.w < 24 || rect.h < 24) continue
    out.push(rect)
  }
  return out
}

function hitWindow(x, y, windows) {
  for (var i = 0; i < windows.length; i++) {
    var win = windows[i]
    if (x >= win.x && x <= win.x + win.w && y >= win.y && y <= win.y + win.h) return win
  }
  return null
}

function nearestEdge(x, y, win) {
  var dl = x - win.x
  var dr = win.x + win.w - x
  var dt = y - win.y
  var db = win.y + win.h - y
  var m = Math.min(dl, dr, dt, db)
  if (m === dt) return { x: x, y: win.y - 0.4, nx: 0, ny: -1, edge: "top" }
  if (m === db) return { x: x, y: win.y + win.h + 0.4, nx: 0, ny: 1, edge: "bottom" }
  if (m === dl) return { x: win.x - 0.4, y: y, nx: -1, ny: 0, edge: "left" }
  return { x: win.x + win.w + 0.4, y: y, nx: 1, ny: 0, edge: "right" }
}

function windAt(t, strength) {
  var s = strength === undefined ? 1 : strength
  return s * (18 * Math.sin(t * 0.31) + 9 * Math.sin(t * 0.73 + 1.2) + 4 * Math.sin(t * 1.9 + 4.1))
}

function luminance(color) {
  if (!color) return 1
  var r = Number(color.r)
  var g = Number(color.g)
  var b = Number(color.b)
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return 1
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function isDarkTheme(color) {
  return luminance(color) < 0.45
}

function flickerFrameCount() {
  return FLICKER_GAINS.length
}

function flickerIntervalMs() {
  return FLICKER_INTERVAL_MS
}

function flickerContrast() {
  return FLICKER_CONTRAST
}

function flickerDarkPercentile() {
  return FLICKER_DARK_PERCENTILE
}

function flickerGainsCsv() {
  return FLICKER_GAINS.join(",")
}

function flickerFrameName(index) {
  var n = String(index)
  if (n.length < 2) n = "0" + n
  return "frame-" + n + ".png"
}

// WCAG contrast ratio (L + 0.05) / (dark + 0.05) >= ratio,
// solved for the relative luminance a pixel must reach.
function contrastLumaCut(darkLuma, ratio) {
  var dark = clamp(darkLuma, 0, 1)
  var r = Number(ratio)
  if (!isFinite(r) || r <= 0) r = FLICKER_CONTRAST
  return r * (dark + 0.05) - 0.05
}

function isBrighterLuma(luma, darkLuma, ratio) {
  return Number(luma) + 1e-9 >= contrastLumaCut(darkLuma, ratio)
}

function flickerFramesReady(names) {
  if (!names || !names.length) return false
  var have = {}
  var i
  for (i = 0; i < names.length; i++) have[String(names[i])] = true
  for (i = 0; i < FLICKER_GAINS.length; i++) {
    if (!have[flickerFrameName(i)]) return false
  }
  return true
}

function parseNameList(text) {
  var parts = String(text || "").split("\n")
  var out = []
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].replace(/^\s+|\s+$/g, "")
    if (name) out.push(name)
  }
  return out
}

function parseFlickerProbe(text) {
  var lines = String(text || "").replace(/\s+$/g, "").split("\n")
  if (lines.length < 2) return null
  var bits = lines[0].replace(/^\s+|\s+$/g, "").split(/\s+/)
  var size = Number(bits[0])
  var mtime = Number(bits[1])
  var path = lines.slice(1).join("\n").replace(/^\s+|\s+$/g, "")
  if (!path || !isFinite(size) || size < 0 || !isFinite(mtime)) return null
  return { path: path, size: size, mtime: mtime }
}

function flickerProbeCommand() {
  return [
    "bash", "-c",
    "target=$(readlink -f \"$HOME/.local/state/omarchy/current/background\") || exit 1; stat -c '%s %Y' \"$target\"; printf '%s\\n' \"$target\"",
  ]
}

function flickerListCommand(dir) {
  return [
    "bash", "-c",
    "find \"$1\" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null || true",
    "find",
    String(dir || ""),
  ]
}

function filePathFromUrl(url) {
  var s = String(url || "")
  if (s.slice(0, 7) === "file://") s = s.slice(7)
  try { s = decodeURIComponent(s) } catch (e) {}
  if (s.length > 1 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1)
  return s
}

function fileUrl(path) {
  var s = String(path || "")
  if (s.slice(0, 7) === "file://") return s
  return "file://" + encodeURI(s)
}

function flickerStateRoot(home) {
  return String(home || "") + "/.local/state/omarchy/mawari/flicker"
}

function flickerBaseName(path) {
  var parts = String(path || "wallpaper").split("/")
  var base = parts[parts.length - 1] || "wallpaper"
  base = base.replace(/[^A-Za-z0-9._-]+/g, "_")
  if (base.length > 48) base = base.slice(0, 48)
  if (!base) base = "wallpaper"
  return base
}

function flickerCacheKey(path, size, mtime) {
  var s = [
    "v1",
    String(FLICKER_CONTRAST),
    String(FLICKER_DARK_PERCENTILE),
    FLICKER_GAINS.join(","),
    String(path || ""),
    String(size),
    String(mtime),
  ].join("\n")
  var h = 5381
  for (var i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0
  }
  var hex = h.toString(16)
  while (hex.length < 8) hex = "0" + hex
  return hex
}

function flickerCacheDir(home, path, size, mtime) {
  return flickerStateRoot(home) + "/" + flickerBaseName(path) + "-" + flickerCacheKey(path, size, mtime)
}

function countsFor(effect, density, area) {
  if (effect === "flicker" || effect === "off") return 0
  var scale = clamp(density, 0.35, 2) * clamp(area / (1280 * 800), 0.55, 1.6)
  if (effect === "snow") return Math.round(78 * scale)
  if (effect === "leaves") return Math.round(34 * scale)
  if (effect === "sand") return Math.round(150 * scale)
  if (effect === "lava") return Math.round(7 * clamp(density, 0.7, 1.4))
  return 0
}

function spawnInGap(w, h, windows, margin) {
  var x = 0
  var y = 0
  for (var i = 0; i < 12; i++) {
    x = Math.random() * w
    y = Math.random() * h
    var hit = hitWindow(x, y, windows)
    if (!hit) return { x: x, y: y }
    if (i > 6) {
      var edge = nearestEdge(x, y, hit)
      return { x: edge.x, y: edge.y }
    }
  }
  return { x: Math.random() * w, y: margin || 8 }
}

function makeSnow(w, h, windows) {
  var p = spawnInGap(w, h, windows, 8)
  return {
    x: p.x,
    y: p.y,
    vx: (Math.random() - 0.5) * 12,
    vy: 18 + Math.random() * 28,
    r: 1.1 + Math.random() * 1.8,
    a: 0.35 + Math.random() * 0.5,
    phase: Math.random() * 6.28,
  }
}

function makeLeaf(w, h, windows) {
  var p = spawnInGap(w, h, windows, 8)
  return {
    x: p.x,
    y: p.y,
    vx: (Math.random() - 0.4) * 22,
    vy: 8 + Math.random() * 16,
    rot: Math.random() * 6.28,
    spin: (Math.random() - 0.5) * 2.4,
    w: 5 + Math.random() * 6,
    h: 2.2 + Math.random() * 2.4,
    tone: Math.random(),
    phase: Math.random() * 6.28,
  }
}

function makeSand(w, h, windows) {
  var p = spawnInGap(w, h, windows, 8)
  return {
    x: p.x,
    y: p.y,
    vx: (Math.random() - 0.5) * 30,
    vy: 20 + Math.random() * 40,
    r: 0.7 + Math.random() * 0.9,
    rest: 0,
    tone: Math.random(),
  }
}

function makeLava(w, h, windows, i, n) {
  var p = spawnInGap(w, h, windows, 40)
  return {
    x: p.x,
    y: p.y,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.5) * 10,
    r: 36 + Math.random() * 42,
    phase: (i / Math.max(1, n)) * 6.28,
    tone: i / Math.max(1, n - 1),
  }
}

function ensurePopulation(list, effect, w, h, windows, density) {
  var need = countsFor(effect, density, w * h)
  if (effect === "off" || need <= 0) {
    list.length = 0
    return list
  }
  var spawn = makeSnow
  if (effect === "leaves") spawn = makeLeaf
  else if (effect === "sand") spawn = makeSand
  else if (effect === "lava") spawn = makeLava
  while (list.length < need) {
    if (effect === "lava") list.push(makeLava(w, h, windows, list.length, need))
    else list.push(spawn(w, h, windows))
  }
  if (list.length > need) list.length = need
  return list
}

function wrap(p, w, h) {
  if (p.x < -12) p.x = w + 8
  else if (p.x > w + 12) p.x = -8
  if (p.y > h + 16) {
    p.y = -10
    p.x = Math.random() * w
  } else if (p.y < -20) {
    p.y = h + 8
  }
}

function bounce(p, windows, slide) {
  var hit = hitWindow(p.x, p.y, windows)
  if (!hit) return false
  var edge = nearestEdge(p.x, p.y, hit)
  p.x = edge.x
  p.y = edge.y
  if (edge.edge === "top") {
    p.vy = Math.min(p.vy, 0) * 0.15
    if (slide) p.rest = 1
  } else if (edge.edge === "bottom") {
    p.vy = Math.abs(p.vy) * 0.25 + 8
  } else {
    p.vx = -p.vx * 0.35 + edge.nx * 6
    p.vy += 4
  }
  return true
}

function stepSnow(list, w, h, windows, dt, t, wind) {
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    p.phase += dt * 1.4
    p.vx += (wind * 0.35 - p.vx) * dt * 0.6
    p.x += (p.vx + Math.sin(p.phase + p.y * 0.04) * 10) * dt
    p.y += p.vy * dt
    var hit = hitWindow(p.x, p.y, windows)
    if (hit) {
      var edge = nearestEdge(p.x, p.y, hit)
      if (edge.edge === "top") {
        p.y = -8
        p.x = Math.random() * w
      } else {
        p.x = edge.x
        p.y = edge.y
        p.vx += edge.nx * 18
        p.vy = Math.max(p.vy, 12)
      }
    }
    wrap(p, w, h)
  }
}

function stepLeaves(list, w, h, windows, dt, t, wind) {
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    p.phase += dt * 2.2
    var flutter = Math.sin(p.phase) * 28
    p.vx += (wind * 0.55 + flutter - p.vx) * dt * 1.1
    p.vy += (12 + Math.cos(p.phase * 0.7) * 10 - p.vy) * dt * 0.8
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += (p.spin + p.vx * 0.02) * dt
    var hit = hitWindow(p.x, p.y, windows)
    if (hit) {
      var edge = nearestEdge(p.x, p.y, hit)
      p.x = edge.x
      p.y = edge.y
      p.vx = p.vx * 0.3 + edge.nx * 22 + (Math.random() - 0.5) * 16
      p.vy = p.vy * 0.25 + edge.ny * 10 + 6
      p.spin += (Math.random() - 0.5) * 3
    }
    wrap(p, w, h)
  }
}

function stepSand(list, w, h, windows, dt, t, wind) {
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    p.vy += 78 * dt
    p.vx += (wind * 1.1 - p.vx) * dt * 0.45
    if (p.rest > 0) {
      p.vy = Math.min(p.vy, 8)
      p.vx += wind * dt * 1.8
      p.rest = Math.max(0, p.rest - dt * 0.35)
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    bounce(p, windows, true)
    if (p.rest > 0 && Math.abs(p.vx) > 28) p.rest = 0
    wrap(p, w, h)
  }
}

function stepLava(list, w, h, windows, dt, t) {
  var i
  for (i = 0; i < list.length; i++) {
    var p = list[i]
    p.phase += dt * 0.55
    p.vx += Math.sin(p.phase + i) * 18 * dt
    p.vy += Math.cos(p.phase * 0.8 + i * 0.7) * 14 * dt
    p.vx *= 0.96
    p.vy *= 0.96
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.x < p.r * 0.3) { p.x = p.r * 0.3; p.vx = Math.abs(p.vx) }
    if (p.x > w - p.r * 0.3) { p.x = w - p.r * 0.3; p.vx = -Math.abs(p.vx) }
    if (p.y < p.r * 0.3) { p.y = p.r * 0.3; p.vy = Math.abs(p.vy) }
    if (p.y > h - p.r * 0.3) { p.y = h - p.r * 0.3; p.vy = -Math.abs(p.vy) }
    var hit = hitWindow(p.x, p.y, windows)
    if (hit) {
      var edge = nearestEdge(p.x, p.y, hit)
      p.x = edge.x
      p.y = edge.y
      p.vx = p.vx * 0.4 + edge.nx * 16
      p.vy = p.vy * 0.4 + edge.ny * 16
    }
  }
  for (i = 0; i < list.length; i++) {
    for (var j = i + 1; j < list.length; j++) {
      var a = list[i]
      var b = list[j]
      var dx = b.x - a.x
      var dy = b.y - a.y
      var d = Math.sqrt(dx * dx + dy * dy) || 0.01
      var min = (a.r + b.r) * 0.42
      if (d < min) {
        var push = (min - d) * 0.08
        a.x -= dx / d * push
        a.y -= dy / d * push
        b.x += dx / d * push
        b.y += dy / d * push
      }
    }
  }
}

function step(list, effect, w, h, windows, dt, t, wind) {
  if (effect === "flicker" || effect === "off") return
  if (effect === "snow") stepSnow(list, w, h, windows, dt, t, wind)
  else if (effect === "leaves") stepLeaves(list, w, h, windows, dt, t, wind)
  else if (effect === "sand") stepSand(list, w, h, windows, dt, t, wind)
  else if (effect === "lava") stepLava(list, w, h, windows, dt, t)
}

function leafColor(tone, accent, urgent) {
  var a = accent || { r: 0.85, g: 0.55, b: 0.62 }
  var u = urgent || { r: 0.77, g: 0.36, b: 0.42 }
  if (tone < 0.45) return cssRgba(a.r, a.g * 0.92, a.b, 0.78)
  if (tone < 0.75) return cssRgba(u.r, u.g, u.b, 0.72)
  return cssRgba(Math.min(1, a.r + 0.12), Math.min(1, a.g + 0.18), Math.min(1, a.b * 0.7 + 0.2), 0.7)
}

function sandColor(tone, muted, accent) {
  var m = muted || { r: 0.55, g: 0.48, b: 0.4 }
  var a = accent || { r: 0.83, g: 0.7, b: 0.4 }
  return cssRgba(
    m.r * 0.55 + a.r * 0.45 + tone * 0.08,
    m.g * 0.55 + a.g * 0.35 + tone * 0.04,
    m.b * 0.5 + a.b * 0.2,
    0.55 + tone * 0.25
  )
}

function lavaColor(tone, t, accent, urgent, core) {
  var a = accent || { r: 0.91, g: 0.76, b: 0.42 }
  var u = urgent || { r: 0.77, g: 0.36, b: 0.42 }
  var pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + tone * 4)
  if (core) {
    return cssRgba(
      Math.min(1, a.r * 0.4 + 0.7),
      Math.min(1, a.g * 0.5 + 0.45 + pulse * 0.1),
      Math.min(1, u.b * 0.2 + 0.12),
      0.42 + pulse * 0.18
    )
  }
  return cssRgba(
    a.r * (0.7 + tone * 0.3) + u.r * (1 - tone) * 0.25,
    a.g * 0.55 + tone * 0.15,
    u.b * 0.25 + a.b * 0.2,
    0.0
  )
}

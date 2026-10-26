const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")
const src = fs.readFileSync(path.join(__dirname, "../MawariModel.js"), "utf8")
  .replace(".pragma library\n", "")
const names = [
  "normalizeEffect", "nextEffect", "hitWindow", "nearestEdge",
  "countsFor", "ensurePopulation", "stepSand", "step", "windowsOnMonitor",
  "isDarkTheme", "flickerFrameCount", "flickerFrameName", "flickerFramesReady",
  "contrastLumaCut", "isBrighterLuma", "parseFlickerProbe", "parseNameList",
  "flickerCacheDir", "flickerCacheKey", "flickerProbeCommand", "flickerListCommand",
  "fileUrl", "filePathFromUrl", "flickerGainsCsv", "ICONS",
]
const Mawari = {}
new Function("exports", src + "\nnames.forEach(n => exports[n] = eval(n))".replace("names", JSON.stringify(names)))(Mawari)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(Mawari.nextEffect("leaves") === "snow", "cycle leaves -> snow")
assert(Mawari.nextEffect("lava") === "flicker", "cycle lava -> flicker")
assert(Mawari.nextEffect("flicker") === "off", "cycle flicker -> off")
assert(Mawari.normalizeEffect("petals") === "leaves", "alias petals")
assert(Mawari.normalizeEffect("candle") === "flicker", "alias candle")
assert(Mawari.normalizeEffect("Flicker") === "flicker", "flicker case")
assert(Mawari.ICONS.flicker.codePointAt(0) === 0xF05E2, "candle icon")
assert(Mawari.isDarkTheme({ r: 0.102, g: 0.118, b: 0.173 }), "night background is dark")
assert(!Mawari.isDarkTheme({ r: 0.93, g: 0.91, b: 0.86 }), "day background is light")
assert(!Mawari.isDarkTheme(null), "missing color is not dark")
assert(Math.abs(Mawari.contrastLumaCut(0, 3) - 0.1) < 1e-9, "3:1 against black")
assert(Mawari.isBrighterLuma(0.1, 0, 3), "at the cut is brighter")
assert(!Mawari.isBrighterLuma(0.05, 0, 3), "below the cut stays still")
assert(Mawari.flickerFrameCount() === 16, "sixteen flicker frames")
assert(Mawari.flickerFrameName(0) === "frame-00.png", "first frame name")
assert(Mawari.flickerFrameName(15) === "frame-15.png", "last frame name")
assert(!Mawari.flickerFramesReady(["frame-00.png"]), "partial set is not ready")
assert(Mawari.flickerFramesReady(Array.from({ length: 16 }, (_, i) => Mawari.flickerFrameName(i))), "full set is ready")
assert(Mawari.countsFor("flicker", 1, 1280 * 800) === 0, "flicker is not particles")
const probe = Mawari.parseFlickerProbe("406194 1710000000\n/tmp/lanterns.jpg\n")
assert(probe && probe.path === "/tmp/lanterns.jpg" && probe.size === 406194 && probe.mtime === 1710000000, "probe parse")
const dirA = Mawari.flickerCacheDir("/home/x", "/pics/a.jpg", 10, 20)
const dirB = Mawari.flickerCacheDir("/home/x", "/pics/a.jpg", 10, 21)
assert(dirA.indexOf("/home/x/.local/state/omarchy/mawari/flicker/") === 0, "cache root")
assert(dirA !== dirB, "changed picture gets its own directory")
assert(Mawari.flickerCacheKey("/pics/a.jpg", 10, 20) === Mawari.flickerCacheKey("/pics/a.jpg", 10, 20), "cache key is stable")
assert(Mawari.fileUrl("/home/x/my picture.jpg") === "file:///home/x/my%20picture.jpg", "file url")
assert(Mawari.filePathFromUrl("file:///home/x/mawari/") === "/home/x/mawari", "file path")
const listed = Mawari.parseNameList(execFileSync(
  Mawari.flickerListCommand("/no/such/mawari-flicker")[0],
  Mawari.flickerListCommand("/no/such/mawari-flicker").slice(1),
  { encoding: "utf8" }
))
assert(listed.length === 0, "missing directory lists nothing")
const live = Mawari.parseFlickerProbe(execFileSync(
  Mawari.flickerProbeCommand()[0],
  Mawari.flickerProbeCommand().slice(1),
  { encoding: "utf8" }
))
assert(live && live.size > 0 && live.path.indexOf("/") === 0, "live desktop picture probes")

const win = { x: 100, y: 100, w: 200, h: 80 }
assert(Mawari.hitWindow(150, 120, [win]), "inside")
assert(!Mawari.hitWindow(10, 10, [win]), "outside")
assert(Mawari.nearestEdge(150, 110, win).edge === "top", "top edge")
assert(Mawari.nearestEdge(105, 140, win).edge === "left", "left edge")

const sand = []
Mawari.ensurePopulation(sand, "sand", 400, 300, [win], 1)
assert(sand.length > 20, "sand population")
for (var i = 0; i < 8; i++) Mawari.stepSand(sand, 400, 300, [win], 0.04, i * 0.04, 12)
assert(sand.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), "sand stays finite")

execFileSync("python3", [path.join(__dirname, "../bin/flicker-frames.py"), "--self-test"], { stdio: "inherit" })

console.log("ok")

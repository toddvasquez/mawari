import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import "MawariModel.js" as Mawari

Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string pluginId: manifest && manifest.id ? String(manifest.id) : "toddv.mawari"
  readonly property var idleService: shell ? shell.firstPartyServiceFor("omarchy.idle") : null
  readonly property var lockService: shell ? shell.firstPartyServiceFor("omarchy.lock") : null
  readonly property bool screenObscured:
    (idleService && (!idleService.screensaverStateKnown || idleService.screensaverWindowCount > 0))
    || (lockService && lockService.locked)

  readonly property var pluginSettings: Mawari.settingsFromEntry(
    Mawari.pluginEntry(shell && shell.shellConfig ? shell.shellConfig : null, pluginId)
  )

  property string effect: pluginSettings.effect
  readonly property string icon: Mawari.iconFor(effect)
  readonly property string label: effect === "flicker" && !darkTheme
    ? "Mawari · Flicker · dark themes only"
    : "Mawari · " + Mawari.labelFor(effect)
  readonly property bool darkTheme: Mawari.isDarkTheme(Commons.Color.background)
  readonly property bool particlesOn: effect !== "off" && effect !== "flicker" && !screenObscured
  readonly property bool flickerOn: effect === "flicker" && !screenObscured && darkTheme
  readonly property bool running: particlesOn || flickerOn

  readonly property string homeDir: Quickshell.env("HOME")
  readonly property string flickerScript: Mawari.filePathFromUrl(Qt.resolvedUrl("bin/flicker-frames.py"))

  property string flickerSource: ""
  property string flickerDir: ""
  property string flickerStage: "idle"
  property int flickerFrame: 0
  property int flickerToken: 0
  property int flickerProbeToken: 0
  property bool flickerBuildAttempted: false
  property bool flickerIgnoreBuildExit: false
  property bool flickerRestartBuild: false
  readonly property bool flickerReady: flickerOn && flickerStage === "ready"

  property var monitors: []
  property var windows: []
  property real clock: 0
  property int simGeneration: 0

  function persistEffect(next) {
    if (!shell || typeof shell.updateEntryInline !== "function") return
    var entry = Mawari.pluginEntry(shell.shellConfig, pluginId) || { id: pluginId }
    var payload = { id: pluginId }
    for (var key in entry) if (key !== "id") payload[key] = entry[key]
    payload.effect = next
    shell.updateEntryInline(pluginId, payload)
  }

  function setEffect(next) {
    effect = Mawari.normalizeEffect(next)
    simGeneration += 1
    persistEffect(effect)
  }

  function cycle() {
    setEffect(Mawari.nextEffect(effect))
  }

  function refreshGeometry() {
    if (!snapshotProc.running) snapshotProc.running = true
  }

  function applySnapshot(text) {
    var snap = Mawari.parseSnapshot(text)
    monitors = snap.monitors
    windows = snap.windows
  }

  function stopFlickerWork() {
    flickerToken += 1
    if (!flickerOn) flickerStage = "idle"
    if (buildProc.running) buildProc.running = false
    if (listProc.running) listProc.running = false
  }

  function probeFlickerSource() {
    if (!flickerOn || probeProc.running) return
    flickerProbeToken = flickerToken
    probeProc.command = Mawari.flickerProbeCommand()
    probeProc.running = true
  }

  function armFlicker() {
    flickerToken += 1
    flickerStage = "checking"
    flickerFrame = 0
    if (listProc.running) listProc.running = false
    if (buildProc.running) {
      flickerIgnoreBuildExit = true
      buildProc.running = false
    }
    probeFlickerSource()
  }

  function applyFlickerProbe(text) {
    if (!flickerOn || flickerProbeToken !== flickerToken) return
    var info = Mawari.parseFlickerProbe(text)
    if (!info) {
      flickerStage = "failed"
      return
    }
    var dir = Mawari.flickerCacheDir(homeDir, info.path, info.size, info.mtime)
    if (dir === flickerDir && (flickerStage === "listing" || flickerStage === "building"
      || flickerStage === "ready" || flickerStage === "failed"))
      return
    flickerSource = info.path
    flickerDir = dir
    flickerBuildAttempted = false
    flickerStage = "listing"
    flickerFrame = 0
    if (buildProc.running) {
      flickerRestartBuild = true
      buildProc.running = false
      return
    }
    startFlickerList()
  }

  function startFlickerList() {
    if (!flickerOn || !flickerDir || listProc.running) return
    listProc.command = Mawari.flickerListCommand(flickerDir)
    listProc.running = true
  }

  function ingestFlickerList(text) {
    if (!flickerOn || flickerStage !== "listing") return
    var names = Mawari.parseNameList(text)
    if (Mawari.flickerFramesReady(names)) {
      flickerStage = "ready"
      if (!flickerBuildAttempted)
        console.log("mawari flicker: pictures already exist, reusing " + flickerDir)
      return
    }
    if (flickerBuildAttempted) {
      flickerStage = "failed"
      console.warn("mawari flicker: frames still missing after build")
      return
    }
    startFlickerBuild()
  }

  function startFlickerBuild() {
    if (!flickerOn || !flickerSource || !flickerDir) return
    flickerBuildAttempted = true
    flickerStage = "building"
    console.log("mawari flicker: writing pictures to " + flickerDir)
    buildProc.command = [
      "python3", flickerScript,
      "--source", flickerSource,
      "--out", flickerDir,
      "--contrast", String(Mawari.flickerContrast()),
      "--dark-percentile", String(Mawari.flickerDarkPercentile()),
      "--gains", Mawari.flickerGainsCsv(),
    ]
    buildProc.running = true
  }

  function finishFlickerBuild(exitCode) {
    if (flickerIgnoreBuildExit) {
      flickerIgnoreBuildExit = false
      return
    }
    if (flickerRestartBuild) {
      flickerRestartBuild = false
      if (flickerOn) startFlickerList()
      return
    }
    if (!flickerOn || flickerStage !== "building") return
    if (exitCode !== 0) {
      flickerStage = "failed"
      console.warn("mawari flicker: build failed (" + exitCode + ")")
      return
    }
    flickerStage = "listing"
    startFlickerList()
  }

  function handleHyprlandEvent(event) {
    var name = String(event && event.name ? event.name : "")
    if (name === "openwindow" || name === "closewindow" || name === "movewindow"
      || name === "resizewindow" || name === "fullscreen" || name === "changefloatingmode"
      || name === "moveworkspace" || name === "workspace" || name === "focusedmon"
      || name === "activewindow" || name === "activewindowv2" || name === "configreloaded") {
      refreshTimer.restart()
    }
  }

  onPluginSettingsChanged: {
    var next = pluginSettings.effect
    if (next && next !== effect) {
      effect = next
      simGeneration += 1
    }
  }

  onFlickerOnChanged: {
    if (flickerOn) armFlicker()
    else stopFlickerWork()
  }

  Timer {
    id: refreshTimer
    interval: 50
    repeat: false
    onTriggered: root.refreshGeometry()
  }

  Timer {
    id: pollTimer
    interval: 800
    repeat: true
    running: root.particlesOn
    onTriggered: root.refreshGeometry()
  }

  Timer {
    id: clockTimer
    interval: 40
    repeat: true
    running: root.particlesOn
    onTriggered: root.clock += interval / 1000
  }

  Timer {
    id: flickerWatch
    interval: 2000
    repeat: true
    running: root.flickerOn
    onTriggered: root.probeFlickerSource()
  }

  Timer {
    id: flickerClock
    interval: Mawari.flickerIntervalMs()
    repeat: true
    running: root.flickerReady
    onTriggered: root.flickerFrame = (root.flickerFrame + 1) % Mawari.flickerFrameCount()
  }

  Process {
    id: probeProc
    command: ["true"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyFlickerProbe(text)
    }
  }

  Process {
    id: listProc
    command: ["true"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.ingestFlickerList(text)
    }
  }

  Process {
    id: buildProc
    command: ["true"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var msg = String(text || "").replace(/^\s+|\s+$/g, "")
        if (msg !== "") console.log("mawari flicker: " + msg)
      }
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var msg = String(text || "").replace(/^\s+|\s+$/g, "")
        if (msg !== "") console.warn("mawari flicker: " + msg)
      }
    }
    onExited: function(exitCode) { root.finishFlickerBuild(exitCode) }
  }

  Process {
    id: snapshotProc
    command: [
      "bash", "-lc",
      "hyprctl -j monitors; printf '\\n---\\n'; hyprctl -j clients"
    ]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applySnapshot(text)
    }
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) { root.handleHyprlandEvent(event) }
  }

  Component.onCompleted: {
    root.refreshGeometry()
    if (root.flickerOn) root.armFlicker()
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel

      required property var modelData

      screen: modelData
      visible: root.particlesOn || root.flickerReady
      color: "transparent"
      mask: Region {}
      exclusionMode: ExclusionMode.Ignore
      surfaceFormat.opaque: false

      WlrLayershell.namespace: "omarchy-mawari"
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

      anchors {
        top: true
        bottom: true
        left: true
        right: true
      }

      property var particles: []
      property int lastGeneration: -1
      property string lastEffect: ""
      property real lastStep: 0

      readonly property var monitor: Mawari.monitorForScreen(root.monitors, modelData)
      readonly property var localWindows: Mawari.windowsOnMonitor(root.windows, monitor)

      function stepAndPaint() {
        if (!root.particlesOn || width <= 0 || height <= 0) return
        if (lastGeneration !== root.simGeneration || lastEffect !== root.effect) {
          particles = []
          lastGeneration = root.simGeneration
          lastEffect = root.effect
          lastStep = root.clock
        }
        Mawari.ensurePopulation(
          particles, root.effect, width, height, localWindows, root.pluginSettings.density
        )
        var dt = Math.min(0.05, Math.max(0.016, root.clock - lastStep))
        lastStep = root.clock
        Mawari.step(
          particles, root.effect, width, height, localWindows, dt, root.clock,
          Mawari.windAt(root.clock, root.pluginSettings.wind)
        )
        canvas.requestPaint()
      }

      Canvas {
        id: canvas
        anchors.fill: parent
        visible: root.particlesOn
        renderTarget: Canvas.FramebufferObject
        renderStrategy: Canvas.Cooperative

        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          ctx.clearRect(0, 0, width, height)
          if (!root.particlesOn) return

          var list = panel.particles
          var effect = root.effect
          var t = root.clock
          var i

          if (effect === "snow") {
            ctx.fillStyle = Mawari.cssRgba(0.93, 0.95, 0.98, 0.72)
            for (i = 0; i < list.length; i++) {
              var s = list[i]
              ctx.globalAlpha = s.a
              ctx.beginPath()
              ctx.arc(s.x, s.y, s.r, 0, 6.2832)
              ctx.fill()
            }
            ctx.globalAlpha = 1
            return
          }

          if (effect === "sand") {
            for (i = 0; i < list.length; i++) {
              var g = list[i]
              ctx.fillStyle = Mawari.sandColor(g.tone, Commons.Color.muted, Commons.Color.accent)
              ctx.fillRect(g.x, g.y, g.r, g.r)
            }
            return
          }

          if (effect === "leaves") {
            for (i = 0; i < list.length; i++) {
              var leaf = list[i]
              ctx.save()
              ctx.translate(leaf.x, leaf.y)
              ctx.rotate(leaf.rot)
              ctx.scale(1, leaf.h / leaf.w)
              ctx.fillStyle = Mawari.leafColor(leaf.tone, Commons.Color.accent, Commons.Color.urgent)
              ctx.beginPath()
              ctx.arc(0, 0, leaf.w * 0.5, 0, 6.2832)
              ctx.fill()
              ctx.restore()
            }
            return
          }

          if (effect === "lava") {
            ctx.globalCompositeOperation = "lighter"
            for (i = 0; i < list.length; i++) {
              var blob = list[i]
              var grad = ctx.createRadialGradient(blob.x, blob.y, blob.r * 0.08, blob.x, blob.y, blob.r)
              grad.addColorStop(0, Mawari.lavaColor(blob.tone, t, Commons.Color.accent, Commons.Color.urgent, true))
              grad.addColorStop(0.45, Mawari.cssRgba(Commons.Color.accent.r, Commons.Color.accent.g * 0.55, Commons.Color.urgent.b * 0.35, 0.16))
              grad.addColorStop(1, Mawari.cssRgba(Commons.Color.accent.r, Commons.Color.accent.g, Commons.Color.accent.b, 0))
              ctx.fillStyle = grad
              ctx.beginPath()
              ctx.arc(blob.x, blob.y, blob.r, 0, 6.2832)
              ctx.fill()
            }
            ctx.globalCompositeOperation = "source-over"
          }
        }
      }

      Repeater {
        model: root.flickerReady ? Mawari.flickerFrameCount() : 0

        Image {
          anchors.fill: parent
          visible: index === root.flickerFrame
          source: Mawari.fileUrl(root.flickerDir + "/" + Mawari.flickerFrameName(index))
          fillMode: Image.PreserveAspectCrop
          asynchronous: false
          cache: true
          smooth: true
          mipmap: true
        }
      }

      Connections {
        target: root
        function onClockChanged() { panel.stepAndPaint() }
        function onWindowsChanged() { panel.stepAndPaint() }
        function onEffectChanged() { panel.stepAndPaint() }
      }
    }
  }
}

import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "MawariModel.js" as Mawari

BarWidget {
  id: root
  moduleName: "toddv.mawari"

  readonly property var service: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor("toddv.mawari") : null
  readonly property string effect: service ? service.effect : Mawari.normalizeEffect(setting("effect", "leaves"))

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function persist(next) {
    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    entry.effect = next
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function cycle() {
    var next = Mawari.nextEffect(effect)
    if (service && typeof service.setEffect === "function") service.setEffect(next)
    else persist(next)
  }

  function turnOff() {
    if (service && typeof service.setEffect === "function") service.setEffect("off")
    else persist("off")
  }

  BarIconButton {
    id: button
    bar: root.bar
    text: Mawari.iconFor(root.effect)
    tooltipText: root.effect === "flicker" && !Mawari.isDarkTheme(Commons.Color.background)
      ? "Mawari · Flicker · dark themes only"
      : "Mawari · " + Mawari.labelFor(root.effect)
    active: root.effect !== "off"
    onPressed: function(buttonId) {
      if (buttonId === Qt.RightButton) root.turnOff()
      else root.cycle()
    }
  }
}

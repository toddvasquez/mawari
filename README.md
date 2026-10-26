<h1 align="center">Mawari</h1>

<p align="center">
  Motion in the empty space <strong>around and between</strong> Hyprland windows.<br>
  An <a href="https://omarchy.org/">Omarchy</a> shell plugin.
</p>

<p align="center">
  <img alt="version 1.1.0" src="https://img.shields.io/badge/version-1.1.0-E7A0B0?style=flat-square">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-C4B8A8?style=flat-square">
  <img alt="Omarchy shell plugin" src="https://img.shields.io/badge/Omarchy-shell%20plugin-1C2433?style=flat-square">
</p>

<p align="center">
  <img src="docs/images/hero.jpg" alt="The shotengai-90s wallpaper from cherry-blossom-day, a shopping street under cherry blossoms">
</p>

Mawari paints on the layer behind your windows, so titles, terminals, and the theme stay as they are. A chip on the bar cycles the effect. The desktop underneath keeps working.

Left-click the chip to move to the next effect. Right-click turns Mawari off.

## The name

周り (mawari) is the circumference of a thing, and the surroundings pressed against that edge. The word is glossed as circumference, perimeter, and girth, and also as surroundings, neighborhood, and vicinity: the place just beside something. Next to it is the verb 回る (mawaru), to go around.

That ring is the whole plugin. Petals, snow, sand, and the lava-lamp glow travel the perimeter of each window and the gaps between windows. What is on the windows stays put.

## Install

```bash
omarchy plugin add https://github.com/toddvasquez/mawari.git --enable
```

Omarchy clones this repository to `~/.config/omarchy/plugins/toddv.mawari/` and places the chip in the right side of the bar. It asks before it adds anything. Pass `--yes` only when you already mean to skip that prompt.

To pick the section yourself, add it first, then enable it:

```bash
omarchy plugin add https://github.com/toddvasquez/mawari.git
omarchy plugin enable toddv.mawari --section right
```

`left` and `center` work the same way. Later:

```bash
omarchy plugin update toddv.mawari
```

Plugins run as unsandboxed code inside `omarchy-shell`. The interesting parts are `Service.qml`, `BarWidget.qml`, `MawariModel.js`, and `bin/flicker-frames.py`.

## Effects

The chip walks this order, then returns to cherry blossom:

`leaves` → `snow` → `sand` → `lava` → `flicker` → `off`

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/images/hero.jpg" alt="shotengai-90s, the cherry-blossom-day wallpaper">
      <br>
      <strong>Cherry blossom</strong>
      <br>
      <code>5-shotengai-90s.jpg</code> from cherry-blossom-day. Petals already move through the street.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/images/snow.jpg" alt="Snow falling over the station-street wallpaper from cherry-blossom-day">
      <br>
      <strong>Snow</strong>
      <br>
      Quiet flakes on <code>6-station-street-90s.jpg</code> from cherry-blossom-day. No windows.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="docs/images/sand.jpg" alt="Sand grains blowing across the ukiyo-e avenue wallpaper">
      <br>
      <strong>Sand</strong>
      <br>
      Grains on the wind across <code>3-ukiyoe-avenue.jpg</code> from cherry-blossom-day. No windows.
    </td>
    <td width="50%" align="center" valign="top">
      <img src="docs/images/lava.jpg" alt="A dwindle tiled Omarchy layout with lava light in the gaps">
      <br>
      <strong>Lava lamp</strong>
      <br>
      Warm light in the cracks of a dwindle layout: square corners, a 2px border, 10px outer gap, 5px between windows. The picture behind them is <code>2-shrine-town-anime.jpg</code>.
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="docs/images/flicker.jpg" width="78%" alt="hanami-lanterns, the cherry-blossom-night wallpaper">
      <br>
      <strong>Flicker</strong>
      <br>
      <code>1-hanami-lanterns.jpg</code> from cherry-blossom-night, with no windows on it. On a dark theme, Mawari re-lights the brighter parts of this picture and cycles those frames behind the windows.
    </td>
  </tr>
</table>

Particle effects read live window geometry from Hyprland and stay in the gaps. Fullscreen windows are left alone. Motion waits while the lock screen or the screensaver is up.

## Settings

On the bar entry, or on the `plugins[]` entry, in `~/.config/omarchy/shell.json`:

```json
{
  "id": "toddv.mawari",
  "effect": "leaves",
  "density": 1,
  "wind": 1
}
```

`effect` is `leaves`, `snow`, `sand`, `lava`, `flicker`, or `off`.

These names are accepted too: `blossom`, `petals`, `leaf`, `flake`, `snowing`, `dust`, `wind`, `fluid`, `lamp`, `goo`, and `candle`.

`density` runs from 0.35 to 2. `wind` runs from 0 to 2.5. Both apply to the particle effects. Flicker ignores them.

## Flicker

Flicker is for dark themes. On a light theme it can stay selected, and the picture stays still.

While it is on, Mawari copies the current desktop picture into a directory under `~/.local/state/omarchy/mawari/flicker/`. Each copy is the same picture with a different candle-light profile. Only pixels whose contrast ratio to the darkest elements of the picture is at least 3:1 are re-lit. Dark areas are copied unchanged. Mawari then cycles those pictures behind the windows.

Turning flicker on lists that directory first. If the pictures are already there, they are reused and nothing is copied again. A different picture, or the same file saved again, gets its own directory.

Building the frames needs `python3` and ImageMagick 7 (`magick` on your `PATH`). The other effects do not.

## Remove

```bash
omarchy plugin remove toddv.mawari --yes
```

Frame caches under `~/.local/state/omarchy/mawari/flicker/` are left in place. Delete that directory when you want the disk space back.

## Develop

From a checkout of this repo:

```bash
omarchy plugin validate .
node test/model.test.js
```

`omarchy plugin validate` checks `manifest.json`. The test covers the effect model and the flicker frame builder. The frame builder's self-test needs `python3` and `magick`. The live probe at the end of the test reads your current Omarchy desktop picture.

## License

[MIT](LICENSE)

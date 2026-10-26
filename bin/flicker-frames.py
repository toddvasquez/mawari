#!/usr/bin/env python3
"""Build candle-flicker frames for one desktop picture.

Bright pixels are those whose WCAG contrast ratio against the dark
reference is at least --contrast. The dark reference is the relative
luminance percentile given by --dark-percentile (the darkest elements).
Each output frame re-lights only those pixels. A directory that already
holds every frame is left untouched.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

DEFAULT_GAINS = (
    1.00, 1.05, 0.96, 1.10, 1.03, 0.88, 0.76, 0.93,
    1.08, 1.16, 1.04, 0.95, 1.01, 0.86, 0.79, 0.94,
)


def frame_name(index):
    return "frame-%02d.png" % index


def luma_cut(dark, ratio):
    dark = max(0.0, min(1.0, float(dark)))
    return float(ratio) * (dark + 0.05) - 0.05


def channel_multipliers(gain):
    # Dim frames only lose light. Brighter frames pick up a little amber.
    warmth = max(0.0, min(1.0, (float(gain) - 0.92) / 0.24))
    gain = float(gain)
    return (
        gain * (1.0 + 0.06 * warmth),
        gain * (1.0 + 0.02 * warmth),
        gain * (1.0 - 0.10 * warmth),
    )


def parse_gains(text):
    gains = []
    for part in str(text or "").split(","):
        part = part.strip()
        if not part:
            continue
        gains.append(float(part))
    if not gains:
        raise RuntimeError("no flicker gains")
    return gains


def frames_ready(out_dir, count):
    for i in range(count):
        path = os.path.join(out_dir, frame_name(i))
        if not os.path.isfile(path) or os.path.getsize(path) <= 0:
            return False
    return True


def run(args, **kwargs):
    proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(err or ("command failed: " + " ".join(args[:3])))
    return proc


def sample_dark_luminance(source, percentile):
    raw = run([
        "magick", source,
        "-colorspace", "RGB",
        "-grayscale", "Rec709Luminance",
        "-filter", "Box",
        "-resize", "180x",
        "-set", "colorspace", "sRGB",
        "-depth", "8",
        "gray:-",
    ]).stdout
    if not raw:
        return 0.0
    vals = sorted(raw)
    index = int(round(float(percentile) * (len(vals) - 1)))
    index = max(0, min(len(vals) - 1, index))
    return vals[index] / 255.0


def write_copies(source, out_dir, count):
    os.makedirs(out_dir, exist_ok=True)
    for i in range(count):
        dest = os.path.join(out_dir, frame_name(i))
        shutil.copyfile(source, dest)


def build_frames(source, out_dir, contrast, percentile, gains):
    source = os.path.realpath(source)
    if not os.path.isfile(source):
        raise RuntimeError("desktop picture not found: " + source)
    count = len(gains)
    if frames_ready(out_dir, count):
        print("reused")
        return

    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        if name.startswith(".building-"):
            shutil.rmtree(os.path.join(out_dir, name), ignore_errors=True)
    work = tempfile.mkdtemp(prefix=".building-", dir=out_dir)
    try:
        dark = sample_dark_luminance(source, percentile)
        cut = luma_cut(dark, contrast)
        mask = os.path.join(work, "mask.png")
        if cut >= 1:
            write_copies(source, work, count)
        else:
            threshold = max(0.0, cut) * 100.0
            run([
                "magick", source,
                "-colorspace", "RGB",
                "-grayscale", "Rec709Luminance",
                "-threshold", "%.6f%%" % threshold,
                "-blur", "0x0.7",
                mask,
            ])
            linear = os.path.join(work, "linear.mpc")
            run(["magick", source, "-colorspace", "RGB", linear])
            for i, gain in enumerate(gains):
                red, green, blue = channel_multipliers(gain)
                relit = os.path.join(work, "relit.png")
                run([
                    "magick", linear,
                    "-channel", "R", "-evaluate", "multiply", "%.6f" % red,
                    "-channel", "G", "-evaluate", "multiply", "%.6f" % green,
                    "-channel", "B", "-evaluate", "multiply", "%.6f" % blue,
                    "+channel",
                    "-colorspace", "sRGB",
                    relit,
                ])
                run([
                    "magick", source, relit, mask, "-composite",
                    os.path.join(work, frame_name(i)),
                ])
                os.remove(relit)
        for i in range(count):
            os.replace(
                os.path.join(work, frame_name(i)),
                os.path.join(out_dir, frame_name(i)),
            )
    finally:
        shutil.rmtree(work, ignore_errors=True)
    if not frames_ready(out_dir, count):
        raise RuntimeError("flicker frames were not written")
    print("wrote")


def linear_to_srgb_u8(channel):
    if channel <= 0.0031308:
        value = 12.92 * channel
    else:
        value = 1.055 * (channel ** (1.0 / 2.4)) - 0.055
    return int(round(max(0.0, min(1.0, value)) * 255))


def read_rgb(path):
    info = run(["magick", "identify", "-format", "%w %h", path]).stdout.decode().split()
    width, height = int(info[0]), int(info[1])
    raw = run(["magick", path, "-alpha", "off", "-depth", "8", "rgb:-"]).stdout
    if len(raw) != width * height * 3:
        raise RuntimeError("unexpected pixel buffer for " + path)
    return width, height, raw


def pixel(buf, width, x, y):
    i = (y * width + x) * 3
    return buf[i], buf[i + 1], buf[i + 2]


def self_test():
    gains = parse_gains(",".join(str(g) for g in DEFAULT_GAINS))
    assert abs(luma_cut(0, 3) - 0.1) < 1e-9
    assert channel_multipliers(0.76) == (0.76, 0.76, 0.76)
    red, green, blue = channel_multipliers(1.16)
    assert abs(red - 1.2296) < 1e-9
    assert abs(green - 1.1832) < 1e-9
    assert abs(blue - 1.044) < 1e-9

    dim = linear_to_srgb_u8(0.04)
    bright = linear_to_srgb_u8(0.40)
    tmp = tempfile.mkdtemp(prefix="mawari-flicker-")
    try:
        src = os.path.join(tmp, "picture.png")
        run([
            "magick", "-size", "64x48", "xc:black",
            "-fill", "rgb(%d,%d,%d)" % (dim, dim, dim), "-draw", "rectangle 2,30 9,37",
            "-fill", "rgb(%d,%d,%d)" % (bright, bright, bright), "-draw", "rectangle 40,4 55,19",
            src,
        ])
        jpeg = os.path.join(tmp, "picture.jpg")
        run(["magick", src, jpeg])
        out = os.path.join(tmp, "frames")
        build_frames(jpeg, out, 3, 0.08, gains)
        assert frames_ready(out, len(gains))
        before = os.stat(os.path.join(out, frame_name(0))).st_mtime_ns
        build_frames(jpeg, out, 3, 0.08, gains)
        after = os.stat(os.path.join(out, frame_name(0))).st_mtime_ns
        assert before == after, "second run rewrote existing frames"

        _, _, source = read_rgb(jpeg)
        dim_frame, _, dim_buf = read_rgb(os.path.join(out, frame_name(6)))
        _, _, bright_buf = read_rgb(os.path.join(out, frame_name(9)))
        assert dim_frame == 64
        assert pixel(dim_buf, 64, 4, 4) == pixel(source, 64, 4, 4)
        assert pixel(bright_buf, 64, 4, 4) == pixel(source, 64, 4, 4)
        assert pixel(dim_buf, 64, 6, 34) == pixel(source, 64, 6, 34)
        assert pixel(bright_buf, 64, 6, 34) == pixel(source, 64, 6, 34)
        dim_px = pixel(dim_buf, 64, 48, 12)
        bright_px = pixel(bright_buf, 64, 48, 12)
        source_px = pixel(source, 64, 48, 12)
        assert sum(bright_px) > sum(dim_px), (dim_px, bright_px)
        assert bright_px != source_px
        assert dim_px != source_px
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok")


def main(argv):
    parser = argparse.ArgumentParser(description="Build candle-flicker frames for a desktop picture")
    parser.add_argument("--source")
    parser.add_argument("--out")
    parser.add_argument("--contrast", type=float, default=3)
    parser.add_argument("--dark-percentile", type=float, default=0.08)
    parser.add_argument("--gains", default=",".join(str(g) for g in DEFAULT_GAINS))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    if not args.source or not args.out:
        parser.error("--source and --out are required")
    build_frames(args.source, args.out, args.contrast, args.dark_percentile, parse_gains(args.gains))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

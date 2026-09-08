"""Package recorded UI frames as a GIF and a static preview (requires Pillow)."""

import argparse
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "media"
OUTPUT.mkdir(exist_ok=True)
FONT = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 17)
SIZE = (1280, 800)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--wallpaper", type=Path, help="Background image; defaults to the current Windows wallpaper")
args = parser.parse_args()
wallpaper = args.wallpaper
if wallpaper is None:
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop") as key:
        wallpaper = Path(os.path.expandvars(winreg.QueryValueEx(key, "WallPaper")[0]))
if not wallpaper.is_file():
    parser.error("Wallpaper image not found. Supply its path with --wallpaper.")
with Image.open(wallpaper) as original:
    background = ImageOps.fit(original.convert("RGB"), SIZE, Image.Resampling.LANCZOS)

LABELS = {
    "en": {"search": "01  Search your Markdown", "preview": "02  Preview the PDF", "export": "03  Export a local copy"},
    "zh": {"search": "01  搜索 Markdown", "preview": "02  预览 PDF", "export": "03  导出到本机"},
}

for language in ("en", "zh"):
    source = ROOT / "artifacts" / "readme-demo" / language
    recording = json.loads((source / "frames.json").read_text(encoding="utf-8"))
    entries = recording["frames"]
    # Older recordings used a 10 CSS-pixel radius at 125% Windows scaling.
    corner_radius = recording.get("cornerRadius", 12.5)
    sizes = []
    for entry in entries:
        with Image.open(source / entry["file"]) as screenshot:
            sizes.append(screenshot.size)
    scale = min(900 / max(width for width, height in sizes), 720 / max(height for width, height in sizes))
    frames = []
    durations = []
    poster = None
    for index, entry in enumerate(entries):
        with Image.open(source / entry["file"]) as original:
            screenshot = original.convert("RGB")
        screenshot = screenshot.resize((round(screenshot.width * scale), round(screenshot.height * scale)), Image.Resampling.LANCZOS)
        # capturePage omits the native window's rounded clipping. Restore it
        # with an antialiased mask so the wallpaper shows through the corners.
        mask = Image.new("L", (screenshot.width * 4, screenshot.height * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, mask.width - 1, mask.height - 1),
            radius=corner_radius * scale * 4,
            fill=255,
        )
        mask = mask.resize(screenshot.size, Image.Resampling.LANCZOS)
        # Only the wallpaper file and captured app window are composited here.
        # No desktop capture means no taskbar, clock or unrelated windows.
        frame = background.copy()
        draw = ImageDraw.Draw(frame)
        draw.text((30, 17), LABELS[language][entry["stage"]], fill="#30343b", font=FONT)
        draw.text((SIZE[0] - 180, 17), "印页 · Inkleaf", fill="#30343b", font=FONT)
        y = 56 if screenshot.height > 400 else round(SIZE[1] * 0.16)
        frame.paste(screenshot, ((SIZE[0] - screenshot.width) // 2, y), mask)
        frames.append(frame)
        end = entries[index + 1]["at"] if index + 1 < len(entries) else recording["duration"]
        durations.append(max(20, round((end - entry["at"]) / 10) * 10))
        # The recorder marks a fully rendered frame before following the link.
        if entry["file"] == recording["posterFile"]:
            poster = frame.copy()

    # One palette avoids flickering colours and lets GIF store unchanged regions.
    palette_source = Image.new("RGB", (320, 200 * 4))
    for row, fraction in enumerate((0.1, 0.3, 0.55, 0.95)):
        palette_source.paste(frames[int(len(frames) * fraction)].resize((320, 200)), (0, row * 200))
    palette = palette_source.quantize(colors=256)
    encoded = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    target = OUTPUT / f"demo-{language}.gif"
    encoded[0].save(target, save_all=True, append_images=encoded[1:], duration=durations, loop=0, optimize=True, disposal=1)
    (poster or frames[-1]).save(OUTPUT / f"demo-{language}.png", optimize=True)
    with Image.open(target) as gif:
        total = 0
        for index in range(gif.n_frames):
            gif.seek(index)
            total += gif.info.get("duration", 0)
        print(f"{target.name}: {gif.n_frames} frames, {total / 1000:.2f}s, {target.stat().st_size / 1024:.0f} KiB")

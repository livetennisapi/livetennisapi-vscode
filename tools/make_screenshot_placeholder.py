#!/usr/bin/env python3
"""Generate media/screenshot.png — a labelled PLACEHOLDER, not a real screenshot.

It exists so the README image link resolves and `vsce package` succeeds. It is
deliberately marked as a placeholder so nobody mistakes it for a capture of the
running extension. Replace it with a real screenshot before publishing.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 320
BG = (30, 30, 30, 255)
BAR = (0, 122, 204, 255)
TEXT = (220, 220, 220, 255)
MUTED = (150, 150, 150, 255)


def font(size, bold=False):
    for name in (
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


img = Image.new("RGBA", (W, H), BG)
d = ImageDraw.Draw(img)

d.text((40, 46), "SCREENSHOT PLACEHOLDER", font=font(38, True), fill=(230, 180, 80, 255))
d.text((40, 100), "Replace media/screenshot.png with a real capture before publishing.",
       font=font(22), fill=MUTED)
d.text((40, 140), "This image was generated, not captured from a running editor.",
       font=font(22), fill=MUTED)

# Mock of the status bar strip at the bottom, as the item would appear.
d.rectangle([0, H - 46, W, H], fill=BAR)
d.text((W - 340, H - 36), "\U0001F3BE Alcaraz . 6-3 6-5 Sinner",
       font=font(21), fill=(255, 255, 255, 255))

out = Path(__file__).resolve().parent.parent / "media" / "screenshot.png"
img.convert("RGB").save(out, "PNG", optimize=True)
print(f"wrote {out}")

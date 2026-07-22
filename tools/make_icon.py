#!/usr/bin/env python3
"""Generate media/icon.png — a 128x128 tennis ball on the gallery-banner green.

Drawn at 8x and downsampled with LANCZOS, which is how we get clean antialiased
edges out of PIL's hard-edged primitives.
"""
from pathlib import Path

from PIL import Image, ImageDraw

S = 8
SIZE = 128 * S
BG = (11, 61, 46, 255)        # #0B3D2E, matches galleryBanner.color
BALL = (203, 226, 62, 255)    # optic yellow
SEAM = (245, 249, 232, 255)

img = Image.new("RGBA", (SIZE, SIZE), BG)
d = ImageDraw.Draw(img)

pad = 10 * S
ball_box = [pad, pad, SIZE - pad, SIZE - pad]
d.ellipse(ball_box, fill=BALL)

# Two seams, drawn on their own layer and then clipped to the ball: PIL's arc
# has no clip region, so an unmasked seam spills onto the background.
seams = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ds = ImageDraw.Draw(seams)
seam_w = 6 * S
bulge = 30 * S

# Each arc is a tall ellipse centred just outside one edge of the ball; the
# visible slice curving through the ball is the seam.
ds.arc([pad - bulge, pad, pad + bulge, SIZE - pad], start=270, end=90,
       fill=SEAM, width=seam_w)
ds.arc([SIZE - pad - bulge, pad, SIZE - pad + bulge, SIZE - pad], start=90,
       end=270, fill=SEAM, width=seam_w)

# Mask = the ball, shrunk a touch so seams stop cleanly inside the rim.
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).ellipse([c + (1 * S if i < 2 else -1 * S)
                              for i, c in enumerate(ball_box)], fill=255)
img.paste(seams, (0, 0), Image.composite(
    seams.split()[3], Image.new("L", (SIZE, SIZE), 0), mask))

out = Path(__file__).resolve().parent.parent / "media" / "icon.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.resize((128, 128), Image.LANCZOS).save(out, "PNG", optimize=True)
print(f"wrote {out}")

#!/usr/bin/env python3
"""Generate the LocalShare app icon set from the brand palette.

Renders a rounded-square badge with the radar motif (concentric rings + core)
and writes the PNGs each platform packager needs. Run:

    python3 tools/make_icons.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "assets", "icon")

BACKGROUND = (11, 16, 32, 255)      # AppColors.background
SURFACE = (20, 27, 46, 255)         # AppColors.surface
ACCENT = (79, 195, 247, 255)        # AppColors.accent
ACCENT_DEEP = (41, 121, 255, 255)   # AppColors.accentDeep


def render(size: int) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background.
    radius = int(s * 0.22)
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BACKGROUND)
    inner = int(s * 0.06)
    draw.rounded_rectangle(
        [inner, inner, s - 1 - inner, s - 1 - inner],
        radius=radius - inner // 2,
        fill=SURFACE,
    )

    cx = cy = s / 2
    # Concentric radar rings.
    for factor, alpha in ((0.40, 90), (0.30, 120), (0.20, 160)):
        r = s * factor
        ring = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        rd.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=ACCENT[:3] + (alpha,),
            width=int(s * 0.018),
        )
        img = Image.alpha_composite(img, ring)

    # Glowing core.
    core_r = s * 0.11
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(int(core_r), 0, -max(1, int(core_r / 20))):
        a = int(200 * (1 - i / core_r))
        gd.ellipse([cx - i, cy - i, cx + i, cy + i], fill=ACCENT_DEEP[:3] + (a,))
    img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=ACCENT)
    ring_w = int(s * 0.02)
    draw.ellipse(
        [cx - core_r, cy - core_r, cx + core_r, cy + core_r],
        outline=BACKGROUND,
        width=ring_w,
    )

    # A single sweep wedge, for the radar feel.
    wedge = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wedge)
    wd.pieslice([cx - s * 0.44, cy - s * 0.44, cx + s * 0.44, cy + s * 0.44], -90, -35, fill=ACCENT[:3] + (70,))
    img = Image.alpha_composite(img, wedge)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)
    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        render(size).save(os.path.join(ICON_DIR, f"localshare_{size}.png"))
    # Multi-resolution ICO for Windows.
    render(256).save(
        os.path.join(ICON_DIR, "localshare.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    # 1024 master, used for the macOS .iconset.
    render(1024).save(os.path.join(ICON_DIR, "localshare_1024.png"))
    print(f"wrote icons to {ICON_DIR}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate the desktop application icon.

    python tools/make_icon.py

The mark is the decision axis, which is what the console is actually about:
a probability distribution split by a threshold. Mint bars sit below the
attack threshold, coral bars above it, and a bone detent marks the line.

Drawn at 1024 and downsampled, so the small sizes stay legible. Writes a
multi-resolution build/icon.ico for electron-builder.
"""

from pathlib import Path

from PIL import Image, ImageDraw

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "build" / "icon.ico"

# Palette lifted from src/index.css so the icon matches the app.
GROUND = (14, 28, 33, 255)
RULE = (43, 87, 99, 255)
BENIGN = (79, 216, 178, 255)
ATTACK = (255, 110, 78, 255)
BONE = (236, 230, 216, 255)

SIZE = 1024

# Bar heights as fractions of the plot height, left to right. Shaped like a
# real distribution: a benign mass, a thin middle, an attack cluster.
BARS = [
    (0.22, BENIGN), (0.46, BENIGN), (0.78, BENIGN), (0.55, BENIGN),
    (0.30, BENIGN), (0.16, BENIGN),
    (0.20, ATTACK), (0.42, ATTACK), (0.72, ATTACK), (0.34, ATTACK),
]

# Where the threshold sits, as a fraction across the plot.
DETENT = 0.6


def rounded_background(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=int(size * 0.22),
        fill=GROUND,
    )
    return image, draw


def draw_icon(size):
    image, draw = rounded_background(size)

    pad_x = size * 0.13
    plot_width = size - pad_x * 2
    baseline = size * 0.78
    plot_height = size * 0.52

    # The detent starts just above the tallest bar. Any higher and the stalk
    # leaves dead space that reads as a mis-centred mark at small sizes.
    tallest = max(fraction for fraction, _ in BARS)
    detent_top = baseline - plot_height * tallest - size * 0.10

    # Baseline
    draw.rounded_rectangle(
        [(pad_x, baseline), (pad_x + plot_width, baseline + size * 0.018)],
        radius=size * 0.009,
        fill=RULE,
    )

    # Histogram
    slot = plot_width / len(BARS)
    bar_width = slot * 0.66
    gap = (slot - bar_width) / 2

    for index, (fraction, colour) in enumerate(BARS):
        left = pad_x + index * slot + gap
        height = plot_height * fraction
        draw.rounded_rectangle(
            [(left, baseline - height), (left + bar_width, baseline)],
            radius=bar_width * 0.3,
            fill=colour,
        )

    # Threshold detent, drawn over the bars so the split reads immediately.
    detent_x = pad_x + plot_width * DETENT
    width = size * 0.022
    draw.rounded_rectangle(
        [
            (detent_x - width / 2, detent_top),
            (detent_x + width / 2, baseline + size * 0.018),
        ],
        radius=width / 2,
        fill=BONE,
    )
    # Cap, echoing the live cursor in the app.
    draw.ellipse(
        [
            (detent_x - width * 1.6, detent_top - width * 1.6),
            (detent_x + width * 1.6, detent_top + width * 1.6),
        ],
        fill=BONE,
    )

    return image


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)

    master = draw_icon(SIZE)

    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [master.resize((s, s), Image.LANCZOS) for s in sizes]

    frames[-1].save(OUT, format="ICO", sizes=[(s, s) for s in sizes])

    # A PNG alongside is handy for READMEs and non-Windows packaging.
    master.resize((512, 512), Image.LANCZOS).save(OUT.with_suffix(".png"))

    print(f"wrote {OUT} ({', '.join(f'{s}x{s}' for s in sizes)})")
    print(f"wrote {OUT.with_suffix('.png')}")


if __name__ == "__main__":
    main()

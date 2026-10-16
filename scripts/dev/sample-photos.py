#!/usr/bin/env python3
"""Write deterministic sample photos for the dev seed and smoke scripts (E1-S10).

Usage:
    sample-photos.py --count N --out DIR

Writes `sample-01.png` … `sample-NN.png` into DIR and prints a JSON manifest to stdout:
one `{"path": …, "hex": "#rrggbb"}` per photo — the path the seed scripts upload, the hex
the dump uses as its aura. Progress goes to stderr, so stdout stays machine-readable.

The images are generated with the standard library alone (`zlib`, `struct`, `colorsys`):
the repository stays free of an image dependency, and the backend's upload path — magic
bytes, declared type, size — is exactly what validates these PNGs. No randomness: the same
arguments produce the same bytes on any machine, so a re-run is a no-op for the demo.

Each sample is a 96×64 vertical gradient with its own hue — every fourth one grayscale —
over a charcoal floor band, so the archive has something with an actual dominant colour for
the palette extraction of the frontend to find.
"""

import argparse
import colorsys
import json
import pathlib
import struct
import sys
import zlib

WIDTH = 96
HEIGHT = 64
FLOOR_PIXELS = 14
FLOOR = (38, 38, 38)  # #262626, the charcoal the frontend design is built on


def hsv(hue: float, saturation: float, value: float) -> tuple[int, int, int]:
    """A color from hue (degrees), saturation and value (0–1)."""
    red, green, blue = colorsys.hsv_to_rgb((hue % 360) / 360, saturation, value)
    return (round(red * 255), round(green * 255), round(blue * 255))


def mix(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    """Linear blend from start to end at t in [0, 1]."""
    return tuple(round(a + (b - a) * t) for a, b in zip(start, end))


def chunk(kind: bytes, payload: bytes) -> bytes:
    """One PNG chunk: length, type, payload, CRC over type and payload."""
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def png_bytes(rows: list[bytes]) -> bytes:
    """A complete 8-bit RGB PNG from scanlines (filter byte first, as the format wants)."""
    raw = b"".join(rows)
    header = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def sample(index: int, count: int) -> tuple[tuple[int, int, int], bytes]:
    """One sample: (its top colour, the PNG bytes). Distinct hue per index; grey every fourth."""
    hue = index * 360.0 / count
    grey = index % 4 == 3
    top = hsv(hue, 0.0 if grey else 0.55, 0.92)
    bottom = hsv(hue + 28, 0.0 if grey else 0.68, 0.34)
    rows = []
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        pixel = FLOOR if y >= HEIGHT - FLOOR_PIXELS else mix(top, bottom, t)
        rows.append(b"\x00" + bytes(channel for _ in range(WIDTH) for channel in pixel))
    return top, png_bytes(rows)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Write deterministic sample photos (PNG) for the dev seed and smoke scripts."
    )
    parser.add_argument("--count", type=int, default=12, help="how many photos to write (default 12)")
    parser.add_argument("--out", required=True, help="directory the sample-NN.png files go into")
    args = parser.parse_args()

    if args.count < 1:
        parser.error("--count must be at least 1")

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    print(f"Writing {args.count} sample photos ({WIDTH}x{HEIGHT} PNG) to {out}", file=sys.stderr)

    manifest = []
    for index in range(args.count):
        top, data = sample(index, args.count)
        path = out / f"sample-{index + 1:02d}.png"
        path.write_bytes(data)
        manifest.append({"path": str(path), "hex": "#%02x%02x%02x" % top})

    print(json.dumps(manifest))
    return 0


if __name__ == "__main__":
    sys.exit(main())

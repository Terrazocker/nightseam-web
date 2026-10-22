"""Redraw the planner's install icons (web/icon-*.png) as clean vector art.

Usage: python scripts/make_app_icons.py web   (needs Pillow; not a build step:
the icons are committed, rerun only to change them)
"""
import random, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
S = 2048  # supersampled canvas

def star(draw, cx, cy, r, waist, fill):
    # four-point star: tips at r, concave waist points at `waist`
    import math
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else waist
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    draw.polygon(pts, fill=fill)

def render(maskable):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # vertical gradient background
    bg = Image.new('RGBA', (S, S))
    top, bottom = (0x14, 0x19, 0x27), (0x26, 0x34, 0x5c)
    px = bg.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(S):
            px[x, y] = c
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable:
        md.rectangle([0, 0, S, S], fill=255)
    else:
        m = round(S * 0.02)
        md.rounded_rectangle([m, m, S - m, S - m], radius=round(S * 0.2), fill=255)
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    # content scale: maskable art must sit inside the central 80% safe zone
    k = 0.72 if maskable else 1.0
    c0 = S / 2
    def p(x, y):  # icon units (0..1) -> pixels, scaled about the centre
        return c0 + (x - 0.5) * S * k, c0 + (y - 0.5) * S * k
    rnd = random.Random(7)
    for _ in range(46):
        x, y = rnd.uniform(0.08, 0.92), rnd.uniform(0.08, 0.92)
        if abs(x - 0.5) < 0.2 and abs(y - 0.5) < 0.2:
            continue
        r = rnd.choice([5, 7, 9, 12]) * k
        cx, cy = p(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(231, 236, 232, rnd.choice([170, 210, 255])))
    cx, cy = p(0.49, 0.5)
    star(d, cx, cy, S * 0.36 * k, S * 0.07 * k, (249, 200, 93, 255))
    cx, cy = p(0.77, 0.27)
    star(d, cx, cy, S * 0.11 * k, S * 0.025 * k, (236, 240, 252, 255))
    return img

for maskable, name in ((False, 'icon'), (True, 'icon-maskable')):
    big = render(maskable)
    for size in (192, 512):
        big.resize((size, size), Image.LANCZOS).save(f'{OUT}/{name}-{size}.png', optimize=True)

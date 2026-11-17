#!/usr/bin/env python3
"""GlyphMark-Solo icon: teal rounded square, white orthogonal tree spine+branches,
one amber 4-point sparkle at the end of the top branch. Drawn at 4x, downscaled."""
from PIL import Image, ImageDraw

S = 4  # supersample
W = 512 * S
TEAL = (13, 143, 159, 255)      # #0D8F9F
WHITE = (255, 255, 255, 255)
AMBER = (232, 179, 61, 255)     # #E8B33D

img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def u(v):
    return v * S

# Background: rounded square, corner radius ~22% of 512 = 113
d.rounded_rectangle([0, 0, W - 1, W - 1], radius=u(113), fill=TEAL)

LW = u(30)  # line width

def bar(x1, y1, x2, y2):
    d.line([u(x1), u(y1), u(x2), u(y2)], fill=WHITE, width=LW)
    for (x, y) in [(x1, y1), (x2, y2)]:
        r = LW / 2
        d.ellipse([u(x) - r, u(y) - r, u(x) + r, u(y) + r], fill=WHITE)

# Spine (vertical)
bar(150, 118, 150, 394)
# Branches (horizontal), top branch ends where the sparkle sits
bar(150, 150, 330, 150)
bar(150, 256, 372, 256)
bar(150, 362, 292, 362)

# Amber 4-point sparkle centered at (392, 150)
cx, cy, R, r = u(392), u(150), u(52), u(15)
pts = [
    (cx, cy - R), (cx + r, cy - r), (cx + R, cy), (cx + r, cy + r),
    (cx, cy + R), (cx - r, cy + r), (cx - R, cy), (cx - r, cy - r),
]
d.polygon(pts, fill=AMBER)

img = img.resize((512, 512), Image.LANCZOS)
img.save('/home/hatch/workspace/projects/GlyphMark-Solo/icon.png')
print('saved icon.png', img.size)

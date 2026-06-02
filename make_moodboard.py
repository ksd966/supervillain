#!/usr/bin/env python3
"""Caffe Goga 2020 - Coffee House Premium moodboard (Koncept 1: Topli Cognac)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1754
FONTS = "/mnt/skills/examples/canvas-design/canvas-fonts"

def font(name, size):
    return ImageFont.truetype(f"{FONTS}/{name}", size)

serif_b   = lambda s: font("CrimsonPro-Bold.ttf", s)
sans_b    = lambda s: font("InstrumentSans-Bold.ttf", s)
sans_r    = lambda s: font("InstrumentSans-Regular.ttf", s)
mono_b    = lambda s: font("JetBrainsMono-Bold.ttf", s)

GOLD   = (201, 162, 75)
CREAM  = (239, 230, 214)
MUTED  = (176, 162, 142)

img = Image.new("RGB", (W, H))
dr = ImageDraw.Draw(img)

# vertical espresso gradient background
top, bot = (33, 28, 23), (44, 37, 30)
for y in range(H):
    t = y / H
    dr.line([(0, y), (W, y)],
            fill=tuple(int(top[i] + (bot[i]-top[i])*t) for i in range(3)))

def tracked(draw, xy, text, fnt, fill, track=0, anchor_center=None):
    """Draw text with letter-spacing. If anchor_center given, center on that x."""
    widths = [draw.textlength(c, font=fnt) for c in text]
    total = sum(widths) + track*(len(text)-1)
    x = (anchor_center - total/2) if anchor_center is not None else xy[0]
    y = xy[1]
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=fnt, fill=fill)
        x += w + track
    return total

def center(draw, cx, y, text, fnt, fill):
    w = draw.textlength(text, font=fnt)
    draw.text((cx - w/2, y), text, font=fnt, fill=fill)

cx = W // 2

# ---- header ----
tracked(dr, (0, 86), "CAFFE GOGA 2020", serif_b(78), GOLD, track=6, anchor_center=cx)
center(dr, cx, 188, "COFFEE HOUSE  ·  PREMIUM", sans_b(30), CREAM)
# gold rule
dr.line([(cx-230, 246), (cx+230, 246)], fill=GOLD, width=2)
center(dr, cx, 268, "Predlog boja — ulaz & terasa", sans_r(26), MUTED)
center(dr, cx, 318, "Koncept 1 · Topli Cognac", sans_b(34), CREAM)

# ---- swatch cards ----
swatches = [
    ("ZIDOVI",              "Greige / Taupe",  "#B8A894", (184,168,148)),
    ("GARNITURE · ratan",   "Konjak",          "#9C6B3F", (156,107,63)),
    ("JASTUCI",             "Krem",            "#EFE6D6", (239,230,214)),
    ("STOLOVI",             "Hrast",           "#7A5230", (122,82,48)),
    ("STAKLA · natpis",     "Zlato",           "#C9A24B", (201,162,75)),
    ("ZARDINJERE · tenda",  "Antracit",        "#2C2E30", (44,46,48)),
]

mL, gap = 80, 36
cols = 2
cw = (W - 2*mL - gap*(cols-1)) // cols
ch = 360
y0 = 380
bar = 104  # dark label bar height

for i, (name, tone, hexv, rgb) in enumerate(swatches):
    r, c = divmod(i, cols)
    x = mL + c*(cw+gap)
    y = y0 + r*(ch+gap)
    # color block
    dr.rounded_rectangle([x, y, x+cw, y+ch], radius=22, fill=rgb)
    # subtle inner border for light swatches
    dr.rounded_rectangle([x, y, x+cw, y+ch], radius=22, outline=(0,0,0), width=1)
    # dark label bar at bottom
    by = y + ch - bar
    dr.rectangle([x, by, x+cw, y+ch-22], fill=(26,22,18))
    dr.rounded_rectangle([x, by, x+cw, y+ch], radius=22, fill=(26,22,18))
    dr.rectangle([x, by, x+cw, by+30], fill=(26,22,18))
    # labels
    dr.text((x+26, by+18), name, font=sans_b(27), fill=CREAM)
    dr.text((x+26, by+54), tone, font=sans_r(23), fill=MUTED)
    hw = dr.textlength(hexv, font=mono_b(26))
    dr.text((x+cw-26-hw, by+38), hexv, font=mono_b(26), fill=GOLD)

# ---- footer notes ----
fy = y0 + 3*ch + 2*gap + 26
dr.line([(mL, fy), (W-mL, fy)], fill=(78,66,52), width=1)
notes = [
    "Ulaz: dvokrilna staklena vrata, tanki antracit profili — natpis u zlatu, centriran",
    "Zardinjere (antracit) simetrično levo i desno — uokviruju ulaz kao kapiju",
    "Tenda bez boje — tamni metalni ram ostaje vidljiv",
    "Izlozi brendirani: „Caffe Goga 2020“ u zlatu  ·  toplo svetlo 2700K iznutra",
]
ty = fy + 26
for n in notes:
    dr.text((mL+18, ty), "•", font=sans_b(24), fill=GOLD)
    dr.text((mL+44, ty), n, font=sans_r(24), fill=CREAM)
    ty += 42

img.save("/home/user/supervillain/goga_moodboard.png", "PNG")
print("saved goga_moodboard.png", img.size)

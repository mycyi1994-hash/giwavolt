#!/usr/bin/env python3
"""Shared brand kit for the VOLT decks — palette, fonts and drawing primitives.

Imported by volt_deck.py (introduction) and volt_ir_deck.py (investor). Both
decks are hand-drawn with reportlab so they match the app's neon/cyberpunk
look exactly rather than approximating it in a template.

Fonts (gitignored). Regenerate once:
  mkdir -p game/docs/fonts && cd game/docs/fonts
  curl -fsSL -o PretendardVariable.ttf \
    https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/public/variable/PretendardVariable.ttf
  python3 - <<EOF
from fontTools import ttLib
from fontTools.varLib.instancer import instantiateVariableFont
for n,w in [("Medium",500),("Bold",700),("ExtraBold",800),("Black",900)]:
    f=ttLib.TTFont("PretendardVariable.ttf"); instantiateVariableFont(f,{"wght":w},inplace=True); f.save(f"Pretendard-{n}.ttf")
EOF
Then: pip install reportlab && python3 game/docs/<deck>.py
"""
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color

W, H = 1280, 720  # 16:9 slide

# ---- brand palette -------------------------------------------------------
BG     = HexColor("#06060e")
INK    = HexColor("#0c0c18")
INK2   = HexColor("#11111f")
LINE   = HexColor("#22243a")
CYAN   = HexColor("#00e5ff")
MAGENTA= HexColor("#ff2bd6")
LIME   = HexColor("#39ff14")
GOLD   = HexColor("#ffd23f")
TXT    = HexColor("#e9f3ff")
MUT    = HexColor("#8b93b8")
FAINT  = HexColor("#5b6082")

# ---- fonts (Pretendard) --------------------------------------------------
import os
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
_FD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
pdfmetrics.registerFont(TTFont("Pretendard",    _FD + "/Pretendard-Medium.ttf"))
pdfmetrics.registerFont(TTFont("Pretendard-B",  _FD + "/Pretendard-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Pretendard-XB", _FD + "/Pretendard-ExtraBold.ttf"))
pdfmetrics.registerFont(TTFont("Pretendard-BK", _FD + "/Pretendard-Black.ttf"))
pdfmetrics.registerFont(TTFont("Mono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"))
FR  = "Pretendard"     # body
FB  = "Pretendard-B"   # bold — headings, labels
FX  = "Pretendard-XB"  # titles
FBK = "Pretendard-BK"  # display / wordmark
FM  = "Mono"           # formula

def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t):
    return Color(lerp(c1.red,c2.red,t), lerp(c1.green,c2.green,t), lerp(c1.blue,c2.blue,t))

def hgrad(c, x, y, w, h, c1, c2, steps=200, vertical=False):
    if vertical:
        sh = h/steps
        for i in range(steps):
            c.setFillColor(mix(c1,c2,i/(steps-1))); c.rect(x, y+i*sh, w, sh+1, stroke=0, fill=1)
    else:
        sw = w/steps
        for i in range(steps):
            c.setFillColor(mix(c1,c2,i/(steps-1))); c.rect(x+i*sw, y, sw+1, h, stroke=0, fill=1)

def rings(c, cx, cy, col, r0=130, n=7, gap=78, alpha=0.12):
    c.setStrokeColor(col)
    for i in range(n):
        c.setStrokeAlpha(alpha*(1 - i/(n+1))); c.setLineWidth(1.1)
        c.circle(cx, cy, r0+i*gap, stroke=1, fill=0)
    c.setStrokeAlpha(1)

def bg(c, c1=CYAN, c2=MAGENTA):
    c.setFillColor(BG); c.rect(0,0,W,H, fill=1, stroke=0)
    rings(c, W+30, H+40, c1)
    rings(c, -30, -40, c2)
    # faint dot grid
    c.setFillColor(HexColor("#ffffff")); c.setFillAlpha(0.035)
    gx = 30
    while gx < W:
        gy = 30
        while gy < H:
            c.circle(gx, gy, 0.8, stroke=0, fill=1); gy += 30
        gx += 30
    c.setFillAlpha(1)

def tracked(c, x, y, s, font, size, col, track=2.0, align="l"):
    # draw char-by-char (no text object → no canvas char-space leak)
    c.setFont(font, size); c.setFillColor(col)
    ws = [c.stringWidth(ch, font, size) for ch in s]
    total = sum(ws) + track*(len(s)-1)
    if align == "c": x -= total/2
    elif align == "r": x -= total
    cx = x
    for ch, w in zip(s, ws):
        c.drawString(cx, y, ch); cx += w + track
    return total

def bolt(c, x, y, s, col):
    # stylized lightning bolt, height ~s
    pts = [(0.55,1.0),(0.0,0.42),(0.34,0.42),(0.18,0.0),(0.78,0.62),(0.42,0.62)]
    p = c.beginPath(); p.moveTo(x+pts[0][0]*s, y+pts[0][1]*s)
    for px,py in pts[1:]: p.lineTo(x+px*s, y+py*s)
    p.close(); c.setFillColor(col); c.drawPath(p, stroke=0, fill=1)

def wordmark(c, x, y, size=30, withbolt=True):
    if withbolt:
        bolt(c, x, y-2, size*0.92, CYAN); x += size*0.95
    tracked(c, x, y, "VOLT", FB, size, TXT, track=size*0.12)

def chip(c, x, y, label, col=CYAN, pad=12, size=11):
    w = c.stringWidth(label, FB, size) + pad*2
    c.setStrokeColor(col); c.setLineWidth(1); c.setFillColor(INK2)
    c.roundRect(x, y, w, 26, 6, stroke=1, fill=1)
    c.setFont(FB, size); c.setFillColor(col)
    c.drawCentredString(x+w/2, y+8.5, label)
    return w

def kicker(c, x, y, text, col=CYAN):
    c.setFillColor(col); c.rect(x, y, 22, 3, fill=1, stroke=0)
    tracked(c, x+32, y-4, text.upper(), FB, 12, col, track=3)

def title(c, x, y, text, size=42):
    c.setFont(FX, size); c.setFillColor(TXT); c.drawString(x, y, text)

def para(c, x, y, lines, size=15, col=MUT, lead=22, font=FR):
    c.setFont(font, size); c.setFillColor(col)
    for i, ln in enumerate(lines): c.drawString(x, y-i*lead, ln)

def wrap(c, text, font, size, maxw):
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) <= maxw: cur = t
        else:
            if cur: out.append(cur)
            cur = w
    if cur: out.append(cur)
    return out

def para_w(c, x, y, text, maxw, size=14, col=MUT, lead=20, font=FR):
    para(c, x, y, wrap(c, text, font, size, maxw), size, col, lead, font)

def footer(c, n):
    c.setStrokeColor(LINE); c.setLineWidth(1); c.line(70, 54, W-70, 54)
    wordmark(c, 70, 32, 15)
    c.setFont(FR, 10); c.setFillColor(FAINT)
    c.drawCentredString(W/2, 35, "On-chain crypto arcade  ·  Giwa Sepolia")
    c.setFont(FB, 10); c.setFillColor(FAINT)
    c.drawRightString(W-70, 35, f"{n:02d}")

def card(c, x, y, w, h, accent=CYAN, fill=INK):
    c.setFillColor(fill); c.setStrokeColor(LINE); c.setLineWidth(1)
    c.roundRect(x, y, w, h, 10, stroke=1, fill=1)
    c.setFillColor(accent); c.roundRect(x+14, y+h-6, 34, 3, 1.5, stroke=0, fill=1)

def arrow(c, x1, y, x2, col=FAINT):
    c.setStrokeColor(col); c.setLineWidth(1.4); c.line(x1, y, x2-7, y)
    p = c.beginPath(); p.moveTo(x2, y); p.lineTo(x2-8, y+4); p.lineTo(x2-8, y-4); p.close()
    c.setFillColor(col); c.drawPath(p, stroke=0, fill=1)


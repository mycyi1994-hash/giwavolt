#!/usr/bin/env python3
"""VOLT — on-chain crypto arcade. Introduction deck (English) → PDF.
Hand-drawn with reportlab to match the app's neon/cyberpunk brand.

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
Then: pip install reportlab && python3 game/docs/volt_deck.py
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

# =========================================================================
c = canvas.Canvas("/home/user/ProjectGIWA/VOLT-Introduction.pdf", pagesize=(W, H))

# ---- 1. COVER -----------------------------------------------------------
bg(c)
hgrad(c, 0, H-6, W, 6, CYAN, MAGENTA)
bolt(c, W/2-150, H/2-10, 120, CYAN)
tracked(c, W/2-10, H/2+30, "VOLT", FBK, 116, TXT, track=14)
tracked(c, W/2, H/2-30, "ON-CHAIN CRYPTO ARCADE", FB, 22, CYAN, track=8, align="c")
c.setFont(FR, 18); c.setFillColor(MUT)
c.drawCentredString(W/2, H/2-95, "Real games.  No-signature play.  Provably fair.")
chipx = W/2 - 150
c.setFillColor(FAINT); c.setFont(FB, 12)
tracked(c, W/2, 70, "BUILT ON GIWA SEPOLIA   ·   TESTNET LIVE", FB, 12, FAINT, track=3, align="c")
c.showPage()

# ---- 2. WHAT IS VOLT ----------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Overview")
title(c, 70, H-150, "What is VOLT?")
para(c, 70, H-195, [
    "A neon crypto arcade where you play fast price-action games for real",
    "on-chain stakes — without signing a wallet popup on every bet.",
], size=18, col=TXT, lead=27)
pillars = [
    ("On-chain custody", CYAN, ["Funds sit in an auditable", "vault contract — not a", "company's hot wallet."]),
    ("No-popup play", MAGENTA, ["Deposit once, then play", "instantly. Zero wallet", "signatures per bet."]),
    ("Provably fair", LIME, ["Every outcome is verifiable", "and the house edge is", "transparent, checkable math."]),
]
cw, gap = 350, 30; x0 = 70; y0 = 150
for i,(t_,col,lines) in enumerate(pillars):
    x = x0 + i*(cw+gap)
    card(c, x, y0, cw, 220, col)
    c.setFont(FB, 21); c.setFillColor(TXT); c.drawString(x+26, y0+160, t_)
    para(c, x+26, y0+125, lines, size=14, col=MUT, lead=22)
footer(c, 2)
c.showPage()

# ---- 3. THE GAMES -------------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Product", MAGENTA)
title(c, 70, H-150, "Two games, one balance")
games = [
    ("Tap Trading", CYAN, "Tap cells on the live BTC price grid. The line is the real exchange tick series, and every multiplier is fair odds on its measured volatility, minus the house edge. If the price lands in your cell, win stake × multiplier."),
    ("Death Fun", MAGENTA, "Flip safe tiles for a rising multiplier; cash out before you hit a skull. Provably-fair commit-reveal RNG."),
]
cw, ch, gap = 540, 230, 28; x0, y = 70, 250
for i,(t_,col,desc) in enumerate(games):
    x = x0 + i*(cw+gap)
    card(c, x, y, cw, ch, col)
    c.setFont(FB, 22); c.setFillColor(col); c.drawString(x+26, y+ch-46, t_)
    para_w(c, x+26, y+ch-82, desc, cw-52, size=13.5, col=MUT, lead=21)
footer(c, 3)
c.showPage()

# ---- 4. HOW YOU PLAY ----------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Experience")
title(c, 70, H-150, "Play in four steps")
steps = [
    ("01", "Connect", "wallet — no signature", CYAN),
    ("02", "Fund", "claim test KRW or deposit", LIME),
    ("03", "Play", "any game — no popups", MAGENTA),
    ("04", "Withdraw", "real tKRW to your wallet", GOLD),
]
bw, gap = 250, 40; x0, y = 70, 300
for i,(num,t_,sub,col) in enumerate(steps):
    x = x0 + i*(bw+gap)
    card(c, x, y, bw, 150, col)
    tracked(c, x+26, y+108, num, FB, 30, col, track=2)
    c.setFont(FB, 19); c.setFillColor(TXT); c.drawString(x+26, y+62, t_)
    para(c, x+26, y+36, [sub], size=12.5, col=MUT)
    if i < 3: arrow(c, x+bw+8, y+75, x+bw+gap-8, col=FAINT)
c.setFillColor(INK2); c.setStrokeColor(LINE); c.roundRect(70, 175, W-140, 56, 8, stroke=1, fill=1)
c.setFont(FB, 15); c.setFillColor(CYAN); c.drawString(96, 197, "Only deposit & withdraw touch the chain.")
c.setFont(FR, 15); c.setFillColor(MUT); c.drawString(470, 197, "Everything in between is instant and free.")
footer(c, 4)
c.showPage()

# ---- 5. ARCHITECTURE / MONEY FLOW --------------------------------------
bg(c)
kicker(c, 70, H-95, "How it works", LIME)
title(c, 70, H-150, "On-chain where it counts, off-chain where it's fast")
# three lanes
def lane(x, w, t_, col, lines, h=210, y=190):
    card(c, x, y, w, h, col)
    c.setFont(FB, 17); c.setFillColor(col); c.drawString(x+24, y+h-40, t_)
    para(c, x+24, y+h-70, lines, size=13, col=MUT, lead=20)
lane(70, 330, "GameVault (on-chain)", CYAN,
     ["Holds deposited tKRW in an", "auditable contract. Withdrawals", "pay out only via operator-signed", "EIP-712 vouchers, to the user."])
lane(440, 330, "Server ledger (off-chain)", MAGENTA,
     ["Your game balance lives in a", "Postgres ledger. Stakes & payouts", "settle here instantly — no gas,", "no signatures, server-authoritative."])
lane(810, 330, "TestKRW token (ERC-20)", LIME,
     ["Play money on testnet today.", "Swap the token address for USDC", "or native ETH on mainnet — the", "rest of the stack is unchanged."])
c.setFont(FR, 13.5); c.setFillColor(FAINT)
c.drawString(70, 150, "Deposit  →  Vault holds funds  ·  Play  →  ledger updates  ·  Withdraw  →  Vault releases real tKRW to your wallet")
footer(c, 5)
c.showPage()

# ---- 6. PROVABLY FAIR ---------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Trust", GOLD)
title(c, 70, H-150, "Fair by math, not by promise")
# formula box (left)
bx, bw_ = 70, 600
c.setFillColor(INK); c.setStrokeColor(CYAN); c.setLineWidth(1.2)
c.roundRect(bx, 250, bw_, 150, 10, stroke=1, fill=1)
cx_ = bx + bw_/2
c.setFont(FM, 25); c.setFillColor(TXT)
c.drawCentredString(cx_, 332, "multiplier = (1 - edge) / P(win)")
c.setFont(FR, 12.5); c.setFillColor(MUT)
c.drawCentredString(cx_, 298, "every offered bet has the same expected value")
c.setFont(FB, 12.5); c.setFillColor(CYAN)
c.drawCentredString(cx_, 272, "→ same edge at every multiplier  ·  publicly verifiable")
# right column
pts = [
    ("Commit–reveal RNG", "The server commits a seed hash up front; after the round you can recompute every roll and verify it was never changed."),
    ("Transparent edge", "Default 7%, tunable. Because multiplier = (1−edge)/P, anyone can reverse-calc the exact edge from the posted odds."),
    ("No hidden volatility", "The same volatility model prices the grid and drives the line — so the stated odds are the real odds."),
]
rx, rw = 720, W-70-720
y = 392
for t_, d in pts:
    c.setFillColor(GOLD); c.rect(rx, y, 8, 8, fill=1, stroke=0)
    c.setFont(FB, 16); c.setFillColor(TXT); c.drawString(rx+20, y, t_)
    para_w(c, rx+20, y-22, d, rw-20, size=12.5, col=MUT, lead=18)
    y -= 96
footer(c, 6)
c.showPage()

# ---- 7. WHY VOLT --------------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Positioning", MAGENTA)
title(c, 70, H-150, "Why VOLT is different")
cols = [
    ("vs. CEX casinos", CYAN, ["On-chain custody +", "verifiable fairness —", "not \"just trust us\".", "Funds you can audit."]),
    ("vs. on-chain games", MAGENTA, ["No wallet popup per", "bet. Deposit once and", "play CEX-smooth, with", "instant settlement."]),
    ("vs. prediction mkts", LIME, ["Fast, arcade-style", "rounds — seconds, not", "15-minute markets.", "Built for fun + flow."]),
]
cw, gap = 350, 30; x0, y0 = 70, 175
for i,(t_,col,lines) in enumerate(cols):
    x = x0 + i*(cw+gap)
    card(c, x, y0, cw, 215, col)
    c.setFont(FB, 19); c.setFillColor(col); c.drawString(x+26, y0+160, t_)
    para(c, x+26, y0+125, lines, size=14, col=MUT, lead=23)
footer(c, 7)
c.showPage()

# ---- 8. TECH ------------------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Stack")
title(c, 70, H-150, "Under the hood")
chips = [
    ("Giwa Sepolia · OP-stack L2", CYAN),("Solidity 0.8.24", CYAN),
    ("TestKRW · ERC-20", LIME),("GameVault · custody", LIME),
    ("EIP-712 withdrawal vouchers", MAGENTA),("Provably-fair · HMAC commit-reveal", MAGENTA),
    ("Next.js 14 + canvas engine", GOLD),("Postgres ledger (Supabase)", GOLD),
    ("Server-authoritative settlement", CYAN),("RainbowKit · wagmi · viem", CYAN),
]
x, y = 70, 380; maxx = W-70
for label, col in chips:
    w = c.stringWidth(label, FB, 13) + 26
    if x + w > maxx: x = 70; y -= 44
    chip(c, x, y, label, col, pad=13, size=13); x += w + 14
para(c, 70, 200, [
    "Two contracts, one off-chain ledger, one canvas game engine — a small, legible",
    "surface that's straightforward to audit and to port to mainnet with a real asset.",
], size=14.5, col=MUT, lead=23)
footer(c, 8)
c.showPage()

# ---- 9. STATUS ----------------------------------------------------------
bg(c)
kicker(c, 70, H-95, "Status", LIME)
title(c, 70, H-150, "Where we are")
card(c, 70, 330, 540, 200, LIME)
c.setFont(FB, 18); c.setFillColor(LIME); c.drawString(96, 478, "Live now — testnet")
para(c, 96, 446, [
    "· Two games playable end-to-end",
    "· Live BTC feed — odds priced off measured vol",
    "· Off-chain tKRW balance + faucet",
    "· On-chain deposit / withdraw via GameVault",
    "· Deployed on Giwa Sepolia",
], size=14, col=TXT, lead=27)
card(c, 640, 330, 540, 200, CYAN)
c.setFont(FB, 18); c.setFillColor(CYAN); c.drawString(666, 478, "Next")
para(c, 666, 446, [
    "· Server-authoritative settlement (anti-cheat)",
    "· Mainnet + real assets (USDC / ETH)",
    "· More games, leaderboards, seasons",
    "· Public launch & growth",
], size=14, col=MUT, lead=27)
footer(c, 9)
c.showPage()

# ---- 10. CLOSING --------------------------------------------------------
bg(c, MAGENTA, CYAN)
hgrad(c, 0, 0, W, 6, MAGENTA, CYAN)
bolt(c, W/2-130, H/2+30, 96, CYAN)
tracked(c, W/2, H/2+150, "VOLT", FBK, 96, TXT, track=12, align="c")
tracked(c, W/2, H/2-10, "THE ARCADE, ON-CHAIN.", FB, 24, CYAN, track=6, align="c")
c.setFont(FR, 16); c.setFillColor(MUT)
c.drawCentredString(W/2, H/2-60, "Play fast price-action games for real on-chain stakes — without the friction.")
c.setStrokeColor(LINE); c.line(W/2-220, 150, W/2+220, 150)
tracked(c, W/2, 120, "yourdomain.xyz   ·   @volt   ·   hello@volt.xyz", FB, 13, FAINT, track=2, align="c")
c.showPage()

c.save()
print("OK ->", "/home/user/ProjectGIWA/VOLT-Introduction.pdf")

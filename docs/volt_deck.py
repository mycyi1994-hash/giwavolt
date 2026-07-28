#!/usr/bin/env python3
"""VOLT — on-chain crypto arcade. Introduction deck (English) → PDF.

Brand kit (palette, fonts, primitives) lives in deck_brand.py; see its header
for the one-time font setup. Then: python3 game/docs/volt_deck.py
"""
from reportlab.pdfgen import canvas
from deck_brand import *  # noqa: F403 — the brand kit is meant to be ambient

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
cw, ch, gap = 540, 175, 28; x0, y = 70, 285
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

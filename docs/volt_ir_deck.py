#!/usr/bin/env python3
"""VOLT — investor deck → PDF.

Brand kit (palette, fonts, primitives) lives in deck_brand.py; see its header
for the one-time font setup. Then: python3 game/docs/volt_ir_deck.py

A note on what is and isn't in here. Every technical and product claim in this
deck is checkable against the repository — the numbers come from the verification
suites in game/web/scripts, not from a pitch. Traction, team, financials and the
raise are left as explicit placeholder slides, because inventing them would be
worse than useless in front of an investor. Those four slides are drawn with a
dashed border and a visible TO FILL marker so the deck cannot be sent by
accident with them still empty.
"""
from reportlab.pdfgen import canvas
from deck_brand import *  # noqa: F403 — the brand kit is meant to be ambient

OUT = "/home/user/ProjectGIWA/VOLT-IR-Deck.pdf"


def ir_footer(c, n):
    c.setStrokeColor(LINE); c.setLineWidth(1); c.line(70, 54, W - 70, 54)
    wordmark(c, 70, 32, 15)
    c.setFont(FR, 10); c.setFillColor(FAINT)
    c.drawCentredString(W / 2, 35, "Investor overview  ·  Confidential")
    c.setFont(FB, 10); c.setFillColor(FAINT)
    c.drawRightString(W - 70, 35, f"{n:02d}")


def todo_slide(c, n, kick, head, prompts, note):
    """A slide only the founders can fill in. Marked so it can't slip through."""
    bg(c)
    kicker(c, 70, H - 95, kick, GOLD)
    title(c, 70, H - 150, head)
    # unmistakable marker
    c.setFillColor(HexColor("#2a2410")); c.setStrokeColor(GOLD); c.setLineWidth(1.2)
    c.roundRect(W - 300, H - 128, 230, 30, 6, stroke=1, fill=1)
    tracked(c, W - 185, H - 118, "TO FILL — YOUR NUMBERS", FB, 11, GOLD, track=2, align="c")

    c.setDash(4, 4)
    c.setStrokeColor(HexColor("#4a4326")); c.setFillColor(HexColor("#0d0c08"))
    c.roundRect(70, 140, W - 140, 340, 10, stroke=1, fill=1)
    c.setDash()
    y = 415
    for p in prompts:
        c.setFillColor(GOLD); c.circle(100, y + 5, 3, stroke=0, fill=1)
        c.setFont(FR, 15); c.setFillColor(MUT); c.drawString(118, y, p)
        y -= 34
    c.setFont(FR, 12); c.setFillColor(FAINT)
    para_w(c, 100, 208, note, W - 260, size=12, col=FAINT, lead=18)
    ir_footer(c, n)
    c.showPage()


def bars(c, x, y, w, h, rows, maxv, unit=""):
    """Horizontal bars — label, value, colour."""
    lab_w = 210
    bw = w - lab_w - 90
    row_h = h / max(len(rows), 1)
    for i, (label, val, col) in enumerate(rows):
        ry = y + h - (i + 1) * row_h + row_h * 0.22
        c.setFont(FR, 13); c.setFillColor(MUT)
        c.drawString(x, ry + 3, label)
        c.setFillColor(HexColor("#15152400")); c.setStrokeColor(LINE)
        c.setFillColor(INK2)
        c.roundRect(x + lab_w, ry - 4, bw, 18, 4, stroke=0, fill=1)
        frac = max(0.0, min(1.0, val / maxv))
        c.setFillColor(col)
        c.roundRect(x + lab_w, ry - 4, max(bw * frac, 3), 18, 4, stroke=0, fill=1)
        c.setFont(FB, 13); c.setFillColor(col)
        c.drawString(x + lab_w + bw + 12, ry + 3, f"{val:g}{unit}")


c = canvas.Canvas(OUT, pagesize=(W, H))

# ---- 1. COVER -----------------------------------------------------------
bg(c)
hgrad(c, 0, H - 6, W, 6, CYAN, MAGENTA)
bolt(c, W / 2 - 165, H / 2 + 10, 120, CYAN)
tracked(c, W / 2 - 25, H / 2 + 50, "VOLT", FBK, 116, TXT, track=14)
tracked(c, W / 2, H / 2 - 10, "THE CASINO THAT CAN'T LIE", FB, 22, CYAN, track=8, align="c")
c.setFont(FR, 17); c.setFillColor(MUT)
c.drawCentredString(W / 2, H / 2 - 62, "A price arcade where every outcome settles on a public fact —")
c.drawCentredString(W / 2, H / 2 - 88, "not on a number the house rolled in private.")
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(W / 2 - 210, 120, 420, 40, 8, stroke=1, fill=1)
tracked(c, W / 2, 133, "INVESTOR OVERVIEW   ·   TESTNET LIVE ON GIWA", FB, 12, FAINT, track=3, align="c")
c.showPage()

# ---- 2. THE PROBLEM -----------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "The problem", MAGENTA)
title(c, 70, H - 150, "“Provably fair” usually proves nothing")
para(c, 70, H - 200, [
    "Crypto casinos publish a seed hash and call it trust. But the seed only proves",
    "the house didn't change its mind — it says nothing about whether the number",
    "was fair to begin with. You are still verifying the house against itself.",
], size=16, col=TXT, lead=25)
cols = [
    ("The roll is private", MAGENTA, [
        "A commit-reveal seed proves",
        "consistency, not fairness. The",
        "house still authors the outcome",
        "and grades its own homework.",
    ]),
    ("The odds are opaque", GOLD, [
        "Payout tables are posted as",
        "fact. Nothing lets a player",
        "derive the edge, so “1% house",
        "edge” is a marketing claim.",
    ]),
    ("The funds are theirs", CYAN, [
        "Balances sit in a company hot",
        "wallet. Solvency is a press",
        "release until, abruptly, it",
        "isn't.",
    ]),
]
cw, gap = 350, 30
for i, (t_, col, lines) in enumerate(cols):
    x = 70 + i * (cw + gap)
    card(c, x, 150, cw, 255, col)
    c.setFont(FB, 19); c.setFillColor(col); c.drawString(x + 26, 150 + 198, t_)
    para(c, x + 26, 150 + 162, lines, size=13.5, col=MUT, lead=23)
ir_footer(c, 2)
c.showPage()

# ---- 3. THE INSIGHT -----------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "The insight", LIME)
title(c, 70, H - 150, "Settle on something the house doesn't own")
para(c, 70, H - 200, [
    "Bitcoin's price at 14:03:22 is a public fact. Binance publishes it, it is",
    "immutable, and anyone can fetch it forever. Build the game on that and",
    "fairness stops being a promise — it becomes something a player can check.",
], size=16, col=TXT, lead=25)

c.setFillColor(INK); c.setStrokeColor(LIME); c.setLineWidth(1.4)
c.roundRect(70, 155, W - 140, 245, 10, stroke=1, fill=1)
c.setFont(FB, 16); c.setFillColor(LIME); c.drawString(100, 355, "A VOLT bet, end to end")
steps = [
    ("You tap a cell", "a price range and a settlement second"),
    ("Server prices it", "from its own read of the market"),
    ("The second arrives", "the exchange publishes its 1s bar"),
    ("You can check it", "re-query the same public endpoint"),
]
bx, bwid = 100, (W - 200) / 4
for i, (t_, d) in enumerate(steps):
    x = bx + i * bwid
    c.setFont(FB, 14); c.setFillColor(TXT); c.drawString(x, 300, t_)
    para_w(c, x, 276, d, bwid - 24, size=12, col=MUT, lead=17)
    if i < 3:
        arrow(c, x + bwid - 28, 304, x + bwid - 8, col=FAINT)
c.setFont(FB, 13.5); c.setFillColor(CYAN)
c.drawString(100, 195, "The house never touches the outcome. It only quotes the odds.")
ir_footer(c, 3)
c.showPage()

# ---- 4. PRODUCT ---------------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Product")
title(c, 70, H - 150, "Two games, one balance")
games = [
    ("Tap Trading", CYAN, [
        "Tap cells on a live price grid.",
        "Each cell is a price range and a",
        "moment; land in it and win stake",
        "× multiplier. Rounds resolve in",
        "10–46 seconds.",
    ]),
    ("Death Fun", MAGENTA, [
        "Flip safe tiles for a rising",
        "multiplier and cash out before a",
        "skull. The board is dealt from a",
        "seed committed before your first",
        "tap, and published after.",
    ]),
]
cw, gap = 540, 28
for i, (t_, col, lines) in enumerate(games):
    x = 70 + i * (cw + gap)
    card(c, x, 175, cw, 285, col)
    c.setFont(FB, 24); c.setFillColor(col); c.drawString(x + 28, 175 + 222, t_)
    para(c, x + 28, 175 + 184, lines, size=14, col=MUT, lead=25)
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(70, 100, W - 140, 52, 8, stroke=1, fill=1)
c.setFont(FR, 13.5); c.setFillColor(MUT)
c.drawString(96, 120, "Deposit once, then play with no wallet popup per bet — CEX-smooth, on-chain custody.")
ir_footer(c, 4)
c.showPage()

# ---- 5. THE DIFFERENTIATOR ----------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Why it's different", CYAN)
title(c, 70, H - 150, "The outcome is a public record")
rows = [
    ("Typical crypto casino", MAGENTA, [
        "Outcome  →  a private RNG roll",
        "Proof  →  a hash of the house's own seed",
        "Verify  →  against the house's own record",
        "Edge  →  stated, not derivable",
    ]),
    ("VOLT", LIME, [
        "Outcome  →  the exchange's published price",
        "Proof  →  the exchange's public endpoint",
        "Verify  →  against a third party, forever",
        "Edge  →  reverse-calculable from the odds",
    ]),
]
cw, gap = 545, 30
for i, (t_, col, lines) in enumerate(rows):
    x = 70 + i * (cw + gap)
    card(c, x, 160, cw, 275, col)
    c.setFont(FB, 21); c.setFillColor(col); c.drawString(x + 28, 160 + 214, t_)
    para(c, x + 28, 160 + 172, lines, size=13.5, col=MUT, lead=28, font=FR)
c.setFont(FB, 14); c.setFillColor(GOLD)
c.drawCentredString(W / 2, 120, "A player who doesn't trust us can still verify us. That is the entire product.")
ir_footer(c, 5)
c.showPage()

# ---- 6. THE ECONOMICS ---------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Economics", GOLD)
title(c, 70, H - 150, "The edge is derived, not decided")
c.setFillColor(INK); c.setStrokeColor(CYAN); c.setLineWidth(1.2)
c.roundRect(70, 300, 600, 120, 10, stroke=1, fill=1)
c.setFont(FM, 24); c.setFillColor(TXT)
c.drawCentredString(370, 365, "multiplier = (1 − edge) / P(win)")
c.setFont(FR, 12.5); c.setFillColor(MUT)
c.drawCentredString(370, 332, "P comes from the market's own volatility — so every cell has the same EV")
pts = [
    ("Revenue is the edge × volume", "No rake, no spread games, no token. The house takes 7% of expected turnover and nothing else."),
    ("Anyone can audit it", "Because multiplier = (1−edge)/P, a player can invert the posted odds and recover the exact edge."),
    ("Same edge at every payout", "A 5× cell and a 50× cell are equally priced. There is no trap cell, and no need for one."),
]
y = 400
for t_, d in pts:
    c.setFillColor(GOLD); c.rect(720, y, 8, 8, fill=1, stroke=0)
    c.setFont(FB, 15); c.setFillColor(TXT); c.drawString(740, y, t_)
    para_w(c, 740, y - 21, d, W - 70 - 740, size=12.5, col=MUT, lead=18)
    y -= 92
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(70, 145, 600, 130, 8, stroke=1, fill=1)
c.setFont(FB, 13); c.setFillColor(CYAN); c.drawString(96, 247, "Measured, and verified")
bars(c, 96, 158, 548, 72, [
    ("Target edge", 7.0, FAINT),
    ("Realised — BTC market", 6.8, CYAN),
    ("Realised — VOLT market", 7.0, LIME),
], maxv=8.0, unit="%")
ir_footer(c, 6)
c.showPage()

# ---- 7. TWO MARKETS -----------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Product depth", MAGENTA)
title(c, 70, H - 150, "Two markets, one engine")
para(c, 70, H - 195, [
    "Both answer the engine a single question: what is σ of the price at time T?",
    "That narrowness is why a second market cost almost nothing to add.",
], size=15, col=TXT, lead=23)
mk = [
    ("BTC", CYAN, [
        "Live exchange trades",
        "σ estimated from ticks",
        "Edge 6.5–6.8% realised",
        "Pauses when the market is still",
        "Real money: yes",
    ]),
    ("VOLT", LIME, [
        "Our own synthetic market",
        "σ declared on a public schedule",
        "Edge exactly 7.00%",
        "Never quiet, needs no network",
        "Real money: no — demo only",
    ]),
]
cw, gap = 400, 30
for i, (t_, col, lines) in enumerate(mk):
    x = 70 + i * (cw + gap)
    card(c, x, 150, cw, 285, col)
    c.setFont(FB, 26); c.setFillColor(col); c.drawString(x + 28, 150 + 224, t_)
    para(c, x + 28, 150 + 182, lines, size=13.5, col=MUT, lead=27)
c.setFillColor(INK); c.setStrokeColor(LINE)
c.roundRect(900, 150, W - 70 - 900, 285, 10, stroke=1, fill=1)
c.setFont(FB, 15); c.setFillColor(GOLD); c.drawString(924, 150 + 240, "Why a second market")
para_w(c, 924, 150 + 212,
       "A blocked exchange used to leave the demo stuck on “connecting”, and a quiet "
       "market pauses betting. VOLT runs from nothing, never goes quiet, and because we "
       "declare its volatility instead of measuring it, its odds are exact rather than "
       "merely close.", W - 70 - 924 - 24, size=12.5, col=MUT, lead=18)
ir_footer(c, 7)
c.showPage()

# ---- 8. WHY IT'S HARD ---------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Moat", CYAN)
title(c, 70, H - 150, "The hard part isn't the game. It's the pricing.")
para(c, 70, H - 200, [
    "To offer fair odds on a real price you must know its volatility. Measuring that",
    "from live trades is where this gets genuinely difficult — and where a competitor",
    "who hasn't done the work will quietly hand their bankroll to the first quant.",
], size=15, col=TXT, lead=23)

c.setFillColor(INK); c.setStrokeColor(MAGENTA); c.setLineWidth(1.2)
c.roundRect(70, 155, 640, 250, 10, stroke=1, fill=1)
c.setFont(FB, 15); c.setFillColor(MAGENTA); c.drawString(96, 372, "Naive volatility is catastrophically wrong")
para_w(c, 96, 348, "Trade prints bounce between bid and ask. Read that bounce as volatility and "
                   "the estimate comes back several times too high — and multipliers are roughly "
                   "linear in it, so the error lands straight in the payouts.", 590, size=12.5, col=MUT, lead=18)
bars(c, 96, 180, 590, 100, [
    ("True volatility", 1.0, LIME),
    ("Tick-by-tick estimate", 6.8, MAGENTA),
    ("Our estimator", 1.02, CYAN),
], maxv=7.2, unit="×")

facts = [
    ("It refuses rather than guesses", "When the spread drowns the signal, or the market stops, the game stops quoting."),
    ("Verified, not asserted", "Five suites reproduce the edge, the estimator and the settlement against a real database."),
]
y = 380
for t_, d in facts:
    c.setFillColor(CYAN); c.rect(745, y, 8, 8, fill=1, stroke=0)
    c.setFont(FB, 15); c.setFillColor(TXT); c.drawString(765, y, t_)
    para_w(c, 765, y - 21, d, W - 70 - 765, size=12.5, col=MUT, lead=18)
    y -= 100
ir_footer(c, 8)
c.showPage()

# ---- 9. SECURITY --------------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Rigour", LIME)
title(c, 70, H - 150, "We attacked it before anyone else could")
para(c, 70, H - 195, [
    "A house that can be arbitraged is not a business. An adversarial review plus",
    "play-testing found five ways a player could construct a winning request. All",
    "five are closed; four carry a regression test that reproduces the original.",
], size=15, col=TXT, lead=23)
found = [
    ("Client-shaped odds", "A player could describe their own price band, and solve for the cell our model priced worst."),
    ("Stale quote arbitrage", "Our price lagged the market by a second. Theirs didn't."),
    ("Refund as a free option", "Settlement was player-triggered, so a loser could be retried until it voided and refunded."),
    ("Cancel after the fact", "Re-tapping a resting bet refunded it — keep the winners, cancel the losers."),
    ("A market that stopped", "A frozen price broke the estimate, and the fallback kept quoting generous odds."),
]
cw, gap = 215, 16
for i, (t_, d) in enumerate(found):
    x = 70 + i * (cw + gap)
    card(c, x, 150, cw, 255, LIME)
    head_lines = wrap(c, t_, FB, 14.5, cw - 44)
    c.setFont(FB, 14.5); c.setFillColor(TXT)
    for j, ln in enumerate(head_lines):
        c.drawString(x + 22, 150 + 208 - j * 19, ln)
    para_w(c, x + 22, 150 + 208 - len(head_lines) * 19 - 14, d, cw - 44, size=11.5, col=MUT, lead=17)
c.setFont(FB, 13.5); c.setFillColor(GOLD)
c.drawCentredString(W / 2, 115, "Every one of these would have been a slow bankroll leak in production.")
ir_footer(c, 9)
c.showPage()

# ---- 10. ARCHITECTURE ---------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "How it works", CYAN)
title(c, 70, H - 150, "On-chain where it counts, off-chain where it's fast")


def lane(x, w, t_, col, lines, h=255, y=160):
    card(c, x, y, w, h, col)
    c.setFont(FB, 17); c.setFillColor(col); c.drawString(x + 24, y + h - 40, t_)
    para(c, x + 24, y + h - 70, lines, size=13, col=MUT, lead=20)


lane(70, 330, "Vault (on-chain)", CYAN,
     ["Deposits sit in an auditable", "contract, not a company wallet.", "Withdrawals pay out only against", "an operator-signed voucher."])
lane(440, 330, "Ledger (off-chain)", MAGENTA,
     ["Play settles in Postgres —", "instant, no gas, no signatures,", "and server-authoritative so the", "browser can't author a win."])
lane(810, 330, "Settlement (public)", LIME,
     ["Outcomes resolve against the", "exchange's published bar, which", "the player can re-query. We keep", "the quote so payouts re-derive."])
c.setFont(FR, 13); c.setFillColor(FAINT)
c.drawString(70, 120, "Only deposit and withdraw touch the chain. Everything between them is instant and free — which is what makes it playable.")
ir_footer(c, 10)
c.showPage()

# ---- 11. STATUS ---------------------------------------------------------
bg(c)
kicker(c, 70, H - 95, "Status", LIME)
title(c, 70, H - 150, "Where we are")
card(c, 70, 295, 545, 195, LIME)
c.setFont(FB, 17); c.setFillColor(LIME); c.drawString(96, 295 + 148, "Live on testnet")
para(c, 96, 295 + 116, [
    "·  Both games playable end to end",
    "·  Server-authoritative settlement, both games",
    "·  On-chain deposit / withdraw via the vault",
    "·  Two markets, five verification suites",
], size=13, col=TXT, lead=22)
card(c, 645, 295, 545, 195, CYAN)
c.setFont(FB, 17); c.setFillColor(CYAN); c.drawString(671, 295 + 148, "Next")
para(c, 671, 295 + 116, [
    "·  Mainnet: swap the test token for a real one",
    "·  Bankroll and exposure limits",
    "·  VOLT market to real money via a hash chain",
    "·  Public verification page for past rounds",
], size=13, col=MUT, lead=22)
c.setFillColor(INK2); c.setStrokeColor(GOLD); c.setLineWidth(1)
c.roundRect(70, 130, W - 140, 130, 8, stroke=1, fill=1)
c.setFont(FB, 14); c.setFillColor(GOLD); c.drawString(96, 228, "Said plainly")
para_w(c, 96, 202,
       "This is a testnet product with no real money in it yet. The engine, the custody "
       "contracts and the settlement path are built and tested; what is not yet proven is "
       "demand. The next milestone is players, not features — and the deck says so rather "
       "than dressing a prototype as a business.", W - 200, size=12.5, col=MUT, lead=18)
ir_footer(c, 11)
c.showPage()

# ---- 12-14. THE SLIDES ONLY YOU CAN WRITE -------------------------------
todo_slide(c, 12, "Traction", "The numbers",
           ["Wallets connected / returning players",
            "Rounds played, and total staked volume",
            "Retention: D1 / D7 / D30",
            "Deposits, withdrawals, net bankroll",
            "Cost to acquire a player, if you've spent anything"],
           "Left blank on purpose. Invented traction is the fastest way to lose a room, and these "
           "are the only figures in the deck that can't be derived from the code. Pull them from "
           "the ledger — every stake and payout is already an append-only row in the txns table.")

todo_slide(c, 13, "Team", "Who is building this",
           ["Founders — names, and what you did before",
            "Why you specifically (trading? gaming? protocol?)",
            "Anyone advising, and on what",
            "Who you hire first with this money"],
           "At this stage an investor is underwriting the team more than the product. The strongest "
           "version of this slide connects your background directly to the hard part of the deck — "
           "the pricing model on slide 8.")

todo_slide(c, 14, "The ask", "What we're raising",
           ["Amount, instrument, and valuation",
            "Runway it buys, in months",
            "Use of funds — bankroll vs. build vs. growth",
            "The specific milestone this round reaches"],
           "Bankroll is worth calling out separately from operating spend: a house edge only pays "
           "out over volume, and a thin bankroll caps the stake sizes you can accept — which caps "
           "revenue directly. That is a fundable line item, not overhead.")

# ---- 15. CLOSING --------------------------------------------------------
bg(c)
hgrad(c, 0, H - 6, W, 6, CYAN, MAGENTA)
bolt(c, W / 2 - 155, H / 2 + 40, 100, CYAN)
tracked(c, W / 2 - 20, H / 2 + 70, "VOLT", FBK, 92, TXT, track=12)
c.setFont(FR, 19); c.setFillColor(MUT)
c.drawCentredString(W / 2, H / 2 - 5, "Every other casino asks you to trust it.")
c.setFont(FB, 21); c.setFillColor(CYAN)
c.drawCentredString(W / 2, H / 2 - 42, "This one hands you the receipt.")
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(W / 2 - 250, 140, 500, 44, 8, stroke=1, fill=1)
c.setFont(FR, 13); c.setFillColor(FAINT)
c.drawCentredString(W / 2, 156, "[ contact  ·  demo link  ·  repository ]")
c.showPage()

c.save()
print("OK ->", OUT)

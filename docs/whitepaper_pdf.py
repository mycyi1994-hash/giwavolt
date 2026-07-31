#!/usr/bin/env python3
"""VOLT whitepaper (Markdown) → PDF.

Renders WHITEPAPER.md from the public repo into an A4 document in the deck's
palette and typeface. A small Markdown subset is enough here — headings, lists,
tables, fenced code, blockquotes, inline code/bold/links — because the source is
written by us and does not use anything exotic.

The source of truth stays the Markdown file; this is a rendering of it, so the
two cannot drift as long as the PDF is regenerated:

    python3 game/docs/whitepaper_pdf.py [path/to/WHITEPAPER.md]
"""
import os
import re
import sys

from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

# Fonts and palette come from the deck kit so the document and the decks read as
# one set. Page geometry does not: a deck is 16:9, a whitepaper is A4 portrait.
from deck_brand import FR, FB, FBK, FM  # noqa: F401

BG = HexColor("#06060e")
INK = HexColor("#0c0c18")
INK2 = HexColor("#11111f")
LINE = HexColor("#22243a")
CYAN = HexColor("#00e5ff")
MAGENTA = HexColor("#ff2bd6")
LIME = HexColor("#39ff14")
GOLD = HexColor("#ffd23f")
TXT = HexColor("#e9f3ff")
MUT = HexColor("#8b93b8")
FAINT = HexColor("#5b6082")

W, H = 595, 842  # A4 portrait
ML, MR = 56, 56
MT, MB = 66, 58
CW = W - ML - MR

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", "workspace", "giwavolt", "WHITEPAPER.md")
OUT = os.path.join(HERE, "..", "..", "VOLT-Whitepaper.pdf")

ACCENTS = [CYAN, MAGENTA, LIME, GOLD]


class Doc:
    def __init__(self, c):
        self.c = c
        self.y = 0
        self.page = 0
        self.section = 0
        self.new_page(first=True)

    # ---- page furniture --------------------------------------------------
    def new_page(self, first=False):
        if not first:
            self.footer()
            self.c.showPage()
        self.page += 1
        c = self.c
        c.setFillColor(BG)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        # thin spectrum rule at the very top, same as the decks
        for i in range(120):
            t = i / 119
            c.setFillColor(HexColor("#00e5ff") if t < 0.001 else self._mix(t))
            c.rect(i * (W / 120), H - 3, W / 120 + 1, 3, stroke=0, fill=1)
        self.y = H - MT

    @staticmethod
    def _mix(t):
        a = (0x00, 0xE5, 0xFF)
        b = (0xFF, 0x2B, 0xD6)
        return HexColor("#%02x%02x%02x" % tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))

    def footer(self):
        c = self.c
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.line(ML, MB - 16, W - MR, MB - 16)
        c.setFont(FB, 8)
        c.setFillColor(FAINT)
        c.drawString(ML, MB - 28, "VOLT · Grabit")
        c.drawCentredString(W / 2, MB - 28, "Whitepaper v1")
        c.drawRightString(W - MR, MB - 28, str(self.page))

    def need(self, h):
        if self.y - h < MB:
            self.new_page()

    # ---- inline formatting ----------------------------------------------
    @staticmethod
    def strip_inline(s):
        s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)   # links → their text
        s = s.replace("**", "").replace("`", "")
        s = re.sub(r"(?<!\*)\*(?!\*)", "", s)
        return s

    # Inline markup is tokenised into styled words BEFORE wrapping. Wrapping the
    # raw string first and styling each line afterwards broke whenever a bold
    # run or a code span happened to straddle a line break: the half-open
    # markers printed literally.
    def tokens(self, text, size, col, font=FR):
        out = []
        parts = re.split(r"(\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|`[^`]+`|\[[^\]]+\]\([^)]+\))", text)
        for p in parts:
            if not p:
                continue
            # Nesting is real in this document: bold wrapping a link, a link
            # wrapping code. Recurse so the inner markers are consumed too
            # rather than surviving into the drawn text.
            if p.startswith("**") and p.endswith("**"):
                out += self.tokens(p[2:-2], size, TXT, FB)
                continue
            if p.startswith("*") and p.endswith("*") and len(p) > 2:
                out += self.tokens(p[1:-1], size, TXT, font)
                continue
            if p.startswith("[") and "](" in p:
                inner = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", p)
                out += self.tokens(inner, size, CYAN, font)
                continue
            if p.startswith("`") and p.endswith("`"):
                f, sz, cl, body = FM, size - 0.6, CYAN, p[1:-1]
            else:
                f, sz, cl, body = font, size, col, p
            for w in body.split(" "):
                if w:
                    out.append((w, f, sz, cl))
        return out

    def lay(self, toks, x, maxw, lead, first_cb=None):
        """Lay styled words out with wrapping. Returns nothing; advances y."""
        c = self.c
        line, width = [], 0.0
        space = lambda f, sz: c.stringWidth(" ", f, sz)

        def flush():
            nonlocal line, width
            if not line:
                return
            self.need(lead)
            if first_cb:
                first_cb()
            cx = x
            for w, f, sz, cl in line:
                c.setFont(f, sz)
                c.setFillColor(cl)
                c.drawString(cx, self.y, w)
                cx += c.stringWidth(w, f, sz) + space(f, sz)
            self.y -= lead
            line, width = [], 0.0

        for w, f, sz, cl in toks:
            ww = c.stringWidth(w, f, sz)
            if line and width + ww > maxw:
                flush()
            line.append((w, f, sz, cl))
            width += ww + space(f, sz)
        flush()

    def rich(self, x, y, text, size, col, font=FR):
        """Single-line draw, for table cells and other pre-fitted text."""
        c = self.c
        cx = x
        for w, f, sz, cl in self.tokens(text, size, col, font):
            c.setFont(f, sz)
            c.setFillColor(cl)
            c.drawString(cx, y, w)
            cx += c.stringWidth(w + " ", f, sz)
        return cx

    def wrap(self, text, size, maxw, font=FR):
        out, cur = [], ""
        for w in text.split():
            t = (cur + " " + w).strip()
            if self.c.stringWidth(self.strip_inline(t), font, size) <= maxw:
                cur = t
            else:
                if cur:
                    out.append(cur)
                cur = w
        if cur:
            out.append(cur)
        return out or [""]

    def para(self, text, size=9.4, col=MUT, x=ML, maxw=None, lead=14.4, font=FR, gap=8):
        self.lay(self.tokens(text, size, col, font), x, maxw or CW, lead)
        self.y -= gap


def render(md, c):
    d = Doc(c)
    lines = md.splitlines()
    i = 0
    in_code = False
    code_buf = []

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        # ---- fenced code -------------------------------------------------
        if line.startswith("```"):
            if in_code:
                h = 12 + 11.4 * len(code_buf)
                d.need(h + 8)
                c.setFillColor(INK2)
                c.setStrokeColor(LINE)
                c.setLineWidth(0.8)
                c.roundRect(ML, d.y - h + 10, CW, h, 4, stroke=1, fill=1)
                yy = d.y
                for cl in code_buf:
                    c.setFont(FM, 8)
                    c.setFillColor(HexColor("#9fe8f5"))
                    c.drawString(ML + 10, yy, cl[:96])
                    yy -= 11.4
                d.y = yy - 10
                code_buf, in_code = [], False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(raw)
            i += 1
            continue

        # ---- tables ------------------------------------------------------
        if line.startswith("|") and i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= set("-: "):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [x.strip() for x in lines[i].strip().strip("|").split("|")]
                if not set("".join(cells)) <= set("-: "):
                    rows.append(cells)
                i += 1
            ncol = max(len(r) for r in rows)
            colw = CW / ncol
            head, body = rows[0], rows[1:]
            d.need(20 + 15 * len(body))
            c.setFillColor(INK)
            c.rect(ML, d.y - 4, CW, 17, stroke=0, fill=1)
            for j, cell in enumerate(head):
                c.setFont(FB, 8.4)
                c.setFillColor(CYAN)
                c.drawString(ML + 7 + j * colw, d.y + 2, Doc.strip_inline(cell)[:38])
            d.y -= 19
            for r in body:
                lns = 1
                for j, cell in enumerate(r):
                    txt = Doc.strip_inline(cell)
                    parts = d.wrap(cell, 8.4, colw - 14)
                    lns = max(lns, len(parts))
                    for k, p in enumerate(parts):
                        d.rich(ML + 7 + j * colw, d.y - k * 11, p, 8.4, MUT)
                d.y -= 11 * lns + 3
                c.setStrokeColor(HexColor("#191b2b"))
                c.setLineWidth(0.5)
                c.line(ML, d.y + 6, W - MR, d.y + 6)
                d.need(16)
            d.y -= 8
            continue

        # ---- headings ----------------------------------------------------
        if line.startswith("# "):
            d.need(60)
            c.setFont(FBK, 26)
            c.setFillColor(TXT)
            c.drawString(ML, d.y, Doc.strip_inline(line[2:]))
            d.y -= 30
            i += 1
            continue
        if line.startswith("## "):
            title = Doc.strip_inline(line[3:])
            d.need(52)
            if d.y < H - MT - 6:
                d.y -= 10
            acc = ACCENTS[d.section % len(ACCENTS)]
            d.section += 1
            c.setFillColor(acc)
            c.rect(ML, d.y + 2, 18, 3, stroke=0, fill=1)
            c.setFont(FBK, 15)
            c.setFillColor(TXT)
            c.drawString(ML + 26, d.y, title)
            d.y -= 22
            i += 1
            continue
        if line.startswith("### "):
            d.need(30)
            d.y -= 4
            c.setFont(FB, 11)
            c.setFillColor(ACCENTS[(d.section - 1) % len(ACCENTS)])
            c.drawString(ML, d.y, Doc.strip_inline(line[4:]))
            d.y -= 17
            i += 1
            continue

        # ---- rules, blockquotes, lists, prose ----------------------------
        if line.startswith("---"):
            d.need(14)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.8)
            c.line(ML, d.y + 4, W - MR, d.y + 4)
            d.y -= 14
            i += 1
            continue

        if line.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(lines[i].lstrip("> ").rstrip())
                i += 1
            text = " ".join(x for x in quote if x)
            wrapped = d.wrap(text, 9.6, CW - 34, FB)
            h = 20 + 14.4 * len(wrapped)
            d.need(h + 6)
            c.setFillColor(INK)
            c.setStrokeColor(GOLD)
            c.setLineWidth(1)
            c.roundRect(ML, d.y - h + 12, CW, h, 4, stroke=1, fill=1)
            c.setFillColor(GOLD)
            c.rect(ML, d.y - h + 12, 3, h, stroke=0, fill=1)
            d.y -= 4
            d.lay(d.tokens(text, 9.6, TXT, FB), ML + 16, CW - 34, 14.4)
            d.y -= 12
            continue

        m = re.match(r"^(\s*)[-*] (.+)$", line)
        if m:
            indent = len(m.group(1))
            x = ML + 12 + indent
            body = m.group(2)
            # A bullet that wraps in the source continues on indented lines.
            # Without this the tail became its own paragraph and lost the indent.
            i += 1
            while (i < len(lines) and lines[i].strip()
                   and not re.match(r"^(\s*)[-*] |^\d+\. |^#|^\||^>|^```|^---", lines[i])
                   and lines[i].startswith(" ")):
                body += " " + lines[i].strip()
                i += 1
            i -= 1
            state = {"first": True}

            def dot():
                if state["first"]:
                    c.setFillColor(ACCENTS[(d.section - 1) % len(ACCENTS)])
                    c.circle(ML + 4 + indent, d.y + 3, 1.7, stroke=0, fill=1)
                    state["first"] = False

            d.lay(d.tokens(body, 9.4, MUT), x, CW - 24 - indent, 14.4, dot)
            i += 1
            if i < len(lines) and not re.match(r"^(\s*)[-*] ", lines[i]):
                d.y -= 5
            continue

        m = re.match(r"^(\d+)\. (.+)$", line)
        if m:
            x = ML + 18
            num, state = m.group(1), {"first": True}

            def label():
                if state["first"]:
                    c.setFont(FB, 9.4)
                    c.setFillColor(ACCENTS[(d.section - 1) % len(ACCENTS)])
                    c.drawString(ML + 2, d.y, num + ".")
                    state["first"] = False

            d.lay(d.tokens(m.group(2), 9.4, MUT), x, CW - 30, 14.4, label)
            i += 1
            continue

        if not line.strip():
            i += 1
            continue

        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||>|```|---|\s*[-*] |\d+\. )", lines[i]):
            para.append(lines[i].rstrip())
            i += 1
        d.para(" ".join(para))

    d.footer()


with open(os.path.normpath(SRC), encoding="utf-8") as f:
    md = f.read()

c = canvas.Canvas(os.path.normpath(OUT), pagesize=(W, H))
c.setTitle("VOLT — Whitepaper")
c.setAuthor("Grabit")
render(md, c)
c.save()
print("OK ->", os.path.normpath(OUT))

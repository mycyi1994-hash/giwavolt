#!/usr/bin/env python3
"""VOLT — 투자 소개 자료 (IR Deck) → PDF.

브랜드 킷(팔레트·폰트·드로잉 프리미티브)은 deck_brand.py에 있습니다. 폰트 최초
설치 방법은 그 파일 헤더 참고. 이후: python3 game/docs/volt_ir_deck.py

이미지는 game/docs/shots/ 의 실제 앱 스크린샷입니다. 목업이 아니라 Playwright로
띄운 실행 화면을 그대로 찍은 것이고, VOLT 마켓 화면은 외부 네트워크를 전부 차단한
상태에서 찍었습니다.

이 덱에 없는 것: 트랙션·팀·재무·조달 조건. 코드로 검증할 수 없는 유일한 숫자들이고,
지어내는 것은 투자자 앞에서 아무 도움이 되지 않기 때문에 비워뒀습니다. 해당 슬라이드는
점선 테두리와 "채워 넣을 것" 마커로 표시되어 빈 채로 발송되는 사고를 막습니다.
"""
import os
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from deck_brand import *  # noqa: F403 — 브랜드 킷은 전역으로 쓰는 것을 전제로 함

OUT = "/home/user/ProjectGIWA/VOLT-IR-Deck.pdf"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")

# ---- 타이포: 한 단계씩 더 굵고 크게 --------------------------------------
# 기본 브랜드 킷보다 전반적으로 웨이트와 크기를 올린다. 투자 미팅은 화면이 작고
# 멀리서 보는 경우가 많아서, 소개용 자료의 톤으로는 약하다.

def kick(c, text, col=CYAN):
    c.setFillColor(col)
    c.rect(70, H - 92, 30, 5, stroke=0, fill=1)
    tracked(c, 112, H - 95, text.upper(), FB, 14, col, track=4.5)


def head(c, text, size=54, col=TXT):
    c.setFont(FBK, size)
    c.setFillColor(col)
    c.drawString(70, H - 158, text)


def lead(c, y, lines, size=17, col=TXT, gap=28):
    c.setFont(FB, size)
    c.setFillColor(col)
    for i, ln in enumerate(lines):
        c.drawString(70, y - i * gap, ln)


def ir_footer(c, n):
    c.setStrokeColor(LINE); c.setLineWidth(1); c.line(70, 54, W - 70, 54)
    wordmark(c, 70, 32, 15)
    c.setFont(FB, 10); c.setFillColor(FAINT)
    c.drawCentredString(W / 2, 35, "투자 소개 자료  ·  대외비")
    c.setFont(FBK, 11); c.setFillColor(FAINT)
    c.drawRightString(W - 70, 35, f"{n:02d}")


def shot(c, name, x, y, w, accent=CYAN, label=None):
    """실제 스크린샷 + 네온 프레임. 높이를 반환한다."""
    img = ImageReader(os.path.join(SHOTS, name))
    iw, ih = img.getSize()
    h = w * ih / iw
    c.saveState()
    c.setFillColor(HexColor("#05050c"))
    c.roundRect(x - 5, y - 5, w + 10, h + 10, 9, stroke=0, fill=1)
    c.drawImage(img, x, y, w, h, mask="auto")
    c.setStrokeColor(accent); c.setLineWidth(1.6)
    c.roundRect(x - 5, y - 5, w + 10, h + 10, 9, stroke=1, fill=0)
    if label:
        c.setFillColor(HexColor("#06060e"))
        tw = c.stringWidth(label, FB, 10) + 22
        c.roundRect(x + 6, y + h - 24, tw, 19, 4, stroke=0, fill=1)
        tracked(c, x + 17, y + h - 18, label, FB, 10, accent, track=1.5)
    c.restoreState()
    return h


def fade_down(c, x, y, w, h, steps=48):
    """배경색에서 투명으로 떨어지는 세로 페이드. 이미지 상단의 잘린 경계를 지운다."""
    sh = h / steps
    for i in range(steps):
        c.setFillColor(HexColor("#06060e"))
        c.setFillAlpha(1 - i / (steps - 1))
        c.rect(x, y + h - (i + 1) * sh, w, sh + 1, stroke=0, fill=1)
    c.setFillAlpha(1)


def stat(c, x, y, value, label, col=CYAN, size=44):
    c.setFont(FBK, size); c.setFillColor(col)
    c.drawString(x, y, value)
    c.setFont(FB, 12.5); c.setFillColor(MUT)
    c.drawString(x, y - 24, label)


def bars(c, x, y, w, rows, maxv, unit="", row_h=30):
    lab_w = 200
    bw = w - lab_w - 95
    for i, (label, val, col) in enumerate(rows):
        ry = y - i * row_h
        c.setFont(FB, 13.5); c.setFillColor(MUT)
        c.drawString(x, ry + 3, label)
        c.setFillColor(INK2)
        c.roundRect(x + lab_w, ry - 5, bw, 20, 5, stroke=0, fill=1)
        frac = max(0.0, min(1.0, val / maxv))
        c.setFillColor(col)
        c.roundRect(x + lab_w, ry - 5, max(bw * frac, 4), 20, 5, stroke=0, fill=1)
        c.setFont(FBK, 15); c.setFillColor(col)
        c.drawString(x + lab_w + bw + 14, ry + 3, f"{val:g}{unit}")


def todo_slide(c, n, kicker_text, title_text, prompts, note):
    """창업자만 채울 수 있는 슬라이드. 빈 채로 나가지 않도록 표시한다."""
    bg(c)
    kick(c, kicker_text, GOLD)
    head(c, title_text, col=GOLD)
    c.setFillColor(HexColor("#2a2410")); c.setStrokeColor(GOLD); c.setLineWidth(1.4)
    c.roundRect(W - 320, H - 132, 250, 34, 6, stroke=1, fill=1)
    tracked(c, W - 195, H - 121, "채워 넣을 것", FBK, 13, GOLD, track=3, align="c")

    c.setDash(4, 4)
    c.setStrokeColor(HexColor("#4a4326")); c.setFillColor(HexColor("#0d0c08"))
    c.roundRect(70, 140, W - 140, 330, 10, stroke=1, fill=1)
    c.setDash()
    y = 410
    for p in prompts:
        c.setFillColor(GOLD); c.circle(102, y + 6, 3.5, stroke=0, fill=1)
        c.setFont(FB, 16); c.setFillColor(TXT); c.drawString(122, y, p)
        y -= 36
    para_w(c, 102, 205, note, W - 260, size=12.5, col=FAINT, lead=19, font=FR)
    ir_footer(c, n)
    c.showPage()


c = canvas.Canvas(OUT, pagesize=(W, H))

# ---- 1. 표지 ------------------------------------------------------------
bg(c)
hgrad(c, 0, H - 6, W, 6, CYAN, MAGENTA)
img = ImageReader(os.path.join(SHOTS, "cover-band.png"))
iw, ih = img.getSize()
bh = W * ih / iw
c.drawImage(img, 0, 0, W, bh, mask="auto")
c.setFillColor(HexColor("#06060e")); c.setFillAlpha(0.55)
c.rect(0, 0, W, bh, stroke=0, fill=1)
c.setFillAlpha(1)
fade_down(c, 0, bh - 150, W, 150)

bolt(c, W / 2 - 175, H / 2 + 78, 128, CYAN)
tracked(c, W / 2 - 30, H / 2 + 120, "VOLT", FBK, 124, TXT, track=15)
tracked(c, W / 2, H / 2 + 38, "거짓말할 수 없는 카지노", FBK, 30, CYAN, track=6, align="c")
c.setFont(FB, 18); c.setFillColor(TXT)
c.drawCentredString(W / 2, H / 2 - 10, "모든 결과가 공개된 사실 위에서 정산되는 가격 아케이드.")
c.setFont(FR, 17); c.setFillColor(MUT)
c.drawCentredString(W / 2, H / 2 - 40, "하우스가 뒤에서 굴린 숫자가 아니라.")
c.setFillColor(HexColor("#0c0c18")); c.setStrokeColor(LINE)
c.roundRect(W / 2 - 235, 92, 470, 42, 8, stroke=1, fill=1)
tracked(c, W / 2, 106, "투자 소개 자료   ·   GIWA 테스트넷 가동 중", FB, 13, FAINT, track=3, align="c")
c.showPage()

# ---- 2. 문제 ------------------------------------------------------------
bg(c)
kick(c, "문제", MAGENTA)
head(c, "“프루버블리 페어”는 대개 아무것도 증명하지 않는다")
lead(c, H - 210, [
    "크립토 카지노는 시드 해시를 공개하고 그걸 신뢰라 부릅니다. 하지만 시드는 하우스가",
    "마음을 바꾸지 않았다는 것만 증명할 뿐, 그 숫자가 애초에 공정했는지는 말해주지 않습니다.",
    "결국 하우스를 하우스 기준으로 검증하는 셈입니다.",
], size=16, gap=27)
cols = [
    ("숫자는 비공개다", MAGENTA, ["커밋-리빌 시드는 일관성을", "증명할 뿐 공정성을 증명하지", "않습니다. 하우스가 여전히", "결과를 만들고, 자기 답안을", "자기가 채점합니다."]),
    ("배당은 불투명하다", GOLD, ["배당표는 그냥 사실로 게시될", "뿐입니다. 플레이어가 엣지를", "역산할 방법이 없으니", "“하우스 엣지 1%”는 마케팅", "문구에 지나지 않습니다."]),
    ("자금은 그들의 것이다", CYAN, ["잔고는 회사의 핫월렛에", "있습니다. 지급 능력은 어느 날", "갑자기 아니게 되기 전까지는", "보도자료일 뿐입니다."]),
]
cw, gap = 350, 30
for i, (t_, col, lines) in enumerate(cols):
    x = 70 + i * (cw + gap)
    card(c, x, 190, cw, 215, col)
    c.setFont(FBK, 22); c.setFillColor(col); c.drawString(x + 26, 363, t_)
    para(c, x + 26, 325, lines, size=13.5, col=MUT, lead=23)
ir_footer(c, 2)
c.showPage()

# ---- 3. 통찰 ------------------------------------------------------------
bg(c)
kick(c, "통찰", LIME)
head(c, "하우스가 소유하지 않은 것 위에서 정산한다")
lead(c, H - 210, [
    "14시 03분 22초의 비트코인 가격은 공개된 사실입니다. 거래소가 공표하고, 바뀌지 않고,",
    "누구나 영원히 조회할 수 있습니다. 그 위에 게임을 올리면 공정성은 약속이 아니라",
    "플레이어가 직접 확인할 수 있는 것이 됩니다.",
], size=16, gap=27)

c.setFillColor(INK); c.setStrokeColor(LIME); c.setLineWidth(1.6)
c.roundRect(70, 130, W - 140, 265, 10, stroke=1, fill=1)
c.setFont(FBK, 19); c.setFillColor(LIME); c.drawString(100, 340, "베팅 한 판의 처음부터 끝까지")
steps = [
    ("셀을 탭한다", "가격 구간과 정산 시각을 고른다"),
    ("서버가 값을 매긴다", "서버 자신이 읽은 시세로"),
    ("그 초가 도래한다", "거래소가 1초봉을 공표한다"),
    ("직접 확인한다", "같은 공개 API를 다시 조회"),
]
bwid = (W - 200) / 4
for i, (t_, d) in enumerate(steps):
    x = 100 + i * bwid
    c.setFillColor(LIME); c.circle(x + 6, 288, 5, stroke=0, fill=1)
    c.setFont(FBK, 17); c.setFillColor(TXT); c.drawString(x, 258, t_)
    para_w(c, x, 232, d, bwid - 30, size=13, col=MUT, lead=19)
    if i < 3:
        arrow(c, x + bwid - 34, 288, x + bwid - 12, col=FAINT)
c.setFont(FBK, 16); c.setFillColor(CYAN)
c.drawString(100, 168, "하우스는 결과에 손대지 않는다. 배당만 제시할 뿐이다.")
ir_footer(c, 3)
c.showPage()

# ---- 4. 실제 화면: TAP TRADING ------------------------------------------
bg(c)
kick(c, "제품", CYAN)
head(c, "Tap Trading — 실제 화면")
h_img = shot(c, "hero-tap.png", 70, 118, 745, CYAN, label="VOLT 마켓 · 실제 실행 화면")
rx = 850
c.setFont(FB, 15); c.setFillColor(TXT)
para_w(c, rx, H - 215,
       "왼쪽은 가격, 오른쪽은 격자입니다. 각 칸은 가격 구간과 시각이고, "
       "그 안에 가격이 들어오면 베팅액 × 배수를 받습니다.", W - 70 - rx, size=14.5, col=TXT, lead=23, font=FB)
facts = [
    ("10–46초", "한 판이 끝나는 시간", CYAN),
    ("5×–50×", "격자에 걸리는 배수", MAGENTA),
    ("7%", "모든 칸에 동일한 엣지", LIME),
]
sy = H - 300
for v, l, col in facts:
    stat(c, rx, sy, v, l, col, size=40)
    sy -= 86
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(rx, 122, W - 70 - rx, 92, 8, stroke=1, fill=1)
para_w(c, rx + 18, 190, "노란 테두리 칸이 실제로 걸린 베팅입니다. 화면의 선은 실시간 체결가이며, "
                        "이 스크린샷은 외부 네트워크를 전부 차단한 채 촬영했습니다.",
       W - 70 - rx - 36, size=11.5, col=FAINT, lead=17)
ir_footer(c, 4)
c.showPage()

# ---- 5. 실제 화면: DEATH FUN --------------------------------------------
bg(c)
kick(c, "제품", MAGENTA)
head(c, "Death Fun — 실제 화면")
shot(c, "hero-death.png", 815, 96, 395, MAGENTA, label="라운드 종료 · 판 전체 공개")
LW = 700  # 왼쪽 단 폭 — 이미지가 세로로 길어서 본문에 자리가 많이 남는다
para_w(c, 70, H - 208,
       "안전한 타일을 열수록 배수가 올라가고, 해골을 밟기 전에 멈추면 가져갑니다. "
       "판은 첫 탭 이전에 확정된 시드로 배치되고, 라운드가 끝나면 그 시드가 공개됩니다.",
       LW, size=15, col=TXT, lead=25, font=FB)
c.setFillColor(INK); c.setStrokeColor(MAGENTA); c.setLineWidth(1.4)
c.roundRect(70, 252, LW, 208, 10, stroke=1, fill=1)
c.setFont(FBK, 19); c.setFillColor(MAGENTA); c.drawString(98, 418, "공개된 시드로 재현된다")
para(c, 98, 384, [
    "라운드 시작 전   →   sha256(서버 시드)를 먼저 공개한다",
    "라운드 진행 중   →   해골 위치는 서버에만, 응답은 전부 hidden",
    "라운드 종료 후   →   서버 시드를 공개한다",
], size=13.5, col=MUT, lead=26, font=FB)
para_w(c, 98, 296, "판의 모양부터 해골 배치까지 전부 그 시드에서 나옵니다. 공개된 시드를 다시 돌리면 "
                   "같은 판이 그대로 재현됩니다. 클라이언트 시드는 플레이어가 넣기 때문에, 불리한 판을 "
                   "미리 준비해 둘 수도 없습니다.",
       LW - 56, size=12.5, col=FAINT, lead=19)
# 판은 6×6 격자에서 시드로 깎아낸 모양이라 칸 수가 매번 다르다. 이 라운드는 24칸.
for i, (v, l) in enumerate([("24", "이번 판 타일"), ("15", "숨어 있던 해골"), ("9", "안전 타일")]):
    stat(c, 70 + i * 240, 160, v, l, MAGENTA, size=40)
ir_footer(c, 5)
c.showPage()

# ---- 6. 차별점 ----------------------------------------------------------
bg(c)
kick(c, "차별점", CYAN)
head(c, "결과가 공개된 기록으로 남는다")
lead(c, H - 212, [
    "차이는 배당표가 아니라 증거의 출처입니다. 결과를 누가 만들었고, 무엇과 대조해서",
    "확인할 수 있는가 — 이 두 줄이 나머지를 전부 결정합니다.",
], size=16, gap=27)
rows = [
    ("일반적인 크립토 카지노", MAGENTA, [
        "결과    →  비공개 RNG 추첨",
        "증거    →  하우스 자기 시드의 해시",
        "검증    →  하우스 자기 기록과 대조",
        "엣지    →  주장될 뿐, 역산 불가",
    ]),
    ("VOLT", LIME, [
        "결과    →  거래소가 공표한 가격",
        "증거    →  거래소의 공개 엔드포인트",
        "검증    →  제3자 기록과 대조, 영구히",
        "엣지    →  배당에서 역산 가능",
    ]),
]
cw, gap = 545, 30
for i, (t_, col, lines) in enumerate(rows):
    x = 70 + i * (cw + gap)
    card(c, x, 170, cw, 230, col)
    c.setFont(FBK, 24); c.setFillColor(col); c.drawString(x + 28, 356, t_)
    para(c, x + 28, 316, lines, size=15, col=MUT, lead=34, font=FB)
c.setFont(FBK, 17); c.setFillColor(GOLD)
c.drawCentredString(W / 2, 108, "우리를 믿지 않는 플레이어도 우리를 검증할 수 있다. 그게 제품의 전부다.")
ir_footer(c, 6)
c.showPage()

# ---- 7. 경제성 ----------------------------------------------------------
bg(c)
kick(c, "경제성", GOLD)
head(c, "엣지는 정하는 게 아니라 유도된다")
c.setFillColor(INK); c.setStrokeColor(CYAN); c.setLineWidth(1.4)
c.roundRect(70, 350, 600, 130, 10, stroke=1, fill=1)
# 수식은 모노 폰트가 어울리지만 FM에는 한글 글리프가 없어 두부가 난다. FBK로 쓴다.
c.setFont(FBK, 28); c.setFillColor(TXT)
c.drawCentredString(370, 428, "배수 = (1 − 엣지) / P(적중)")
c.setFont(FB, 13); c.setFillColor(MUT)
c.drawCentredString(370, 390, "P는 시장 자체의 변동성에서 나온다 — 그래서 모든 칸의 기댓값이 같다")
pts = [
    ("매출 = 엣지 × 거래량", "레이크도, 스프레드 장난도, 토큰도 없습니다. 기대 회전량의 7%가 전부입니다."),
    ("누구나 감사할 수 있다", "배수 = (1−엣지)/P 이므로, 게시된 배당을 뒤집으면 정확한 엣지가 나옵니다."),
    ("모든 배당에서 엣지가 같다", "5배 칸과 50배 칸의 가격이 동일합니다. 함정 칸이 없고, 있을 이유도 없습니다."),
]
y = 462
for t_, d in pts:
    c.setFillColor(GOLD); c.rect(720, y, 9, 9, fill=1, stroke=0)
    c.setFont(FBK, 17); c.setFillColor(TXT); c.drawString(742, y, t_)
    para_w(c, 742, y - 24, d, W - 70 - 742, size=13, col=MUT, lead=19)
    y -= 100
c.setFillColor(INK2); c.setStrokeColor(LINE)
c.roundRect(70, 150, 600, 152, 8, stroke=1, fill=1)
c.setFont(FBK, 15); c.setFillColor(CYAN); c.drawString(96, 268, "측정했고, 검증했다")
bars(c, 96, 232, 548, [
    ("목표 엣지", 7.0, FAINT),
    ("실현 — BTC 마켓", 6.8, CYAN),
    ("실현 — VOLT 마켓", 7.0, LIME),
], maxv=8.0, unit="%")
ir_footer(c, 7)
c.showPage()

# ---- 8. 두 마켓 ---------------------------------------------------------
bg(c)
kick(c, "제품 깊이", MAGENTA)
head(c, "두 개의 마켓, 하나의 엔진")
c.setFont(FB, 14.5); c.setFillColor(TXT)
c.drawString(70, H - 207, "엔진이 마켓에 묻는 건 단 하나 — “시각 T의 가격 σ는 얼마인가?”  "
                          "그래서 격자도 차트도 정산도 두 번째 마켓을 알 필요가 없었습니다.")

shot(c, "market-btc.png", 70, 248, 500, CYAN, label="BTC — 실시간 거래소")
# hero-tap.png이 곧 VOLT 마켓 화면이라 4쪽과 같은 파일을 크기만 바꿔 재사용한다.
shot(c, "hero-tap.png", 620, 248, 500, LIME, label="VOLT — 자체 마켓")

info = [
    (70, CYAN, "BTC", ["틱에서 σ를 추정", "엣지 6.5–6.8% 실현", "조용해지면 베팅 정지", "실제 머니: 가능"]),
    (620, LIME, "VOLT", ["공개 스케줄로 σ를 선언", "엣지 정확히 7.00%", "멈추지 않고, 네트워크 불필요", "실제 머니: 불가 — 데모 전용"]),
]
for x, col, name, lines in info:
    c.setFont(FBK, 21); c.setFillColor(col); c.drawString(x, 202, name)
    para(c, x + 82, 204, lines, size=12.5, col=MUT, lead=20)
c.setFont(FB, 13); c.setFillColor(GOLD)
c.drawString(70, 104, "VOLT는 변동성을 측정하지 않고 선언하기 때문에 엣지가 근사치가 아니라 정확합니다.")
c.setFont(FR, 13); c.setFillColor(FAINT)
c.drawString(70, 82, "대신 경로를 브라우저가 생성하므로 미래를 알 수 있어, 실제 머니에서는 쓰지 않습니다.")
ir_footer(c, 8)
c.showPage()

# ---- 9. 해자 ------------------------------------------------------------
bg(c)
kick(c, "해자", CYAN)
head(c, "어려운 건 게임이 아니라 가격 책정이다")
lead(c, H - 212, [
    "실제 가격에 공정한 배당을 걸려면 그 변동성을 알아야 합니다. 실시간 체결에서 이걸",
    "측정하는 일이 진짜 어려운 지점이고, 이 작업을 하지 않은 경쟁자는 눈치 빠른 퀀트",
    "한 명에게 뱅크롤을 조용히 넘겨주게 됩니다.",
], size=16, gap=27)

c.setFillColor(INK); c.setStrokeColor(MAGENTA); c.setLineWidth(1.4)
c.roundRect(70, 140, 640, 265, 10, stroke=1, fill=1)
c.setFont(FBK, 17); c.setFillColor(MAGENTA); c.drawString(96, 368, "순진한 변동성 측정은 처참하게 틀린다")
para_w(c, 96, 342, "체결가는 매수·매도 호가를 오갑니다. 그 튐을 변동성으로 읽으면 추정치가 몇 배로 "
                   "부풀고, 배수는 변동성에 거의 선형이라 그 오차가 배당에 그대로 들어갑니다.",
       590, size=13, col=MUT, lead=19)
bars(c, 96, 258, 590, [
    ("실제 변동성", 1.0, LIME),
    ("틱 단위 순진한 추정", 6.8, MAGENTA),
    ("우리 추정기", 1.02, CYAN),
], maxv=7.2, unit="배", row_h=34)

facts = [
    ("두 개의 격자로 잡음을 뺀다", "체결을 두 가지 간격으로 표본화하면 잡음 항이 분리됩니다. 시뮬레이션 피드에서 "
                                  "중앙값 오차 약 2%까지 내려갑니다."),
    ("추측하지 않고 거부한다", "스프레드가 신호를 덮거나 시장이 멈추면 호가 제시를 중단합니다. 변동성은 "
                              "가드레일 밖에서 잘라 쓰지 않고 아예 거부합니다."),
    ("주장이 아니라 검증", "추정기·엣지·합성 마켓은 시뮬레이션으로, 정산 API 3종은 실제 Postgres 위에서 "
                          "재현합니다."),
]
y = 396
for t_, d in facts:
    c.setFillColor(CYAN); c.rect(745, y, 9, 9, fill=1, stroke=0)
    c.setFont(FBK, 17); c.setFillColor(TXT); c.drawString(767, y, t_)
    para_w(c, 767, y - 24, d, W - 70 - 767, size=13, col=MUT, lead=19)
    y -= 92
ir_footer(c, 9)
c.showPage()

# ---- 10. 엄격함 ---------------------------------------------------------
bg(c)
kick(c, "엄격함", LIME)
head(c, "누가 공격하기 전에 우리가 먼저 공격했다")
lead(c, H - 212, [
    "차익거래가 가능한 하우스는 사업이 아닙니다. 적대적 리뷰와 플레이테스트로 플레이어가",
    "이기는 요청을 만들 수 있는 경로 5건을 찾았습니다. 5건 모두 차단했고, 그중 4건은",
    "원래 익스플로잇을 그대로 재현하는 회귀 테스트를 함께 넣었습니다.",
], size=16, gap=27)
found = [
    ("클라이언트가 만든 배당", "플레이어가 자기 가격 밴드를 직접 그려서, 모델이 가장 잘못 매기는 칸을 계산해 찍을 수 있었습니다.",
     "서버가 자기 격자에 스냅시킨다"),
    ("지연된 호가 차익", "우리 가격이 시장보다 1초 늦었습니다. 상대는 아니었고요.",
     "베팅마다 새 호가, 호가의 나이는 모델이 부담"),
    ("공짜 옵션이 된 환불", "정산을 플레이어가 트리거해서, 진 베팅을 무효·환불될 때까지 재시도할 수 있었습니다.",
     "무효는 실제 시간에 걸친 반복 실패를 요구"),
    ("사후 취소", "걸어둔 베팅을 다시 탭하면 환불됐습니다. 이긴 건 두고 진 건 취소.",
     "취소 자체를 삭제 — 건 베팅은 그대로 간다"),
    ("멈춰버린 시장", "가격이 멈추면 변동성 추정이 깨지는데, 폴백이 계속 후한 배당을 제시했습니다.",
     "폴백 제거 — 측정이 안 되면 호가를 멈춘다"),
]
cw, gap = 215, 16
for i, (t_, d, fix) in enumerate(found):
    x = 70 + i * (cw + gap)
    card(c, x, 155, cw, 250, LIME)
    hl = wrap(c, t_, FBK, 15, cw - 44)
    c.setFont(FBK, 15); c.setFillColor(TXT)
    for j, ln in enumerate(hl):
        c.drawString(x + 22, 375 - j * 20, ln)
    para_w(c, x + 22, 375 - len(hl) * 20 - 16, d, cw - 44, size=11.5, col=MUT, lead=17)
    c.setStrokeColor(LINE); c.setLineWidth(1)
    c.line(x + 22, 245, x + cw - 22, 245)
    tracked(c, x + 22, 224, "고침", FBK, 10, LIME, track=2.5)
    para_w(c, x + 22, 206, fix, cw - 44, size=11, col=TXT, lead=16, font=FB)
c.setFont(FBK, 16); c.setFillColor(GOLD)
c.drawCentredString(W / 2, 105, "하나하나가 실서비스였다면 뱅크롤이 조용히 새어나가는 구멍이었습니다.")
ir_footer(c, 10)
c.showPage()

# ---- 11. 아키텍처 -------------------------------------------------------
bg(c)
kick(c, "구조", CYAN)
head(c, "중요한 곳은 온체인, 빨라야 할 곳은 오프체인")
lead(c, H - 212, [
    "베팅마다 지갑 서명을 받는 게임은 아무도 하지 않습니다. 그렇다고 잔고를 회사 지갑에",
    "두면 아무도 믿지 않습니다. 그래서 자금 보관만 체인에 올리고, 플레이는 서버 원장에서",
    "즉시 처리하되 결과는 외부 기록으로 판정합니다.",
], size=16, gap=27)


def lane(x, w, t_, col, lines, h=175, y=225):
    card(c, x, y, w, h, col)
    c.setFont(FBK, 19); c.setFillColor(col); c.drawString(x + 24, y + h - 42, t_)
    para(c, x + 24, y + h - 78, lines, size=13, col=MUT, lead=21)


lane(70, 330, "볼트 (온체인)", CYAN,
     ["입금액은 회사 지갑이 아니라", "감사 가능한 컨트랙트에 있습니다.", "출금은 운영자가 서명한", "바우처에 대해서만 집행됩니다."])
lane(440, 330, "원장 (오프체인)", MAGENTA,
     ["플레이는 Postgres에서 즉시", "정산됩니다. 가스도 서명도 없고,", "서버 권위형이라 브라우저가", "승리를 만들어낼 수 없습니다."])
lane(810, 330, "정산 (공개)", LIME,
     ["결과는 거래소가 공표한 봉으로", "판정되고, 플레이어가 직접 다시", "조회할 수 있습니다. 산정 근거도", "함께 저장해 재계산됩니다."])
c.setFont(FB, 13.5); c.setFillColor(FAINT)
c.drawString(70, 196, "체인에 닿는 건 입금과 출금뿐입니다. 그 사이는 전부 즉시이고 무료입니다 — 그래서 플레이할 만해집니다.")

# 돈이 실제로 지나가는 경로. 서명이 필요한 지점이 어디인지가 이 슬라이드의 요점이다.
c.setFillColor(INK2); c.setStrokeColor(LINE); c.setLineWidth(1)
c.roundRect(70, 88, W - 140, 92, 8, stroke=1, fill=1)
tracked(c, 94, 152, "돈이 움직이는 경로", FBK, 11, CYAN, track=3)
flow = [
    ("지갑 연결", "서명 없음"),
    ("테스트 토큰 받기", "서명 없음"),
    ("플레이", "원장에서 즉시 정산"),
    ("입금", "사용자 서명은 여기 한 번"),
    ("출금", "운영자 서명 바우처를 중계"),
]
fw = (W - 188) / len(flow)
for i, (t_, d) in enumerate(flow):
    x = 94 + i * fw
    c.setFont(FBK, 13.5); c.setFillColor(TXT); c.drawString(x, 122, t_)
    c.setFont(FB, 10.5); c.setFillColor(MUT); c.drawString(x, 106, d)
    if i < len(flow) - 1:
        arrow(c, x + fw - 42, 126, x + fw - 18, col=FAINT)
ir_footer(c, 11)
c.showPage()

# ---- 12. 현황 -----------------------------------------------------------
bg(c)
kick(c, "현황", LIME)
head(c, "지금 어디까지 왔나")
card(c, 70, 300, 545, 200, LIME)
c.setFont(FBK, 19); c.setFillColor(LIME); c.drawString(96, 452, "테스트넷에서 가동 중")
para(c, 96, 416, [
    "·  두 게임 모두 처음부터 끝까지 플레이 가능",
    "·  두 게임 모두 서버 권위형 정산",
    "·  볼트를 통한 온체인 입출금",
    "·  두 개의 마켓, 6개 검증 스위트",
], size=13.5, col=TXT, lead=24)
card(c, 645, 300, 545, 200, CYAN)
c.setFont(FBK, 19); c.setFillColor(CYAN); c.drawString(671, 452, "다음")
para(c, 671, 416, [
    "·  메인넷 — 테스트 토큰을 실제 토큰으로",
    "·  뱅크롤 및 익스포저 한도",
    "·  VOLT 마켓을 해시 체인으로 실제 머니화",
    "·  지난 라운드 공개 검증 페이지",
], size=13.5, col=MUT, lead=24)
c.setFillColor(INK2); c.setStrokeColor(GOLD); c.setLineWidth(1.2)
c.roundRect(70, 140, W - 140, 130, 8, stroke=1, fill=1)
c.setFont(FBK, 16); c.setFillColor(GOLD); c.drawString(96, 238, "솔직하게 말하면")
para_w(c, 96, 210,
       "아직 실제 돈이 들어가지 않은 테스트넷 제품입니다. 엔진과 커스터디 컨트랙트, 정산 경로는 "
       "만들어졌고 테스트도 되어 있습니다. 아직 증명되지 않은 것은 수요입니다. 다음 마일스톤은 "
       "기능이 아니라 플레이어이고, 이 덱은 프로토타입을 사업처럼 포장하는 대신 그 사실을 그대로 적습니다.",
       W - 200, size=13, col=MUT, lead=20)
ir_footer(c, 12)
c.showPage()

# ---- 13-15. 창업자만 채울 수 있는 슬라이드 ------------------------------
todo_slide(c, 13, "트랙션", "숫자",
           ["연결된 지갑 수 / 재방문 플레이어",
            "플레이된 라운드 수, 총 베팅 규모",
            "리텐션: D1 / D7 / D30",
            "입금·출금, 순 뱅크롤",
            "플레이어 획득 비용 (집행한 게 있다면)"],
           "일부러 비워뒀습니다. 지어낸 트랙션은 미팅을 잃는 가장 빠른 방법이고, 이 덱에서 코드로 "
           "유도할 수 없는 유일한 숫자들이기도 합니다. 원장에서 그대로 뽑으면 됩니다 — 모든 베팅과 "
           "지급이 이미 txns 테이블에 append-only 행으로 쌓여 있습니다.")

todo_slide(c, 14, "팀", "누가 만들고 있나",
           ["창업자 — 이름, 그리고 그 전에 무엇을 했는지",
            "왜 하필 당신들인지 (트레이딩? 게임? 프로토콜?)",
            "자문이 있다면 누구이고 어느 영역인지",
            "이 자금으로 가장 먼저 채용할 사람"],
           "이 단계에서 투자자는 제품보다 팀을 보고 넣습니다. 이 슬라이드의 가장 강한 버전은 여러분의 "
           "배경을 9페이지의 어려운 문제 — 가격 책정 모델 — 에 직접 연결하는 것입니다.")

todo_slide(c, 15, "요청", "얼마를, 어떻게",
           ["금액, 투자 방식, 밸류에이션",
            "확보되는 런웨이 (개월)",
            "자금 용처 — 뱅크롤 / 개발 / 성장",
            "이번 라운드로 도달할 구체적 마일스톤"],
           "뱅크롤은 운영비와 분리해서 잡는 편이 좋습니다. 하우스 엣지는 거래량 위에서만 실현되는데, "
           "뱅크롤이 얇으면 받을 수 있는 베팅 크기가 제한되고 그것이 곧 매출 상한이 됩니다. "
           "오버헤드가 아니라 정당한 투자 항목입니다.")

# ---- 16. 마무리 ---------------------------------------------------------
bg(c)
hgrad(c, 0, H - 6, W, 6, CYAN, MAGENTA)
img = ImageReader(os.path.join(SHOTS, "cover-band.png"))
iw, ih = img.getSize()
bh = W * ih / iw
c.drawImage(img, 0, 0, W, bh, mask="auto")
c.setFillColor(HexColor("#06060e")); c.setFillAlpha(0.62)
c.rect(0, 0, W, bh, stroke=0, fill=1)
c.setFillAlpha(1)
fade_down(c, 0, bh - 150, W, 150)
bolt(c, W / 2 - 160, H / 2 + 92, 104, CYAN)
tracked(c, W / 2 - 22, H / 2 + 122, "VOLT", FBK, 96, TXT, track=13)
c.setFont(FB, 21); c.setFillColor(MUT)
c.drawCentredString(W / 2, H / 2 + 36, "다른 카지노는 자기를 믿어달라고 합니다.")
c.setFont(FBK, 26); c.setFillColor(CYAN)
c.drawCentredString(W / 2, H / 2 - 8, "여기는 영수증을 건넵니다.")
c.setFillColor(HexColor("#0c0c18")); c.setStrokeColor(LINE)
c.roundRect(W / 2 - 260, 108, 520, 46, 8, stroke=1, fill=1)
c.setFont(FB, 13.5); c.setFillColor(FAINT)
c.drawCentredString(W / 2, 124, "[ 연락처  ·  데모 링크  ·  저장소 ]")
c.showPage()

c.save()
print("OK ->", OUT)

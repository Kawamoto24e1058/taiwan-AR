"""開発用のダミー衣装パネルを生成する（実在の部族意匠は使わない汎用図形）。

出力: public/costumes/placeholder-{n}.webp（1080x1620、顔の穴は透過）
顔の穴の座標は public/costumes/costumes.json と一致させること。
"""
import sys
from PIL import Image, ImageDraw

W, H = 1080, 1620
HOLE = (540, 520, 170, 220)  # cx, cy, rx, ry（px）

PALETTES = {
    1: ((44, 62, 80), (192, 57, 43), (241, 196, 15)),
    2: ((30, 70, 60), (22, 160, 133), (236, 240, 241)),
    3: ((60, 40, 80), (142, 68, 173), (230, 126, 34)),
}


def make(n: int, out: str) -> None:
    bg, body, accent = PALETTES[n]
    img = Image.new("RGBA", (W, H), bg + (255,))
    d = ImageDraw.Draw(img)
    cx, cy, rx, ry = HOLE
    # 胴体（汎用の衣服シルエット）
    d.polygon([(cx - 140, cy + ry - 20), (cx + 140, cy + ry - 20),
               (cx + 420, H), (cx - 420, H)], fill=body + (255,))
    # 帯状の装飾（汎用の幾何模様）
    for i, y in enumerate(range(cy + ry + 180, H, 140)):
        d.rectangle([0, y, W, y + 36], fill=accent + (255,))
        for x in range(30 if i % 2 else 100, W, 140):
            d.polygon([(x, y), (x + 35, y + 18), (x, y + 36), (x - 35, y + 18)], fill=bg + (255,))
    # 頭飾り（汎用）
    d.ellipse([cx - rx - 60, cy - ry - 90, cx + rx + 60, cy - ry + 120], fill=accent + (255,))
    # 顔の穴（完全透過）
    hole = Image.new("L", (W, H), 255)
    ImageDraw.Draw(hole).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=0)
    img.putalpha(hole)
    # 「SAMPLE」表記
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 90], fill=(0, 0, 0, 160))
    d.text((40, 30), f"SAMPLE COSTUME {n}  (placeholder / not a real design)", fill=(255, 255, 255, 255))
    img.save(out, "WEBP", quality=82, method=6)


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "public/costumes"
    for n in PALETTES:
        make(n, f"{outdir}/placeholder-{n}.webp")

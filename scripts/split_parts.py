"""衣装レイヤー（1080x1620 RGBA）を、骨格追従用の部品に分ける。

部品は同じ 1080x1620 のキャンバスのまま書き出す（座標系を共通にするため）。
袖は「多角形の範囲内」かつ「白・灰色（彩度が低い）」の画素だけを切り出し、
上に重なる房飾り（色の付いた画素）は上半身側に残す。

使い方: python3 scripts/split_parts.py <衣装レイヤー.webp> <出力ディレクトリ> <部品定義.json>
"""
import json
import os
import sys
from PIL import Image, ImageChops, ImageDraw


def poly_mask(size, poly):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    return m


def low_saturation_mask(img: Image.Image, max_sat: int) -> Image.Image:
    hsv = img.convert("RGB").convert("HSV")
    _, s, _ = hsv.split()
    return s.point(lambda v: 255 if v <= max_sat else 0)


def main(src: str, outdir: str, spec_path: str) -> None:
    img = Image.open(src).convert("RGBA")
    spec = json.load(open(spec_path))
    os.makedirs(outdir, exist_ok=True)
    alpha = img.getchannel("A")
    remaining = Image.new("L", img.size, 255)  # まだどの部品にも割り当てていない画素
    for part in spec["parts"]:
        if part.get("rest"):
            m = remaining
        else:
            m = poly_mask(img.size, part["polygon"])
            if "maxSaturation" in part:
                m = ImageChops.multiply(m, low_saturation_mask(img, part["maxSaturation"]))
            m = ImageChops.multiply(m, remaining)
        remaining = ImageChops.subtract(remaining, m)
        out = img.copy()
        out.putalpha(ImageChops.multiply(alpha, m))
        path = os.path.join(outdir, f"{part['id']}.webp")
        out.save(path, "WEBP", quality=85, method=6)
        print(part["id"], os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main(*sys.argv[1:4])

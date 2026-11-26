"""AI下絵（白背景・顔ありのマネキン）を、アプリ用の衣装レイヤーに変換する。

- 白背景を透過（外周から塗りつぶし）
- 顔（肌色の領域）を透過して「顔の穴」にする
- 1080x1620 のキャンバスに中央配置して WebP（透過あり）で出力
- 顔の穴の外接矩形を表示（costumes.json の anchor に転記する）

使い方: python3 scripts/process_costume.py <入力画像> <出力.webp> <顔の内側の点x,y>
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = 1080, 1620
SENTINEL = (255, 0, 255)


def flood_mask(rgb: Image.Image, seeds, thresh: int) -> Image.Image:
    work = rgb.copy()
    for s in seeds:
        if work.getpixel(s) != SENTINEL:
            ImageDraw.floodfill(work, s, SENTINEL, thresh=thresh)
    # SENTINEL になった画素 = 塗りつぶし領域
    diff = ImageChops.difference(work, Image.new("RGB", work.size, SENTINEL)).convert("L")
    return diff.point(lambda v: 255 if v == 0 else 0)


def main(src: str, dst: str, face_xy: str) -> None:
    rgb = Image.open(src).convert("RGB")
    w, h = rgb.size
    fx, fy = (int(v) for v in face_xy.split(","))

    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    bg = flood_mask(rgb, corners, thresh=14)
    face = flood_mask(rgb, [(fx, fy)], thresh=30)
    # 顔の縁の輪郭線も消すため少し広げる
    face = face.filter(ImageFilter.MaxFilter(7))

    cut = ImageChops.lighter(bg, face)
    alpha = ImageChops.invert(cut).filter(ImageFilter.GaussianBlur(1.2))
    rgba = rgb.copy()
    rgba.putalpha(alpha)

    scale = min(W / w, H / h)
    nw, nh = round(w * scale), round(h * scale)
    rgba = rgba.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox, oy = (W - nw) // 2, (H - nh) // 2
    out.paste(rgba, (ox, oy))
    out.save(dst, "WEBP", quality=85, method=6)

    bx0, by0, bx1, by1 = face.getbbox()
    sx = lambda v: round(v * scale + ox)
    sy = lambda v: round(v * scale + oy)
    print(f"face hole bbox (output coords): x={sx(bx0)}..{sx(bx1)} y={sy(by0)}..{sy(by1)}")
    print(f'suggested anchor: {{"cx": {(sx(bx0)+sx(bx1))//2}, "cy": {(sy(by0)+sy(by1))//2}, "width": {sx(bx1)-sx(bx0)}, "height": {sy(by1)-sy(by0)}}}')


if __name__ == "__main__":
    main(*sys.argv[1:4])

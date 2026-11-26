"""AI下絵（白背景・顔ありのマネキン）を、アプリ用の衣装レイヤーに変換する。

- 白背景を透過（外周から塗りつぶし）
- 顔（肌色の領域）を透過して「顔の穴」にする
- 1080x1620 のキャンバスに中央配置して WebP（透過あり）で出力
- 顔の穴の外接矩形を表示（costumes.json の anchor に転記する）

- 肌の色（マネキンの腕・手・首・脚）を透過して、本人の腕や足が見えるようにする（--skin R,G,B）
- 指定した点から塗りつぶした領域を透過する（--remove x,y;x,y）
- 指定した高さより下を透過する（靴など。--cut-below Y、入力画像の座標）

使い方:
  python3 scripts/process_costume.py <入力画像> <出力.webp> <顔の内側の点x,y> [--skin R,G,B] [--remove x,y;x,y] [--cut-below Y]
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


def skin_mask(rgb: Image.Image, color, tol=(14, 16, 18)) -> Image.Image:
    """肌色に近い画素のマスク。輪郭線も消すため、閉じる処理（膨張→収縮）のあと少し広げる"""
    r, g, b = rgb.split()
    def band(ch, c, t):
        return ch.point(lambda v: 255 if abs(v - c) <= t else 0)
    m = ImageChops.multiply(ImageChops.multiply(band(r, color[0], tol[0]), band(g, color[1], tol[1])), band(b, color[2], tol[2]))
    raw = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    # 小さな点（衣装の中の肌に近い色）を消し、大きな肌の領域（腕・脚・首）だけを種にする
    m = raw.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    # 種から、つながっている肌色の画素へ広げる（指先など細い部分も拾う。形態学的再構成）
    for _ in range(40):
        grown = ImageChops.darker(m.filter(ImageFilter.MaxFilter(3)), raw)
        if ImageChops.difference(grown, m).getbbox() is None:
            break
        m = grown
    # 隙間を埋めてから、輪郭線の分だけ広げる
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return m.filter(ImageFilter.MaxFilter(9))


def main(src: str, dst: str, face_xy: str, skin=None, remove=None, cut_below=None) -> None:
    rgb = Image.open(src).convert("RGB")
    w, h = rgb.size
    fx, fy = (int(v) for v in face_xy.split(","))

    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    bg = flood_mask(rgb, corners, thresh=14)
    face = flood_mask(rgb, [(fx, fy)], thresh=30)
    # 顔の縁の輪郭線も消すため少し広げる
    face = face.filter(ImageFilter.MaxFilter(7))

    cut = ImageChops.lighter(bg, face)
    if skin:
        cut = ImageChops.lighter(cut, skin_mask(rgb, skin))
    if remove:
        extra = flood_mask(rgb, remove, thresh=12).filter(ImageFilter.MaxFilter(11))
        cut = ImageChops.lighter(cut, extra)
    if cut_below is not None:
        below = Image.new("L", (w, h), 0)
        ImageDraw.Draw(below).rectangle([0, cut_below, w, h], fill=255)
        cut = ImageChops.lighter(cut, below)
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
    args = sys.argv[1:]
    skin = remove = None
    if "--skin" in args:
        i = args.index("--skin")
        skin = tuple(int(v) for v in args[i + 1].split(","))
        del args[i:i + 2]
    if "--remove" in args:
        i = args.index("--remove")
        remove = [tuple(int(v) for v in pt.split(",")) for pt in args[i + 1].split(";")]
        del args[i:i + 2]
    cut_below = None
    if "--cut-below" in args:
        i = args.index("--cut-below")
        cut_below = int(args[i + 1])
        del args[i:i + 2]
    main(*args[:3], skin=skin, remove=remove, cut_below=cut_below)

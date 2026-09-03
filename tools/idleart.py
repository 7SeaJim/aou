"""把朋友给的待机组图做成小屋里那段动画。

给的是 2048×2048 的 PNG,四帧一轮,**本身就是像素画**(上一批 128px 的 JPEG
描出来一圈毛边,这批没有这个问题 —— 2048 缩到 124 是十六比一的面积平均,
再多的抗锯齿也平掉了)。

这里只干两件事:

1. **四帧按同一个并集框裁**,再一起缩。各裁各的会让身子在四帧之间跳 ——
   动画里该动的只有翅膀。
2. **换表情。** 给的是一只哭得很凶的哇鸥(大眼泪 + 张嘴嚎),而待机要的是
   形象稿那张脸。眼泪抹掉、整张脸推平,再把**描出来的形象稿**(`HUT_WAOU`)
   上的两只梯子眼和红三角嘴搬过来 —— 它俩本来就是同一份形象稿,
   搬过来才谈得上「一致」;照着手描一遍只会多出一份不一样的脸。

用法:
    python3 tools/idleart.py ~/Downloads/0902_2.PNG ... --name HUT_IDLE --h 124
"""
import argparse
import json
from collections import deque

from PIL import Image

from pal import PAL
from scenery import HUT_WAOU
from trace import snap, despeckle

# 这批图用得到的色:轮廓/翅膀、身子、肚皮阴影、嘴和脚的红、眼泪的蓝
KEYS = list('KwVXrBbAaN')
TEARS = set('BbN')          # 眼泪:整块抹掉
RED = set('Xr')             # 嘴和脚都是红的,靠位置分

# **脸从哪儿来:`HUT_WAOU`,也就是描出来的那张正面形象稿。**
#
# 原稿这批像素图是哭的(眯眼 + 眼泪 + 张嘴嚎),而待机要的是形象稿那张脸:
# 梯子眼带睫毛 + 红三角小嘴。与其照着手描一遍,不如**把那三块直接搬过来** ——
# 它本来就是同一份形象稿,搬过来才谈得上「一致」。
FACE_SEEDS = [((20, 39), (38, 55), 'K'),      # 左眼:在这个框里找一个 K 当种子
              ((68, 39), (88, 55), 'K'),      # 右眼
              ((44, 52), (66, 62), 'KXr')]    # 嘴(红 + 描边)
FACE_SCALE = 0.85      # 这批身子比形象稿胖,脸照原大小搬过来会显得挤
FACE_EYE_Y = 30        # 眼睛落在身子的第几行
FACE_CX = 82           # 脸的中轴
# 先推平的那块(上,下,左,右)。**下边要盖住张开的嘴** ——
# 哭那张的嘴一直张到第 55 行往下,只推平到 50 会在新嘴底下留一弯红,
# 看着像伸出来的舌头(第一版就是这样)
FACE_CLEAR = (10, 62, 38, 126)


def blobs(g, chars):
    h, w = len(g), len(g[0])
    seen = [[0] * w for _ in range(h)]
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if g[y0][x0] in chars and not seen[y0][x0]:
                q = deque([(x0, y0)])
                seen[y0][x0] = 1
                cells = []
                while q:
                    x, y = q.popleft()
                    cells.append((x, y))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = x + dx, y + dy
                            if (0 <= nx < w and 0 <= ny < h and not seen[ny][nx]
                                    and g[ny][nx] in chars):
                                seen[ny][nx] = 1
                                q.append((nx, ny))
                out.append(cells)
    out.sort(key=len, reverse=True)
    return out


def _blob(g, seed, chars):
    x0, y0 = seed
    q = deque([(x0, y0)])
    seen = {(x0, y0)}
    cells = []
    h, w = len(g), len(g[0])
    while q:
        x, y = q.popleft()
        cells.append((x, y))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen
                        and g[ny][nx] in chars):
                    seen.add((nx, ny))
                    q.append((nx, ny))
    return cells


def face_parts():
    """从描出来的形象稿里抠出两只眼和一张嘴"""
    out = []
    for (x0, y0), (x1, y1), chars in FACE_SEEDS:
        seed = next(((x, y) for y in range(y0, y1) for x in range(x0, x1)
                     if HUT_WAOU[y][x] in chars), None)
        if seed:
            out.append(_blob(HUT_WAOU, seed, chars))
    return out


def calm(g):
    """哭脸换成待机脸:抹眼泪、推平整张脸、把形象稿的眼和嘴搬过来"""
    h, w = len(g), len(g[0])
    # 眼泪。**光抹蓝色不够** —— 泪痕的边缘归色时落在灰(V/A/a)上,
    # 只抹蓝会在身上留两道浅灰的沟。把蓝块胀两格,罩住的灰一起推平成身子
    mask = set()
    for cells in blobs(g, TEARS):
        for x, y in cells:
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    mask.add((x + dx, y + dy))
    for x, y in mask:
        if 0 <= y < h and 0 <= x < w and g[y][x] in 'BbNVAa':
            g[y][x] = 'w'
    # 整张脸推平成身子,再贴形象稿的脸。
    # **不是只换嘴** —— 哭那张的眼睛是眯着的,眯眼配小嘴读起来是「忍着」,
    # 待机要的是睁着的梯子眼
    t, b, l, r = FACE_CLEAR
    for y in range(t, min(b, h)):
        for x in range(l, min(r, w)):
            if g[y][x] != '.':
                g[y][x] = 'w'
    # 推平之后再扫一遍红:张开的嘴下沿常常拖出一两行,落在推平框外面,
    # 看着像新嘴底下伸出来的舌头。**脚也是红的**,所以只扫脸那一段
    for y in range(t, min(b + 14, h)):
        for x in range(w):
            if g[y][x] in 'Xr':
                g[y][x] = 'w'
    parts = face_parts()
    if not parts:
        return g
    xs = [x for p in parts for x, _ in p]
    eyes = parts[0] + parts[1] if len(parts) > 1 else parts[0]
    cx0 = (min(xs) + max(xs)) // 2
    cy0 = (min(y for _, y in eyes) + max(y for _, y in eyes)) // 2
    for p in parts:
        for x, y in p:
            nx = FACE_CX + round((x - cx0) * FACE_SCALE)
            ny = FACE_EYE_Y + round((y - cy0) * FACE_SCALE)
            if 0 <= ny < h and 0 <= nx < w and g[ny][nx] != '.':
                g[ny][nx] = HUT_WAOU[y][x]
    return g


def build(paths, th, keep_face=False):
    ims = [Image.open(p).convert('RGBA') for p in paths]
    bbs = [im.getbbox() for im in ims]
    # **同一个并集框** —— 各裁各的会让身子在四帧之间跳
    U = (min(b[0] for b in bbs), min(b[1] for b in bbs),
         max(b[2] for b in bbs), max(b[3] for b in bbs))
    W, H = U[2] - U[0], U[3] - U[1]
    s = th / H
    out = []
    for im in ims:
        c = im.crop(U).resize((round(W * s), th), Image.BOX)
        g = despeckle(snap(c, KEYS), 1)
        out.append(g if keep_face else calm(g))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='+')
    ap.add_argument('--name', default='HUT_IDLE')
    ap.add_argument('--h', type=int, default=124)
    ap.add_argument('--keep-face', action='store_true')
    ap.add_argument('--json', default='')
    ap.add_argument('--out', default='')
    a = ap.parse_args()
    gs = build(a.src, a.h, a.keep_face)
    if a.json:
        json.dump(gs, open(a.json, 'w'))
    body = ',\n\n'.join(
        '[\n' + ',\n'.join('"%s"' % ''.join(r) for r in g) + ',\n]' for g in gs)
    src = '%s = [\n%s,\n]\n' % (a.name, body)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)
    print('# %s  %d 帧  %d×%d' % (a.name, len(gs), len(gs[0][0]), len(gs[0])))


if __name__ == '__main__':
    main()

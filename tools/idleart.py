"""把朋友给的待机组图做成小屋里那段动画。

给的是 2048×2048 的 PNG,四帧一轮,**本身就是像素画**(上一批 128px 的 JPEG
描出来一圈毛边,这批没有这个问题 —— 2048 缩到 124 是十六比一的面积平均,
再多的抗锯齿也平掉了)。

这里只干两件事:

1. **四帧按同一个并集框裁**,再一起缩。各裁各的会让身子在四帧之间跳 ——
   动画里该动的只有翅膀。
2. **换表情。** 给的是一只哭得很凶的哇鸥(大眼泪 + 张嘴嚎),
   而小屋里那段是待机。眼泪抹掉、张开的嘴换成形象稿那个红三角小嘴;
   **眯着的眼睛和睫毛原样留着** —— 去掉眼泪之后它读起来正好是「眯眼舒服着」,
   那几笔是人家画的,没有理由重描一遍。

用法:
    python3 tools/idleart.py ~/Downloads/0902_2.PNG ... --name HUT_IDLE --h 124
"""
import argparse
import json
from collections import deque

from PIL import Image

from pal import PAL
from trace import snap, despeckle

# 这批图用得到的色:轮廓/翅膀、身子、肚皮阴影、嘴和脚的红、眼泪的蓝
KEYS = list('KwVXrBbAaN')
TEARS = set('BbN')          # 眼泪:整块抹掉
RED = set('Xr')             # 嘴和脚都是红的,靠位置分

# 形象稿那个红三角小嘴。**换的是嘴,不是脸** —— 眼睛和睫毛用人家原来的
BEAK = [
    "..KKKKKKKKK..",
    "..KXXXXXXXK..",
    "...KXXXXXK...",
    "...KXXXXXK...",
    "....KXXXK....",
    "....KXXXK....",
    ".....KXK.....",
    ".....KKK.....",
]


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


def calm(g):
    """哭脸改成待机脸:抹眼泪、封嘴、点一个红三角"""
    h, w = len(g), len(g[0])
    # 眼泪。**光抹蓝色不够** —— 泪痕的边缘归色时落在灰(V/A/a)上,
    # 只抹蓝会在身上留两道浅灰的沟。把蓝块胀两格,罩住的灰一起推平成身子;
    # 只动灰,不动轮廓(K),所以睫毛和眼睛碰不着
    mask = set()
    for cells in blobs(g, TEARS):
        for x, y in cells:
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    mask.add((x + dx, y + dy))
    for x, y in mask:
        if 0 <= y < h and 0 <= x < w and g[y][x] in 'BbNVAa':
            g[y][x] = 'w'
    # 嘴:脸那一带的红。**脚也是红的**,所以只看上面六成五;
    # 而张开的嘴是「红外圈 + 深色内里 + 粉舌头」好几块,
    # 只清最大的那块会剩下一半(第三帧就是这么露的馅)—— 取所有红块的并集框
    ups = [b for b in blobs(g, RED) if min(y for _, y in b) < h * 0.65]
    if not ups:
        return g
    xs = [x for b in ups for x, _ in b]
    ys = [y for b in ups for _, y in b]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g[y][x] != '.':
                g[y][x] = 'w'          # 整个嘴框推平成身子
    bw, bh = len(BEAK[0]), len(BEAK)
    bx = (x0 + x1) // 2 - bw // 2
    by = y0 + 1
    for dy in range(bh):
        for dx in range(bw):
            ch = BEAK[dy][dx]
            if ch == '.':
                continue
            y, x = by + dy, bx + dx
            if 0 <= y < h and 0 <= x < w and g[y][x] != '.':
                g[y][x] = ch
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

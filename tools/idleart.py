"""把朋友给的像素稿做成小屋里那只待机的哇鸥。

给的是 2048×2048 的 PNG,**本身就是像素画** —— 一格 22×22 像素,
所以它真正的分辨率是 78×58,2048 只是导出时放大的。

**这一条是这个脚本的全部要害。** 第一版我按目标尺寸(112 高)去缩,
边线碎成一团、眼睛的笔画全乱,他一眼就看出来了 ——
因为 58 缩到 112 是 1.93 倍,**一格被切成小数格**。正确的做法是:

    先按原生格子取样(NEAREST 到 58 高:点落在格子中心上,一个色都不混)
    → 归色 → 换脸 → **整数倍放大**(×2 = 116 高)

放大必须用整数倍,一格就是干净的 2×2。而 BOX / LANCZOS 那类平均法在这儿是毒药:
它把一像素宽的描边平均进白底里,**描边会直接消失**(试过,整只鸟没了轮廓)。

第二件事是换表情。给的是一只哭得很凶的哇鸥(大眼泪 + 张嘴嚎),
而待机要的是形象稿那张脸:梯子眼带睫毛 + 红三角小嘴。做法是把形象稿缩到
「它的球和这只的球一样宽」,再按连通块把两只眼和一张嘴搬过来 ——
**两边本来就是同一份形象稿,搬过来才谈得上一致**;照着手描只会多出第三张脸。

用法:
    python3 tools/idleart.py <哭_3.png> --name HUT_IDLE --out /tmp/x.py
"""
import argparse
from collections import deque

from PIL import Image

from trace import snap, despeckle

# 这批图用得到的色:轮廓/翅膀、身子、肚皮阴影、嘴和脚的红、眼泪的蓝
KEYS = list('KwVXrBbAaN')
TEARS = set('BbN')          # 眼泪:整块抹掉
RED = set('Xr')             # 嘴和脚都是红的,靠位置分

NATIVE_H = 58               # 原生格子的高(2048 里一格 22 像素)
ZOOM = 2                    # 整数倍放大
FACE_SRC = 'art/形象稿/形象稿_正面.png'
FACE_SRC_H = 77             # 形象稿缩到这个高,它的球正好和身子的球一样宽(68)
FACE_EYE_TOP = 19           # 眼睛的上沿落在身子的第几行(原生格)
FACE_CLEAR = (6, 44, 8, 70)     # 先推平的那块(上,下,左,右),原生格


def blobs(g, chars):
    """按八邻接分连通块,大的在前"""
    h, w = len(g), len(g[0])
    seen = set()
    out = []
    for y in range(h):
        for x in range(w):
            if g[y][x] in chars and (x, y) not in seen:
                q = deque([(x, y)])
                seen.add((x, y))
                cells = []
                while q:
                    cx, cy = q.popleft()
                    cells.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if (0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen
                                    and g[ny][nx] in chars):
                                seen.add((nx, ny))
                                q.append((nx, ny))
                out.append(cells)
    out.sort(key=len, reverse=True)
    return out


def face_parts():
    """从形象稿里抠出两只眼和一张嘴,已经缩到和身子一个尺度。

    **按连通块抠,不按矩形框。** 框住的那一片里还有形象稿自己的翅膀尖,
    整块搬过来会在身上多出两个黑三角(第一版就是这样)。
    """
    im = Image.open(FACE_SRC)
    im = im.crop(im.getbbox())
    w, h = im.size
    g = despeckle(snap(im.resize((round(w * FACE_SRC_H / h), FACE_SRC_H), Image.BOX),
                       list('KwVX')), 1)
    parts = []
    for bl in blobs(g, 'K'):                      # 两只眼:大小和位置都在这一档
        ys = [y for _, y in bl]
        if 90 < len(bl) < 200 and 18 <= min(ys) and max(ys) <= 38:
            parts.append(bl)
    for bl in blobs(g, 'KXr'):                    # 嘴:红 + 描边,在眼睛下面一点
        ys = [y for _, y in bl]
        if 30 < len(bl) < 400 and 28 <= min(ys) <= 36:
            parts.append(bl)
            break
    return [(x, y, g[y][x]) for bl in parts for x, y in bl]


def calm(g, face):
    """哭脸换成待机脸:抹眼泪、推平整张脸、把形象稿的眼和嘴搬过来"""
    h, w = len(g), len(g[0])
    # 眼泪。**光抹蓝色不够** —— 泪痕的边缘归色时落在灰(V/A/a)上,
    # 只抹蓝会在身上留两道浅灰的沟。把蓝块胀一格,罩住的灰一起推平成身子
    mask = set()
    for cells in blobs(g, TEARS):
        for x, y in cells:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    mask.add((x + dx, y + dy))
    for x, y in mask:
        if 0 <= y < h and 0 <= x < w and g[y][x] in 'BbNVAa':
            g[y][x] = 'w'
    # 整张脸推平成身子。**不是只换嘴** —— 哭那张的眼睛是眯着的,
    # 眯眼配小嘴读起来是「忍着」,待机要的是睁着的梯子眼
    t, b, l, r = FACE_CLEAR
    for y in range(t, min(b, h)):
        for x in range(l, min(r, w)):
            if g[y][x] != '.':
                g[y][x] = 'w'
    # 推平之后再扫一遍脸那一段的红:张开的嘴常常拖到框外面,
    # 留一弯红在新嘴底下,看着像伸出来的舌头。**脚也是红的**,所以只扫上半
    for y in range(t, min(b + 8, h)):
        for x in range(w):
            if g[y][x] in RED:
                g[y][x] = 'w'
    if not face:
        return g
    # 贴脸:横向对球的中轴(拿头顶那几行量,那儿没有翅膀),纵向按眼睛的上沿
    mid = [[x for x in range(w) if g[y][x] != '.'] for y in range(6, 14)]
    mid = [xs for xs in mid if xs]
    cx = round(sum((min(xs) + max(xs)) / 2 for xs in mid) / max(1, len(mid)))
    fx0 = (min(x for x, _, _ in face) + max(x for x, _, _ in face)) // 2
    fy0 = min(y for _, y, _ in face)
    for x, y, ch in face:
        nx, ny = cx + (x - fx0), FACE_EYE_TOP + (y - fy0)
        if 0 <= ny < h and 0 <= nx < w and g[ny][nx] != '.':
            g[ny][nx] = ch
    return g


def zoom(g, n):
    """整数倍放大。一格变成 n×n,边线一点不糊"""
    return [list(''.join(c * n for c in row)) for row in g for _ in range(n)]


def build(paths, native_h=NATIVE_H, z=ZOOM, keep_face=False):
    ims = [Image.open(p).convert('RGBA') for p in paths]
    bbs = [im.getbbox() for im in ims]
    # **同一个并集框** —— 各裁各的会让身子在帧之间跳
    U = (min(b[0] for b in bbs), min(b[1] for b in bbs),
         max(b[2] for b in bbs), max(b[3] for b in bbs))
    W, H = U[2] - U[0], U[3] - U[1]
    face = None if keep_face else face_parts()
    out = []
    for im in ims:
        # **NEAREST,不是 BOX** —— 见文件开头
        c = im.crop(U).resize((round(W * native_h / H), native_h), Image.NEAREST)
        g = [list(r) for r in snap(c, KEYS)]
        if not keep_face:
            g = calm(g, face)
        out.append(zoom(g, z))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='+')
    ap.add_argument('--name', default='HUT_IDLE')
    ap.add_argument('--native', type=int, default=NATIVE_H)
    ap.add_argument('--zoom', type=int, default=ZOOM)
    ap.add_argument('--keep-face', action='store_true')
    ap.add_argument('--out', default='')
    a = ap.parse_args()
    gs = build(a.src, a.native, a.zoom, a.keep_face)
    if len(gs) > 1:
        body = ',\n\n'.join(
            '[\n' + ',\n'.join('"%s"' % ''.join(r) for r in g) + ',\n]' for g in gs)
    else:
        body = ',\n'.join('"%s"' % ''.join(r) for r in gs[0])
    src = '%s = [\n%s,\n]\n' % (a.name, body)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)
    print('# %s  %d 帧  %d×%d' % (a.name, len(gs), len(gs[0][0]), len(gs[0])))


if __name__ == '__main__':
    main()

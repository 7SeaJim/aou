"""从待机那张画出睡着的哇鸥。

他给的睡觉参考是 ~/Downloads/0904_1.GIF(16 帧,400×400,和待机那组同一套线稿),
要求是「**在已有的待机动作上进行绘制**」—— 所以这里不重新描一遍稿,
直接拿 `HUT_IDLE` 改三处,别的一格不动:

    1. 睁着的那对梯子眼抹平,换成两道**微微向右下斜的短横** —— 参考里就是这样,
       几乎是平的。画成明显的下弯弧会变成哭脸,上弯弧又变成在笑,都不是睡着
    2. 别的什么都不改。身子、嘴、肚皮、脚、垂着的那对翅膀全照搬 ——
       同一只鸟睡着了,不是另一只鸟

**参考图右上那个白椭圆不在这张图里。** 我一开始把它读成「举起来的一只翅膀」,
照着描进了精灵图 —— 他一眼看穿:「那个椭圆是鼻涕泡」。16 帧里它一直在涨缩
(顶边在 y=153 和 y=101 之间来回,根不动),那本来就是个动效,不是姿势。
既然是动效就该画在代码里(`hut.js` 的 `drawBubble`),不该烙进一张静图。

> **一张「静态」的参考图给了 16 帧,说明动的是画里的某样东西,不是整只鸟。**
> 我当时看出「16 帧几乎一样」,却推成了「所以这张是静的」——
> 差的那一步是去问:那到底哪儿在动。

姿势不做动画:他说「睡觉动作不需要动态,只需要右上角几个 zzzz 的符号偶尔飘出」,
所以这张是**一张静图**,飘的 Z 由 `drawZzz()` 画,和这张图无关。

举起的翅膀那几个数是量参考图量出来的,按身子那只球归一化(球心、半宽、半高),
换算到 156×116 上 —— 这样以后原稿改了尺寸,比例还是对的。量法见 DESIGN.md。
"""
import argparse
import math
import sys

BG = '.'
INK = 'K'
FILL = 'w'


# 闭上的眼:在原来那只眼的下三分之一处画一道短横,右端低两格
EYE_DROP = 0.62             # 横线落在原眼框高度的百分之几处
EYE_TILT = 2                # 右端比左端低几格
EYE_THICK = 4


def eye_blobs(g):
    """找出脸上那两块最大的墨 —— 就是两只眼(嘴在更下面,按行范围排除)"""
    from collections import deque
    h, w = len(g), len(g[0])
    seen = set()
    out = []
    for y in range(20, 62):
        for x in range(30, 130):
            if g[y][x] != INK or (x, y) in seen:
                continue
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
                                and g[ny][nx] == INK):
                            seen.add((nx, ny))
                            q.append((nx, ny))
            out.append(cells)
    # **嘴也是一块又大又黑的东西,而且它的上沿就在眼睛下沿附近** ——
    # 第一版只按大小挑,把嘴当成眼睛抹平了,脸上多出一道横杠。
    # 嘴跨在中轴上,眼睛不跨:按这个分,比调行号范围稳
    mid = len(g[0]) / 2
    out = [c for c in out if 100 < len(c) < 900
           and not (min(p[0] for p in c) < mid < max(p[0] for p in c))]
    out.sort(key=lambda c: min(p[0] for p in c))
    return out[:2]


def close_eyes(grid):
    g = [''.join(r) for r in grid]
    for cells in eye_blobs(g):
        xs = [p[0] for p in cells]
        ys = [p[1] for p in cells]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        for x, y in cells:                       # 先把睁着的眼抹平
            grid[y][x] = FILL
        cy = y0 + (y1 - y0) * EYE_DROP
        for i, x in enumerate(range(x0, x1 + 1)):
            t = i / max(1, x1 - x0)
            top = round(cy + EYE_TILT * t)
            for y in range(top, top + EYE_THICK):
                grid[y][x] = INK


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='', help='待机网格的 .py(不传就读 scenery)')
    ap.add_argument('--name', default='HUT_SLEEP')
    ap.add_argument('--out', default='')
    a = ap.parse_args()

    sys.path.insert(0, 'tools')
    if a.src:
        ns = {}
        exec(open(a.src, encoding='utf-8').read(), ns)
        base = ns['HUT_IDLE']
    else:
        import scenery
        base = scenery.HUT_IDLE
    g = [list(r) for r in base]
    h, w = len(g), len(g[0])

    close_eyes(g)
    rows = [''.join(r) for r in g]
    src = '%s = [\n%s,\n]\n' % (a.name, ',\n'.join('"%s"' % r for r in rows))
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)


if __name__ == '__main__':
    main()

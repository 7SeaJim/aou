"""把朋友给的形象稿描成字符网格。

形象稿是 128~1638 像素的线稿(白底 JPEG),而游戏里的东西是
`tools/*.py` 里那种一个字符一个像素的网格。这个脚本是两者之间的桥。

**它只干「缩小 + 归色 + 去噪」三件事,不修构图。** 出来的网格照旧是
可读的字符,拿去 scenery.py 里手改和别的素材没有区别 ——
这一条是故意的:形象稿会再版,而手改过的地方不该被下一次覆盖掉。

量过的结论(见 DESIGN.md《形象稿落地》):

    ≥64px   缩下来干净,能直接用(小屋那两张 124×108、待机大图 101×131)
    32px    勉强,眼睛和嘴还认得出,轮廓要手工收
    16px    只能照着重画 —— 线稿的一根线到这儿只剩不到一个像素

用法:
    python3 tools/trace.py art/形象稿/睡觉参考.png --w 124 --h 108 --name HUT_SLEEP
    python3 tools/trace.py art/形象稿/形象稿_正面.png --h 110 --name GULL_BIG --crop 0,0,1,0.72
"""
import argparse
from collections import deque, Counter

from PIL import Image

from pal import PAL

# 哇鸥身上只该有这几个色。**不给它整块调色板去挑** ——
# 让它自由发挥的话,肚皮的灰会被判成木头色,轮廓会被判成海水青
BIRD_KEYS = ['K', 'w', 'V', 'X', 'A', 'a', 'h', 'r']


def _rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def key_bg(im, thr=232, fuzz=14):
    """从四边泛洪抠背景。

    **不能按颜色抠。** 哇鸥是只白鸟,画在白底上 —— 按颜色抠会把它自己的
    肚子和身体一起抠掉,剩一圈轮廓(第一版就是这么翻的车,一眼就看出来了)。
    从边上漫进来,碰到轮廓线就停,里面那片白才留得住。
    """
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()

    def bg(x, y):
        r, g, b, _ = px[x, y]
        return min(r, g, b) >= thr and max(r, g, b) - min(r, g, b) <= fuzz

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and bg(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and bg(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and bg(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if seen[y * w + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def keep_main(im, keep=1):
    """只留最大的几块,别的擦掉。

    睡觉那张的右上角有两个「Z」—— 而 `drawZzz()` 已经在画 Z 了,
    描进素材里就是两套。**裁一刀裁不干净**(它们和鸟的横坐标是重叠的),
    按连通块挑才行。
    """
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    blobs = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] == 0 or seen[y0 * w + x0]:
                continue
            q = deque([(x0, y0)])
            seen[y0 * w + x0] = 1
            cells = []
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if (0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]
                                and px[nx, ny][3] > 0):
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
            blobs.append(cells)
    blobs.sort(key=len, reverse=True)
    for cells in blobs[keep:]:
        for x, y in cells:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
    return im


def snap(im, keys=BIRD_KEYS, alpha=110):
    """每个像素归到最近的调色板色,半透明的一律丢掉"""
    cand = [(k, _rgb(PAL[k])) for k in keys]
    px = im.load()
    w, h = im.size
    grid = [['.'] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < alpha:
                continue
            grid[y][x] = min(cand, key=lambda c: (r - c[1][0]) ** 2
                             + (g - c[1][1]) ** 2 + (b - c[1][2]) ** 2)[0]
    return grid


def despeckle(grid, rounds=2):
    """孤立点按邻居的多数改写。

    JPEG 的振铃会在轮廓外面撒一圈碎点,缩小之后每个碎点都是实打实的一格。
    **一个和八个邻居里六个以上都不一样的格子,不是细节,是噪点。**
    """
    h, w = len(grid), len(grid[0])
    for _ in range(rounds):
        out = [row[:] for row in grid]
        for y in range(h):
            for x in range(w):
                ns = [grid[y + dy][x + dx]
                      for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                      if (dx or dy) and 0 <= y + dy < h and 0 <= x + dx < w]
                same = sum(1 for n in ns if n == grid[y][x])
                if same <= len(ns) - 6:
                    out[y][x] = Counter(ns).most_common(1)[0][0]
        grid = out
    return grid


def purge(grid, ch, keep=1):
    """某个颜色只留最大的几块。

    描出来的红嘴周围会散几个红点(JPEG 在高对比边上的振铃),
    而**红色在这只鸟身上只出现在嘴和脚** —— 散在别处的红点一定是噪点,
    按连通块挑一遍比调阈值稳。
    """
    h, w = len(grid), len(grid[0])
    seen = [[0] * w for _ in range(h)]
    blobs = []
    for y0 in range(h):
        for x0 in range(w):
            if grid[y0][x0] != ch or seen[y0][x0]:
                continue
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
                                and grid[ny][nx] == ch):
                            seen[ny][nx] = 1
                            q.append((nx, ny))
            blobs.append(cells)
    blobs.sort(key=len, reverse=True)
    for cells in blobs[keep:]:
        for x, y in cells:
            ns = [grid[y + dy][x + dx]
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                  if (dx or dy) and 0 <= y + dy < h and 0 <= x + dx < w
                  and grid[y + dy][x + dx] != ch]
            grid[y][x] = Counter(ns).most_common(1)[0][0] if ns else '.'
    return grid


def to_py(name, grid):
    body = ',\n'.join('"%s"' % ''.join(r) for r in grid)
    return '%s = [\n%s,\n]\n' % (name, body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--name', required=True)
    ap.add_argument('--w', type=int, default=0, help='目标宽(0 = 按高等比)')
    ap.add_argument('--h', type=int, default=0, help='目标高(0 = 按宽等比)')
    ap.add_argument('--crop', default='', help='先裁一刀,四个 0~1 的比例 l,t,r,b')
    ap.add_argument('--keys', default=''.join(BIRD_KEYS))
    ap.add_argument('--keep', type=int, default=0, help='只留最大的 n 块(0 = 全留)')
    ap.add_argument('--purge', default='', help='某色只留最大的 n 块,如 X:1')
    ap.add_argument('--rounds', type=int, default=2, help='去噪跑几遍')
    ap.add_argument('--out', default='')
    a = ap.parse_args()

    im = key_bg(Image.open(a.src))
    if a.keep:
        im = keep_main(im, a.keep)
    if a.crop:
        l, t, r, b = (float(v) for v in a.crop.split(','))
        W, H = im.size
        im = im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
    im = im.crop(im.getbbox())
    W, H = im.size
    if a.w and a.h:
        s = min(a.w / W, a.h / H)              # 装得下就行,不拉伸
    elif a.w:
        s = a.w / W
    else:
        s = a.h / H
    im = im.resize((max(1, round(W * s)), max(1, round(H * s))), Image.BOX)
    grid = despeckle(snap(im, list(a.keys)), a.rounds)
    for spec in filter(None, a.purge.split(',')):
        ch, n = spec.split(':')
        grid = purge(grid, ch, int(n))
    src = to_py(a.name, grid)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)
    print('# %s  %d×%d' % (a.name, len(grid[0]), len(grid)))


if __name__ == '__main__':
    main()

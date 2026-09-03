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
EYE_SRC_H = 66              # **眼睛单独缩一档**:同一张脸稿缩得小一点再抠眼睛,
                            # 比把抠出来的眼睛再缩一次干净 —— 后者会把梯子的横档抹掉
FACE_EYE_TOP = 16           # 眼睛的上沿落在身子的第几行(原生格)
BEAK_DROP = 13              # 嘴的上沿比眼睛低多少
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


def _trace_face(h):
    im = Image.open(FACE_SRC)
    im = im.crop(im.getbbox())
    w, hh = im.size
    return despeckle(snap(im.resize((round(w * h / hh), h), Image.BOX), list('KwVX')), 1)


def face_parts():
    """从形象稿里抠出两只眼和一张嘴,已经缩到和身子一个尺度。

    **按连通块抠,不按矩形框。** 框住的那一片里还有形象稿自己的翅膀尖,
    整块搬过来会在身上多出两个黑三角(第一版就是这样)。

    眼睛和嘴各按各的尺度抠:眼睛用 EYE_SRC_H 那一档(小一点),嘴用 FACE_SRC_H。
    **不是抠出来再缩** —— 梯子眼的横档只有一格宽,再缩一次就没了。
    返回 (眼睛, 嘴) 两组,让调用方分别摆位。
    """
    ge = _trace_face(EYE_SRC_H)
    eyes = []
    for bl in blobs(ge, 'K'):
        ys = [y for _, y in bl]
        if 60 < len(bl) < 200 and 14 <= min(ys) and max(ys) <= 36:
            eyes.append(bl)
    gm = _trace_face(FACE_SRC_H)
    beak = []
    for bl in blobs(gm, 'KXr'):
        ys = [y for _, y in bl]
        if 30 < len(bl) < 400 and 28 <= min(ys) <= 36:
            beak = bl
            break
    return ([(x, y, ge[y][x]) for bl in eyes for x, y in bl],
            [(x, y, gm[y][x]) for x, y in beak])


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
    smooth_belly(g)
    close_outline(g)
    # **先对折,再贴脸。** 顺序反过来的话眼睛也会被镜像成一模一样的两只
    cx = axis(g)
    symmetrize(g, cx)
    if not face:
        return g
    eyes, beak = face
    # 贴脸:横向对中轴,纵向按各自的上沿。眼睛和嘴分开摆 ——
    # 眼睛那一档缩得小,两组的坐标系不是同一个
    def stamp(cells, top):
        if not cells:
            return
        x0 = (min(x for x, _, _ in cells) + max(x for x, _, _ in cells)) // 2
        y0 = min(y for _, y, _ in cells)
        for x, y, ch in cells:
            nx, ny = cx + (x - x0), top + (y - y0)
            if 0 <= ny < h and 0 <= nx < w and g[ny][nx] != '.':
                g[ny][nx] = ch
    stamp(eyes, FACE_EYE_TOP)
    stamp(beak, FACE_EYE_TOP + BEAK_DROP)
    return g


def close_outline(g):
    """把描边补齐成一整圈。

    他说「边缘部分有描边部分没有,翅膀和身体的连接太生硬了」——
    量了一下:**轮廓上有四成的格子不是描边**。原因是点取样:原稿的描边只有
    一格宽,取样点落在描边上就有、落在旁边的白上就没有,于是断断续续。
    (这是 NEAREST 换来干净边线的代价,躲不掉,只能补。)

    补法是像素画里最老的一条:**凡是挨着透明的格子,一律改成描边色。**
    这样轮廓一定闭合,而且厚度恒为一格。翅膀和身子的接缝也跟着有了边 ——
    原来那儿是深色直接切白色,看着像贴上去的。
    """
    h, w = len(g), len(g[0])
    edge = []
    for y in range(h):
        for x in range(w):
            if g[y][x] == '.':
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < h and 0 <= nx < w) or g[ny][nx] == '.':
                        edge.append((x, y))
                        break
                else:
                    continue
                break
    for x, y in edge:
        g[y][x] = 'K'
    return g


def smooth_belly(g):
    """把肚皮那片浅灰的上沿抹平。

    原稿里肚皮和身子之间是一道**软**的过渡;按原生格子点取样之后,
    那道软边变成一排随机的尖刺 —— 他说的「阴影太尖了」就是这个。
    (这是点取样必然的副作用:软边上每一格取到什么,取决于取样点正好落在
    深的那半格还是浅的那半格。)

    做法是把每一列的上沿取出来,用中位数滤一遍再照它重画。
    **只动肚皮那一段**(身子下半),碰不到嘴和轮廓。
    """
    h, w = len(g), len(g[0])
    y0 = int(h * 0.66)
    tops = []
    for x in range(w):
        col = [y for y in range(y0, h) if g[y][x] == 'V']
        tops.append(min(col) if col else None)
    xs = [x for x in range(w) if tops[x] is not None]
    if len(xs) < 6:
        return g
    sm = dict()
    for x in xs:
        near = [tops[i] for i in range(x - 3, x + 4) if 0 <= i < w and tops[i] is not None]
        sm[x] = sorted(near)[len(near) // 2]
    for x in xs:
        for y in range(y0, h):
            if g[y][x] in 'wV':
                g[y][x] = 'V' if y >= sm[x] else 'w'
    return g


def axis(g):
    """球的中轴。**拿头顶那几行量** —— 那儿没有翅膀,量出来才是身子的中线"""
    w = len(g[0])
    rows = [[x for x in range(w) if g[y][x] != '.'] for y in range(6, 14)]
    rows = [xs for xs in rows if xs]
    return round(sum((min(xs) + max(xs)) / 2 for xs in rows) / max(1, len(rows)))


def symmetrize(g, cx):
    """以中轴对折:左半边镜像到右半边。

    **翅膀、脚、肚皮的阴影应该左右对称,眼睛不用。** 原稿是手画的,
    两边的翅膀和脚各画各的,缩到这个尺度之后那点差别不再读作「手绘的活气」,
    只读作「画歪了」—— 一只正面站着的鸟,左右不齐是最先被看出来的毛病。
    所以身子整个对折,**脸最后才贴**(见 build):眼睛照旧留着人家画的不对称。
    """
    h, w = len(g), len(g[0])
    for y in range(h):
        for dx in range(1, min(cx, w - cx)):
            g[y][cx + dx] = g[y][cx - dx]
        for x in range(cx + min(cx, w - cx), w):   # 镜不到的那一条尾巴,清掉
            g[y][x] = '.'
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

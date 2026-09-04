"""把一条像素轮廓的台阶排匀,让转角圆过来。

他连着两次说待机那只「边缘还是不够圆润,转弯连接处有不必要的像素点」。
放大数了一遍才看明白问题不在某几个像素上,在**台阶的次序**上。

一条画得圆的像素弧,它每一行往里收的格数从头到尾只能越来越小:

    顶上收得快 …… 4 2 2 2 2 1 1 1 1 1 1 1 1 1 0 0 0 0 …… 到赤道停住

而待机那只的左上弧实际是:

    4 2 2 2 2 1 1 1 1 1 1 1 1 1 0 0 0 0 1 0 0 1 0 0
                                        ↑        ↑
                            已经停住了又往外走一格,再停住又走一格

**这两个「1」就是他看见的那个转角。** 边缘先贴平了、又忽然挪一格再贴平,
眼睛读出来的不是弧,是一个凹进去的坎 —— 而且它出现在最显眼的球侧面。

改法只有一句话:**把这一段的 |Δ| 从大到小重排一遍。**

重排不动总位移(还是那 23 格)、不动起点终点(顶还是顶、赤道还是赤道),
只把「先走后停」的次序理顺 —— 所以它不会改造型,只会把同一个造型画圆。
数学上这是同一组步长里唯一单调的那种排法,也就是唯一能读成弧的那种。

描边本身的粗细跟着 |Δ| 走(`run = |Δ| + 1`):平的地方一格,陡的地方几格。
这不是我定的规矩,是照着这批图原来的画法量出来的 —— 顶上那行 Δ=4 配 5 格描边、
Δ=2 配 3 格、Δ=1 配 2 格、Δ=0 配 1 格,一格不差。**沿用它,别另立一套。**

不碰的地方:翅膀和脚。它们是从球上支出去的东西,不是弧的一部分,
按弧去理会把翅膀捋平。所以要传 `keep` 把那几行圈出来。

用法(改完自己看一眼,别直接信):
    python3 tools/roundedge.py HUT_IDLE --zoom 2 --keep 25:37,54:57 --out /tmp/x.py
"""
import argparse
import sys

from PIL import Image, ImageFilter

BG = '.'


def unzoom(g, k):
    """整数倍放大过的图缩回原生格子。**只取样不平均** —— 平均会把描边糊掉"""
    return [''.join(row[x] for x in range(0, len(row), k))
            for y, row in enumerate(g) if y % k == 0]


def rezoom(g, k):
    return [''.join(c * k for c in row) for row in g for _ in range(k)]


def edges(g):
    """每行的左右端。整行空的记 None"""
    out = []
    for row in g:
        xs = [x for x, c in enumerate(row) if c != BG]
        out.append((min(xs), max(xs)) if xs else None)
    return out


def monotone(vals, rising):
    """把相邻差的绝对值重排成单调的。

    `rising` 说的是**离赤道越近步子越小**该往哪边排:
    上半弧从上往下走是「先大后小」,下半弧从上往下走是「先小后大」。

    总和不变 —— 所以起点和终点一格都不会挪,只有中间的次序变了。
    """
    d = [vals[i] - vals[i - 1] for i in range(1, len(vals))]
    sign = [1 if v > 0 else (-1 if v < 0 else 0) for v in d]
    # 一段弧里方向必须一致,混着说明这段圈错了(比如把翅膀圈进来了)
    dirs = {s for s in sign if s}
    if len(dirs) > 1:
        raise ValueError('这一段不是单调的弧,%r' % (d,))
    s = dirs.pop() if dirs else 0
    mag = sorted((abs(v) for v in d), reverse=not rising)
    out = [vals[0]]
    for m in mag:
        out.append(out[-1] + s * m)
    return out


def redraw(row, lo, hi, out_ch, thin=1):
    """把一行按新的左右端重画:描边跟着端点走,中间的内容原地不动。

    「中间的内容」= 原来两头描边段之间的那一截(脸、翅膀、肚皮)。
    它**一格都不许挪** —— 挪了脸就歪了,而这次要改的只是轮廓。所以这里是
    往一张空行上先摆内容、再压描边,不是把几段字符串接起来(接起来就会平移)。

    描边画到哪儿:**从新端点一直画到原来内容的起点**,再给个 2 像素的下限。
    这样端点往外挪一格描边就厚一格,往里挪一格就吃掉一格白,粗细自己就对了 ——
    翅膀那种一整块的也照这条走,不用分情况。

    试过按 `run = |Δ| + 1` 算(原图确实是这么画的:Δ=4 配 5 格、Δ=2 配 3 格),
    **但那条规矩只在一段连续的弧里成立**。翅膀底下那一行的 Δ 是跨着翅膀量的
    (上一行是翅膀的边、这一行是身子的边,差了十格),照 |Δ|+1 就画出一根
    十一格长的横杠戳进肚子里 —— 图上一眼就能看见两道黑线。
    端点差本来就不是曲率,别拿它当曲率用。
    """
    w = len(row)
    old = [x for x, c in enumerate(row) if c != BG]
    a, b = old[0], old[-1]
    i = a
    while i <= b and row[i] == out_ch:
        i += 1
    j = b
    while j >= i and row[j] == out_ch:
        j -= 1
    if i > j:                      # 整行都是描边(顶行、底行),按新端点重铺
        return BG * lo + out_ch * (hi - lo + 1) + BG * (w - hi - 1)

    inner = row[i:j + 1]
    runL = max(i - lo, thin)
    runR = max(hi - j, thin)
    if runL < 1 or runR < 1 or lo + runL > hi - runR:
        return row

    new = [BG] * w
    for t, ch in enumerate(inner):
        new[i + t] = ch
    # 描边可以压掉内容开头那几格白,但不许压到别的色上(压到就退回去)
    for lim, rng in ((runL, range(lo, lo + runL)), (runR, range(hi - runR + 1, hi + 1))):
        for x in rng:
            if new[x] not in (BG, out_ch, inner[0], inner[-1]):
                return row
    for x in range(lo, lo + runL):
        new[x] = out_ch
    for x in range(lo + runL, i):
        new[x] = inner[0]
    for x in range(hi - runR + 1, hi + 1):
        new[x] = out_ch
    for x in range(j + 1, hi - runR + 1):
        new[x] = inner[-1]
    for x in range(0, lo):
        new[x] = BG
    for x in range(hi + 1, w):
        new[x] = BG
    return ''.join(new)


def refine(g, k, keep=(), out_ch='K', blur=0.62, sup=16):
    """把放大 k 倍存的图,**只把轮廓重画到真正的显示分辨率上**。

    这是他说的「边缘还是不够圆润」真正的原因,而不是哪几个像素画错了:

        这批图原稿就是 78×58 的像素画(一格 22 像素),显示要 156×116,
        所以整张按整数倍放大了一遍 —— 于是**每一级台阶都是 2 像素高、2 像素宽**。
        一个 55 格宽的球,轮廓上的台阶粗了一倍,再圆也圆不到哪儿去。

    里头的东西(眼睛、嘴、肚皮)放大成 2×2 一点问题没有 —— 像素画本来就该有块面。
    **只有轮廓不行**,因为轮廓是眼睛唯一会去描的那条线。

    怎么把台阶细一半,试错过两条路,记下来免得再走:

      1. 内插原生格子的左右端 → 台阶是细了,但一段弧里的步长全一样,
         球被拉成了直边;
      2. 把每段弧的 |Δ| 排单调 → **更糟,直接画出一个八边形**。
         因为一条真圆弧的 Δ 序列是 2,1,1,0,1,0,0,1,0,0,0 这样**交错**的,
         把它排成「一堆 1 接一堆 0」就是把曲线排成了折线。
         *单调的是局部平均,不是每一项* —— 这条我一开始想反了。

    真正管用的是第三条,而且它根本不需要模型:**把剪影当形状重新采一次样。**

        原生掩膜 ──放大 16 倍(最近邻,块还是块)──> 高斯糊掉 0.62 个原生格
        ──面积平均降到显示分辨率──> 按一半阈值二值化

    高斯的半径正好是「一个原生格」的量级,所以它只抹掉原生格子那一级的方角,
    抹不动造型;而阈值化天然会给出交错的台阶 —— 反锯齿再二值化本来就是
    Bresenham 那类算法在做的事。量下来新轮廓和原轮廓每行差不超过 1 像素,
    也就是说**造型一格没改,只是同一条弧按显示分辨率重画了一遍**。

    重画每一行的时候分两种情况(第一版没分,把翅膀刷成白的了):

      · 前导是**细描边**(≤3 格):描边按 `run = |Δ| + 1` 重铺,空出来的填内色
      · 前导是**一整块**(翅膀那种):整块跟着端点伸缩,不能按描边算 ——
        按描边算等于把翅膀当成轮廓线,剩下的全填成肚子的白
    """
    native = unzoom(g, k)
    W, H = len(native[0]), len(native)
    m = Image.new('L', (W, H), 0)
    px = m.load()
    for y, row in enumerate(native):
        for x, c in enumerate(row):
            if c != BG:
                px[x, y] = 255
    big = m.resize((W * sup, H * sup), Image.NEAREST)
    big = big.filter(ImageFilter.GaussianBlur(blur * sup))
    small = big.resize((W * k, H * k), Image.BOX)

    n = len(g)
    skip = set()
    for a, b in keep:
        skip.update(range(a * k, b * k + k))

    L, R = [], []
    for y in range(n):
        xs = [x for x in range(W * k) if small.getpixel((x, y)) >= 128]
        L.append(min(xs) if xs else None)
        R.append(max(xs) if xs else None)

    ext = edges(g)
    out = []
    for y, row in enumerate(g):
        if y in skip or ext[y] is None or L[y] is None or (L[y], R[y]) == ext[y]:
            out.append(row)
            continue
        out.append(redraw(row, L[y], R[y], out_ch, k))
    return out


def smooth(g, keep=(), out_ch='K'):
    """把不在 keep 里的那几段弧理顺"""
    ext = edges(g)
    n = len(g)
    skip = set()
    for a, b in keep:
        skip.update(range(a, b + 1))

    # 按「不跳过的连续行」切段,再在每段里按左右端各自的极值切成上下两半弧
    segs = []
    y = 0
    while y < n:
        if y in skip or ext[y] is None:
            y += 1
            continue
        z = y
        while z + 1 < n and z + 1 not in skip and ext[z + 1] is not None:
            z += 1
        segs.append((y, z))
        y = z + 1

    L = [e[0] if e else None for e in ext]
    R = [e[1] if e else None for e in ext]
    for a, b in segs:
        if b - a < 2:
            continue
        # **上半弧还是下半弧,看这一段是在变宽还是在变窄** —— 不能看左右端
        # 各自的走向:左边往里收和右边往外张说的是同一件事(在变宽),
        # 而第一版拿「端点是不是在减小」去判,右边就整个判反了,
        # 结果右半边一格没动(新端点越界,redraw 一律原样返回),
        # 只有左边改了六个格 —— 图看着几乎没变,差点当成算法不管用。
        rising = (R[b] - L[b]) < (R[a] - L[a])      # 越往下越窄 = 下半弧
        L[a:b + 1] = monotone(L[a:b + 1], rising)
        R[a:b + 1] = monotone(R[a:b + 1], rising)

    out = []
    for y, row in enumerate(g):
        if y in skip or ext[y] is None or (L[y], R[y]) == ext[y]:
            out.append(row)
        else:
            out.append(redraw(row, L[y], R[y], out_ch))
    return out


def curve_wings(g, rows, edge, amp, out_ch='K', fill='w'):
    """把两边平伸出去的翅膀掰出一点弧度。

    他说「翅膀整体太直了,得稍微向上或向下带点弧度」—— 原稿那两片是水平戳出去的,
    像两片鳍。真鸟收着翅膀站着的时候翅尖是**往下垂**的,所以往下掰。

    掰法是**按列做竖直错切,位移取二次曲线**:

        dy(x) = amp · ((edge − x) / edge)²

    根上(靠身子那头)dy=0,所以翅膀和身子的接缝一格都不动;越往翅尖位移越大,
    而二次意味着位移是**渐渐**加起来的 —— 线性的话整片是斜的,那叫歪不叫弯。

    掰之前得先把身子被翅膀盖住的那截轮廓补回来:原稿在翅膀底下是没画身子边线的
    (盖住了就不用画),翅膀一挪走那儿就是个豁口。`edge` 给的就是这几行身子边线该在哪。
    """
    w = len(g[0])
    grid = [list(r) for r in g]
    a, b = rows
    for side in (0, 1):
        cells = []
        for y in range(a, b + 1):
            lo = edge(y)
            span = range(0, lo) if side == 0 else range(w - lo, w)
            for x in span:
                if grid[y][x] == out_ch:
                    cells.append((x, y))
                grid[y][x] = BG
            # 补回身子那两格边线,再把边线和原有内容之间的空当填上内色
            e0, e1 = (lo, lo + 1) if side == 0 else (w - lo - 2, w - lo - 1)
            for x in (e0, e1):
                grid[y][x] = out_ch
            step = 1 if side == 0 else -1
            x = e1 + step if side == 0 else e0 + step
            while 0 <= x < w and grid[y][x] == BG:
                grid[y][x] = fill
                x += step
        for x, y in cells:
            d = (edge(y) - x) / edge(y) if side == 0 else (x - (w - edge(y) - 1)) / edge(y)
            ny = y + round(amp * d * d)
            if 0 <= ny < len(grid):
                grid[ny][x] = out_ch
    return [''.join(r) for r in grid]


def to_py(name, g):
    return '%s = [\n%s,\n]\n' % (name, ',\n'.join('"%s"' % r for r in g))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name', help='tools/scenery.py 里的网格名')
    ap.add_argument('--zoom', type=int, default=1, help='这张图是几倍放大存的')
    ap.add_argument('--keep', default='', help='原生行号,不理的段,如 25:37,54:57')
    ap.add_argument('--refine', action='store_true',
                    help='轮廓重画到显示分辨率(台阶从 zoom 像素变成 1 像素)')
    ap.add_argument('--blur', type=float, default=0.62,
                    help='抹掉多少个原生格的方角。大了会改造型,小了不起作用')
    ap.add_argument('--out', default='')
    a = ap.parse_args()

    sys.path.insert(0, 'tools')
    import scenery
    g = getattr(scenery, a.name)
    keep = [tuple(int(v) for v in s.split(':')) for s in filter(None, a.keep.split(','))]
    if a.refine and a.zoom > 1:
        g = refine(g, a.zoom, keep, blur=a.blur)
    else:
        if a.zoom > 1:
            g = unzoom(g, a.zoom)
        g = smooth(g, keep)
        if a.zoom > 1:
            g = rezoom(g, a.zoom)
    src = to_py(a.name, g)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)
    print('# %s  %d×%d' % (a.name, len(g[0]), len(g)), file=sys.stderr)


if __name__ == '__main__':
    main()

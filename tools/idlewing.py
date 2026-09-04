"""把小屋那只待机哇鸥的两片翅膀重画成带弧度的。

他说「翅膀整体太直了,得稍微向上或向下带点弧度」。原稿那两片是水平戳出去的一对
透镜形,轴线是平的 —— 一只鸟收着翅膀站着,翅尖该往下垂。

**为什么不是把原来那片错切一下就完了。** 试过,翻车了两回,原因是这批原稿的画法:

    翅膀底下**没有画身子的边线**(反正盖住了),身子的白直接铺到翅膀根上。

所以翅膀一挪走,那几行身子就只剩一段裸白;而把裸白当边线补上,身子侧面就多出
一块方方正正的鼓包(去翅之后一眼就看见了,左右各一坨)。两样都不能要。

改成**身子归身子、翅膀归翅膀**:

    1. 把翅膀那几行的墨迹全清掉,身子的左右缘按整只球的椭圆补回去 ——
       球本来就是椭圆,拟合残差 RMS 1.3 像素,这几行照公式取值最可信
    2. 翅膀另外长一片:轴线是二次曲线(根上不动、越到翅尖垂得越多),
       厚度从根上 11 格收到翅尖 2 格,**根埋进身子里两格**,接缝自然没有缝

轴线用二次不用直线:直线是整片斜过去,那叫歪;二次是越往外弯得越快,那才叫弧。
"""
import argparse
import sys

BG = '.'
INK = 'K'
FILL = 'w'

# 身子那只球的椭圆(见 DESIGN.md《翅膀带弧度》):
# |x−cx|/rx 和 |y−cy|/ry 的 n 次方和为 1,上下半轴不等长 —— 蛋形,不是正圆
BALL = dict(cx=76.5, cy=61.0, rx=57.25, ryU=62.0, ryL=52.0, n=1.9)

WING_ROWS = (50, 75)        # 翅膀占的行(原稿量的)
WING_ROOT = 24              # 根伸到这一列(比身子边线还往里两格,埋进去)
WING_CY = 61.0              # 根部轴线的高度
WING_R = 11.5               # 根部半厚(原稿在根上量出来是 10.5,对得上)
WING_TIP_R = 1.4            # 翅尖半厚
WING_TAPER = 3.0            # 收尖的快慢。小了整片是个椭圆,像只耳朵
WING_DROP = 7.0             # 翅尖比根低多少。0/5/7/10 都摆出来比过,7 最像收着的翅膀
LINE = 2                    # 描边几格粗(法向)。他说「頭部邊緣明顯線條過厚」——
                            # 上一版按行铺,法向厚度在 2.2 和 3.1 之间来回跳,十几行跳六次;
                            # 摆过 1 和 2 两版比,1 太细(脚上的边几乎没了),取 2


def ball_edge(y):
    """身子在这一行的左缘"""
    b = BALL
    ry = b['ryU'] if y < b['cy'] else b['ryL']
    t = 1 - abs((y - b['cy']) / ry) ** b['n']
    if t <= 0:
        return None
    return b['cx'] - b['rx'] * t ** (1 / b['n'])


def strip_wings(grid, w):
    """把翅膀那几行清到身子的椭圆边上,并把边线补回去"""
    for y in range(WING_ROWS[0], WING_ROWS[1] + 1):
        e = ball_edge(y)
        if e is None:
            continue
        lo = int(round(e))
        for x in range(0, lo):
            grid[y][x] = BG
        for x in range(w - lo, w):
            grid[y][x] = BG
        for x in (lo, lo + 1, w - lo - 2, w - lo - 1):
            grid[y][x] = INK
        # 边线和原有内容之间要是空着(原稿在这儿铺的是白),填回白
        for x in range(lo + 2, w // 2):
            if grid[y][x] != BG:
                break
            grid[y][x] = FILL
        for x in range(w - lo - 3, w // 2, -1):
            if grid[y][x] != BG:
                break
            grid[y][x] = FILL


def wing_cells(w, drop=WING_DROP):
    """一片翅膀占哪些格。按列算:每列一段竖直的墨,段心沿二次曲线往下走"""
    out = []
    for x in range(0, WING_ROOT + 1):
        t = (WING_ROOT - x) / WING_ROOT          # 0 = 根,1 = 尖
        cy = WING_CY + drop * t * t
        r = WING_TIP_R + (WING_R - WING_TIP_R) * (1 - t ** WING_TAPER) ** 0.5
        if r < 1:
            continue
        for y in range(int(round(cy - r)), int(round(cy + r)) + 1):
            out.append((x, y))
            out.append((w - 1 - x, y))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', default='HUT_IDLE')
    ap.add_argument('--drop', type=float, default=WING_DROP)
    ap.add_argument('--out', default='')
    a = ap.parse_args()

    sys.path.insert(0, 'tools')
    import scenery
    import roundedge
    # 三步,顺序不能换:
    #   1. 轮廓重画到显示分辨率(台阶 2 像素 → 1 像素)
    #   2. 摘掉翅膀,把身子的描边**按到画外的距离**重铺成处处一样粗
    #   3. 长回带弧度的翅膀
    #
    # 第二步必须夹在中间。放在最前面,轮廓还是 2 像素一级的台阶,匀了也白匀;
    # 放在最后,翅膀是一整团墨,按深度算会被从中间掏空 —— 剩一圈轮廓。
    base = roundedge.refine(getattr(scenery, a.name), 2, keep=[(54, 57)])
    g = [list(r) for r in base]
    h, w = len(g), len(g[0])
    strip_wings(g, w)
    g = [list(r) for r in roundedge.even_outline([''.join(r) for r in g],
                                                 thick=LINE, center=BALL['cx'])]
    for x, y in wing_cells(w, a.drop):
        if 0 <= y < h:
            g[y][x] = INK
    rows = [''.join(r) for r in g]
    src = '%s = [\n%s,\n]\n' % (a.name, ',\n'.join('"%s"' % r for r in rows))
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(src)
    else:
        print(src)


if __name__ == '__main__':
    main()

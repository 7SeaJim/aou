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

**翅膀支在两侧是定过的,不是还没跟上参考图。**

`art/形象稿/` 里后来那几张(睡着_01..16、他发的那张干净图)上,翅膀是**身子里面
的两团灰**,不是从两侧支出去的深色片 —— 也就是说仓库里的参考图和这张精灵图
对不上。我把这处差别单独问过他,他的回话是:**「不改了,保持现状。」**

记在这儿是因为下一个照着 `art/` 核对的人(很可能是我自己)会把它当成没跟上的
遗漏,顺手"修"回去。它不是遗漏,是选过的:支出去那一版在 16 像素那档的大坝小鸟、
飞行四帧上都认得出轮廓,收进身子里就只剩一个白球。
"""
import argparse
import sys

BG = '.'
INK = 'K'
FILL = 'w'

# 身子那只球。**它现在是一个真的椭圆,直接算出来的,不是描出来的。**
#
# 他发了张干净的哇鸥像素图,说「身體部分直接考慮繪製一個橢圓,解決邊緣鋸齒問題」。
# 这条一句顶前面三次尝试:再怎么给一条描出来的边去锯齿,它也只是「比较像弧」;
# 而一个按方程栅格化的椭圆,**台阶的分布是数学给的,不可能有多余的一格**。
#
# 数是拿原稿的剪影最小二乘拟出来的(去掉翅膀和脚那几行):RMS 1.16 像素,
# 82 行里只有 7 行差超过 2 像素 —— 也就是说他朋友本来画的就是个椭圆,
# 我们只是把它画准了。上下半轴不等长,所以是蛋形不是正圆。
BALL = dict(cx=76.5, cy=62.0, rx=56.58, ryU=62.5, ryL=49.5, n=2.0)
BODY_BOT = 105              # 身子的椭圆画到这一行为止,底下是腿和脚,原样保留
DEEP = 6                    # 原来压在描边位置上的墨,深度不超过这个的退回内色
BELLY = 'V'                 # 肚皮的浅灰
BELLY_TOP = 60              # 这一行以上不该有肚皮色 —— 上面的都是描稿噪点

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
    """身子在这一行的左缘(浮点)。底下切平那一段返回 None"""
    b = BALL
    if y > BODY_BOT:
        return None
    ry = b['ryU'] if y < b['cy'] else b['ryL']
    t = 1 - abs((y - b['cy']) / ry) ** b['n']
    if t <= 0:
        return None
    return b['cx'] - b['rx'] * t ** (1 / b['n'])


def _chamfer(mask, w, h):
    """每个实心格离画外多远。(3,4)/3 倒角距离,近似欧氏 ——
    四邻会把斜边算厚、八邻会把斜边算薄,描边就跟着一起歪"""
    INF = 1 << 20
    d = [[0 if not mask[y][x] else INF for x in range(w)] for y in range(h)]
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            v = d[y][x]
            for dy, dx, c in ((-1, 0, 3), (0, -1, 3), (-1, -1, 4), (-1, 1, 4)):
                ny, nx = y + dy, x + dx
                v = min(v, (d[ny][nx] if 0 <= ny < h and 0 <= nx < w else 0) + c)
            d[y][x] = v
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            if not mask[y][x]:
                continue
            v = d[y][x]
            for dy, dx, c in ((1, 0, 3), (0, 1, 3), (1, 1, 4), (1, -1, 4)):
                ny, nx = y + dy, x + dx
                v = min(v, (d[ny][nx] if 0 <= ny < h and 0 <= nx < w else 0) + c)
            d[y][x] = v
    return d


def ellipse_body(g, line=None):
    """把剪影换成按方程栅格化的椭圆,描边按到画外的距离铺成一样粗。

    做三件事,一件都不能少:

      · **剪影**:椭圆里面 + 底下切平。原来支在两边的翅膀落在椭圆外面,顺手就清掉了
        (它们随后由 `wing_cells()` 重新长出来,长的是算出来的那一片)
      · **描边**:离画外不超过 `line` 格的算描边。厚度是造型的函数,不是画法的函数,
        斜的地方和平的地方一样粗 —— 上一版按行铺,厚度在 2.2 和 3.1 之间来回跳
      · **里子**:脸、嘴、肚皮原地不动。原来压在描边位置上的那些墨(深度 ≤ DEEP)
        要退回内色,不然新边只会叠在旧边上更厚;深处的墨(眼睛、嘴离边十几格)碰不到

    脚在 BODY_BOT 底下,整段原样保留 —— 那是三根趾头的形,不是弧。
    """
    line = LINE if line is None else line
    h, w = len(g), len(g[0])
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        e = ball_edge(y)
        if e is None:
            continue
        lo, hi = int(round(e)), int(round(2 * BALL['cx'] - e))
        for x in range(max(0, lo), min(w, hi + 1)):
            mask[y][x] = True
    # **腿和脚也要进掩膜**,虽然它们一格都不改。
    # 不进的话,量距离的时候 BODY_BOT 底下就是「画外」,身子最后一两行整行都算描边,
    # 于是那儿糊出一根黑杠,把两条红腿盖掉 —— 第一版就是这样,截图上一眼就看见了。
    for y in range(BODY_BOT + 1, h):
        for x in range(w):
            if g[y][x] != BG:
                mask[y][x] = True
    d = _chamfer(mask, w, h)

    out = [list(r) for r in g]
    for y in range(h):
        for x in range(w):
            if y > BODY_BOT:                 # 脚:原样
                continue
            # 头顶那两小片灰是描稿时带进来的噪点(第 8~11 行,左右各一片)。
            # 原来藏在厚描边底下看不出来,边一细就露成两块脏。
            # 他给的参考图上身子是纯白的,灰只出现在翅膀 —— 按参考图清掉
            if y < BELLY_TOP and g[y][x] == BELLY:
                out[y][x] = FILL
            if not mask[y][x]:
                out[y][x] = BG
            elif d[y][x] <= line * 3:
                out[y][x] = INK
            elif g[y][x] == BG or (g[y][x] == INK and d[y][x] <= DEEP * 3):
                out[y][x] = _inner_colour(g, y, x, w)
    return [''.join(r) for r in out]


def _inner_colour(g, y, x, w):
    """这一格该填什么内色:沿着这一行往球心走,碰到的第一个既不是空也不是墨的色"""
    step = 1 if x < BALL['cx'] else -1
    nx = x + step
    while 0 <= nx < w:
        c = g[y][nx]
        # 头顶那两片灰在这儿也要拦一道:椭圆比原剪影宽出来的格子会往里找色,
        # 找到的正好就是那片噪点,于是刚擦掉的灰又被抄回来了(擦了三遍没擦掉,
        # 就是这么回事 —— **擦的地方对,补的地方把它又抄回来了**)
        if c not in (BG, INK) and not (y < BELLY_TOP and c == BELLY):
            return c
        nx += step
    return FILL


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
    ap.add_argument('--line', type=int, default=LINE, help='描边几格粗')
    ap.add_argument('--out', default='')
    a = ap.parse_args()

    sys.path.insert(0, 'tools')
    import scenery
    # 两步:身子换成算出来的椭圆(顺手把支在两边的旧翅膀清掉),再长回算出来的翅膀。
    #
    # 之前那一版是「重采样原剪影 → 匀描边 → 长翅膀」三步。椭圆一上,前两步一起没了 ——
    # **不用再把一条描出来的边修得像弧,直接画一条真的弧。**
    base = getattr(scenery, a.name)
    g = [list(r) for r in ellipse_body(base, a.line)]
    h, w = len(g), len(g[0])
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

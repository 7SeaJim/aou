"""跑道:一根细长杆子,顶上一间带风向标的小屋。

第一版画的是「高台 + 坡道 + 两面旗」,越改越不对 —— 台子加高就挡住后面的湖,
旗子做大就和站在台上的鸟互相遮,而且那一整块横着占了坝子右边一大片,
本来就挤的甲板更没地方了。

换个思路:**它是个高空起跑点,不是一座看台。** 一根杆子往上戳,
顶上一间小屋(其实就是个巨大的鸟窝箱),屋顶一支风向标。
好处是三条:

    竖着占地方  杆子只有 4 格宽,甲板上几乎不占位置
    轮廓独一份  坝上别的东西全是横的,只有它是竖的,一眼就找得到
    说得通      起飞点当然要高;风向标也正好对上「风向旗」那条升级

老翘站屋子下面那根栖木上(老鸟在高处看风),丫丫站杆子底下(小鸟在起跑线上)。
"""


def canvas(w=32, h=64):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, int(y)), min(len(g), int(y + h))):
        for i in range(max(0, int(x)), min(len(g[0]), int(x + w))):
            g[j][i] = c


def outline(g, c='K'):
    h, w = len(g), len(g[0])
    out = [r[:] for r in g]
    for j in range(h):
        for i in range(w):
            if g[j][i] != '.':
                continue
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                y, x = j + dj, i + di
                if 0 <= y < h and 0 <= x < w and g[y][x] not in ('.', c):
                    out[j][i] = c
                    break
    return out


def pole(g):
    """杆子和底座。没建好的时候只有这一截"""
    rect(g, 18, 28, 4, 32, 'd')
    rect(g, 18, 28, 1, 32, 'D')            # 受光的那一边
    for y in range(33, 58, 6):              # 几道箍
        rect(g, 17, y, 6, 1, 'a')
    rect(g, 14, 60, 12, 3, 'd')            # 底座
    rect(g, 14, 60, 12, 1, 'D')


def vane(g):
    """屋顶的风向标:一支箭 + 一根横杆。**这是它的记号**,得画满六行"""
    rect(g, 19, 0, 2, 8, 'a')              # 立轴
    rect(g, 11, 2, 17, 1, 'a')             # 横杆
    for j, w in enumerate([1, 3, 5]):       # 箭头,朝左
        rect(g, 14 - j, 1 + j, w, 1, 'X')
    rect(g, 24, 1, 4, 3, 'X')              # 尾羽
    rect(g, 25, 2, 2, 1, 'R')


def hut(g):
    """顶上那间小屋。一个放大的鸟窝箱:人字顶 + 圆洞 + 一根栖木"""
    for j in range(6):                      # 人字顶,一层层往外放
        rect(g, 19 - j * 2, 8 + j, 2 + j * 4, 1, 'd')
    rect(g, 8, 13, 24, 2, 'D')             # 出檐
    rect(g, 8, 13, 24, 1, 'L')
    rect(g, 11, 15, 18, 11, 'D')           # 屋身
    rect(g, 11, 15, 1, 11, 'L')
    for x in range(14, 29, 5):              # 板缝
        rect(g, x, 16, 1, 9, 'd')
    for j, w in enumerate([4, 6, 6, 6, 4]):  # 圆洞
        rect(g, 20 - w // 2, 17 + j, w, 1, 'K')
    # 栖木**往左伸出去一大截**。老翘要站在上头 —— 一只 16 格宽的鸟
    # 挨着 18 格宽的屋子,不伸出来的话它半个身子压在门洞上
    rect(g, 0, 26, 32, 2, 'd')
    rect(g, 0, 26, 32, 1, 'D')


def built():
    g = canvas()
    pole(g)
    hut(g)
    vane(g)
    return outline(g)


def unbuilt():
    """还没建:只有底座和一小截杆。**得让人看出这儿会有东西** ——
    什么都不画的话,升级面板里那一条就成了凭空冒出来的"""
    g = canvas()
    rect(g, 11, 46, 4, 12, 'd')
    rect(g, 11, 46, 1, 12, 'D')
    rect(g, 7, 58, 12, 3, 'd')
    rect(g, 7, 58, 12, 1, 'D')
    rect(g, 9, 44, 8, 2, 'a')               # 杆头上一圈箍,像是等着往上接
    return outline(g)


RUNWAY = {
    'runway':     rows(built()),
    'runway_off': rows(unbuilt()),
}

for _k, _g in RUNWAY.items():
    assert len(set(len(r) for r in _g)) == 1, f'{_k} 行宽不齐'

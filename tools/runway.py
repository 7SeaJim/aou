"""跑道:一座小高台,上面插着飘旗,左边搭一道坡。

哇鸥觅食是从坝上起飞的。**原来它就地一蹬就走了** —— 一个每天都要用的
玩法,起点却什么都没有。跑道给这件事一个地方:助跑的坡、看风向的旗、
出发前垫肚子的食槽,三样各管飞行里的一项。

初期没有,花钱建起来;建好之后三条线各自升级。
所以这张图有两种状态:

    runway_off  只有打好的地基和两根空杆 —— 让玩家看见「这儿будет有个东西」
    runway      建好的样子

56×34。摆在坝子右头,那一带原来只有芦苇。
台面要够宽 —— 老翘和丫丫两只都站上头,窄了会叠在一起。
"""


def canvas(w=56, h=34):
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


def base(g):
    """地基和台子腿。建没建好都有这一截"""
    rect(g, 16, 22, 38, 3, 'd')            # 台面下的横梁
    for x in (20, 33, 46):                 # 三根腿
        rect(g, x, 25, 3, 8, 'd')
        rect(g, x, 25, 1, 8, 'D')
    rect(g, 14, 32, 42, 2, 'd')            # 落在甲板上的底座


def deck(g):
    """台面。横板铺的 —— 竖着铺就成了一堵墙,这条在甲板上栽过"""
    rect(g, 16, 18, 38, 4, 'D')
    rect(g, 16, 18, 38, 1, 'L')
    for y in (20, 22):
        rect(g, 16, y, 38, 1, 'd')


def ramp(g):
    """左边那道助跑坡。一级一级往上,不是一条斜线 —— 像素画里斜线要靠台阶堆"""
    for i in range(7):
        rect(g, 1 + i * 2, 31 - i * 2, 3, 1 + i * 2, 'D')
        rect(g, 1 + i * 2, 31 - i * 2, 3, 1, 'L')


def poles(g, flag=None):
    """两根杆。flag 给颜色就挂旗,不给就是两根空杆(还没建好)"""
    # 杆子挪到台面**两端**。原来立在正中,老翘和丫丫往上一站就把旗挡没了 ——
    # 一个建筑的记号被站在它上面的人挡住,等于白画
    for x in (17, 51):
        rect(g, x, 4, 2, 15, 'a')
        rect(g, x, 4, 1, 15, 'A')
        rect(g, x - 1, 3, 4, 1, 'K')
        if flag:
            for j, w in enumerate([6, 7, 6, 4]):    # 飘起来的三角旗
                rect(g, x + 2, 5 + j, w, 1, flag)
            rect(g, x + 2, 5, 1, 4, 'K')


def trough(g):
    """台面上的食槽。出发前垫两口"""
    rect(g, 40, 14, 10, 4, 'T')
    rect(g, 41, 15, 8, 2, 'S')


def built():
    g = canvas()
    base(g)
    ramp(g)
    deck(g)
    poles(g, 'X')
    trough(g)
    return outline(g)


def unbuilt():
    """还没建:只有地基和两根空杆。**要让人看出这儿会有个东西** ——
    直接什么都不画的话,升级面板里那一条就成了凭空冒出来的"""
    g = canvas()
    base(g)
    poles(g)
    return outline(g)


RUNWAY = {
    'runway':     rows(built()),
    'runway_off': rows(unbuilt()),
}

for _k, _g in RUNWAY.items():
    assert len(set(len(r) for r in _g)) == 1, f'{_k} 行宽不齐'

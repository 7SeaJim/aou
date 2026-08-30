"""哇鸥的摊子,四个阶段。

**关键是轮廓要变,不是往旁边堆东西。**

第一版的做法是摊子本体固定不动,升级就在旁边多摆一个箱子、多摆一个灶 ——
堆到满级是一排叠叠乐,而且「多一个箱子」根本不像「生意做大了」。

现在摊子本身分四段,一段比一段大、比一段像个正经铺子:

    1 路边摊    一张折叠桌,搭块布,一口锅。风一吹就得收摊的那种
    2 支起棚子  两根柱子撑起条纹雨棚,有了正经柜台和菜牌
    3 木屋铺面  有墙有屋顶了,开一扇卖饭的窗,挂上招牌
    4 街边专卖店 瓦顶带檐、玻璃橱窗、通亮的灯箱招牌、烟囱

判定用**四条升级线的总级数**(4 到 44),不是某一条 —— 铺面是整体投入的结果,
只升炉子不该让门面变成专卖店。

画法:用下面几个原语拼,不手写整行。最大那张 76 格宽 —— 手写一行数
七十多个格子,数错一个整张歪掉,而且以后想把窗户挪两格得重数一遍。
"""


def canvas(w, h):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, y), min(len(g), y + h)):
        for i in range(max(0, x), min(len(g[0]), x + w)):
            g[j][i] = c


def frame(g, x, y, w, h, edge, fill=None):
    """描边的方块。fill 传 None 就只画边,里面留空"""
    if fill is not None:
        rect(g, x + 1, y + 1, w - 2, h - 2, fill)
    rect(g, x, y, w, 1, edge)
    rect(g, x, y + h - 1, w, 1, edge)
    rect(g, x, y, 1, h, edge)
    rect(g, x + w - 1, y, 1, h, edge)


def hline(g, x, y, w, c):
    rect(g, x, y, w, 1, c)


def vline(g, x, y, h, c):
    rect(g, x, y, 1, h, c)


def awning(g, x, y, w, h, a, b, edge='K'):
    """条纹雨棚。**竖条纹**不是横的 —— 横条读成百叶窗,竖条才像布"""
    for i in range(w):
        rect(g, x + i, y, 1, h, a if (i // 3) % 2 == 0 else b)
    rect(g, x, y, w, 1, edge)
    # 下沿做成波浪边,布才不像铁皮
    for i in range(w):
        if (i // 3) % 2 == 0:
            g[y + h - 1][x + i] = edge
        else:
            g[y + h][x + i] = edge if y + h < len(g) else edge


def tiles(g, x, y, w, h, c, dark, edge='K'):
    """瓦顶。一层层往上收,每层错开半格"""
    for j in range(h):
        w2 = w - j * 2
        x2 = x + j
        rect(g, x2, y + j, w2, 1, c if j % 2 == 0 else dark)
        for i in range(x2 + (j % 2), x2 + w2, 4):
            g[y + j][i] = dark if j % 2 == 0 else c
    rect(g, x, y + h - 1, w, 1, edge)


def planks(g, x, y, w, h, c, dark):
    """木板墙。竖着钉,每 5 格一道缝"""
    rect(g, x, y, w, h, c)
    for i in range(x + 4, x + w, 5):
        vline(g, i, y, h, dark)


# ============================================================
#  四个阶段
# ============================================================

def stage1():
    """路边摊:一张折叠桌 + 一块红布 + 一口锅。40×28"""
    g = canvas(40, 28)
    # 遮阳伞。**要罩在桌子正上方** —— 第一版偏到右边去了,
    # 看着像旁边另立了一根杆子,不像这张桌子的伞
    vline(g, 18, 6, 8, 'd')
    vline(g, 19, 6, 8, 'K')
    rect(g, 6, 3, 28, 1, 'K')
    for j in (4, 5):
        for i in range(6, 34):
            g[j][i] = 'X' if ((i - 6) // 3) % 2 == 0 else 'w'
    rect(g, 6, 6, 28, 1, 'K')
    # 桌面
    frame(g, 4, 12, 30, 4, 'K', 'D')
    hline(g, 5, 13, 28, 'L')
    # 桌前挂的红白布
    for j in range(16, 23):
        for i in range(5, 33):
            g[j][i] = 'X' if ((i - 5) // 4) % 2 == 0 else 'w'
    frame(g, 4, 16, 30, 8, 'K')
    # 桌腿
    for i in (7, 30):
        vline(g, i, 23, 4, 'd')
        vline(g, i + 1, 23, 4, 'K')
    # 桌上一口锅
    frame(g, 12, 8, 9, 4, 'K', 'a')
    hline(g, 13, 9, 7, 'A')
    rect(g, 15, 7, 3, 1, 'K')
    return rows(g)


def stage2():
    """支起棚子:条纹雨棚 + 正经柜台 + 菜牌。52×36"""
    g = canvas(52, 36)
    # 两根立柱
    for i in (3, 46):
        vline(g, i, 8, 26, 'K')
        vline(g, i + 1, 8, 26, 'd')
        vline(g, i + 2, 8, 26, 'K')
    # 雨棚
    awning(g, 2, 4, 48, 6, 'X', 'w')
    rect(g, 2, 3, 48, 1, 'K')
    # 菜牌吊在左柱上
    frame(g, 6, 12, 11, 8, 'K', 'D')
    for j in (14, 16, 18):
        hline(g, 8, j, 7, 'd')
    # 柜台
    frame(g, 6, 20, 40, 5, 'K', 'D')
    hline(g, 7, 21, 38, 'L')
    frame(g, 6, 25, 40, 8, 'K', 'd')
    for i in range(9, 45, 6):
        vline(g, i, 26, 6, 'D')
    # 台面上摆的东西
    frame(g, 20, 16, 8, 4, 'K', 'a')
    rect(g, 23, 15, 2, 1, 'K')
    frame(g, 31, 17, 6, 3, 'K', 'Y')
    return rows(g)


def stage3():
    """木屋铺面:有墙有顶,开一扇卖饭的窗,挂招牌。64×46"""
    g = canvas(64, 46)
    # 烟囱 —— 三段起就有了,炉子升级之后从这儿冒烟
    frame(g, 46, 0, 7, 6, 'K', 'r')
    rect(g, 47, 1, 5, 1, 'a')
    # 屋顶
    tiles(g, 2, 4, 60, 7, 'r', 'K')
    rect(g, 0, 10, 64, 2, 'K')
    rect(g, 1, 11, 62, 1, 'd')
    # 墙
    planks(g, 4, 12, 56, 30, 'D', 'd')
    frame(g, 3, 12, 58, 31, 'K')
    # 卖饭的窗:一个大开口。**里面要暗** —— 第一版填的是海蓝,
    # 一大块蓝读成一台电视,不像往店里看进去
    frame(g, 10, 17, 44, 16, 'K', 'K')
    hline(g, 11, 18, 42, 'Y')          # 顶上一条暖光,照着货
    # 窗台
    frame(g, 8, 32, 48, 4, 'K', 'L')
    # 窗里摆的东西(剪影)
    for x, c in ((14, 'Y'), (23, 'E'), (32, 'X'), (41, 'C')):
        frame(g, x, 24, 7, 7, 'd', c)
    # 招牌挂在屋檐下
    frame(g, 16, 12, 32, 5, 'K', 'L')
    for i in range(19, 45, 5):
        rect(g, i, 14, 3, 2, 'd')
    # 底座
    frame(g, 3, 36, 58, 7, 'K', 'd')
    for i in range(8, 60, 7):
        vline(g, i, 37, 5, 'D')
    return rows(g)


def stage4():
    """街边专卖店:瓦檐 + 橱窗 + 灯箱招牌 + 烟囱。76×56"""
    g = canvas(76, 56)
    # 烟囱
    frame(g, 56, 2, 8, 8, 'K', 'r')
    rect(g, 57, 3, 6, 1, 'a')
    # 瓦顶 + 出檐
    tiles(g, 4, 8, 68, 8, 'r', 'K')
    rect(g, 0, 15, 76, 3, 'K')
    rect(g, 1, 16, 74, 1, 'd')
    # 灯箱招牌
    frame(g, 8, 18, 60, 9, 'K', 'Y')
    hline(g, 9, 19, 58, 'y')
    for i in range(13, 64, 8):
        frame(g, i, 21, 5, 4, 'K', 'o')
    # 雨棚
    awning(g, 4, 27, 68, 6, 'X', 'w')
    # 墙
    planks(g, 4, 34, 68, 16, 'D', 'd')
    frame(g, 3, 33, 70, 18, 'K')
    # 橱窗:两大格玻璃
    for x in (8, 40):
        frame(g, x, 36, 28, 12, 'K', 'B')
        hline(g, x + 1, 37, 26, 'w')
        vline(g, x + 14, 37, 10, 'K')
        # 窗里码着的货
        for i in range(x + 3, x + 26, 6):
            frame(g, i, 42, 4, 5, 'K', 'E' if (i // 6) % 2 else 'C')
    # 台阶
    frame(g, 1, 50, 74, 4, 'K', 'A')
    rect(g, 2, 51, 72, 1, 'V')
    return rows(g)


STALLS = {
    'stall1': stage1(),
    'stall2': stage2(),
    'stall3': stage3(),
    'stall4': stage4(),
}

for _k, _g in STALLS.items():
    assert len({len(r) for r in _g}) == 1, f'{_k} 行宽不齐'

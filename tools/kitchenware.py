"""出摊那一场里**真正摆在案子上的**四件家什:砧板、煎盘、灶台、烤箱。

和 `kitchen.py` 里那四个 16×16 图标是两回事:

    kitchen.py     16×16,给按钮和列表用的**记号**
    kitchenware.py 场景里的**东西**,有大小、有位置、食材直接拖到它身上

为什么要有这一套:原来厨具在界面上是四个一模一样的木框子,框子里几个方格,
食材拖进格子 —— **看着像流水线的工位,不像在做饭。** 现在它们是案板上摆着的
四件东西,各占各的地方、各是各的形状,拖过去就是把菜放到那件东西上。

尺度对齐场景里别的东西:哇鸥 32×32,路人 13×24。所以案上的砧板 44 宽、
灶台 60 宽,和一个人站在柜台外面差不多高 —— 这样透视才对得上。
"""


def canvas(w, h):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, int(y)), min(len(g), int(y + h))):
        for i in range(max(0, int(x)), min(len(g[0]), int(x + w))):
            g[j][i] = c


def blob(g, cx, cy, rx, ry, c):
    """实心椭圆。锅、灶眼这些圆东西全靠它"""
    for j in range(len(g)):
        for i in range(len(g[0])):
            if ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1:
                g[j][i] = c


def outline(g, c='K'):
    """整体描一圈边。各画各的描边会在接缝处露白"""
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


# ---------- 砧板 44×14 ----------
# 平摆在案上的一块厚木板,左边一截手柄,板上横着一把刀。
# 手柄和刀是它的两个身份记号:少了手柄就是一块木板,少了刀就不知道是切东西的。
def board():
    g = canvas(44, 14)
    rect(g, 6, 1, 36, 8, 'L')          # 板面(浅木)
    rect(g, 0, 3, 8, 4, 'D')           # 左边探出去的手柄
    rect(g, 6, 9, 36, 2, 'D')          # 板的厚度
    rect(g, 6, 11, 36, 2, 'd')         # 底下那道暗边,让它看着是「厚」的
    for x in (12, 20, 28, 36):         # 木纹
        rect(g, x, 2, 1, 6, 'D')
    rect(g, 14, 2, 20, 2, 'A')         # 刀身
    rect(g, 14, 4, 20, 1, 'a')         # 刀背的暗面
    rect(g, 34, 2, 7, 3, 't')          # 刀柄
    return outline(g)


# ---------- 煎盘 36×16 ----------
# 俯视的圆盘,右边一根伸出去的长柄。**柄必须伸出盘外一大截** ——
# 光一个圆盘和灶眼分不开,伸出去的柄才是煎盘。
def pan():
    g = canvas(36, 16)
    rect(g, 22, 6, 14, 3, 't')         # 长柄
    rect(g, 23, 5, 12, 1, 'M')         # 柄上的高光
    blob(g, 12, 8, 12, 7, 'A')         # 盘沿
    blob(g, 12, 8, 10, 5.5, 'a')       # 盘底(深)
    blob(g, 12, 7, 8, 3.5, 'h')        # 盘底再深一档,看着是凹的
    return outline(g)


# ---------- 灶台 60×34 ----------
# 铁皮灶身,台面上一个灶眼,正面一扇看得见火的炉门,底下两个旋钮。
# 火**画在灶台自己身上**:玩家一眼要能看出「这台在烧」。
def stove():
    g = canvas(60, 34)
    rect(g, 2, 6, 56, 26, 'A')         # 灶身
    rect(g, 2, 28, 56, 4, 'a')         # 底下的暗面
    rect(g, 0, 2, 60, 5, 'a')          # 台面
    rect(g, 0, 2, 60, 2, 'H')          # 台面的高光
    blob(g, 30, 4, 13, 3, 'h')         # 灶眼
    blob(g, 30, 4, 10, 2, 'K')
    rect(g, 8, 11, 44, 13, 'K')        # 炉门(黑)
    rect(g, 10, 13, 40, 9, 'h')        # 门里的深灰,火从这儿透
    rect(g, 10, 24, 40, 1, 'a')
    for x in (14, 42):                 # 旋钮
        rect(g, x, 26, 4, 4, 'Y')
        rect(g, x + 1, 27, 2, 2, 'o')
    return outline(g)


# ---------- 烤箱 78×46 ----------
# 嵌在案子底下的方箱:上头一条带旋钮的操作板,当中一扇大玻璃窗,窗下一道横把手。
# 它比上面三件大一圈 —— 慢、能放着不管的那件,占地方也该最大。
def oven():
    g = canvas(78, 46)
    rect(g, 0, 0, 78, 46, 'A')         # 箱体
    rect(g, 0, 0, 78, 8, 'a')          # 操作板
    rect(g, 0, 0, 78, 2, 'H')
    for x in (10, 24, 54, 68):         # 四个旋钮
        rect(g, x, 3, 4, 3, 'Y')
        rect(g, x + 1, 4, 2, 1, 'o')
    rect(g, 4, 10, 70, 32, 'a')        # 炉门
    rect(g, 8, 14, 62, 20, 'K')        # 窗框
    rect(g, 10, 16, 58, 16, 'h')       # 玻璃,火从这儿透
    rect(g, 8, 36, 62, 4, 'H')         # 横把手
    rect(g, 8, 36, 62, 1, 'w')
    rect(g, 0, 42, 78, 4, 'a')         # 底座
    return outline(g)


KITCHENWARE = {
    'kw_board': rows(board()),
    'kw_pan':   rows(pan()),
    'kw_stove': rows(stove()),
    'kw_oven':  rows(oven()),
}

for _k, _g in KITCHENWARE.items():
    assert len(set(len(r) for r in _g)) == 1, f'{_k} 行宽不齐'

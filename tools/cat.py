"""折耳根 —— 常年游荡在海埂大坝的一只橘猫。

梦想也是去冰岛,所以跟哇鸥一起在摊上打工。不上班的时候就摊在大坝上睡觉。

名字是云南人都懂的那个梗:折耳根(鱼腥草)是本地菜里最有争议的一味,
爱的爱死恨的恨死 —— 拿来当一只谁都想撸又谁都撸不着的橘猫的名字正好。

两个姿势:
    cat_sleep  睡着的,团成一坨,尾巴绕过来盖住鼻子。摆在大坝甲板上
    cat_work   上班的,坐着,尾巴支在身侧。摆在出摊那一场的柜台后

橘猫用 Y/o 两档橘 + t 的深条纹 + w 的肚皮。**不用 R/r 那两档珊瑚色** ——
那是哇鸥嘴和脚的颜色,一个画面里两处红会打架。
"""


def canvas(w, h):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, y), min(len(g), y + h)):
        for i in range(max(0, x), min(len(g[0]), x + w)):
            g[j][i] = c


def blob(g, cx, cy, rx, ry, c):
    """一个实心椭圆。猫身上没有直线,全靠这个堆"""
    for j in range(len(g)):
        for i in range(len(g[0])):
            if ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1:
                g[j][i] = c


def outline(g, c='K'):
    """给所有非空格子描一圈边。省得每个形状各描各的,接缝处还会露白"""
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


def sleeping():
    """睡着的橘猫。团成一坨,尾巴从后面绕上来搭在鼻子前"""
    g = canvas(30, 17)
    blob(g, 15, 11, 13, 5, 'Y')            # 身子
    blob(g, 7, 9, 5.5, 4.5, 'Y')           # 脑袋窝在左边
    # 耳朵
    rect(g, 4, 4, 2, 3, 'Y'); rect(g, 5, 3, 1, 2, 'Y')
    rect(g, 9, 4, 2, 3, 'Y'); rect(g, 9, 3, 1, 2, 'Y')
    # 深色条纹:横着一道道,睡着的猫看得见的就是背上这几道
    for x in (13, 17, 21, 25):
        rect(g, x, 7, 1, 4, 't')
    rect(g, 6, 5, 1, 3, 't'); rect(g, 9, 5, 1, 3, 't')
    # 肚皮
    blob(g, 16, 14, 8, 2, 'w')
    # 闭着的眼睛和鼻子
    rect(g, 4, 9, 3, 1, 'K')
    rect(g, 8, 9, 3, 1, 'K')
    rect(g, 6, 11, 2, 1, 'p')
    # 尾巴绕过来搭在鼻子前
    for i, x in enumerate(range(2, 14)):
        rect(g, x, 15 - (i // 3), 1, 2, 'o')
    return rows(outline(g))


def working():
    """上班的橘猫。坐着,尾巴支在身侧 —— 一副「我在干活」的样子"""
    g = canvas(18, 24)
    blob(g, 9, 17, 6, 6, 'Y')              # 身子
    blob(g, 9, 8, 5.5, 5, 'Y')             # 脑袋
    # 耳朵
    rect(g, 4, 2, 2, 4, 'Y'); rect(g, 5, 1, 1, 2, 'Y')
    rect(g, 12, 2, 2, 4, 'Y'); rect(g, 12, 1, 1, 2, 'Y')
    # 额头的条纹
    rect(g, 7, 4, 1, 2, 't'); rect(g, 10, 4, 1, 2, 't')
    # 脸
    rect(g, 6, 8, 2, 2, 'K'); rect(g, 10, 8, 2, 2, 'K')     # 眼睛
    rect(g, 8, 11, 2, 1, 'p')                                # 鼻子
    rect(g, 7, 12, 1, 1, 'K'); rect(g, 10, 12, 1, 1, 'K')    # 嘴
    # 白围嘴和肚皮
    blob(g, 9, 18, 3.5, 4, 'w')
    # 前爪
    rect(g, 5, 21, 3, 2, 'w'); rect(g, 10, 21, 3, 2, 'w')
    # 尾巴支在右边
    for i, y in enumerate(range(21, 11, -1)):
        rect(g, 15 + (i // 4), y, 2, 1, 'o')
    return rows(outline(g))


CAT = {
    'cat_sleep': sleeping(),
    'cat_work': working(),
}

for _k, _g in CAT.items():
    assert len({len(r) for r in _g}) == 1, f'{_k} 行宽不齐'

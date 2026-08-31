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


def stamp(dst, src, ox, oy):
    """把一张小图盖到大图上,空格子不盖。"""
    for j, row in enumerate(src):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            if 0 <= oy + j < len(dst) and 0 <= ox + i < len(dst[0]):
                dst[oy + j][ox + i] = ch


def head_with_ears():
    """脑袋和两只耳朵。

    **画在一起,只描一圈外边。** 上一版脑袋描一圈、每只耳朵各描一圈,
    耳根那儿于是多出一道线 —— 看着像一颗人头上扣了两只猫耳。
    耳朵是脑袋长出来的,它俩中间本来就不该有线。

    但**整个「脑袋 + 耳朵」还是得带边**:它要压在身子上,
    而身子和它是同一块橙,不带边叠上去等于没画。
    所以是「里头不描、外圈描一圈」—— 单独画完再整体 outline,盖到身子上。

    耳朵是收口的圆三角,不收成一格宽:真猫的耳尖是有厚度的,
    收到一格在这个尺度上像两根天线。
    """
    h = canvas(16, 20)
    blob(h, 7, 12, 6, 5.5, 'Y')            # 脑袋
    for cx in (4, 11):
        for j, w in enumerate([3, 3, 4, 5, 5]):
            rect(h, cx - w // 2, 2 + j, w, 1, 'Y')
        rect(h, cx - 1, 4, 2, 4, 'o')      # 耳朵里头
    return outline(h)


def sleeping():
    """睡着的橘猫,团成一坨。

    **就是两个椭圆**:小的那个是脑袋(连着耳朵),大的那个是身子,
    脑袋叠在身子左端。绕了几版才回到这么简单的一句话 ——

        v1 一根等粗的长椭圆 + 平铺的尾巴  →  毛毛虫,尾巴看不出是尾巴
        v2 身子和屁股两个圆挨着画         →  被 outline() 焊成一根管子
        v3 背拱得老高、尾梢挑到肩膀       →  睡熟的猫是塌下去的,不是弓起来的
        v4 压平 + 宽矮的耳朵              →  平成一块板,耳朵读成兔子
        v5 尖耳朵,为了不压身子把头外挪   →  耳朵尖得像天线
        v6 脑袋和耳朵各描各的边           →  耳根多一道线,像人头上扣了猫耳

    一条规律贯穿始终:**描边要按「一个东西」来描,不是按「一个图形」。**
    脑袋加耳朵是一个东西,里头不该有线;它和身子是两个东西,中间必须有线。
    """
    g = canvas(33, 24)
    blob(g, 19, 13.5, 12.5, 8, 'Y')        # 身子:一个大椭圆,背就是它的上缘
    # 背上的条纹跟着背的弧度走,越往屁股越短
    for x, y, h in ((17, 7, 4), (21, 7, 4), (25, 8, 3), (28, 10, 3)):
        rect(g, x, y, 1, h, 't')
    # 脑袋(连耳朵)整个压上来
    stamp(g, head_with_ears(), 0, 3)
    rect(g, 4, 12, 1, 2, 't'); rect(g, 9, 12, 1, 2, 't')     # 额头的纹
    # 肚皮和折在身下的前爪
    blob(g, 18, 19, 6, 2, 'w')
    rect(g, 11, 18, 4, 3, 'w')
    # 脸:两道闭着的眼 + 一个鼻头。**不画嘴** ——
    # 这个尺度上嘴只有两三格,画出来是脸上多了几个黑点,不是一张嘴
    rect(g, 4, 15, 3, 1, 'K')
    rect(g, 8, 15, 3, 1, 'K')
    rect(g, 6, 17, 2, 1, 'p')
    # 尾巴:贴着底边绕到前面,尖收在前爪旁边。
    # **不往上翘** —— 翘起来那一截在这个尺度上读成一片鱼鳍。
    # 先铺 K 再填 o,这道 K 就是尾巴和身子之间那条缝
    tail = [(29, 16), (29, 18), (27, 20), (24, 21), (21, 21), (18, 21),
            (16, 21), (14, 21)]
    for x, y in tail:
        rect(g, x - 1, y - 1, 4, 4, 'K')
    for x, y in tail:
        rect(g, x, y, 2, 2, 'o')
    rect(g, 13, 21, 2, 2, 'Y')             # 尖梢挑亮一格,收在这儿
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

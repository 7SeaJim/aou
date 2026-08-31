"""下雨天用的两样东西:折耳根的小木棚、路人和哇鸥的伞。

**这两样都是为了同一件事:天气得改变画面里的人在干什么。**
原来下暴雨打雷,坝上的人照样溜达、猫照样摊在地上睡 —— 天气只改了
一层雨丝和调色,底下那层「大家在干嘛」一动不动,越看越假。

    catshed     摊子旁边一间敞口的小木棚,下雨天猫躲进去睡
    umbrella_*  三把颜色不同的伞。人和哇鸥下雨天都撑一把
"""


def canvas(w, h):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, int(y)), min(len(g), int(y + h))):
        for i in range(max(0, int(x)), min(len(g[0]), int(x + w))):
            g[j][i] = c


def shed():
    """敞口的小木棚。**正面必须是敞开的** —— 封起来就看不见里头的猫,
    而「猫躲雨去了」这件事全靠看得见才成立。

    46×36:比猫(30×21)大一圈,四周留出边,不然猫会顶着棚顶。
    """
    g = canvas(46, 36)
    # 人字顶。两坡各铺一道板,屋脊压一道深色
    for i in range(12):
        w = 4 + i * 3.5
        rect(g, 23 - w, i, w * 2, 1, 'd' if i % 3 == 2 else 'D')
    rect(g, 21, 0, 4, 3, 'd')                       # 屋脊
    rect(g, 0, 11, 46, 3, 'd')                      # 出檐:比棚身宽,才挡得住雨
    rect(g, 0, 11, 46, 1, 'L')
    # 里头。**要比外面暗一档**,不然猫趴进去像贴在一张木板上
    rect(g, 5, 14, 36, 18, 'a')
    rect(g, 5, 14, 36, 2, 'h')                      # 顶里侧的阴影最深
    for x in range(7, 40, 6):                       # 后墙的板缝
        rect(g, x, 16, 1, 14, 'h')
    # 两根柱子
    for x in (2, 41):
        rect(g, x, 12, 3, 22, 'D')
        rect(g, x, 12, 1, 22, 'L')
    # 地上垫的干草
    rect(g, 5, 30, 36, 3, 's')
    for x in range(6, 40, 5):
        rect(g, x, 29, 3, 1, 'S')
    # 底座
    rect(g, 0, 33, 46, 3, 'd')
    rect(g, 0, 33, 46, 1, 'D')
    return rows(g)


def umbrella(top, body):
    """一把伞:伞面 + 一小截柄。

    **柄和空隙是关键。** 第一版只画伞面、直接扣在脑袋上,17 格宽比人
    只宽四格 —— 读出来是一顶彩色的帽子,不是伞。
    现在 21 宽、伞面抬到头顶上方几格,中间那截柄把两头连起来:
    看得见「伞悬在头上方」这层关系,才是伞。
    """
    g = canvas(21, 15)
    for i in range(8):
        w = 2 + i * 1.15
        rect(g, 10 - w, i + 1, w * 2 + 1, 1, body)
    rect(g, 9, 0, 3, 2, 'K')                        # 伞尖
    rect(g, 10, 1, 1, 1, top)
    rect(g, 1, 9, 19, 1, body)
    # 波浪下沿:一条平直的边读起来还是帽檐
    for x in (1, 6, 11, 16):
        rect(g, x, 10, 4, 1, body)
    # 伞骨的高光,一道就够
    for i in range(6):
        rect(g, 10 - i, 2 + i, 1, 1, top)
    # 柄:从伞心垂下来,落到脑袋顶上
    rect(g, 10, 10, 1, 5, 'K')
    return rows(g)


SHED = {
    'catshed':    shed(),
    'umbrella_a': umbrella('B', 'b'),      # 蓝
    'umbrella_b': umbrella('R', 'r'),      # 红
    'umbrella_c': umbrella('G', 'g'),      # 绿
}

for _k, _g in SHED.items():
    assert len({len(r) for r in _g}) == 1, f'{_k} 行宽不齐'

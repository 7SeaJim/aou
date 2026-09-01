"""六只伙计鸥的图标。

原来六个人在界面上全用 `waou` 那一个图标 —— 和「鲜花和鲜花饼共用一个图」
是同一类硬伤,而且更糟:**连主角和员工都分不开**。

它们和哇鸥是同一个物种(红嘴鸥),骨架自然是同一副,所以不靠「画成别的鸟」
来区分,靠的是**一鸟一个记号**:

    灰灰  一身灰 + 举着一边翅膀      —— 颠锅的那个
    阿胖  横着胖出一圈,眯着眼        —— 认得出谁兜里有钱
    小白  倒过来的,脚朝天            —— 会翻跟头
    老翘  后脑勺一撮翘毛 + 长嘴       —— 飞了十二年
    墩墩  深灰、方，站得笔直          —— 看摊子的
    丫丫  歪着头往下嗅,旁边一朵菌子  —— 闻得到菌子在哪

**每只只给一个记号。** 16 格上塞两个特征,两个都读不出来。
挑记号的标准是「缩到 16 像素还认得出」:倒过来、胖一圈、一撮毛,
都是轮廓层面的差别;换个眼神、加条纹这种,到这个尺寸就没了。
"""


def canvas(w=16, h=16):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def rect(g, x, y, w, h, c):
    for j in range(max(0, int(y)), min(len(g), int(y + h))):
        for i in range(max(0, int(x)), min(len(g[0]), int(x + w))):
            g[j][i] = c


# 一只鸥的轮廓,逐行的宽度。**四角都要收** —— 收成方的就是一块砖不是一只鸟。
# 第 7 行最宽,那是两边探出去的翅膀。
BODY = {1: 6, 2: 10, 3: 12, 4: 12, 5: 12, 6: 12, 7: 14,
        8: 12, 9: 12, 10: 12, 11: 10, 12: 8, 13: 6}


def gull(body='w', belly='V', wide=0, eye='K', beak=(8, 2)):
    """一只正面站着的鸥。

    wide 往两边各胖出几格;beak 是嘴的 (起始行, 高度)。

    眼睛、嘴、脚的位置六只都一样 —— **区分靠轮廓和颜色,不靠挪五官**:
    16 格上把眼睛挪两格,谁也看不出来。
    """
    g = canvas()
    for y, w0 in BODY.items():
        w = min(16, w0 + (wide * 2 if 2 <= y <= 11 else 0))
        rect(g, 8 - w // 2, y, w, 1, body)
    for y in range(9, 14):                      # 肚皮:比身子窄两格
        w = min(16, BODY[y] + (wide * 2 if y <= 11 else 0)) - 4
        if w > 0:
            rect(g, 8 - w // 2, y, w, 1, belly)
    if eye != '.':
        rect(g, 4 - wide, 5, 2, 2, eye)
        rect(g, 10 + wide, 5, 2, 2, eye)
    rect(g, 7, beak[0], 2, beak[1], 'X')
    rect(g, 5, 14, 2, 1, 'X')                   # 脚
    rect(g, 9, 14, 2, 1, 'X')
    return g


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


def huihui():
    """灰灰:一身灰,右边翅膀举起来。颠锅的那个"""
    g = gull(body='H', belly='A')
    rect(g, 13, 2, 2, 6, 'H')          # 举起来的那边翅膀
    rect(g, 14, 1, 1, 4, 'H')
    return outline(g)


def apang():
    """阿胖:横着胖出一圈,眯着眼"""
    g = gull(body='w', belly='V', wide=1, eye='.')
    rect(g, 3, 6, 3, 1, 'K')           # 眯成两道缝
    rect(g, 10, 6, 3, 1, 'K')
    return outline(g)


def xiaobai():
    """小白:整只倒过来,脚朝天。会翻跟头的那个 —— 轮廓一眼就不一样"""
    return outline(gull(body='w', belly='V')[::-1])


def laoqiao():
    """老翘:深色头罩 + 后脑勺一撮翘毛。飞了十二年的老鸟。

    头罩不是编的 —— 红嘴鸥换上繁殖羽的时候头就是深褐色的。
    **而且它解决了一个实际问题**:阿胖、丫丫、老翘原来都是一身白,
    缩到卡片上那个尺寸,三只分不出来。给一只戴上头罩,立刻各是各的。
    """
    g = gull(body='w', belly='V', beak=(8, 3))   # 长嘴,但别长成一条舌头
    for y in (1, 2, 3, 4, 5, 6):                 # 深色头罩
        w = BODY[y]
        rect(g, 8 - w // 2, y, w, 1, 't')
    rect(g, 4, 5, 2, 2, 'w')                     # 眼睛在深头上要反过来点白
    rect(g, 10, 5, 2, 2, 'w')
    rect(g, 3, 0, 3, 1, 't')                     # 翘起来的那撮
    rect(g, 2, 1, 3, 1, 't')
    return outline(g)


def dundun():
    """墩墩:深灰,肩膀方,站得笔直。看摊子的"""
    g = gull(body='h', belly='H')
    for y in (3, 4, 5, 6, 7):          # 肩膀那几行填方 —— 一副门神样
        rect(g, 2, y, 12, 1, 'h')
    rect(g, 4, 5, 2, 2, 'K')
    rect(g, 10, 5, 2, 2, 'K')
    rect(g, 6, 9, 4, 3, 'H')
    return outline(g)


def yaya():
    """丫丫:歪着头往下嗅,旁边冒出一朵菌子"""
    g = gull(body='w', belly='V', beak=(9, 3))
    rect(g, 2, 3, 2, 1, '.')           # 削掉左上一角 = 头歪着
    rect(g, 2, 4, 1, 1, '.')
    rect(g, 13, 2, 1, 2, 'w')          # 右边补一点,配平
    rect(g, 0, 11, 4, 2, 'M')          # 菌子:伞盖
    rect(g, 1, 13, 2, 1, 'S')          # 菌柄
    return outline(g)


CREW_ICONS = {
    'crew_huihui':  rows(huihui()),
    'crew_apang':   rows(apang()),
    'crew_xiaobai': rows(xiaobai()),
    'crew_laoqiao': rows(laoqiao()),
    'crew_dundun':  rows(dundun()),
    'crew_yaya':    rows(yaya()),
}

for _k, _g in CREW_ICONS.items():
    assert len(_g) == 16, f'{_k} 行数 {len(_g)}'
    for _i, _r in enumerate(_g):
        assert len(_r) == 16, f'{_k} 第 {_i} 行 {len(_r)}'

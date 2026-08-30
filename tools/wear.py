"""装扮素材:哇鸥戴的东西。

和 icons.py / scenery.py 一样是字符网格,字符含义见 pal.py。
区别是这里的每件东西有**两套图**,因为哇鸥在两个尺度上出现:

    big   小屋近景的 124x99 大图。按 46 宽画,由 emit 时 ×2 放大到 92 ——
          直接画 92 宽的话一行字要数九十多个格子,数错一个就歪。
          放大两倍之后描边正好 2px,和 hut_waou 身上的描边一致。
    small 大坝上那只 16x16 的小图。十几个格子,直接画。

同一件东西不能只画一套再缩放:92 缩到 12 是一坨糊,12 放到 92 是一堆大方块。

**锚点**:两套图都以精灵图的水平中心对齐,`big_y` / `small_y` 是网格
第一行落在精灵图坐标系里的 y(可以是负的,帽子会探到头顶上面去)。
"""

HAT_HALF = 23      # 帽子:左半边 23 格,镜像后 46 宽
BAND_HALF = 20     # 围脖:左半边 20 格,镜像后 40 宽


def mirror(half, rows):
    """左半边镜像成整行。

    右半边一定是左半边翻过来的 —— 与其把 46 个格子数两遍,不如只写一半。
    不足 half 的行**从左边补点**,所以贴着中线的东西直接写就行,
    要放到侧边的元素才需要自己把前面的点数够。
    """
    out = []
    for r in rows:
        assert len(r) <= half, f'半行超宽({len(r)} > {half}): {r!r}'
        s = r.rjust(half, '.')
        out.append(s + s[::-1])
    return out


def scale(grid, n):
    """整数倍最近邻放大。像素画只能整数倍,别的倍率会把描边搞成一粗一细。"""
    out = []
    for row in grid:
        big = ''.join(c * n for c in row)
        out.extend([big] * n)
    return out


# ---------- 斗笠 ----------
# 滇池边渔家的竹斗笠。锥顶 + 一圈平沿。沿子必须比脑袋宽,不然不像斗笠像瓜皮帽。
DOULI = mirror(27, [
    'K',
    'Ks',
    'Kss',
    'Ksss',
    'Kssss',
    'Ksssss',
    'Kssssss',
    'Ksssssss',
    'Kssssssss',
    'Ksdsssssss',
    'Kssssssssss',
    'Ksssssssssss',
    'Kssssssssssss',
    'KKsssssssssssssssssssssssss',
    'Kdssssssssssssssssssssssss',
    'KKdddddddddddddddddddddddd',
])
DOULI_S = [
    '.....KKK.....',
    '....KsssK....',
    '...KsssssK...',
    '.KKsssssssKK.',
    '.KdddddddddK.',
]

# ---------- 蓝花巾 ----------
# 扎染的靛蓝头巾,包住整个脑门,两个角在侧边垂着。白点是扎染没上到色的地方。
LANHUA = mirror(26, [
    'Kbbbb',
    'Kbbbbbbb',
    'Kbwbbbbbbbb',
    'Kbbbbbbbbbbbbb',
    'Kbbbbbwbbbbbbbbb',
    'Kbbbbbbbbbbbbbbbbb',
    'Kbwbbbbbbbbbbbbbbbbb',
    'Kbbbbbbbbbwbbbbbbbbbbb',
    'Kbbbbbbbbbbbbbbbbbbbbbb',
    'Kbwbbbbbbbbbbbbbbbbbbbbb',
    'KNbbbbbbbbbbbbbbbbbbbbbbb',
    'KNbbbbbwbbbbbbbbbbbbbbbbb',
    'KKNNNNNNNNNNNNNNNNNNNNNNNN',
    '....KbbK..................',
    '....KbNK..................',
    '....KKKK..................',
])
LANHUA_S = [
    '..KbbbbbbK..',
    '.KbwbbbwbbK.',
    '.KbbbbbbbbK.',
    'KKNNNNNNNNKK',
]

# ---------- 花环 ----------
# 斗南花市顺来的。一圈绿藤箍在头上,正中一朵金的,两边各一朵粉的。
HUAHUAN = mirror(25, [
    '.......KpK.............KY',
    '......KpppK...........KYY',
    '......KpppK...........KYY',
    '.......KKK............KKY',
    '.KGGGGGGGGGGGGGGGGGGGGGGG',
    'KGGgGGGGGgGGGGGGGgGGGGGGG',
    'Kgggggggggggggggggggggggg',
    'KKgggggggggggggggggggggg',
])
HUAHUAN_S = [
    '....KYK....',
    '.KpKKYKKpK.',
    'KGGGGGGGGGK',
    'KgggggggggK',
]

# ---------- 红围巾 ----------
# 一圈围起来,前面搭下来一截。冬天鸥群回来的时候戴最应景。
WEIJIN = mirror(20, [
    'KKXXXXXXXXXXXXXXXXXX',
    'KXXXXXXXXXXXXXXXXXXX',
    'KXwwXXXXXXXXXXXXXXXX',
    'KXXXXXXXXXXXXXXXXXXX',
    'KKrrrrrrrrrrrrrrrrrr',
    '.....KXXXX',
    '.....KXwwX',
    '.....KKrrr',
])
WEIJIN_S = [
    'KXXXXXXXXXXK',
    'KXwXXXXXXwXK',
    'KKrrrrrrrrKK',
    '....KXXK....',
    '....KrrK....',
]

# ---------- 铜铃 ----------
# 一根细绳挂个小铜铃。它一走路就叮当响 —— 这是小屋那段走路动画的配音。
TONGLING = mirror(20, [
    'Kdddddddddddddddddd',
    'KKddddddddddddddddd',
    '..KY',
    '.KYYY',
    'KYoYYY',
    'KYoooYY',
    'KKoooooo',
    '..Kooo',
])
TONGLING_S = [
    'KddddddddK',
    '...KYYK...',
    '..KYooYK..',
    '...KooK...',
]


WEAR = {
    'douli':    {'big': scale(DOULI, 2),    'big_y': 0,  'small': DOULI_S,    'small_y': -1},
    'lanhua':   {'big': scale(LANHUA, 2),   'big_y': 2,  'small': LANHUA_S,   'small_y': 1},
    'huahuan':  {'big': scale(HUAHUAN, 2),  'big_y': 10, 'small': HUAHUAN_S,  'small_y': 0},
    'weijin':   {'big': scale(WEIJIN, 2),   'big_y': 76, 'small': WEIJIN_S,   'small_y': 8},
    'tongling': {'big': scale(TONGLING, 2), 'big_y': 78, 'small': TONGLING_S, 'small_y': 8},
}

for _k, _v in WEAR.items():
    for _which in ('big', 'small'):
        _g = _v[_which]
        assert len(set(len(r) for r in _g)) == 1, f'{_k}.{_which} 行宽不齐'

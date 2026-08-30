"""大坝上的游客。

**正面,看得见眼睛和头发** —— 星露谷 / 泰拉瑞亚那一路。
上一版画的是背影(不用画脸、也不怕和哇鸥的豆豆眼打架),但背影的代价是
这帮人没有表情、没有朝向,永远像一排背对着你的模特。正面才有人味。

13×24。这个尺寸上脸只有五格宽,所以五官只保留**两只眼睛和一道嘴** ——
再多的细节(鼻子、耳朵、瞳孔高光)缩到画面里就是一团脏点。

三种姿势:
    stand  站着看
    wave   举起一只手 —— 投喂的那一下,和规则层真实的投喂事件对上
    walk   迈开腿 —— 坝上总有人只是路过,不是所有人都在看哇鸥

区分四个人靠**头发色 + 衣服色 + 肤色 + 身高**。小孩矮一截,
身高在这个尺寸上是最强的信号。
"""

W = 13


def _check(g, who):
    for r in g:
        assert len(r) == W, f'{who}: 这行 {len(r)} 格 -> {r}'
    return g


def person(h, s, s2, p, z, skin='E', pose='stand', kid=False):
    """h 头发 / s 上衣 / s2 上衣暗部 / p 裤子 / z 鞋 / skin 肤色"""
    head = [
        "....KKKKK....",
        "..KK" + h * 5 + "KK..",
        ".K" + h * 9 + "K.",
        ".K" + h * 2 + skin * 5 + h * 2 + "K.",      # 刘海压着额头
        ".K" + h + skin * 7 + h + "K.",
        ".K" + skin * 2 + "K" + skin * 3 + "K" + skin * 2 + "K.",   # 眼睛
        ".K" + skin * 9 + "K.",
        ".K" + skin * 3 + "e" * 3 + skin * 3 + "K.",                # 嘴
        "..K" + skin * 7 + "K..",
        "...KK" + "e" * 3 + "KK...",                                # 脖子
    ]
    body = [
        ".KKKKKKKKKKK.",
        ".K" + s * 9 + "K.",
        ".K" + s + s2 + s * 5 + s2 + s + "K.",
        ".K" + skin + s * 7 + skin + "K.",           # 手垂在身侧
        ".K" + skin + s * 7 + skin + "K.",
    ]
    if not kid:
        body.insert(2, ".K" + s * 9 + "K.")
    if pose == 'wave':
        # 举起一只手。**手要举到脑袋那么高才看得出来** ——
        # 第一版只在肩膀上点了一格肤色,缩小之后完全看不见。
        # 只改必要的那几行,两帧之间人不会整个跳一下。
        head[8] = "..K" + skin * 7 + "K." + skin
        head[9] = "...KK" + "e" * 3 + "KK.." + skin
        body[0] = ".KKKKKKKKKKK" + skin
        body[1] = ".K" + s * 9 + "K" + skin

    legs = ["..K" + s * 7 + "K.."]
    if pose == 'walk':
        # 迈步:两条腿一前一后,不是向两边叉开。
        # 叉开读成「站桩」,前后错开才读成「在走」
        legs += [
            "..K" + p * 7 + "K..",
            "..K" + p * 3 + "K" + p * 3 + "K..",
            ".K" + p * 3 + "K." + p * 3 + "K..",
        ]
        if not kid:
            legs += ["K" + p * 3 + "K.." + p * 3 + "K.."]
        legs += [
            "K" + z * 3 + "K.." + z * 3 + "K..",
            "KKKKK..KKKKK.",
        ]
    else:
        legs += ["..K" + p * 7 + "K.."]
        legs += ["..K" + p * 3 + "." + p * 3 + "K.."] * (2 if kid else 4)
        legs += [
            "..KK" + p * 2 + "." + p * 2 + "KK..",
            "..K" + z * 2 + "K.K" + z * 2 + "K..",
            "..KKKK.KKKK..",
        ]
    return _check(head + body + legs, f'{h}{s}{pose}')


# 四个人。肤色也分两档 —— 一排人全是同一张脸色最假
SPEC = [
    ('a', 'M', 'B', 'b', 'N', 'a', 'E'),     # 棕发蓝衬衫的中年人
    ('b', 'K', 'R', 'r', 'a', 'K', 'e'),     # 黑发红上衣的年轻人
    ('c', 'a', 'G', 'g', 'N', 'a', 'E'),     # 花白头发的老人
    ('d', 'M', 'Y', 'o', 'b', 'K', 'E'),     # 小孩,矮一截
]

PEOPLE = {}
for _tag, _h, _s, _s2, _p, _z, _skin in SPEC:
    _kid = _tag == 'd'
    for _pose in ('stand', 'wave', 'walk'):
        _key = f'onlooker_{_tag}' + ('' if _pose == 'stand' else '_' + _pose)
        PEOPLE[_key] = person(_h, _s, _s2, _p, _z, _skin, _pose, _kid)

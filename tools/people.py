"""大坝上围观的路人。

**从背后看。** 他们是站在坝上看哇鸥表演的,背对镜头 —— 这样既不用画脸,
也避开了「路人有五官、哇鸥是豆豆眼」的画风打架:同一个画面里两套脸的做法,
是很多像素游戏看着别扭的根源。

原来只有两个纯灰剪影(`a` 和 `A` 两种灰),站一排像一堵墙。现在四个人,
靠**头发色 + 衣服色 + 身高**区分 —— 在 11×22 这个尺寸上能用的差别就这三样,
再多的细节缩到画面里全糊成一团。

小孩矮一截:身高是这个尺寸下最强的辨识信号,比任何细节都管用。
"""


def person(hair, shirt, shirt2, pants, shoe, kid=False):
    W = 11
    g = [
        "...KKKKK...",
        f"..K{hair*5}K..",
        f"..K{hair*5}K..",
        f"..K{hair*5}K..",
        "...KeeeK...",
        "..KKKKKKK..",
        f".K{shirt*7}K.",
        f"K{shirt*9}K",
        f"K{shirt}{shirt2}{shirt*5}{shirt2}{shirt}K",
        f"K{shirt}{shirt2}{shirt*5}{shirt2}{shirt}K",
        f".K{shirt*7}K.",
    ]
    if not kid:                       # 大人比小孩多一段躯干和一段腿
        g += [f".K{shirt*7}K.", f".K{shirt*7}K."]
    g += [
        f".KK{shirt*5}KK.",
        f"..K{pants*5}K..",
        f"..K{pants*2}.{pants*2}K..",
        f"..K{pants*2}.{pants*2}K..",
    ]
    if not kid:
        g += [f"..K{pants*2}.{pants*2}K..", f"..K{pants*2}.{pants*2}K.."]
    g += [
        f"..KK{pants}.{pants}KK..",
        f".K{shoe*2}K.K{shoe*2}K.",
        ".KKKK.KKKK.",
    ]
    for r in g:
        assert len(r) == W, f'行宽 {len(r)} != {W}: {r}'
    return g


PEOPLE = {
    # 棕发蓝衬衫的中年人
    'onlooker_a': person('M', 'B', 'b', 'N', 'a'),
    # 黑发红上衣的年轻人
    'onlooker_b': person('K', 'R', 'r', 'a', 'K'),
    # 花白头发的老人,绿褂子
    'onlooker_c': person('a', 'G', 'g', 'N', 'a'),
    # 小孩,黄衣,矮一截 —— 追鸥群那个随机事件说的就是他
    'onlooker_d': person('M', 'Y', 'o', 'b', 'K', kid=True),
}

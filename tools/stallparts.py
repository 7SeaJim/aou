"""摊位的升级件。

四条升级线各自对应摊子上多出来的一样东西 —— **升级要看得见**。
原来四条线只是数字变大,玩家花掉几十万鸥币,画面上一格都没变,
那笔钱花得毫无实感。

    炉子 stove   → 灶台。3 级支起来,7 级火更旺
    招牌 sign    → 招牌。3 级挂上,7 级换成带灯的(夜里会亮)
    货架 shelf   → 旁边码起来的箱子,3 级一个,6 级两个(直接复用 crate)
    保温箱 warmer → 保温箱。3 级搬来

阈值都卡在 3 级:太早的话新手第一次升级就看见变化,反而分不清是哪条线的功劳。
"""

# 小灶台:一口锅坐在砖头灶上。'X' 是火苗
STOVE = [
    "...KKKKKKK...",
    "..KaAAAAAaK..",
    ".KaaaaaaaaaK.",
    ".KKKKKKKKKKK.",
    "..K.......K..",
    "..KdDDDDDdK..",
    "..KdDDDDDdK..",
    "..KKKKKKKKK..",
    "..KDDDDDDDK..",
    "..KDdDDDdDK..",
    "..KDDDDDDDK..",
    "..KKKKKKKKK..",
]

# 火旺的版本:灶口透出火光
STOVE_HOT = [
    "...KKKKKKK...",
    "..KaAAAAAaK..",
    ".KaaaaaaaaaK.",
    ".KKKKKKKKKKK.",
    "..K.......K..",
    "..KdDDDDDdK..",
    "..KdDDDDDdK..",
    "..KKKKKKKKK..",
    "..KDXYXYXDK..",
    "..KDYXYXYDK..",
    "..KDXYXYXDK..",
    "..KKKKKKKKK..",
]

# 招牌:木板 + 两根吊绳。板上那几道是字,不写具体的字 ——
# 13 像素宽写不下能认的汉字,写了只会是几坨墨
SIGN = [
    "..K.......K..",
    "..K.......K..",
    "KKKKKKKKKKKKK",
    "KDDDDDDDDDDDK",
    "KDdDdDDDdDdDK",
    "KDDDDDDDDDDDK",
    "KDdDDdDDdDDDK",
    "KDDDDDDDDDDDK",
    "KKKKKKKKKKKKK",
]

# 带灯的招牌:上沿多一排灯泡,夜里亮
SIGN_LIT = [
    "..K.......K..",
    "..K.......K..",
    "KKKKKKKKKKKKK",
    "KyKyKyKyKyKyK",
    "KDDDDDDDDDDDK",
    "KDdDdDDDdDdDK",
    "KDDDDDDDDDDDK",
    "KDdDDdDDdDDDK",
    "KKKKKKKKKKKKK",
]

# 保温箱:带扣子的方箱
WARMBOX = [
    "KKKKKKKKKKK",
    "KAAAAAAAAAK",
    "KAaaaaaaaAK",
    "KKKKKKKKKKK",
    "KSSSSKSSSSK",
    "KSSSSKSSSSK",
    "KSSSSKSSSSK",
    "KSsssKsssSK",
    "KSSSSKSSSSK",
    "KKKKKKKKKKK",
]

STALL_PARTS = {
    'stove_s':  STOVE,
    'stove_hot': STOVE_HOT,
    'sign_b':   SIGN,
    'sign_lit': SIGN_LIT,
    'warmbox':  WARMBOX,
}

for _k, _g in STALL_PARTS.items():
    assert len({len(r) for r in _g}) == 1, f'{_k} 行宽不齐'

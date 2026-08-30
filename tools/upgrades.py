"""四条升级线的图标,外加重画的辣椒。

升级线原来全在借别人的图标:炉子借辣椒、招牌借店铺、货架借背包、
保温箱借红糖。**保温箱那个尤其糟** —— 红糖重画成糖砖之后,
升级面板上的「保温箱」变成了一块糖。

辣椒重画的原因:原来那根是直的、上粗下细、橙红色,读起来是胡萝卜。
辣椒和胡萝卜的区别不在颜色在**形状** —— 辣椒是弯的,而且蒂是一个
带小帽的绿把,不是一丛缨子。
"""

UPGRADE_ICONS = {}

# 辣椒:弯钩形,绿蒂带小帽。直的那版被认成胡萝卜
UPGRADE_ICONS['chili'] = [
"................",
"................",
"..........KK....",
".........KGGK...",
"........KKGGK...",
".......KKGGKK...",
"......KXXGKK....",
".....KXXXXK.....",
"....KXXXXK......",
"...KXXXXK.......",
"...KXrXXK.......",
"...KXrXK........",
"...KXrXK........",
"....KXK.........",
".....K..........",
"................",
]

# 炉子:砖砌灶台,炉口透火。台面上那道是锅沿
UPGRADE_ICONS['stove'] = [
"................",
"................",
"..KKKKKKKKKKKK..",
"..KaAAAAAAAAaK..",
"..KKKKKKKKKKKK..",
"..KDDDDDDDDDDK..",
"..KDKKKKKKKKDK..",
"..KDKXYXXYXKDK..",
"..KDKYXYYXYKDK..",
"..KDKXYXXYXKDK..",
"..KDKKKKKKKKDK..",
"..KDdDDDDDDdDK..",
"..KKKKKKKKKKKK..",
"................",
"................",
"................",
]

# 招牌:吊起来的一块木牌。两根吊绳是它和明信片的区别
UPGRADE_ICONS['sign'] = [
"................",
"................",
"...K......K.....",
"...K......K.....",
".KKKKKKKKKKKKK..",
".KLLLLLLLLLLLK..",
".KLdddLdddLLLK..",
".KLLLLLLLLLLLK..",
".KLdddLdLdddLK..",
".KLLLLLLLLLLLK..",
".KLdLdddLdddLK..",
".KLLLLLLLLLLLK..",
".KdddddddddddK..",
".KKKKKKKKKKKKK..",
"................",
"................",
]

# 货架:三层板,上面码着东西。和背包的区别是**横板**
UPGRADE_ICONS['shelf'] = [
"................",
".KKKKKKKKKKKKK..",
".KDDDDDDDDDDDK..",
".KKKKKKKKKKKKK..",
".KRRKKBBKKYYKK..",
".KRRKKBBKKYYKK..",
".KKKKKKKKKKKKK..",
".KDDDDDDDDDDDK..",
".KKKKKKKKKKKKK..",
".KGGKKCCKKppKK..",
".KGGKKCCKKppKK..",
".KKKKKKKKKKKKK..",
".KDDDDDDDDDDDK..",
".KKKKKKKKKKKKK..",
"................",
"................",
]

# 保温箱:带扣的方箱,**冒热气** —— 光画个箱子说不出「保温」
UPGRADE_ICONS['warmer'] = [
"................",
"...K...K...K....",
"..K...K...K.....",
"...K...K...K....",
".....KKKK.......",
"....KK..KK......",
".KKKKKKKKKKKKK..",
".KAAAAAAAAAAAK..",
".KAaaaaaaaaaAK..",
".KKKKKKKKKKKKK..",
".KSSSSSKSSSSSK..",
".KSsSSSKSSSsSK..",
".KSSSSSKSSSSSK..",
".KKKKKKKKKKKKK..",
"................",
"................",
]

for _k, _g in UPGRADE_ICONS.items():
    assert len(_g) == 16, f'{_k} 不是 16 行'
    for _r in _g:
        assert len(_r) == 16, f'{_k} 有一行是 {len(_r)} 格'

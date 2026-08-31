"""九道料理各自的图标。

之前九道菜全在借食材的图标 —— 鲜花和鲜花饼一模一样、菌子一个图标背着
见手青和汽锅鸡。**图标撞了,背包和摊子就等于没有信息**:玩家看见一朵花,
不知道是原料还是成品。

每道菜挑一个**只有它有**的形状特征来画,颜色是次要的:
16px 上颜色能分辨的档次很少,形状才是辨识度的来源。
"""

DISHES = {}

# 烧饵块:烤过的饵块皮卷成筒,里面夹油条,外面刷甜咸酱。
# 特征是**斜着的卷筒**加焦斑 —— 食材饵块是躺平的白椭圆,一眼分得开
DISHES['shao_erkuai'] = [
"................",
"................",
"....KKKKKKKK....",
"...KEEEEEEEEK...",
"..KETEEEEEETEK..",
"..KEKKKKEEEEEK..",
".KEEKTtTKEEETEK.",
".KEEKtTtKEEEEEK.",
".KEEKTtTKEETEEK.",
".KEETKKKKEEEEEK.",
"..KEEEEETEEEEK..",
"..KETEEEEEEEK...",
"...KEEEEEEEK....",
"....KKKKKKK.....",
"................",
"................",
]

# 洋芋粑粑:煎成的土豆饼,圆而扁,边上一圈焦。食材洋芋是球
DISHES['yangyu_baba'] = [
"................",
"................",
"................",
"....KKKKKKKK....",
"..KKTTTTTTTTKK..",
".KTTCTTTTTCTTTK.",
"KTTTTTTCCTTTTTTK",
"KTCTTTTCCTTTCTTK",
"KTTTTTTTTTTTTTTK",
"KTTCTTTTTTTCTTTK",
".KttTTTTTTTTttK.",
"..KKtttttttttK..",
"....KKKKKKKK....",
"................",
"................",
"................",
]

# 米凉虾:红糖水里泡着白色的凉虾。特征是**玻璃杯 + 杯底那截深色糖水**
DISHES['liangxia'] = [
"................",
"..KKKKKKKKKKK...",
"..KwwwwwwwwwK...",
"..KwEwwwEwwwK...",
"..KwwwwwwwwwK...",
"..KwwEwwwwEwK...",
"..KMMMMMMMMMK...",
"..KMEMMMEMMMK...",
"..KMMMMMMMMMK...",
"..KMMEMMMMEMK...",
"..KMMMMMMMMMK...",
"...KMMMMMMMK....",
"...KKMMMMMKK....",
"....KKKKKKK.....",
"................",
"................",
]

# 豆花米线:蓝釉碗,碗里是米线,顶上一坨白豆花,加韭菜和一点酱。
#
# 上一版是白碗白料,和食材「豆花」(一个白色的圆坨)几乎一样 ——
# 两个都读成「白的一坨」。现在靠三样分开:
#   蓝碗   豆花那张图没有碗,这张有,而且是深蓝的
#   米线条 碗里横着几道分隔线,看得出是「条」不是「坨」
#   配料   一点绿、一点酱色 —— 素白的是豆花,拌过的是豆花米线
#
# 米线用 e(#e8d5a8)不用 E(#fff3d6):E 和豆花的白只差一点点,
# 画上去看不出条纹,整碗又糊成一坨白。
DISHES['douhua_mx'] = [
"................",
"................",
".....KwwwwK.....",
"...KKwwwwwwKK...",
"..KewwwwwwwweK..",
".KeeewwwwwweeeK.",
".KeeKeeKeeKeeeK.",
".KGeeKeeKeeKteK.",
".KKeeeeeeeeeeKK.",
"..KbbbbbbbbbbK..",
"..KbNNNNNNNNbK..",
"...KbbbbbbbbK...",
"....KKbbbbKK....",
"......KKKK......",
"................",
"................",
]

# 小锅米线:紫铜小锅,红汤,**右边一根伸出去的长柄**。
#
# 上一版整口锅是红的,柄只是右边一个小疙瘩 —— 读起来是「一只红杯子」。
# 「小锅」这三个字的分量全在那根柄上:红的应该是**汤**,锅是铜的,
# 柄要伸出锅外一大截,一眼就知道这是端着上桌的那种小锅。
# 铜壁得占满两像素(上下各一道 o 的横边),1 像素的边在缩略图上直接没了。
DISHES['xiaoguo_mx'] = [
"................",
"................",
"................",
".KKKKKKKKKKK....",
".KoooooooooK....",
".KoXXXXXXXoK....",
".KoXeXXeXXoKKKK.",
".KoXXXeXXXoKDDK.",
".KoXeXXXeXoKKKK.",
".KoXXXXXXXoK....",
".KoooooooooK....",
"..KKKKKKKKK.....",
"................",
"................",
"................",
"................",
]

# 鲜花饼:圆酥饼,正中一个**红戳**,底下两道酥皮层。
#
# 上一版顶上画的是一朵粉花 —— 和食材「鲜花」用的是同一档粉,
# 16 像素上两个都读成「一坨粉的圆东西」,这正是要避开的那件事。
# 现在它的身份换成**酥皮 + 红印**:红印是真鲜花饼上就有的那个戳,
# 而鲜花那边是粉瓣配金蕊,两个图从此一点不沾。
#
# **饼身不能用 S(沙色)。** 面板底色就是沙色,一整块 S 画上去等于没画 ——
# 只剩一圈描边和中间那个红戳,读成一个甜甜圈。改成 s + T 两档暖黄褐。
DISHES['xianhua_bing'] = [
"................",
"................",
"......KKKK......",
"....KKssssKK....",
"...KssssssssK...",
"..KssssssssssK..",
"..KssKXXXXKssK..",
"..KssKXXXXKssK..",
"..KssssssssssK..",
"..KTTTTTTTTTTK..",
"..KssssssssssK..",
"...KTTTTTTTTK...",
"....KKTTTTKK....",
"......KKKK......",
"................",
"................",
]

# 烤乳扇:竹签上卷着的乳扇,刷了玫瑰酱。原料乳扇没有签、没有粉
DISHES['kao_rusan'] = [
"................",
"................",
".......KK.......",
"......KddK......",
"...KKKKddKKKK...",
"..KtYYYddYYYtK..",
"..KYpYtddtYpYK..",
"..KYYpYddYpYYK..",
"..KtYYYddYYYtK..",
"..KYpYtddtYpYK..",
"..KYYpYddYpYYK..",
"..KtYYYddYYYtK..",
"...KKKKddKKKK...",
"......KddK......",
"......KKKK......",
"................",
]

# 见手青:炒好的一盘菌片 + 辣椒。菌片切开发青,所以带一点冷绿
DISHES['jianshouqing'] = [
"................",
"................",
"....KKK...KKK...",
"...KMMMKKMMMK...",
"..KMMgMMMMgMMK..",
".KMMMMMXMMMMMMK.",
".KMgMMMXMMgMMMK.",
"KMMMMMMXMMMMMMMK",
"KMMgMMMMMgMMMMMK",
"KAAAAAAAAAAAAAAK",
"KAAAAAAAAAAAAAAK",
".KaaaaaaaaaaaaK.",
"..KKaaaaaaaaKK..",
"....KKKKKKKK....",
"................",
"................",
]

# 汽锅鸡:紫陶汽锅。**中间那根蒸汽烟囱**天底下只有汽锅有,最好认
DISHES['qiguoji'] = [
"................",
"......KKKK......",
"......KrrK......",
"....KKKrrKKK....",
"...KrrrrrrrrK...",
"..KKrrrrrrrrKK..",
".KrrrrrrrrrrrrK.",
"KrrrrrrrrrrrrrrK",
"KrKrrrrrrrrrrKrK",
"KrKrrrrrrrrrrKrK",
"KrrrrrrrrrrrrrrK",
".KrrrrrrrrrrrrK.",
"..KKrrrrrrrrKK..",
"....KKKKKKKK....",
"................",
"................",
]

for _k, _g in DISHES.items():
    assert len(_g) == 16, f'{_k} 不是 16 行,是 {len(_g)}'
    for _r in _g:
        assert len(_r) == 16, f'{_k} 有一行是 {len(_r)} 格:{_r}'

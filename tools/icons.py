# 16x16 像素图标。每行必须正好 16 字符,共 16 行(pal.to_svg 会断言校验)。
# 内容框还必须在 16×16 里摆正 —— emit.py 会体检,偏出半格直接报错不生成。
ICONS = {}

ICONS['erkuai'] = [
"................",
"................",
"................",
"...KKKKKKKKKK...",
"..KwwwwwwwwwwK..",
".KwwwwwwwwwwwwK.",
".KwwwwwwwwwwwwK.",
".KwwwVVVVVwwwwK.",
".KwwwwwwwwwwwwK.",
".KwVVVVVVVVVVwK.",
".KVVVVVVVVVVVVK.",
"..KVVVVVVVVVVK..",
"...KKKKKKKKKK...",
"................",
"................",
"................",
]

ICONS['potato'] = [
"................",
"................",
"......KKKK......",
"....KKTTTTKK....",
"...KTLTTTTTTK...",
"..KTTtLTTTTTTK..",
"..KTTTTTTTTTTK..",
".KTTTTTTTTtTTTK.",
".KTTTTTTTTTTTTK.",
".KTTTTTTTTTTTTK.",
"..KTTTTTTTTTTK..",
"..KttttttttttK..",
"...KttttttttK...",
"....KKTTTTKK....",
"......KKKK......",
"................",
]

ICONS['rice'] = [
"................",
"................",
"................",
"......KKKK......",
"....KKwwwwKK....",
"...KwKwwKwwwK...",
"..KwwKwwwKwwwK..",
".KwKwwwKwwwKwwK.",
".KwwwKwwwKwwwwK.",
"KwKwwwKwwwKwwwwK",
"KwwwKwwwKwwwKwwK",
"KVVVVVVVVVVVVVVK",
".KKKKKKKKKKKKKK.",
"................",
"................",
"................",
]

ICONS['douhua'] = [
"................",
"................",
"......KKKK......",
"....KKwwwwKK....",
"...KwwwwwwwwK...",
"..KwwwwwwwwwwK..",
".KwwwwwwwwwwwwK.",
".KwwwVwwwwwwwwK.",
"KwwVwwwwwwVwwwwK",
"KwwwwwwwwwwwwwwK",
"KwVVVVVVVVVVVVwK",
".KVVVVVVVVVVVVK.",
"..KKVVVVVVVVKK..",
"....KKKKKKKK....",
"................",
"................",
]

ICONS['flower'] = [
"................",
".....KKKKKK.....",
"...KKqqqqqqKK...",
"..KqqppppppqqK..",
"..KqppKppKppqK..",
".KqpppKYYKpppqK.",
".KqppppYYppppqK.",
"..KqppKppKppqK..",
"..KqqppppppqqK..",
"...KKqqqqqqKK...",
".....KKggKK.....",
"...KGGKggKGGK...",
"..KGGGKggKGGGK..",
"...KKKKggKKKK...",
"......KggK......",
"................",
]

ICONS['mushroom'] = [
"................",
".....KKKKKK.....",
"...KKTTTTTTKK...",
"..KTLLLTTTTTTK..",
".KTTLTTTTTTTTTK.",
".KTTTTTTTTTTTTK.",
".KttttttttttttK.",
".KttttttttttttK.",
"..KttttttttttK..",
"...KKttttttKK...",
"....KEEEEBeK....",
"...KeeEEEBeEK...",
"...KeeEEEEeEK...",
"...KeeEEEEeEK...",
"....KKKKKKKK....",
"................",
]

ICONS['rusan'] = [
"................",
"................",
"...KKKK.........",
"..KYYYYKK.......",
".KYYYYYYYKK.....",
".KYyYYYYYYYKK...",
".KYYYYyYYYYYYK..",
"..KYYYYYYyYYYK..",
"...KYYYYYYYYYK..",
"....KYYYYyYYYK..",
".....KYYYYYYYK..",
"......KYYYYYYK..",
".......KYYYYYK..",
"........KKKKKK..",
"................",
"................",
]

ICONS['chili'] = [
".......KK.......",
"......KggK......",
".....KGGGGK.....",
"......KKKK......",
"......KRRK......",
".....KRRRrK.....",
".....KXRRrK.....",
".....KXRRrK.....",
".....KRRRrK.....",
".....KRRRrK.....",
".....KRRRrK.....",
".....KRRRrK.....",
".....KRRRrK.....",
"......KRRK......",
".......KK.......",
"................",
]

ICONS['sugar'] = [
"................",
"................",
"................",
"..KKKKKKKKKKKK..",
".KMMMMMMMMMMMMK.",
".KMoMMMoMMMMoMK.",
".KMMMMMMMoMMMMK.",
".KMMoMMMMMMMoMK.",
".KMMMMMoMMMMMMK.",
".KMoMMMMMMoMMMK.",
".KMMMMoMMMMMMMK.",
".KttttttttttttK.",
"..KKKKKKKKKKKK..",
"................",
"................",
"................",
]

ICONS['coin'] = [
"................",
"......KKKK......",
"....KKyyyyKK....",
"...KyyYYYYyyK...",
"..KyyYYYYYYYYK..",
"..KyYYYYYYYYYK..",
".KyYYYYYYYYYYYK.",
".KyYYYYYYYYYYYK.",
".KyYYYYYYYYYoYK.",
".KyYYYYYYYYoooK.",
"..KoYYYYYYoooK..",
"..KKoYYYYoooKK..",
"...KKoooooooK...",
".....KKKKKK.....",
"................",
"................",
]

ICONS['heart'] = [
"................",
"................",
"...KKK...KKK....",
"..KRRRK.KRRRK...",
".KRwwRRKKRRRRK..",
".KRwRRRRRRRRRK..",
".KRRRRRRRRRRRK..",
"..KRRRRRRRRRK...",
"..KrRRRRRRRrK...",
"...KrRRRRRrK....",
"....KrRRRrK.....",
".....KrRrK......",
"......KrK.......",
".......K........",
"................",
"................",
]

ICONS['star'] = [
"................",
".......KK.......",
"......KYYK......",
"......KYYK......",
".....KYYYYK.....",
"KKKKKKYYYYKKKKKK",
"KyYYYYYYYYYYYYyK",
".KYYYYYYYYYYYYK.",
"..KYYYYYYYYYYK..",
"..KYYYYYYYYYYK..",
"..KYYYYYYYYYYK..",
".KYYYKKKKKKYYYK.",
".KYYK......KYYK.",
".KYK........KYK.",
".KK..........KK.",
"................",
]

ICONS['backpack'] = [
"................",
"......KKKK......",
".....KddddK.....",
".....KdKKdK.....",
"..KKKKKKKKKKKK..",
"..KDDDDDDDDDDK..",
"..KDDDDDDDDDDK..",
"..KDKKKKKKKKDK..",
"..KDKLLLLLLKDK..",
"..KDKLKKKKLKDK..",
"..KDKLLLLLLKDK..",
"..KDKKKKKKKKDK..",
"..KDDDDDDDDDDK..",
"..KKDDDDDDDDKK..",
"....KKKKKKKK....",
"................",
]

ICONS['postcard'] = [
"................",
"................",
".KKKKKKKKKKKKKK.",
".KwwwwwwwwwwwwK.",
".KwBBBBBwKKKKwK.",
".KwBBBBBwKwwKwK.",
".KwBwwBBwKKKKwK.",
".KwBBBBBwwwwwwK.",
".KwGGGGGwKKKKwK.",
".KwwwwwwwwwwwwK.",
".KwKKKKKKKKKKwK.",
".KwwwwwwwwwwwwK.",
".KKKKKKKKKKKKKK.",
"................",
"................",
"................",
]

ICONS['shop'] = [
"................",
".....KKKKKK.....",
"....KwwwwwwK....",
"..KKKKKKKKKKKK..",
"..KRRwwRRwwRRK..",
"..KRRwwRRwwRRK..",
"..KKKKKKKKKKKK..",
"..KDDDDDDDDDDK..",
"..KDKKKKKKKDDK..",
"..KDKSSSSSKDDK..",
"..KDKSSSSSKDDK..",
"..KDKSSSSSKDDK..",
"..KDKKKKKKKDDK..",
"..KKKKKKKKKKKK..",
"................",
"................",
]

ICONS['trophy'] = [
"................",
"...KKKKKKKKKK...",
"...KyYYYYYYyK...",
".KKKYYYYYYYYKKK.",
".KoKYYYYYYYYKoK.",
".KoKYYYYYYYYKoK.",
".KoKKYYYYYYKKoK.",
".KKoKYYYYYYKoKK.",
"...KKYYYYYYKK...",
".....KYYYYK.....",
"......KYYK......",
"......KYYK......",
"....KKYYYYKK....",
"....KooooooK....",
"....KKKKKKKK....",
"................",
]

ICONS['map'] = [
"................",
"..KKKKKKKKKKKK..",
".KSSSKSSSSKSSSK.",
".KSSSKSSSSKSSSK.",
".KSrSKSSSSKSSSK.",
".KSSrKSSSSKSSSK.",
".KSSSKrSSSKSSSK.",
".KSSSKSrSSKSSSK.",
".KSSSKSSrSKSSSK.",
".KSSSKSSSrKSSSK.",
".KSSSKSSSSKrSSK.",
".KSSSKSSSSKSRSK.",
".KSSSKSSSSKRSRK.",
".KSSSKSSSSKSSSK.",
"..KKKKKKKKKKKK..",
"................",
]

ICONS['shield'] = [
"................",
"..KKKKKKKKKKKK..",
"..KBBBBBBBBBBK..",
"..KBwwBBBBBBBK..",
"..KBwBBBBBBBBK..",
"..KBBBBBBBBBBK..",
"..KBBBBBBBBBBK..",
"..KBBBBBBBBBBK..",
"..KbBBBBBBBBbK..",
"..KbbBBBBBBbbK..",
"...KbbBBBBbbK...",
"....KbbBBbbK....",
".....KbbbbK.....",
"......KbbK......",
".......KK.......",
"................",
]

ICONS['magnet'] = [
"................",
".....KKKKKK.....",
"...KKAAAAAAKK...",
"..KAAKKKKKKAAK..",
"..KAAK....KAAK..",
"..KAAK....KAAK..",
"..KAAK....KAAK..",
"..KAAK....KAAK..",
"..KAAK....KAAK..",
"..KaaK....KaaK..",
"..KRRK....KRRK..",
"..KRRK....KRRK..",
"..KrrK....KrrK..",
"..KKKK....KKKK..",
"................",
"................",
]

ICONS['double'] = [
"................",
"........KKKK....",
"......KKyyyyKK..",
"......KyYYYYYK..",
".....KyYYYYYYYK.",
"....KKKKYYYYYoK.",
"..KKyyyyKKYYYoK.",
"..KyYYYYYKYYooK.",
".KyYYYYYYYKYoK..",
".KyYYYYYYoKoKK..",
".KyYYYYYYoKK....",
".KyYYYYYooK.....",
"..KYYYYYoK......",
"..KKooooKK......",
"....KKKK........",
"................",
]

ICONS['sun'] = [
"................",
".......KK.......",
"..K....yy....K..",
"...K..KKKK..K...",
"....KKYYYYKK....",
"...KYYYYYYYYK...",
".K.KYYYYYYYYK.K.",
"KyKKYYYYYYYYKKyK",
"KyKKYYYYYYYYKKyK",
".K.KYYYYYYYYK.K.",
"...KYYYYYYYYK...",
"....KKYYYYKK....",
"...K..KKKK..K...",
"..K....yy....K..",
".......KK.......",
"................",
]

ICONS['rain'] = [
"................",
"................",
"....KKKKKKKK....",
"..KKwwwwwwwwKK..",
".KwwwwwwwwwwwwK.",
".KwwwwwwwwwwwwK.",
".KAAAAAAAAAAAAK.",
"..KKKKKKKKKKKK..",
"................",
"................",
"...K....K....K..",
"..KBK..KBK..KBK.",
".KBBK.KBBK.KBBK.",
"..KK...KK...KK..",
"................",
"................",
]

ICONS['fog'] = [
"................",
"................",
"..KKKKKKKKKKKK..",
"..KwwwwwwwwwwK..",
"..KKKKKKKKKKKK..",
"................",
".KKKKKKKKKKKKKK.",
".KAAAAAAAAAAAAK.",
".KKKKKKKKKKKKKK.",
"................",
"..KKKKKKKKKKKK..",
"..KwwwwwwwwwwK..",
"..KKKKKKKKKKKK..",
"................",
"................",
"................",
]

# 汽水瓶盖。成就给的东西 —— 装扮只能用瓶盖买,和鸥币分开走两条线。
#
# 之前画的是瓶盖,两版都被说「看不出是什么」。**16px 下认得出的东西必须有
# 一个独一无二的轮廓**,瓶盖没有(它就是一片叶子),瓶盖有:那圈咬花的齿边
# 天底下只有瓶盖长这样,连内容都不用看,看轮廓就认出来了。
#
# 用红不用金:金的和鸥币那枚硬币在 HUD 里挨着,一眼分不开。
# 齿是按角度算出来的(cos(角度×10) 的正负决定这一格咬进去还是凸出来),
# 手数十个齿数不匀,一不匀就不像机器压出来的。
ICONS['cap'] = [
"....KKKKKKK.....",
"...KKKrKrKKK....",
"..KKKrrrrrKKK...",
".KKKrXXXXXrrKK..",
"KKrrrwwXXXXrrKK.",
"KKKrXwXXXXXrKKK.",
"KKrrXXXXXXXrrKK.",
"KrrXXXXXXXXXrrK.",
"KKrrXXXXXXXrrKK.",
"KKKrXXXXXXXrKKK.",
"KKrrrXXXXXXrrKK.",
".KKKrXXXXXrrKK..",
"..KKKrrrrrKKK...",
"...KKKrKrKKK....",
"....KKKKKKK.....",
"................",
]

ICONS['waou'] = [
"................",
"....KKKKKKKK....",
"..KKwwwwwwwwKK..",
"..KwwwwwwwwwwK..",
"..KwwKKwwKKwwK..",
"..KwwKKwwKKwwK..",
"..KwwwwwwwwwwK..",
"..KwwwwwwwwwwK..",
"KKKwwwKXXKwwwKKK",
".KKwwwwKKwwwwKK.",
"..KwwVVVVVVwwK..",
"..KwVVVVVVVVwK..",
"..KwVVVVVVVVwK..",
"...KKVVVVVVKK...",
"....KKKKKKKK....",
".....XX..XX.....",
]

# 九道料理各自的图标,见 tools/dishes.py。
# 分开放是因为食材和料理是两批东西:食材的键进存档,料理的不进。
from dishes import DISHES
ICONS.update(DISHES)

# 四条升级线的图标 + 重画的辣椒,见 tools/upgrades.py。
# **放在最后 update**,所以 chili 是覆盖上面那版(直的那根被认成胡萝卜)。
from upgrades import UPGRADE_ICONS
ICONS.update(UPGRADE_ICONS)

# 厨房那四件家什,见 tools/kitchen.py。
# 和升级线那四条分开:摊位的「炉子」管你不在时赚多少,厨房的「灶台」管你在时多快,
# 是两条升级线,不能共用一个图标。
from kitchen import KITCHEN_ICONS
ICONS.update(KITCHEN_ICONS)

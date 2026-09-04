/**
 * 觅食飞行小游戏。
 *
 * 相比 template 里的旧实现修了三处:
 *  1. 双倍道具原来在拾取时 ×2、结算时又 ×2,实际变成四倍
 *  2. 生成节奏写死 spawnTimer += 16.67,等于假设永远 60fps。
 *     在 120/144Hz 屏上游戏会快一倍。现在用真实 delta time。
 *  3. 掉湖里和主动退出都走同一个结算,死了照样拿奖励。现在分开。
 *
 * 本模块不碰存档,只在一局结束后把结果交给 rules.settleFlight()。
 */

import { weatherOf, runwayBonus, activeCrew } from './rules.js';
import * as sfx from '../audio.js';
import { PixelScreen, sprite, drawSprite } from './pixmap.js';
import {
    VW, VH, paintSky, drawSea, drawClouds, drawFarGulls, drawRain, drawFog,
} from './scene.js';
import { ICON_GRIDS, SCENERY, WAOU } from './pixels.js';
import { dayPhase, CREW_FLIGHT } from '../data.js';
import { now } from '../clock.js';

/**
 * 显示画布的尺寸。玩法跑在 440×310 的虚拟坐标里(见 scene.js),
 * 由 PixelScreen **整数倍**放大贴出来 —— 半像素坐标在像素画里就是糊。
 *
 * 1860×930 = 620×310 的 **3 倍**。
 *
 * **这两个数必须跟着 scene.js 的 VW/VH 走。** 画面从 440 加宽到 620 那次
 * 漏了这儿:飞行画布还是 1320 宽,而 PixelScreen 按 620 算出的整数倍是 2,
 * 于是 620×310 的图以 2 倍贴成 1240×620,右边 80、底下 310 全是**透明的** ——
 * 大坝那张背景画布从底下透出来,飞行画面下面三分之一是甲板和猫。
 * 真机上看着像「飞着飞着掉进大坝里」,而代码一个错都没报。
 */
export const W = 1860;
export const H = 930;

const HORIZON = 250;          // 飞行视角:海平线压在下面,大半屏是天
const BIRD_X = 60;
/**
 * 命中半径。**吃的判得松,撞的判得紧,这是故意不对称的。**
 *
 * 原来食材和障碍共用一个 17。可后期一个东西一帧要走十几像素,
 * 从看见到擦身而过只剩两三帧 —— 同一个数字下,「差一点没吃到」和
 * 「差一点没撞上」出现得一样多,但玩家只会记住前者:
 * **没吃到是我的损失,没撞上是理所当然。**
 *
 * 所以食材放到 22(比画面上那颗看着还大一圈,伸头就够得着),
 * 障碍收到 15(擦着边过去算你过去了)。道具跟食材走。
 */
const FOOD_R = 22;
const HAZARD_R = 15;
/**
 * 红角的臂长。**只要四个角,不要一整个框** ——
 * 第一版画到 6,四个角快连成一圈,天上全是红方块,比不做记号还吵。
 * 4 就够:眼睛会自己把四个直角补成一个框(这是白送的),
 * 而墨水少一半。招了老翘会长到 7,那是另一回事(见下)。
 */
const CORNER_ARM = 4;

/* ---------- 两个键 ----------
 *
 * 原来是**拖着哇鸥走**:手指在哪它就在哪。够直观,但没有手感可言 ——
 * 位置直接归你,不存在「来不及」,飞行的难度就只剩下眼力。
 *
 * 现在改成两个键,中间隔着一层重力:
 *
 *   跃起(空格 / 屏幕左半)   拍一下翅膀,往上蹿一段再落回来
 *   平飞(方向键右 / 右半)   按住的时候不掉,横着飘
 *   什么都不按               掉
 *
 * 三个状态各管一个方向,合起来是完整的上下控制 —— **但每一次改变高度
 * 都要提前一点点**,那一点点就是手感。飞不是「移到那儿」,是「攒够高度」。
 */
/**
 * 每帧的下坠加速度(以 60fps 为基准,和 move 一样乘 k)。
 *
 * 第一版是 0.09,弧线又高又慢:拍一下要 0.54 秒才到顶,而且**刚拍完
 * 想往下走,得先花半秒把那股上冲的劲抵消掉**。于是常见的死法是
 * 「看见了、也知道该往哪躲、就是身子还在往上飘」—— 那不是难,是迟钝。
 *
 * 现在把整条弧线按时间压短,高度基本不变(48px):
 * 到顶 0.30 秒,从静止往下掉 0.30 秒也走 50px。**上下都在三分之一秒内起效。**
 *
 * **第二次压短(他:「跳跃的斜率再拉高些,减少横向位移距离」)。**
 * 高度不能动 —— **一次跃起正好一条道**,这个比例是整套关卡的地基;
 * 要动的是**同样的高度用多少时间换**,因为横向位移 = 时间 × 世界的速度。
 *
 * 保高度、把时间压成 0.7 倍,两个数是解出来的(h = v²/2g、t = v/g):
 * 初速度乘 1.4、重力乘 1.4²。
 *
 * 后来道距从 47.5 抬到 63.3(见 LANES),高度就得跟着抬到 63 ——
 * 「一跳一条道」比哪个具体数字都重要。**时间不动**(0.217 秒),
 * 所以横向位移一点没变,他要的那件事还在;由 h、t 解回去就是 −9.7 和 0.746。
 *
 *     到顶     0.30 秒 → 0.217 秒
 *     一跳横着走 开局 52px → 38px,四分半 83px → 59px
 *     一跳的高度 48px → 63px(跟着道距走)
 *
 * (`CLIMB_PX_PER_SEC` 那个保守估计**故意没跟着调**:它管的是「下一簇的空道
 * 最远可以离多远」,调高了门就能跨两条道,而「连着两扇门必有共用空道」
 * 那条保证会当场作废。手更利索了,那就让它变成玩家的余量,不是新的难度。)
 */
const GRAVITY = 0.746;
/** 拍一下翅膀给的初速度。升到最高约 63 像素 —— 正好一条道 */
const FLAP_VY = -9.7;
/** 下坠的终速。不封的话最后一段快到看不清自己是怎么掉下去的 */
const MAX_VY = 11.6;
/**
 * **往下掉的时候重力小一点(0.72 倍),终速也低一档。**
 *
 * 他说「下降速度稍慢一些」。上升那一半不能动 —— 一跳的高度和到顶的时间
 * 是整套关卡的地基(一跳正好一条道、横向只走 38 像素)。所以拆开:
 * **顶上去用原来的重力,掉下来用小一点的。**
 *
 *     掉一条道   0.22 秒 → 0.26 秒
 *     终速       696 px/s → 510 px/s
 *
 * 不对称的重力是老办法,只是常见的方向反过来(通常是「掉得更快」让手感更脆)。
 * 这里要的是相反的东西:**掉得慢一点,就有时间在半空改主意** ——
 * 而这一版的密度和四条道,考的正是改主意。
 */
const FALL_G = 0.537;
const MAX_VY_DOWN = 8.5;
/** 平飞时把纵向速度按住的力度。不是直接归零 —— 那样切换起来像瞬移 */
const GLIDE_K = 0.6;
/**
 * 能飞的上下边。上面撞天花板只是停住,下面碰水面要挨一下。
 *
 * 上边从 22 提到 44:**状态条压在画面最上面那一条**(分数、命、第几波、米数),
 * 而原来食材和障碍就生在它底下 —— 玩家看见的是「一个东西从字后面钻出来」,
 * 或者干脆没看见。哇鸥自己也能飞进去躲着。
 * 让开这一条之后,那一带只剩状态条,**画面上会动的东西全在看得见的地方**。
 */
const SKY_TOP = 44;
/**
 * 判「掉进湖里」的高度。
 *
 * 原来是 HORIZON − 16:算的是「32 高的图,底边正好压在海平线上」。
 * 但**图有 32 高不等于鸟有 32 高** —— 哇鸥的脚在中心往下约 11 像素,
 * 底下那几行是空的。于是判定发生时它还整只浮在山那一带的天上,
 * 画面上离水面差着一截,玩家只看见「无缘无故掉了一条命」。
 *
 * 现在压到海平线再往下 4 像素:触发的那一刻哇鸥的身子一半在水里。
 * **判定线该画在玩家看得见的那个东西上,不是画在图片的边界上。**
 */
const SEA_TOP = HORIZON + 4;
// 飞行里会掉的食材。稀有的(菌子、乳扇)不放常规掉落池,靠天气加成出
const FOOD_TYPES = ['erkuai', 'potato', 'rice', 'douhua', 'chili', 'sugar'];
const OBSTACLES = ['cloud', 'balloon', 'kite'];
const POWERUPS = ['shield', 'magnet', 'double'];
const OBSTACLE_GRID = { cloud: 'storm', balloon: 'balloon', kite: 'kite' };

/**
 * 一级、晴天的开局速度(每 60fps 帧走多少虚拟像素)。
 *
 * 1.25 是飘(横穿一次屏要六秒,开局一分钟几乎不用动手),
 * 2.6 又太急(还没坐稳东西就到脸上了)。**手感上对的那个数是
 * 「从露头到眼前三秒多」** —— 太闲和太慌是同一个死法,
 * 而开头这一分钟决定了他要不要玩第二局。
 *
 * 画面从 440 加宽到 620 之后,从露头到哇鸥的距离从 380 变成 560(+47%),
 * 同样的速度等于白送四成七的反应时间。所以 2.0 × 1.47 ≈ 2.9 ——
 * **变的是场地,不是难度;这个数跟着场地走,手感才不变。**
 */
const SPEED_0 = 2.9;

/**
 * 提速的斜率:每飞一分钟,速度在开局的基础上多涨这么多。
 *
 * 底盘抬高之后斜率就得压下来 —— 照旧的 0.9 走,五分钟时会比原来快四成,
 * 反应时间掉到半秒以下,那不是难,是看运气。
 */
const SPEED_GROW = 0.22;
/**
 * 速度的上限。**原来不封顶,理由是「一局的终点应该是撞死了,
 * 不是不再变难了」—— 那句话没错,错在把它交给了速度。**
 *
 * 速度决定的是「从露头到眼前有几秒」,而那几秒是玩家**读得过来读不过来**
 * 的门槛,不是难度旋钮:
 *
 *     开局 2.9  → 174 px/s → 3.2 秒
 *     3 分半 5.0 → 302 px/s → 1.85 秒   ← 他撞墙的地方
 *     6 分  6.7 → 402 px/s → 1.4 秒    ← 已经不是「难」,是看不清
 *
 * 封在 4.6(276 px/s,2.0 秒)。**再往后要变难,靠的是路线,不是眼力** ——
 * 密度、簇的宽度、窄道、饿,这几样都还在涨,而且都是**能练的**。
 * 助跑坡照旧管用:它让你更晚才碰到这个顶。
 */
const SPEED_MAX = 4.6;
/**
 * 等级每一级把**提速的斜率**加多少,以及生成间隔缩多快。
 *
 * 原来等级和天气是乘在 `baseSpeed` 和 `baseInterval` 上的,
 * 于是「开局多快」这件事跟着等级和天气一起飘:
 *
 *     1 级晴天 120px/s   5 级晴天 166   1 级雨天 156   5 级雨天 215
 *
 * 玩家什么都没干,升了一级、或者今天下雨,开局就快了三成到八成 ——
 * **那不是难度设计,那是同一个玩法每次开局都不是同一个游戏。**
 * 而 2.6 那一档正是之前被判「太急」的那个数。
 *
 * 现在等级和天气一律改成加在**斜率**上:谁来飞、什么天,
 * 第一分钟都一模一样;区别在于它多快变难。
 * （助跑坡当初也是这么改的 —— 第三次撞上同一件事了。）
 */
const LV_GROW = 0.10;
/**
 * 开局的生成间隔。**也是个常数** —— 理由同上。
 *
 * 860 → 780:开局那一分钟场上东西太少,而占比调不动这一条 ——
 * 障碍占比管的是「来的是哪一种」,**节奏管的是「多久来一个」**,
 * 头一分钟空荡荡是两个一起造成的,只拧一个拧不动。
 */
const SPAWN_0 = 780;
/**
 * 生成间隔每分钟压缩多少毫秒,以及压到哪儿为止。
 *
 * 底线定在 380ms 而不是 300:**留出来的不是反应时间,是「拍两下」的时间。**
 * 换两条道要连着拍两下并且提前起手,间隔比这个还短的话,
 * 第二下永远来不及 —— 那时候躲不躲得掉就跟操作没关系了。
 */
const SPAWN_GROW = 110;
/**
 * 生成间隔的下限。420 → 520。
 *
 * 420 毫秒 × 后期的速度 = 两次生成之间只隔 127 像素,而哇鸥换一条道
 * 最快要 0.26 秒 —— **连着两簇之间根本没有换道的余地**。
 */
const SPAWN_MIN = 520;
/**
 * 生成节奏的抖动。**均匀的间隔是可以数拍子的** ——
 * 原来每 spawnInterval 精确一次,东西等距过来,玩家闭着眼按节奏动都行
 * (他说「分布太均匀」)。抖 ±35%:平均密度一点没变,
 * 而每一簇要真看一眼才知道在哪。
 */
const SPAWN_JITTER_LO = 0.65;
const SPAWN_JITTER_HI = 1.35;
/**
 * 两簇障碍之间至少隔多久。**这一条是按秒定的,不是按像素。**
 *
 * 他报的「一竖排障碍中间的空路后面又生成一个障碍把路堵死」就是这儿:
 * 生成是每 `spawnInterval` 掷一次骰子,后期 62% 的面都是障碍,
 * 于是**连着两次掷出障碍**是常事 —— 两簇只差一个间隔,而且第二簇的空道
 * 允许挪一条,那一条正好压在第一簇的空道后面。画面上看就是一堵墙。
 *
 * 换道要 0.26~0.35 秒,700 毫秒是两倍的余量。掷到障碍但没到点的,
 * 这一次改放吃的 —— **该密的是东西,不是墙。**
 */
const HAZ_MIN_MS = 700;

/**
 * 障碍占生成的比例:开局 42%,涨到 55% 封顶(约两分半)。
 *
 * 原来开局是 22%,配上 860 毫秒的生成间隔,等于**平均 3.9 秒才来一个障碍**,
 * 而一个障碍横穿画面要 3.2 秒 —— 头一分钟没有游戏。
 *
 * 60%:他说了两轮「初期障碍物过少」。42% → 52% → 60%。
 * **留给吃的空当靠的是「两簇之间至少 700 毫秒」那条硬保证**,不是靠占比留白 ——
 * 占比低只会让「什么都没有」的那几秒变长,而那几秒正是「空旷」的来源。
 *
 * **上限从 62% 压到 55%,斜率从 0.09 减到 0.05。** 这一档和速度上限、
 * 簇宽上限一起,在两分半到三分钟之间**全部封顶** —— 那之后障碍这条线
 * 不再变难,玩家会有一段「不过如此」。**那段松弛是故意的**,
 * 它是后面那件事的铺垫:见 MODE_CD_FROM。
 */
const HAZARD_0 = 0.60;
const HAZARD_MAX = 0.55;
/** 多久算一波。到点报一次,让玩家知道是游戏变难了不是自己变菜了 */
const WAVE_MS = 20_000;
/**
 * 可飞的高度切成几条道。**一簇障碍必留一条空的** ——
 * 密度上去之后如果不留道,就成了随机送死,那不叫难,叫不讲理。
 *
 * **五条改成四条(道距 47.5 → 63.3)。** 他说「障碍物间的纵向间距太窄了,
 * 看上去不能走实际能走」—— 这是一笔算得出来的账:
 *
 *     道距           47.5
 *     障碍那几张图     15~22 高
 *     两个障碍之间的净空 ≈ 27 像素
 *     **而哇鸥那张图是 32 高**
 *
 * 判定上过得去(两边各留 15 的半径,中间还剩 17.5 的余量),
 * 可**画面上它明明塞不进去** —— 玩家照着眼睛走,就永远不敢走那条缝。
 *
 * > **判定可以比图小,但不能小到「看着过不去」。**
 * > 玩家信的是眼睛,不是我的碰撞盒。
 *
 * 四条道之后净空 43 像素,哇鸥 32 —— 看着能过,实际也能过。
 */
const LANES = 4;
/**
 * 五条道的中心高度。**必须铺满能飞的那一整段,两头不能留边。**
 *
 * 原来的道是从「生成区」(46 ~ 224)里等分出来的:每条道 35.6 高,
 * 中心落在 63.8 / 99.4 / … / 206.2 —— 两头各空着半条道。
 * 于是最上面那条道的障碍离天花板 19.8 像素,比判定半径(15)还远:
 * **顶着天飞谁也碰不到你**。而平飞键会把高度稳稳按住,贴着水面也是同一回事。
 * 一个「一直顶着上边」的解法等于把这个玩法作废了 —— 躲和吃都不用做了。
 *
 * 现在道的中心直接按能飞的上下边(SKY_TOP / SEA_TOP)往里收 10 像素铺开。
 * 10 比最小的那个判定半径(老翘的 12)还小,**贴着边也还在最外那条道的判定里**。
 */
const LANE_PAD = 10;
const LANE_TOP = SKY_TOP + LANE_PAD;
const LANE_BOTTOM = SEA_TOP - LANE_PAD;
const LANE_H = (LANE_BOTTOM - LANE_TOP) / (LANES - 1);
/** 第 i 条道的中心高度 */
const laneY = i => LANE_TOP + LANE_H * i;
/** 食材和道具的生成区。障碍走上面那五条道,这两个数只管能吃的 */
const SPAWN_TOP = 46;
const SPAWN_BOTTOM = HORIZON - 26;
/**
 * 哇鸥一秒能纵向挪多少像素(保守估计)。
 * 拿来算「下一簇的空道最远可以离多远」—— 见 _hazard()。
 * 拍翅膀连着按大约 2.7px/帧,松手掉到终速 6.5;取 150 是往低了算,
 * **这个数宁可小,不能大** —— 大了就等于允许一次够不着的换道。
 */
const CLIMB_PX_PER_SEC = 150;
/**
 * 障碍在道上左右前后晃多少。**钉在道的正中,满屏就是一张网格** ——
 * 而网格是「看一眼就知道后面长什么样」,他两次说的「太规律」有一半在这儿。
 * ±7 是算过的:门那条道的中心离最近的障碍还有 40 像素,判定半径 15 ——
 * **晃归晃,门必须还是门。**
 */
const LANE_JITTER = 7;
/** 食材出现在哇鸥当下高度的上下这么多像素之内。约等于两下翅膀 */
const REACH = 72;
/**
 * 食材**横着成组**出现,一组一到五个,同一个高度、同一种。
 *
 * 他点破的那件事:**两个键各管一半 —— 跃起是用来躲的,平飞是用来吃的。**
 * 而食材原来是一颗一颗零散撒的,吃它靠的是「跳到那个高度」——
 * 于是平飞在觅食这一半里没有位置,两个键的分工只落地了一半。
 *
 * 排成一横排之后:对准高度、按住平飞、一路收过去。
 * **一组的长度就是这个键要按多久。**
 *
 * 组的大小偏小(权重表里 1 和 2 最多):一上来就五连排,
 * 那条「对准了就赚一笔」的甜头会变得太廉价。
 */
const FOOD_ROW = [1, 1, 2, 2, 2, 3, 3, 4, 5];
/**
 * 一排里两颗之间隔多久(秒),**不是隔多少像素**。
 *
 * 第一版写死 30 像素 —— 他说「太近了就完全不用横飞」:五颗排下来才 120 像素,
 * 开局那个速度 0.7 秒就过完了,擦过去就全捡到了,平飞按不按都一样。
 *
 * 和窄道的宽度是同一条道理:**要固定的是「按住多久」,不是「多少像素」。**
 * 0.3 秒一颗 —— 五颗一排要按住一秒半,那才叫「用平飞去吃」。
 * 速度涨上去之后像素间距自己跟着涨(0.3 秒还是 0.3 秒)。
 */
const FOOD_ROW_SEC = 0.3;

/* ---------- 三个道具:出得少,但每一个都是一段能记住的十几秒 ----------
 *
 * 原来是**每次生成 5% 的概率**,大约十七秒一个:天上一直飘着加成,
 * 于是它们既不稀罕,单个又不值一提 —— 磁铁只吸身边七十像素,
 * 双倍只改一个看不见的分数,护盾更是一直揣着不过期。
 * **又多又淡是最差的一档**:玩家既不会为拿到它高兴,也不会为够不着可惜。
 *
 * 现在两头一起改:概率压到 1.5%,并且两次之间至少隔 25 秒(约一分钟一个);
 * 换来的是每一个都值得为它拐一趟 ——
 *
 *   磁铁  15 秒,**整屏**的食材全朝你飞过来(原来只有身边 70 像素)
 *   护盾  45 秒内挡**两次**(原来是一次,而且没有期限)
 *   金币  8 秒无敌 + 往前冲,期间**食材翻倍**,撞碎的障碍还给分
 *
 * 三个都有时限,而且都在状态栏上倒数。**一个不知道什么时候没的加成,
 * 没了的那一下只会被当成手感变差**;看得见它快没了,才谈得上
 * 「趁着还有赶紧吃」—— 那十几秒的紧张感是这三个道具真正给的东西。
 */
/**
 * 每次生成里有多大概率是道具,以及两个之间至少隔多久。
 *
 * 1.5% + 25 秒(约一分钟一个)试下来**太稀了**:一局里见着三四次,
 * 而其中还有一次是颠倒 —— 玩家来不及建立「天上会掉好东西」这个预期,
 * 反倒像是随机撞了大运。**加成要成为一条玩法,得先密到能被指望上。**
 *
 * 4% + 12 秒 ≈ 一分钟两三个:每一个还是要拐一趟才拿得到,
 * 但「这一路上会有东西」变成了可以计划的事。
 */
const POWER_RATE = 0.04;
const POWER_GAP = 12_000;
const MAGNET_MS = 15_000;
const MAGNET_MAX = 30_000;
/** 磁铁的吸力(像素/帧)。远的拉得快、近的收得稳,不然会绕着头打转 */
const MAGNET_PULL_MIN = 1.6;
const MAGNET_PULL_MAX = 6.5;
/**
 * 护盾管多久。**十二秒**(原来 45 秒)。
 *
 * 四十五秒长到跟「一直带着」没多少区别 —— 拿到之后照常飞,它自己就用掉了,
 * 玩家甚至不知道它挡的是哪一下。十二秒短到必须**主动去用**:
 * 这十二秒里得刻意往险处伸头,不然它就白过期了。
 * **一个会过期的保命才会被用掉**,而用掉正是它存在的理由。
 */
const SHIELD_MS = 12_000;
const SHIELD_MAX = 24_000;
const SHIELD_N = 2;             // 一个护盾能挡几次
const SHIELD_N_MAX = 4;
/**
 * 金币:这一局里唯一「什么都不用躲」的八秒。
 *
 * 无敌 + 提速 + 翻倍三件事捆在一起,是因为它们指的是同一句话:
 * **放开了冲**。只给无敌的话玩家还是照原速飞,那八秒里什么都没发生;
 * 只提速就成了惩罚。三件一起才有那个「一头扎进去」的劲儿。
 *
 * 八秒不能再长了 —— 无敌期间这个玩法是没有玩法的。
 */
const RUSH_MS = 8000;
const RUSH_MAX = 16_000;
const RUSH_SPEED = 1.8;         // 冲刺时世界跑多快
const RUSH_DX = 46;             // 哇鸥往前顶出去多少(画面上)
const RUSH_SMASH = 4;           // 撞碎一个障碍给多少分

/* ---------- 窄道:唯一一件非平飞不可的事 ----------
 *
 * 两个键里,平飞一直是可有可无的那个:躲障碍靠的是「换到空的那条道」,
 * 而换道用跃起和松手就够了 —— **一个从来不用按的键等于没有。**
 *
 * 窄道是专门为它造的局面:一整片乌云横过来,只留一条缝,
 * 而缝的高度是固定的。你得先飞到那个高度,然后**在里面待住一秒多** ——
 * 松手就掉出去,多拍一下就撞上顶。这一秒多里,平飞是唯一的解。
 *
 * 每三波来一次(约一分钟),提前 1.5 秒在右边缘标出缝在哪 ——
 * **不预告的话它就不是考验,是埋伏。**
 */
const CORRIDOR_EVERY = 3;       // 每几波来一次
const CORRIDOR_WARN = 1500;     // 提前多久预告
const CORRIDOR_S = 1.3;         // 穿过去要多久(秒)。宽度按当时的速度换算
/**
 * 三分钟之后,窄道**变长、而且缝会上下走**。
 *
 * 他要的:「竖向尖刺在 3 分钟后变为可伸缩,即远处尖刺逐渐下降或上升,
 * 且尖刺整体宽度变宽,即需要通过的路程变长」。
 *
 * 原来的窄道是一条**直的**缝:飞到那个高度、按住平飞、等它过去 ——
 * 考的只是「按不按得稳」,而那一下学会了就永远会。缝斜起来之后,
 * 里面那一秒多得**一边按住一边挪**,平飞和跃起要同时用;
 * 走得越长,挪的次数越多。
 *
 * 「远处尖刺逐渐下降或上升」在实现上就是给缝一个斜率:进口在预告的高度,
 * 出口偏出一两条道。**斜率在预告里就定下来**,所以预告能把它画出来 ——
 * 不预告的话它不是考验,是埋伏(这条规矩是窄道刚做出来时定的)。
 */
const CORRIDOR_BEND_AT = 180_000;
const CORRIDOR_BEND_LANES = 2;  // 出口最多偏出几条道
const CORRIDOR_S_MAX = 2.4;     // 穿过去最长要多久
const CORRIDOR_S_PER_MIN = 0.3; // 三分钟之后每分钟长这么多秒
const CORRIDOR_GAP = 32;        // 缝的半高。哇鸥 32 高,判定半径 15
/* 场地宽了之后跟着放 —— 这两个夹的是「云有多长」,单位是像素 */
const CORRIDOR_MIN_W = 310;
const CORRIDOR_MAX_W = 730;

/**
 * 开局先数三秒。
 *
 * 点完「出发觅食」画面一换,东西就已经在往脸上飞了 —— 玩家还没看清
 * 自己在哪儿、这局是什么天气、两个键长什么样,第一条命就没了。
 * **一局的第一秒不该用来找自己。**
 *
 * 这三秒里世界照转、两个键照用、水面不扣命,但**不计时、不生成、不判死**:
 * 距离从 0 开始,难度从 0 分钟开始 —— 它是白送的三秒热身,不是白扣的三秒。
 */
const COUNTDOWN_MS = 3000;

/* ---------- 颠倒:一场二十秒的赌 ----------
 *
 * 天上偶尔飘一个金边的上下箭头。吃到它,**重力翻个个儿**:
 * 松手是往上飘,拍一下是往下扎,平飞还是稳住 —— 两个键各管什么没变,
 * 变的是哪边算「下面」。云顶这时候和湖面一样要命(画面上会长出一层乌云顶),
 * 而这二十秒里捡到的东西**算两份**:分数两份,带回摊上的食材也是两份。
 *
 * 时长从八秒改到二十秒,是他试过之后定的。我当初砍到八秒的账是这么算的:
 * 一局三条命、一天五次,第五分钟的十五秒是二十来簇障碍,怕它变成
 * 「一件该躲开的好东西」。**真机上的结论反过来** —— 八秒里过场就占一秒四,
 * 剩下六秒多刚适应过来重力就翻回去了,那不是一场赌,是一次打断。
 *
 * > 一个要人**重新学一遍操作**的机关,时长的下限不是「难度能承受多久」,
 * > 而是「学会它要多久」。低于那条线,玩家全程都在适应,没有一秒是在玩。
 *
 * 它仍然跟着波数缩(最少十二秒):越到后面越快,同样的秒数越来越重。
 *
 * 收益必须写在明处。**没有回报的机关只是惩罚**:玩家学到的会是「别碰那个」,
 * 而不是「要不要赌一把」—— 后者才是它存在的理由。
 *
 * 开局一分钟内不出、两次之间隔四十五秒、窄道那一段也不出:
 * 手还没热的时候不考,一件难事的当口不叠第二件。
 */
/**
 * 四个「换个飞法」的道具。**它们共用一个秒表、一段过场、一条冷却** ——
 * 同一时间只可能有一个在,所以底下的状态就是一个 f.mode。
 *
 *   flip    重力翻个个儿:松手往上飘,拍一下往下扎。云顶变得和湖面一样要命
 *   mirror  整个世界照镜子:哇鸥挪到右边,东西从左边来,**两个按钮左右对调**
 *   climb   镜头转 90°:哇鸥往上钻,东西从头顶落下,大坝沉到画外
 *   dive    同上反过来:哇鸥往下扎,东西从脚底涌上来,湖面迎面涨上来
 *
 * 越怪的越晚出(见 MODE_AFTER):先让人把最基本的两个键坐熟,
 * 再一件一件往上加。**一次只换一件事**是这四个都成立的前提 ——
 * 同时换两件,玩家学不到东西,只会觉得这游戏在随机整他。
 */
const MODE_TYPE = { flip: 'flip', mirror: 'mirror', climb: 'climb', dive: 'dive' };
const MODE_AFTER = { flip: 60_000, mirror: 90_000, climb: 120_000, dive: 150_000 };
const MODES = ['flip', 'mirror', 'climb', 'dive'];
const FLIP_MS = 20_000;
const FLIP_MS_MIN = 12_000;
const FLIP_MS_DECAY = 300;      // 每过一波少这么多毫秒
const FLIP_AFTER = 60_000;      // 开局这么久之内不出
/* ---------- 后期的难度全在这条线上 ----------
 *
 * 原来后期是靠障碍**越来越多、越来越快**顶上去的,而那条路走到头是一堵墙:
 * 五条道填四条、两簇之间只剩 127 像素、速度快到看不清 ——
 * 玩家学不到东西,只知道自己死了。
 *
 * > **难度的上限不该是「东西多到过不去」,该是「你得换一种飞法」。**
 *
 * 所以障碍那三条线(速度、密度、簇宽)在两分半到三分钟之间全部封顶,
 * 玩家会有一段**「不过如此」**;紧接着从三分钟起,换飞法的道具
 * 冷却一路缩短、出现概率一路抬高 —— 到七分钟基本是一个飞法接一个飞法。
 *
 * 这样后期考的是**认不认得出这是哪一种、手上换不换得过来**,
 * 而这两件事都是能练的;而「障碍多到过不去」不是。
 */
const FLIP_COOLDOWN = 75_000;   // 冷却的起点。前三分钟它是个稀客
const MODE_CD_MIN = 15_000;     // 缩到这儿为止(七分钟)
const MODE_CD_FROM = 180_000;   // 三分钟起开始缩(那会儿别的都封顶了)
const MODE_CD_PER_MIN = 15_000; // 每多飞一分钟少这么多
/**
 * 飞法道具**自己掷一次骰子**,不跟三个纯加成抢那 4% 的位子。
 *
 * 挤在同一个位子里的时候,它一分钟才出一个 —— 而「后期越来越多地遇到飞法」
 * 这件事,得让它自己有一条能往上抬的线。抬的是**出现的概率**,
 * 真正管住节奏的是冷却(_modeCd):概率高只是让它「冷却一到就来」。
 */
const MODE_RATE_0 = 0.05;
const MODE_RATE_MAX = 0.22;
const MODE_RATE_PER_MIN = 0.05;
/** 两个飞法道具之间至少隔这么久 —— 躲开了也不至于下一秒又来一个 */
const MODE_SPAWN_GAP = 8000;
const FLIP_HAUL = 2;            // 颠倒期间捡到的算几份
/**
 * 过场:上下左右的黑边收拢 → 哇鸥归到画面正中 → 在最紧的那一刻翻 →
 * 黑边张开。**翻的那一下藏在黑边后面** —— 重力反过来是个瞬间的事,
 * 明着翻会像掉帧;藏在收拢的黑边里,玩家看到的是「镜头切了一下」。
 *
 * 这一段世界是停的:不计时、不生成、不判死,和开局那三秒同一个道理 ——
 * **手里没有控制权的时候不能扣他的东西**。
 */
const CUT_MS = 1400;
const CUT_HOLD = 0.62;          // 收到最紧的那一刻占过场的几成

/* ---------- 纵向:镜头转 90°,从云缝里往上钻 ----------
 *
 * 「颠倒」他要的其实是这个 —— 我第一版只把重力翻了个个儿,飞行轴没动;
 * 他想的是**镜头转过来,哇鸥往上飞**。水平那版他试过了,留着;这是另一档。
 *
 * 转轴之后两件事立刻变糟,都得治:
 *
 *   看得见的距离   横着飞是 560 像素,竖着只有 266 —— 反应时间少一半还多
 *   要跑的宽度     反过来:能动的那条轴从 210 变成 620,换道要跑三倍远
 *
 * 治法各一条。**世界跑慢到 0.48 倍** —— 266 像素跑出和 560 一样的秒数,
 * 「变的是镜头,不是难度」;而能动的那条轴**收进一条 192 像素宽的云缝里**,
 * 五条道各差 48 —— 正好是一次跃起的距离,和横着飞时一模一样。
 *
 * 于是两个键一个字都不用改写:什么都不按往右漂(侧向重力),
 * 空格往左蹬一下,方向键右把横向速度按住。**同一套手感,转了九十度。**
 * 顺带,云缝这个形状本来就是窄道那一套的九十度版本,玩家见过。
 */
const VERT_SPEED = 0.48;        // 纵向时世界跑多慢
const BIRD_Y_V = 248;           // 往上钻时哇鸥停在这个高度(靠下,好看清头顶)
const BIRD_Y_D = VH - BIRD_Y_V; // 往下扎时反过来,停在靠上
const V_HALF = 96;              // 五条道摊开的半宽。道距 48 = 一次跃起
const V_PAD = 10;               // 同 LANE_PAD:贴着云墙也还在最外那条道的判定里
const V_MID = VW / 2;
const V_LEFT = V_MID - V_HALF - V_PAD;
const V_RIGHT = V_MID + V_HALF + V_PAD;
/** 纵向时第 i 条道的中心。左右两头正好离云墙 V_PAD */
const laneX = i => V_MID - V_HALF + V_HALF * 2 * i / (LANES - 1);
/** 爬升时画面往下让开多少 —— 大坝和湖沉下去,眼前只剩天 */
const CLIMB_OFF = 132;
/**
 * 俯冲时反过来:画面**往上提**,湖面迎面涨上来。
 *
 * 比爬升那个小一半(70 vs 132),因为往上看是空的天(让多少都行),
 * 往下看是实打实的水面 —— 提太多的话半屏都是湖,而五条道还在天上,
 * 会看着像贴着水面飞,可判定又不在那儿。
 * 现在水面停在下面四成,「越扎越近」看得见,又不至于把场地淹掉。
 */
const DIVE_OFF = 70;

/* ---------- 觅食狂潮 ----------
 *
 * 他要的:「玩家连击次数达到 110 后开启觅食狂潮(进一段动画,中间闪烁炫目金光,
 * 四周烟花绚烂),生成大量食材且获得数量翻倍,速度加快,玩家变成无敌」。
 *
 * 一百一十连击**不是随手能到的数**:连击碰一下就清零,而这一局的密度下
 * 一百一十次不漏地吃下来要三四分钟。所以它不是一个道具,是**一条给
 * 「一直没失手」的人留的路** —— 前面所有加成都是运气(飘过来就捡),
 * 只有这一个是手上功夫换的。
 *
 * 也正因为如此,它给的是**当场兑现的东西**:满屏食材 + 翻倍 + 无敌。
 * 十秒里能把前一分钟的收获再挣一遍。
 *
 * 清零之后门槛回到 110,再攒。攒到 220 会再来一次 —— 上限交给手,不交给冷却。
 */
const FRENZY_COMBO = 110;
const FRENZY_MS = 10_000;
/**
 * 狂潮里世界跑多快。**拉满** —— 比金币冲刺(1.8)还快。
 *
 * 反正无敌,快就只剩爽:一屏两秒过完,那条食材弧线像被抽走一样往后飞。
 * 而且快本身就是「大奖」的一部分 —— 老虎机中奖的时候滚轮是转疯了的。
 */
const FRENZY_SPEED = 2.2;
/**
 * 狂潮的量和形状。绕了两版才对:
 *
 *   第一版  一次三样、照常节奏         → 「太少了」
 *   第二版  一次七样 + **整屏吸附**    → 量够了,但吸附把它变成了「站着收钱」
 *   现在    一次七样 + **连成一条弧线** + 只有小范围吸附 + 加速拉满
 *
 * 他要的是「极大量连成一条弧线的资源」+「小范围的吸附」。这两条合起来
 * 变的不是量,是**这十秒要干什么**:
 *
 * > 整屏吸附的时候玩家什么都不用做,食材自己飞过来 —— 那是看动画。
 * > 摆成一条弧线之后,他得**贴着那条线飞**:飞得准就一路全吃,
 * > 飞歪了就漏一段。**大奖也得是自己接住的。**
 *
 * 弧线是连续的:每一颗的间距按「这一拍世界跑多远 ÷ 一拍撒几颗」现算,
 * 相位跨拍累加 —— 所以它不是一拍一簇,是一条从右边一直淌过来的带子。
 */
/**
 * 狂潮的弧线是**一列一列**排成的,一列三颗竖着摞。
 *
 * 他要的:「物资不仅按弧线排列,并且高度总是为 3,即三个一纵列,
 * 一列一列排成弧线」。一颗一颗排的时候那条线太细 ——
 * 贴准了才吃得到,而且吃到的那一下几乎没有分量。
 * 三颗一列之后线变粗了:**对准了是一口三个,偏一点也还能蹭到一个。**
 */
const FRENZY_FOOD = 3;          // 一拍撒几列
const FRENZY_COL = 3;           // 一列摞几颗
const FRENZY_COL_GAP = 26;      // 一列里两颗之间隔多高
const FRENZY_TICK = 0.5;        // 生成节奏压到平常的几成
/**
 * 弧线的弯度:每颗前进多少相位。
 *
 * 改成一列三颗之后,一拍从七颗变成三列 —— 相位得按**列**走,不是按颗。
 * 0.5:相邻两列差四十来像素,而列本身有五十二像素高,所以还是连得上;
 * 一个完整的波走十三列、六百来像素,正好一屏一道大弧。
 */
const FRENZY_ARC = 0.5;
/**
 * 狂潮里的吸附半径。58 → 92。
 *
 * 他说「不应该让玩家的小失误造成损失」。对:那十秒是**奖励**,
 * 而奖励里最不该有的就是「差一点点」—— 弧线在动、速度还是平常的 2.2 倍,
 * 差半个身位是必然会发生的事,不该因此少拿一列。
 *
 * 92 差不多是一列(三颗、52 像素高)再往外各让二十像素:
 * **对准了整列进兜,偏半个身位也还是整列进兜,偏一整列才漏。**
 * 但它仍然不是整屏 —— 那条弧线还是得自己贴着飞。
 */
const FRENZY_PULL = 92;
const FRENZY_HAZARD = 0.12;     // 还留一点障碍 —— 全清的话「无敌」就没有意义
const FRENZY_IN = 900;          // 开场那一下的金光多久
const POP_MAX = 16;             // 吃到一口冒的那朵金花,同时最多几朵
/**
 * 狂潮里一口给多少分。**平常那一套连击加成和翻倍在这十秒里全不算。**
 *
 * 量过一遍:十秒能吃到两百来口。照平常算(基础 5 + 连击 12 再翻倍)
 * 是四千多分,而分数按 1/5 折成经验 —— **一发狂潮九百多经验,
 * 正好把一个一级号顶到十级**(升到十级累计要 965)。
 * 那不是大奖,那是跳过前十级。
 *
 * 所以拆开:**狂潮给的是食材,分数只给个零头。**
 * 分数是「飞得多稳多远」的记录,而狂潮是奖励 —— 奖励不该改写记录。
 */
const FRENZY_SCORE = 2;

/* ---------- 五分钟之后:饿 ---------- */
/** 从这一刻起开始饿。前五分钟只用管躲 */
const HUNGRY_AT = 300_000;
/** 一条满的肚子撑多久(毫秒)。什么都不吃的话 */
const HUNGRY_MS = 13_000;
/** 吃到一样补多少。0.17 → 大约每两秒得吃到一个 */
const HUNGRY_FEED = 0.17;
/**
 * 飞一秒算多少米。**距离就是活着的时间换算过来的,不累加实际位移。**
 *
 * 原来是每帧把移动量加起来 —— 后期速度是开局的三四倍,同样撑一秒
 * 记的距离就差三四倍,「飞了多远」变成了「后期占多大便宜」。
 * 而这个玩法真正考的是撑了多久,那就直接按时间算:
 * 数字匀速往上走,读起来也踏实。
 *
 * 40:2000 米(第一档成就)约 50 秒,8000 米(第二档)约 3 分半。
 */
const M_PER_SEC = 40;

/**
 * 窄道那条缝在某个横位上的高度。
 * 三分钟前 slope 是 0(直缝),之后缝会一路往上或往下走 ——
 * **判定和画面都从这一个函数取**,不然会出现「看着在缝里,算作撞上了」。
 */
const gapAt = (o, x) => o.gapY + (o.slope ?? 0) * (x - o.x);

/** 切角方块。像素画里的「圆」,比正方形软,又不用画 arc() */
function plate(ctx, x, y, r, color) {
    const cx = Math.round(x), cy = Math.round(y), d = r * 2;
    ctx.fillStyle = color;
    ctx.fillRect(cx - r + 3, cy - r, d - 6, d);
    ctx.fillRect(cx - r, cy - r + 3, d, d - 6);
    ctx.fillRect(cx - r + 1, cy - r + 1, d - 2, d - 2);
}

export class Flight {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {object} opts.state       只读取等级/天气/道具,不修改
     * @param {object} opts.sprites     可选,精灵图集(见 sprite.js)
     * @param {()=>number} [opts.rng]   随机源。传一个播种的进来,同一局就能重放
     *                                  (见 rng.js / dev.js 的 wa.seed)
     * @param {(r:object)=>void} opts.onEnd
     * @param {(s:object)=>void} opts.onTick  HUD 刷新
     */
    constructor({ canvas, state, sprites = null, rng = Math.random, onEnd, onTick }) {
        this.canvas = canvas;
        this.screen = new PixelScreen(canvas, VW, VH);
        this.ctx = this.screen.ctx;
        this.sky = null;
        this.skyWeather = null;
        this.state = state;
        this.sprites = sprites;
        this.rng = rng;
        this.onEnd = onEnd;
        this.onTick = onTick;

        this.running = false;
        this.paused = false;
        this.rafId = null;
        this.lastTs = 0;

        this._onDown = this._onDown.bind(this);
        this._onUp = this._onUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this._loop = this._loop.bind(this);
    }

    start() {
        const w = weatherOf(this.state);
        const lv = this.state.level;
        // **只算今天真来上工的。** 没发出工钱的那几只在别处也不生效,
        // 飞行这边跟着一样,不然会出现「大坝上没看见丫丫,天上她却在挡」
        const crew = activeCrew(this.state);
        const laoqiao = crew.includes('laoqiao');
        const yaya = crew.includes('yaya');
        // 跑道给的三条加成。没建跑道时全是 0,下面的算式原样退回原来的数
        const rw = runwayBonus(this.state);

        this.f = {
            score: 0,
            lives: 3,
            birdY: VH / 2,
            vy: 0,
            glide: false,       // 方向键右按着没有
            flapAt: -1e9,       // 上一次拍翅膀,画翅膀那一下要用
            hurtUntil: 0,
            countdown: COUNTDOWN_MS,
            // 画面时间。**和 elapsed 分开** —— elapsed 是「这一局飞了多久」,
            // 倒计时里它必须是 0(距离、难度、波数全从它推);
            // 而云、浪、翅膀这些在倒计时里也得动,不然像卡住了
            vt: 0,
            foods: [], obstacles: [], powerups: [],
            walls: [],        // 窄道。同一时间最多一片
            warn: null,       // 窄道的预告:{ y, at }
            spawnTimer: 0,
            spawnNext: SPAWN_0,
            // 开局的节奏和速度。往后都是从这两个数按飞行时长推的,见 _difficulty()
            // **开局这一档谁都一样** —— 等级和天气全挪到下面的 grow 上
            baseInterval: SPAWN_0,
            baseSpeed: SPEED_0,
            spawnInterval: SPAWN_0,
            speed: SPEED_0,
            // 变难得多急:等级越高、天越糟,来得越快。
            // 助跑坡照旧减这条斜率(见 _difficulty)
            grow: SPEED_GROW * (1 + (lv - 1) * LV_GROW) * w.speed * (1 - rw.ramp),
            denser: SPAWN_GROW * (1 + (lv - 1) * LV_GROW) * w.speed,
            hazard: Math.max(0.08, HAZARD_0 - rw.flag),   // 风向旗:障碍少一些
            flag: rw.flag,
            // 上一簇障碍留的那条空道(起点)和它有多宽。
            // 下一簇只能开在它够得着的范围里
            lastGap: null,
            lastW: 1,
            hazAt: 0,            // 下一簇障碍最早什么时候能放(见 HAZ_MIN_MS)
            modeAt: 0,           // 下一个飞法道具最早什么时候能出

            /* ---- 换飞法的那四个(同一时间只可能有一个) ---- */
            mode: 'flat',        // flat / flip / mirror / climb / dive
            vert: false,         // climb 或 dive:镜头转了 90°
            down: false,         // dive:往下扎
            mir: false,          // mirror:世界照镜子,两个按钮也对调
            gdir: 1,             // 重力朝哪:1 朝下(平常),-1 朝上
            flip: 0,             // 颠倒还剩多少毫秒
            flipAt: FLIP_AFTER,  // 下一次最早什么时候能出
            flipCount: 0,
            cut: null,           // 过场 { t, to, done }
            wallDue: false,      // 颠倒里欠下的那片窄道,翻回来要补
            climbOff: 0,         // 爬升/俯冲时画面让开多少(纯画面,不进判定)
            cutFrom: 0,

            hungryMs: HUNGRY_MS * (1 + rw.trough),  // 食槽:肚子撑得更久
            elapsed: 0,
            hunger: 1,        // 肚子。五分钟之后才开始掉,掉光就回巢
            hungryFlash: 0,
            wave: 0,          // 第几波。每 20 秒一波,HUD 上要报
            combo: 0,
            maxCombo: 0,
            frenzy: 0,           // 觅食狂潮还剩多少毫秒
            frenzyGot: 0,        // 这一轮狂潮吃到多少份 —— 大奖得有个数字在跳
            arcPhase: 0,         // 那条食材弧线走到哪个相位了(跨拍累加)
            pops: [],            // 刚吃到的那几口,冒一朵金花(环形缓冲,封顶)
            frenzyMark: FRENZY_COMBO,   // 连击到这个数开下一次
            frenzyN: 0,
            collected: {},
            itemCount: 0,
            /* ---- 伙计鸥 ---- */
            // 老翘:判定缩一圈,红角画长一点。**这两件事必须一起做** ——
            // 只缩判定的话玩家根本感觉不到(他看见的还是那么大一块),
            // 只标清楚的话又只是好看。缩了就得让他看见缩了
            hazR: laoqiao ? CREW_FLIGHT.laoqiaoHazardR : HAZARD_R,
            arm: laoqiao ? CREW_FLIGHT.laoqiaoArm : CORNER_ARM,
            /**
             * 障碍上那四个红角:**招到第一只伙计鸥之前不画。**
             *
             * 它本来是我给玩家的一副拐杖 —— 把判定框标出来,省得他自己去猜。
             * 可这副拐杖是**白送的**:一上来就有,于是玩家从没体会过
             * 「看不清」是什么感觉,后来老翘把它加长加亮也就没了分量。
             *
             * 现在它是**招人换来的**:招到第一只伙计,天上就有人替你盯着;
             * 老翘那一档照旧(判定缩到 12、红角加长压亮)——
             * 先有「有没有」,再有「好不好」。
             *
             * 用**招过**(不是「今天来没来」)判:记号是玩家已经买下的一层视野,
             * 不该因为谁请了一天假就没了 —— 那会像 bug。
             */
            marks: (this.state.crew?.length ?? 0) > 0,
            // 丫丫:下一次能替你挡的时刻。-1 = 没招她。开局就是满的
            yayaAt: yaya ? 0 : -1,
            yayaFlash: 0,
            // 道具在开局消耗,一局有效
            shieldMs: (this.state.items.shield ?? 0) > 0 ? SHIELD_MS : 0,
            shieldN: (this.state.items.shield ?? 0) > 0 ? SHIELD_N : 0,
            magnetMs: (this.state.items.magnet ?? 0) > 0 ? MAGNET_MS : 0,
            rushMs: (this.state.items.double ?? 0) > 0 ? RUSH_MS : 0,
            powerAt: 10_000,      // 头十秒不出道具,先让人把手放稳
            birdX: BIRD_X,        // 冲刺的时候会往前顶一段;镜像时它挪到右边
            god: false,           // wa.god():不掉命、不掉肚子。只有 dev 版能开
        };

        this._bind();
        this.running = true;
        this.paused = false;
        this.lastTs = 0;
        this.rafId = requestAnimationFrame(this._loop);
        this._emit();
        return { shield: this.f.shieldMs > 0, magnet: this.f.magnetMs > 0, double: this.f.rushMs > 0 };
    }

    setPaused(v) {
        this.paused = v;
        if (!v) this.lastTs = 0;        // 恢复时丢弃暂停期间的时间差
    }

    /** 玩家主动退出:算成功结算 */
    quit() { this._finish('quit'); }

    /** 外部强制停止,不结算(比如离开界面) */
    destroy() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this._unbind();
    }

    /* ---------- 内部 ---------- */

    _bind() {
        // 画布上按下也算:**左半边点一下 = 跃起,右半边按住 = 平飞**。
        // 手机上没有键盘,而满屏可点比去够一个小按钮靠谱得多 ——
        // 屏幕下面那两个按钮同时也是「告诉你有这两个键」的说明。
        this.canvas.addEventListener('pointerdown', this._onDown);
        this.canvas.addEventListener('pointerup', this._onUp);
        this.canvas.addEventListener('pointercancel', this._onUp);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        // 切走的时候浏览器不会补一个 keyup —— 不听 blur 的话,
        // 回来会发现平飞一直按着,而玩家手上什么都没按
        window.addEventListener('blur', this._onBlur);
    }

    _unbind() {
        this.canvas.removeEventListener('pointerdown', this._onDown);
        this.canvas.removeEventListener('pointerup', this._onUp);
        this.canvas.removeEventListener('pointercancel', this._onUp);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
    }

    /** 拍一下翅膀。暂停时不响应 —— 暂停界面上还有按钮要点 */
    flap() {
        if (!this.running || this.paused || this.f.cut) return;
        // **朝「重力那一头」的反方向蹬。** 颠倒的时候这一下是往下扎的 ——
        // 键没换,换的是哪边算下面
        this.f.vy = FLAP_VY * this.f.gdir;
        this.f.flapAt = this.f.vt;
        sfx.play('flap');
    }

    /** 平飞按住 / 松开。UI 上那两个按钮也走这两个口 */
    setGlide(on) {
        if (!this.running) return;
        this.f.glide = !!on && !this.paused && !this.f.cut;
    }

    _onDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const left = e.clientX - rect.left < rect.width / 2;
        // **镜像时两个键左右对调。** 这不是顺手加的花样,它就是那个飞法
        // 要考的东西本身 —— 世界照了镜子,手也得跟着照
        if (left !== this.f.mir) this.flap();
        else this.setGlide(true);
    }

    _onUp() { this.setGlide(false); }

    _onKeyDown(e) {
        // **按住空格不能变成无重力。** 系统的自动重复会一秒发几十个 keydown,
        // 每个都拍一下翅膀的话,压着不放就直接飞上天了
        if (e.repeat) return;
        // 镜像时平飞换到左方向键(键盘上的「左右对调」)
        const glideKey = this.f.mir ? 'ArrowLeft' : 'ArrowRight';
        if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.flap(); }
        else if (e.code === glideKey) { e.preventDefault(); this.setGlide(true); }
    }

    /** 松开**哪个**方向键都算松手 —— 换飞法那一下正按着的话,不能让它卡住 */
    _onKeyUp(e) {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') this.setGlide(false);
    }

    _onBlur() { this.setGlide(false); }

    _emit() {
        this.onTick?.({
            score: this.f.score, lives: this.f.lives, combo: this.f.combo,
            wave: this.f.wave + 1,
            dist: Math.round(this.f.elapsed / 1000 * M_PER_SEC),
            hungry: this.f.elapsed >= HUNGRY_AT,
            count: Math.max(0, Math.ceil(this.f.countdown / 1000)),
            // 丫丫:-1 没招她,0 现在就能挡,>0 还要等几秒。
            // **得让玩家知道现在有没有这一层** —— 看不见的保命等于没有,
            // 他要么白白紧张,要么以为还有结果没有
            yaya: this.f.yayaAt < 0 ? -1
                : Math.max(0, Math.ceil((this.f.yayaAt - this.f.elapsed) / 1000)),
            hunger: this.f.hunger,
            // 换飞法的那四个共用一个秒表(同一时间只有一个在)。
            // **模式名要一起报** —— 键上写什么、按钮在哪边、状态条画哪个图标,
            // 四种各不一样
            mode: this.f.mode,
            modeLeft: this.f.flip > 0 ? Math.ceil(this.f.flip / 1000) : 0,
            // 觅食狂潮:还剩几秒 + 这一轮吃到多少份。
            // **那个数字就是老虎机的计数器** —— 大奖得有个数在跳,
            // 而分数在狂潮里是故意压住的(见 FRENZY_SCORE),它跳不起来
            frenzy: this.f.frenzy > 0 ? Math.ceil(this.f.frenzy / 1000) : 0,
            frenzyGot: this.f.frenzyGot,
            // 磁铁 / 护盾:还剩几秒。**得倒数给他看** —— 一个不知道什么时候没的加成,
            // 没了的那一下只会被当成手感变差
            magnet: Math.ceil(this.f.magnetMs / 1000),
            shield: Math.ceil(this.f.shieldMs / 1000),
            shieldN: this.f.shieldN,
            rush: Math.ceil(this.f.rushMs / 1000),
        });
    }

    _loop(ts) {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._loop);
        if (this.paused) { this.lastTs = ts; return; }

        // 真实 delta,并夹紧上限:切后台回来时 ts 会跳很大,
        // 不夹的话物体会瞬移穿过哇鸥
        const dt = this.lastTs ? Math.min(ts - this.lastTs, 50) : 16.7;
        this.lastTs = ts;

        this._update(dt);
        if (this.running) this._draw();
    }

    _update(dt) {
        const f = this.f;
        const k = dt / 16.7;                 // 以 60fps 为基准的步长系数
        f.vt += dt;
        // 爬升时画面往下让开,大坝和湖沉下去。**纯画面,不进任何判定** ——
        // 「在往上飞」这件事光靠障碍从上面下来是读不出来的,背景得跟着走。
        // 放在最上面:倒计时和过场里也要动(过场那一秒四正好用来沉下去)
        const m = f.cut ? f.cut.to : f.mode;
        const wantOff = m === 'climb' ? CLIMB_OFF : m === 'dive' ? -DIVE_OFF : 0;
        f.climbOff += (wantOff - f.climbOff) * Math.min(1, 0.05 * k);

        // 倒计时:先飞着玩三秒。这里 return 掉的是「计时、生成、判死」,
        // 不是「动」—— 手上的两个键从第一帧起就是通的
        if (f.countdown > 0) {
            const before = Math.ceil(f.countdown / 1000);
            f.countdown -= dt;
            const after = Math.ceil(f.countdown / 1000);
            if (after !== before) sfx.play(after > 0 ? 'tab' : 'event');
            this._fly(k);
            this._emit();
            return;
        }

        // 过场(颠倒的进和出)。**这一段世界是停的** —— 见 CUT_MS 那段注释
        if (f.cut) { this._cut(dt); this._emit(); return; }

        f.elapsed += dt;

        // 颠倒到点了:走一遍出场动画翻回来。这一帧交给过场,别的都不做
        if (f.flip > 0) {
            f.flip = Math.max(0, f.flip - dt);
            if (f.flip === 0) {
                f.flipAt = f.elapsed + this._modeCd();
                this._startCut('flat');      // 回到平常那个飞法
                this._emit();
                return;
            }
        }
        if (f.frenzy > 0 && (f.frenzy = Math.max(0, f.frenzy - dt)) === 0) {
            // **狂潮结束,连击直接归零。**
            //
            // 前一版是「门槛推到当时的连击之上」,想着这样还得再吃一百一十口。
            // 不够 —— 狂潮里连击已经冲到两百多,而它一结束食材还在场上,
            // 一百一十口很快就又攒够了,于是它照样会自己续命。
            //
            // 归零最干净:**下一次狂潮必须从零重新攒一百一十口不失手。**
            // 狂潮里的连击本来也不该算 —— 那十秒是无敌的,不失手不算本事。
            f.combo = 0;
            f.frenzyMark = FRENZY_COMBO;
            sfx.play('tab');
        }
        if (f.magnetMs > 0) f.magnetMs = Math.max(0, f.magnetMs - dt);
        if (f.rushMs > 0) f.rushMs = Math.max(0, f.rushMs - dt);
        // 护盾的期限一到,剩下的次数一起作废 —— 两个数得同生共死,
        // 不然会出现「还剩一次,但已经过期了」这种解释不了的状态
        if (f.shieldMs > 0 && (f.shieldMs = Math.max(0, f.shieldMs - dt)) === 0) f.shieldN = 0;

        // 冲刺时哇鸥往前顶出去一截,回来的时候慢慢退。**这是「冲」唯一看得见的地方** ——
        // 世界跑得快不快,人眼其实分不太出来;而主角自己往前探了一头,一眼就知道
        // **纵向的时候不动它** —— 那会儿横轴归玩家管,冲刺再去拉一把
        // 就成了两只手抢同一个方向盘。镜像时「往前」是往左
        if (!f.vert) {
            const home = f.mir ? VW - BIRD_X : BIRD_X;
            const wantX = home + (f.rushMs > 0 ? (f.mir ? -RUSH_DX : RUSH_DX) : 0);
            f.birdX += (wantX - f.birdX) * Math.min(1, 0.06 * k);
        }

        this._fly(k);

        // 生成
        f.spawnTimer += dt;
        if (f.spawnTimer >= f.spawnNext) {
            f.spawnTimer = 0;
            // **下一次隔多久,当场摇一次** —— 见 SPAWN_JITTER
            // **狂潮里不抖。** 抖动是为了让障碍不可数拍子;而狂潮撒的是一条
            // 连续的弧线,拍与拍之间抖一下,那条线就断成一节一节的
            f.spawnNext = f.frenzy > 0
                ? f.spawnInterval * FRENZY_TICK
                : f.spawnInterval * (SPAWN_JITTER_LO
                    + this.rng() * (SPAWN_JITTER_HI - SPAWN_JITTER_LO));
            this._spawn();
        }

        const move = f.speed * k * (f.rushMs > 0 ? RUSH_SPEED : 1)
                   * (f.frenzy > 0 ? FRENZY_SPEED : 1) * (f.vert ? VERT_SPEED : 1);
        const hit = (o, r) => Math.abs(f.birdX - o.x) < r && Math.abs(f.birdY - o.y) < r;
        // 往哪边走。**每个东西自己记着**(o.d),而不是问当下是哪个模式 ——
        // 过场会清场,但万一没清干净,半路改朝向的那些会当着玩家的面拐弯。
        //   0 往左(平常) · 1 往下(爬升) · 2 往右(镜像) · 3 往上(俯冲)
        const adv = o => {
            if (o.d === 1) o.y += move;
            else if (o.d === 2) o.x += move;
            else if (o.d === 3) o.y -= move;
            else o.x -= move;
        };
        const gone = o => (o.d === 1 ? o.y > VH + 24 : o.d === 2 ? o.x > VW + 24
                         : o.d === 3 ? o.y < -24 : o.x < -24);

        // 食材
        for (let i = f.foods.length - 1; i >= 0; i--) {
            const o = f.foods[i];
            adv(o);
            if (gone(o)) { f.foods.splice(i, 1); continue; }

            // 磁铁开着的时候**整屏**的食材都朝哇鸥来,不再只吸身边那一圈。
            // 拉力按距离给:远的快、近的稳 —— 一律按比例拉的话,
            // 刚出屏的那个会瞬移过来,而贴脸的那个会绕着头打转
            if (f.magnetMs > 0) {
                const dx = f.birdX - o.x, dy = f.birdY - o.y;
                const d = Math.hypot(dx, dy) || 1;
                const pull = Math.min(MAGNET_PULL_MAX, MAGNET_PULL_MIN + d * 0.02);
                o.x += dx / d * pull * k;
                o.y += dy / d * pull * k;
            } else if (f.frenzy > 0) {
                // 狂潮:**只有小范围吸附**(整屏那种取消了)。
                // 它管的是「擦着边过去的也算吃到」,而不是「站着等它飞过来」——
                // 那条弧线还是得自己贴着飞
                const dx = f.birdX - o.x, dy = f.birdY - o.y;
                if (Math.abs(dx) < FRENZY_PULL && Math.abs(dy) < FRENZY_PULL) {
                    o.x += dx * 0.05 * k;
                    o.y += dy * 0.05 * k;
                }
            }
            if (hit(o, FOOD_R)) {
                sfx.play('pickup');
                f.pops.push({ x: o.x, y: o.y, t: f.elapsed });
                if (f.pops.length > POP_MAX) f.pops.shift();
                f.foods.splice(i, 1);
                // 颠倒的那二十秒里捡到的**算两份**:分数两份,带回摊上的食材也是两份。
                // 只翻一个看不见的分数不算赌注 —— 拿命换的东西得能端上桌
                // 颠倒和纵向共用 f.flip 这个秒表(两个不会同时在),都翻倍。
                // 狂潮也翻倍 —— 叠起来最多四倍,那是「一直没失手 + 正好捡到金币」,
                // 值得
                const n = (f.flip > 0 ? FLIP_HAUL : 1) * (f.rushMs > 0 ? FLIP_HAUL : 1)
                        * (f.frenzy > 0 ? FLIP_HAUL : 1);
                f.collected[o.type] = (f.collected[o.type] ?? 0) + n;
                f.itemCount += n;
                f.combo++;
                if (f.combo > f.maxCombo) f.maxCombo = f.combo;
                // **一百一十连击:开狂潮。**
                //
                // 两道闸都是必须的,少一道就是永动机:
                //   `f.frenzy <= 0`  —— 狂潮里不再触发,不然十秒会一直被刷新
                //   门槛在**结束时**按当时的连击重设(见下面 _update)——
                //   狂潮十秒能吃到两百来口,连击直接冲过后面每一档门槛,
                //   照「每 110 一档」算的话它一开就永远不停(实测过,真会)
                if (f.frenzy <= 0 && f.combo >= f.frenzyMark) {
                    f.frenzyN++;
                    f.frenzy = FRENZY_MS;
                    f.frenzyGot = 0;
                    sfx.play('event');
                }

                let gain = FRENZY_SCORE;
                if (f.frenzy <= 0) {
                    gain = 5;
                    if (f.combo >= 5) gain += 2;
                    if (f.combo >= 10) gain += 5;
                    gain *= n;                // 只在这里翻倍,结算时不再翻
                }
                f.score += gain;
                if (f.frenzy > 0) f.frenzyGot += n;
                f.hunger = Math.min(1, f.hunger + HUNGRY_FEED);
            }
        }

        // 障碍
        for (let i = f.obstacles.length - 1; i >= 0; i--) {
            const o = f.obstacles[i];
            adv(o);
            if (gone(o)) { f.obstacles.splice(i, 1); continue; }
            if (!hit(o, f.hazR)) continue;

            f.obstacles.splice(i, 1);
            // 冲刺和狂潮:**撞碎,而且给分**。无敌只是「不掉血」,那几秒里
            // 玩家什么反馈都拿不到;撞碎才是「我在冲」这件事本身
            if (f.rushMs > 0 || f.frenzy > 0) {
                f.score += RUSH_SMASH;
                f.smash = f.elapsed + 120;
                sfx.play('pickup');
                continue;
            }
            if (this._absorb()) continue;
            sfx.play('hit');
            if (!f.god) f.lives--;              // wa.god():照挨照闪,就是不掉命
            f.combo = 0;
            f.frenzyMark = FRENZY_COMBO;        // 连击断了,门槛回到一百一十
            f.hurtUntil = f.elapsed + 450;      // 闪一下,给个挨打的反馈
            if (f.lives <= 0) { this._finish('crash'); return; }
        }

        // 道具
        for (let i = f.powerups.length - 1; i >= 0; i--) {
            const o = f.powerups[i];
            adv(o);
            if (gone(o)) { f.powerups.splice(i, 1); continue; }
            if (!hit(o, FOOD_R)) continue;
            f.powerups.splice(i, 1);
            if (MODE_TYPE[o.type]) {
                // 换飞法的那四个:这一帧交给过场,底下的判定全不做 ——
                // 世界从这里停住
                f.flipCount++;
                this._startCut(o.type);
                this._emit();
                return;
            }
            sfx.play('event');
            if (o.type === 'magnet') { f.magnetMs = Math.min(MAGNET_MAX, f.magnetMs + MAGNET_MS); continue; }
            if (o.type === 'double') { f.rushMs = Math.min(RUSH_MAX, f.rushMs + RUSH_MS); continue; }
            if (o.type === 'shield') {
                f.shieldMs = Math.min(SHIELD_MAX, f.shieldMs + SHIELD_MS);
                f.shieldN = Math.min(SHIELD_N_MAX, f.shieldN + SHIELD_N);
            }
        }

        this._walls(move);
        if (!this.running) return;       // 撞在窄道上没命了

        this._difficulty();
        this._hunger(dt);

        // **每帧都报一次。** 距离是按时间涨的,而 HUD 只在 _emit() 的时候刷 ——
        // 原来 _emit 只在「捡到东西 / 挨了一下 / 上一档」的时候叫,
        // 于是屏幕上的米数是一跳一跳的:碰到道具才蹦一下,平时纹丝不动。
        // 玩家一眼就能看出来那不是在飞,是在数捡了几个。
        // 一帧只是改几个 textContent,不重建任何结构,这个代价可以忽略。
        this._emit();
    }

    /**
     * 难度只跟着**飞了多久**走,不跟分数、不跟等级(等级只定开局那一档)。
     *
     * 原来是「每 5 秒 +0.06,封顶 2.5」—— 一分四十秒就摸到顶,之后再飞十分钟
     * 也是同一个速度、同一个障碍密度。**一局的终点应该是撞死了,不是不再变难了。**
     *
     * 现在三样一起涨,而且**不封顶**:
     *   speed     线性涨,一分钟多涨 22%
     *   interval  越来越密,底线 420ms —— 再密就成了一堵墙
     *   hazard    障碍占生成的比例,22% 一路涨到 55%
     *
     * 涨到后面必死,这是故意的:活得越久分越高,但没有「安全地刷」这条路。
     */
    /**
     * 五分钟之后开始饿。
     *
     * 前五分钟这个玩法只考一件事:躲。躲到后来速度快了、障碍密了,
     * 最省事的活法反而是**贴着一条空道一直飘,一口都不吃** ——
     * 越往后越难的曲线,养出来的是最无聊的打法。
     *
     * 所以第五分钟起加一条一直在掉的肚子条:掉光就是飞饿了,回巢。
     * 吃到一样补一截,大约每两秒得吃到一个。**从这一刻起,躲和吃得同时办**,
     * 而这两件事是打架的 —— 食材和障碍在同一片天上。
     */
    /**
     * 纵向的一步。平飞不是把速度直接归零 —— 那样一按一松像瞬移,
     * 而且从下坠切到平飞会「咔」一下停在半空。按住的是**阻力**,
     * 半个巴掌的时间飘平,看着才像一只鸟在借风。
     */
    _fly(k) {
        const f = this.f, g = f.gdir;
        // 纵向:**同一套数,换一条轴**。什么都不按往右漂,空格往左蹬一下,
        // 方向键右把横向速度按住 —— 三个状态各管一个方向,一个字都没改。
        // 两边云墙只是顶住(不要命),要命的是道上的东西:
        // 最外那条道离墙只有 10 像素,比判定半径小,**贴着墙也躲不掉**
        if (f.vert) {
            if (f.glide) f.vy += (0 - f.vy) * Math.min(1, GLIDE_K * k);
            else {
                // 顺着重力那一头飘得慢一些(同 FALL_G)
                const g0 = f.vy > 0 ? FALL_G : GRAVITY;
                f.vy = Math.min(f.vy > 0 ? MAX_VY_DOWN : MAX_VY, f.vy + g0 * k);
            }
            f.birdX += f.vy * k;
            if (f.birdX > V_RIGHT) { f.birdX = V_RIGHT; f.vy = 0; }
            else if (f.birdX < V_LEFT) { f.birdX = V_LEFT; f.vy = 0; }
            return;
        }
        if (f.glide) f.vy += (0 - f.vy) * Math.min(1, GLIDE_K * k);
        else {
            // **顶上去用原来的重力,掉下来用小一点的**(见 FALL_G)。
            // `f.vy * g > 0` 就是「已经在顺着重力走」
            const falling = f.vy * g > 0;
            f.vy += (falling ? FALL_G : GRAVITY) * g * k;
            const cap = falling ? MAX_VY_DOWN : MAX_VY;
            f.vy = g > 0 ? Math.min(cap, f.vy) : Math.max(-cap, f.vy);
        }
        f.birdY += f.vy * k;

        // 上下两头:**朝着重力的那一头会要命,背着重力的那一头只是停住。**
        // 平常是「掉进湖里」,颠倒的时候变成「撞上云顶」—— 一句话就是同一条规矩
        if (f.birdY > SEA_TOP) {
            if (g > 0) this._splash(false);
            else { f.birdY = SEA_TOP; f.vy = 0; }
        } else if (f.birdY < SKY_TOP) {
            if (g > 0) { f.birdY = SKY_TOP; f.vy = 0; }
            else this._splash(true);
        }
    }

    /** 这一次颠倒管多久。越到后面越短 —— 同样的秒数,后期要重得多 */
    _flipMs() {
        return Math.max(FLIP_MS_MIN, FLIP_MS - this.f.wave * FLIP_MS_DECAY);
    }

    /**
     * 起一段过场。`to` 是过完之后的重力方向(-1 颠倒 / 1 翻回来)。
     *
     * **场上先清空。** 过场里玩家的手是被拿走的,那这一段就不能留下任何
     * 会要命的东西 —— 也不能留下够不着的食材,不然黑边张开的那一刻
     * 会有一堆东西贴在脸上,而他刚被还回控制权。
     */
    /** 换成哪个飞法。四个布尔量只在这一处派生,别处一律读它们 */
    _applyMode(m) {
        const f = this.f;
        f.mode = m;
        f.vert = m === 'climb' || m === 'dive';
        f.down = m === 'dive';
        f.mir = m === 'mirror';
        f.gdir = m === 'flip' ? -1 : 1;
    }

    /** 某个飞法里哇鸥站在哪。过场要知道「他要去哪」,冲刺要知道「家在哪」 */
    _station(m = this.f.mode) {
        if (m === 'climb') return { x: V_MID, y: BIRD_Y_V };
        if (m === 'dive') return { x: V_MID, y: BIRD_Y_D };
        return { x: m === 'mirror' ? VW - BIRD_X : BIRD_X, y: VH / 2 };
    }

    _startCut(to) {
        const f = this.f;
        f.cut = { t: 0, to, done: false };
        f.cutFrom = { x: f.birdX, y: f.birdY };
        f.glide = false;
        // **挨打的那一下就在这儿结清。** 过场里场上是空的、也不判死,
        // 而闪烁的那半秒要是跨过过场,黑边张开时玩家会看见自己在闪 ——
        // 找不到是被什么打的,只会以为新模式一上来就扣了他一下
        f.hurtUntil = 0;
        f.obstacles.length = 0;
        f.foods.length = 0;
        f.powerups.length = 0;
        f.walls.length = 0;
        f.warn = null;
        f.spawnTimer = 0;
        f.lastGap = null;          // 翻完是新局面,上一簇的空道不再作数
        f.hazAt = 0;
        sfx.play('event');
    }

    /** 过场的一步。归中 + 在最紧的那一刻把重力翻过来 */
    _cut(dt) {
        const f = this.f;
        const c = f.cut;
        c.t += dt;
        const p = Math.min(1, c.t / CUT_MS);
        // 归位和黑边收拢同步:黑边收到最紧的时候人正好到位。
        // **去哪儿看的是过完之后是哪个模式** —— 纵向要停在云缝正中、靠下,
        // 横着飞要回到左边那个老位置
        const q = Math.min(1, p / CUT_HOLD);
        const e = q * q * (3 - 2 * q);                 // smoothstep,起落都软
        const to = this._station(c.to);
        f.birdX = f.cutFrom.x + (to.x - f.cutFrom.x) * e;
        f.birdY = f.cutFrom.y + (to.y - f.cutFrom.y) * e;
        f.vy = 0;
        if (!c.done && p >= CUT_HOLD) {
            c.done = true;
            this._applyMode(c.to);
            if (c.to !== 'flat') f.flip = this._flipMs();
            sfx.play('event');
        }
        if (p >= 1) f.cut = null;
    }

    /**
     * 有没有东西替这一下挨了。
     *
     * **先花会回来的那个。** 丫丫过一阵就好了,护盾用掉就没了 ——
     * 反过来花的话,玩家会在丫丫满着的时候白扔一个护盾,
     * 而那个护盾是他花钱买的。
     */
    _absorb() {
        const f = this.f;
        if (f.yayaAt >= 0 && f.elapsed >= f.yayaAt) {
            f.yayaAt = f.elapsed + CREW_FLIGHT.yayaMs;
            f.yayaFlash = f.elapsed + 800;
            sfx.play('event');
            return true;
        }
        if (f.shieldN > 0) {
            sfx.play('event');
            if (--f.shieldN <= 0) f.shieldMs = 0;     // 次数用完,期限也就没意义了
            return true;
        }
        return false;
    }

    /**
     * 掉到水面上。**扣一条命,然后自己蹬水起飞** ——
     * 不直接判死是因为这是只海鸥:落在滇池上再飞起来是它每天干的事,
     * 而一个「碰到底就结束」的下边界,配上重力,会让人不敢往下飞。
     * 下半屏的食材本来就该有人去捡。
     */
    _splash(up = false) {
        const f = this.f;
        // 撞的是哪一头。颠倒时天花板就是水面 —— 弹回来的方向跟着换
        f.birdY = up ? SKY_TOP : SEA_TOP;
        // 蹬水比空中拍一下有力得多(升 120px 而不是 45px)。
        // **这样一次失误只会是一条命** —— 弹得矮的话,还没回过神就又拍下去了,
        // 一个走神扣两三条,那是在罚玩家没盯着屏幕,不是在考他会不会飞
        f.vy = (up ? -FLAP_VY : FLAP_VY) * 1.6;
        if (f.countdown > 0) return;          // 倒计时里随便掉,不算
        if (f.rushMs > 0 || f.frenzy > 0) return;   // 冲刺和狂潮里连水面都不咬人
        if (f.elapsed < f.hurtUntil) return;  // 挨打的那几百毫秒里不重复扣
        // **掉进湖里丫丫不管。** 她挡的是迎面来的东西,
        // 而沉下去是自己没拍翅膀 —— 一个连自己失误都替你兜的伙计,
        // 玩家很快就不看屏幕了。护盾是花钱买的,那个照挡
        if (f.shieldN > 0) {
            sfx.play('event');
            if (--f.shieldN <= 0) f.shieldMs = 0;
            return;
        }
        sfx.play('hit');
        if (!f.god) f.lives--;
        f.combo = 0;
        f.frenzyMark = FRENZY_COMBO;
        f.hurtUntil = f.elapsed + 450;
        if (f.lives <= 0) this._finish('crash');
    }

    _hunger(dt) {
        const f = this.f;
        if (f.elapsed < HUNGRY_AT) return;
        if (f.hungryFlash === 0) {           // 刚饿的那一下要报一声
            f.hungryFlash = f.elapsed + 1600;
            sfx.play('hit');
        }
        if (f.god) return;                   // 无敌连肚子一起停 —— 见 wa.god()
        f.hunger -= dt / f.hungryMs;
        if (f.hunger <= 0) { f.hunger = 0; this._finish('hungry'); }
    }

    _difficulty() {
        const f = this.f;
        const mins = f.elapsed / 60000;
        // 斜率里已经算进了等级、天气和助跑坡(见 start())。
        // **开局那一档三样都不碰** —— 它们改的是「多久变难」,
        // 不是「起点多难」。这两个旋钮混着拧过一次,代价是玩家每局
        // 开头的手感都不一样,而他根本不知道为什么。
        f.speed = Math.min(SPEED_MAX, f.baseSpeed * (1 + mins * f.grow));
        f.spawnInterval = Math.max(SPAWN_MIN, f.baseInterval - mins * f.denser);
        f.hazard = Math.min(HAZARD_MAX - f.flag, Math.max(0.08, HAZARD_0 - f.flag) + mins * 0.05);

        // 每 20 秒报一波。**得让玩家听见、看见它变难了** ——
        // 悄悄变难只会让人觉得「我怎么突然打不过了」,而不是「又上了一档」
        const wave = Math.floor(f.elapsed / WAVE_MS);
        if (wave > f.wave) {
            f.wave = wave;
            sfx.play('event');
            f.waveFlashUntil = f.elapsed + 900;
            // 第 2、5、8… 波各来一片窄道 —— 约一分钟一次。
            // 从第二波起是为了先让人把两个键摸熟,别一上来就考试
            if (wave >= 2 && wave % CORRIDOR_EVERY === 2) this._announceWall();
        }
        // 颠倒那会儿欠下的那一片,翻回来就补上
        if (f.wallDue && f.flip <= 0 && !f.cut) this._announceWall();
    }

    /** 排一片窄道。先只放预告,1.5 秒后云才真的推过来 */
    _announceWall() {
        const f = this.f;
        if (f.warn || f.walls.length) return;      // 一片没过去不排下一片
        // **颠倒的时候不排窄道。** 一件难事的当口不叠第二件 ——
        // 那二十秒本来就在考「反过来还认不认得路」,再来一条只能平飞的缝,
        // 玩家分不清自己是败在哪一件上。
        //
        // **但不是取消,是记账。** 颠倒有二十秒,而窄道每三波(约一分钟)才一次 ——
        // 直接 return 掉的话,四次里会有一次整个消失,而玩家只会觉得
        // 「今天怎么没窄道」。翻回来立刻补上(见 _difficulty 末尾)
        if (f.flip > 0 || f.cut) { f.wallDue = true; return; }
        f.wallDue = false;
        // **缝开在哪,也得是从上一簇的空道走得到的。** 预告有一秒半,
        // 够走两三条道;但开在最远那一头,提前量再多也是白给
        const from = f.lastGap ?? Math.floor(this.rng() * LANES);
        const jump = Math.max(1, Math.min(LANES - 1,
            Math.floor(CLIMB_PX_PER_SEC * (CORRIDOR_WARN / 1000) / LANE_H)));
        const lane = this._nextGap(from, jump, 0, LANES - 1);
        f.lastGap = lane;
        // 出口偏出去几条道(三分钟前是 0,也就是一条直缝)。
        // **在预告里就定下来** —— 这样预告画得出「它会往哪边走」
        let bend = 0;
        if (f.elapsed >= CORRIDOR_BEND_AT) {
            const k = 1 + Math.floor(this.rng() * CORRIDOR_BEND_LANES);
            const dir = this.rng() < 0.5 ? -1 : 1;
            const end = Math.max(0, Math.min(LANES - 1, lane + dir * k));
            bend = laneY(end) - laneY(lane);
        }
        f.warn = { y: laneY(lane), at: f.elapsed + CORRIDOR_WARN, bend };
        sfx.play('event');
    }

    /**
     * 窄道的一步:该推出来的推出来,已经在场上的往左走、判碰。
     *
     * 宽度按**当时的速度**换算成 CORRIDOR_S 秒 —— 写死一个像素宽度的话,
     * 开局要在里面待三秒(熬人),后期只要半秒(等于没有)。
     * 要固定的是「按住多久」,不是「多少像素」。
     */
    _walls(move) {
        const f = this.f;
        if (f.warn && f.elapsed >= f.warn.at) {
            // 三分钟之后越走越长:穿过去要的秒数一路涨到 CORRIDOR_S_MAX
            const late = Math.max(0, f.elapsed - CORRIDOR_BEND_AT) / 60000;
            const secs = Math.min(CORRIDOR_S_MAX, CORRIDOR_S + late * CORRIDOR_S_PER_MIN);
            const w = Math.round(Math.max(CORRIDOR_MIN_W,
                      Math.min(CORRIDOR_MAX_W, f.speed * 60 * secs)));
            f.walls.push({ x: VW + 8, w, gapY: f.warn.y,
                           slope: (f.warn.bend ?? 0) / w });
            f.warn = null;
        }
        for (let i = f.walls.length - 1; i >= 0; i--) {
            const o = f.walls[i];
            o.x -= move;
            if (o.x + o.w < -8) { f.walls.splice(i, 1); continue; }
            const inX = f.birdX + f.hazR > o.x && f.birdX - f.hazR < o.x + o.w;
            if (!inX || Math.abs(f.birdY - gapAt(o, f.birdX)) < CORRIDOR_GAP) continue;
            if (f.rushMs > 0 || f.frenzy > 0) continue;   // 无敌:直接从云里穿过去
            if (f.elapsed < f.hurtUntil) continue;
            if (this._absorb()) continue;
            sfx.play('hit');
            if (!f.god) f.lives--;
            f.combo = 0;
            f.frenzyMark = FRENZY_COMBO;
            f.hurtUntil = f.elapsed + 450;
            // **撞了就把它卷进缝里。** 一片云要走一秒多,不这么做的话
            // 挨打的无敌时间一过又撞一下,一片墙能吃掉三条命 ——
            // 那是在罚「没躲开」这一个错误三次
            f.birdY = gapAt(o, f.birdX);
            f.vy = 0;
            if (f.lives <= 0) { this._finish('crash'); return; }
        }
    }

    /**
     * 生成口那一带还空不空。两个东西的圈都是 30 宽,离得比这近就会压在一起。
     * 横着飞看右边缘,纵向看上边缘 —— 同一件事,换一条轴。
     */
    _roomAt(c, minD = 34) {
        const f = this.f;
        const d = this._gate().d;
        const near = d === 1 ? o => o.y < 24 && Math.abs(o.x - c) < minD
                   : d === 3 ? o => o.y > VH - 24 && Math.abs(o.x - c) < minD
                   : d === 2 ? o => o.x < 24 && Math.abs(o.y - c) < minD
                   :           o => o.x > VW - 24 && Math.abs(o.y - c) < minD;
        return !f.obstacles.some(near) && !f.foods.some(near) && !f.powerups.some(near);
    }

    /**
     * 这会儿能不能出颠倒。
     * 开局一分钟内不出、上一次之后隔够了、自己没在颠倒里、也不在过场里。
     * (窄道那一段 _spawn 早就 return 了,轮不到这儿。)
     */
    /**
     * 这会儿能出哪个飞法道具(没有就是 null)。
     * 越怪的越晚出;够格的几个里随机挑一个。
     */
    _modeReady() {
        const f = this.f;
        if (f.mode !== 'flat' || f.cut || f.flip > 0 || f.elapsed < f.flipAt) return null;
        if (f.elapsed < f.modeAt) return null;
        const ok = MODES.filter(m => f.elapsed >= MODE_AFTER[m]);
        return ok.length ? ok[Math.floor(this.rng() * ok.length)] : null;
    }

    /** 三分钟之后飞了多久(分钟)。后期那两条线都按它算 */
    _late() { return Math.max(0, this.f.elapsed - MODE_CD_FROM) / 60000; }

    /** 换飞法的冷却。一路从 50 秒缩到 15 秒 */
    _modeCd() {
        return Math.max(MODE_CD_MIN, FLIP_COOLDOWN - this._late() * MODE_CD_PER_MIN);
    }

    /** 飞法道具每次生成的出现概率。一路从 5% 抬到 22% */
    _modeRate() {
        return Math.min(MODE_RATE_MAX, MODE_RATE_0 + this._late() * MODE_RATE_PER_MIN);
    }

    /**
     * 下一扇门开在第几条道。**按格边反射,不能夹在边界上取样。**
     *
     * 他报的:「上下的障碍物生成频率明显高于中间」。查出来在这儿 ——
     * 门的落点是一条**有界随机游走**,原来是「在 [x−jump, x+jump] 夹到
     * [0, top] 之后均匀取」。夹这一下把边上那几个格子的出路变少了,
     * 于是链在中间待得久:算出来门落在中间 26%、落在两边 16%,
     * **而门在哪儿,障碍就不在哪儿** —— 反过来就是上下两条道被砸得最多。
     *
     * 改成把出界的那一步按**格子的外边**折回来(−1 折成 0 那一格的镜像),
     * 这样每一步的转移是对称的,均匀分布就是它的稳态 —— 算过,五条道各 20%。
     * (「出界就原地不动」也均匀,但那样门会在边上黏住六成的时间,不好玩。)
     *
     * **门有两条道宽的时候还得再让一步。** 一扇两条宽的门摆在五条道上,
     * 起点若只能落在 0~3,那最上和最下两条道各只被门盖到一次,中间三条各两次 ——
     * 于是边上又被砸得多。所以起点范围放宽到 −1~4:**门可以有一半探出画面**,
     * 那一次就只开一条道。这样每条道被盖到的次数一样(算过,各 2/6),
     * 而且顺带来了「越到后期路越少」的一档:探出去的时候只剩一条路。
     */
    _nextGap(from, jump, lo, hi) {
        let y = from + Math.floor(this.rng() * (jump * 2 + 1)) - jump;
        if (y < lo) y = 2 * lo - 1 - y;
        if (y > hi) y = 2 * hi + 1 - y;
        return Math.max(lo, Math.min(hi, y));
    }

    /** 当前那扇门的正中,在生成口上。飞法道具从这儿进来 */
    _doorSpot() {
        const f = this.f;
        const g = this._gate();
        const g0 = Math.max(0, f.lastGap ?? 2);
        const g1 = Math.min(LANES - 1, (f.lastGap ?? 2) + (f.lastW ?? 1) - 1);
        const i = (g0 + g1) / 2;
        return f.vert ? { x: laneX(i), y: g.y, d: g.d } : { x: g.x, y: laneY(i), d: g.d };
    }

    /**
     * 东西从哪个边出来、往哪走。**四种模式只有这一处知道朝向** ——
     * 生成、判空、加塞全从这儿取,不各自再判一遍模式
     */
    _gate() {
        const f = this.f;
        if (f.mode === 'climb') return { d: 1, x: null, y: -16 };
        if (f.mode === 'dive') return { d: 3, x: null, y: VH + 16 };
        if (f.mir) return { d: 2, x: -16, y: null };
        return { d: 0, x: VW + 16, y: null };
    }

    _spawn() {
        const f = this.f;
        const rnd = this.rng;
        const top = SPAWN_TOP, span = SPAWN_BOTTOM - SPAWN_TOP;
        /**
         * 食材出在哪个高度。**在够得着的范围里随机,而不是整片天随机。**
         *
         * 原来是整片天均匀抽:后期一个东西从露头到擦身而过只有一秒出头,
         * 抽在另一头的那些**从出生起就吃不到** —— 玩家看着它飘过去,
         * 学不到任何东西,只觉得这游戏在馋他。
         *
         * 现在以哇鸥当下的高度为中心、上下各 REACH 抽。REACH 是两下翅膀
         * 的距离:够得着,但得动;而它飞过来的这一秒里哇鸥自己也在动,
         * 所以并不会变成「张嘴等着」。
         */
        const foodY = () => {
            // 试几次,躲开刚放下、还挤在右边缘那几个东西。
            // **叠在一起的两个圈,红的那个会把下面的食材整个吃掉** ——
            // 玩家看见的是一个障碍,伸头去撞的是一份饵块
            for (let i = 0; i < 6; i++) {
                const c = Math.max(top, Math.min(top + span,
                                   f.birdY + (rnd() * 2 - 1) * REACH));
                if (this._roomAt(c)) return c;
            }
            return Math.max(top, Math.min(top + span, f.birdY + (rnd() * 2 - 1) * REACH));
        };
        /**
         * 纵向时食材出在哪个横位。同 foodY,只是换了一条轴:
         * 以哇鸥当下的横位为中心、左右各 REACH,并夹在云缝里。
         */
        const foodX = () => {
            const lo = laneX(0), hi = laneX(LANES - 1);
            const one = () => Math.max(lo, Math.min(hi, f.birdX + (rnd() * 2 - 1) * REACH));
            for (let i = 0; i < 6; i++) { const c = one(); if (this._roomAt(c)) return c; }
            return one();
        };
        /** 生成口:横着飞在左右某个边缘,纵向在上下某个边缘 */
        const g = this._gate();
        const spot = () => (f.vert
            ? { x: foodX(), y: g.y, d: g.d }
            : { x: g.x, y: foodY(), d: g.d });
        /** 把一个刚放下的东西再往生成口外面推一段(天气加塞用,错开半屏) */
        const shift = (o, n) => {
            if (o.d === 1) o.y -= n; else if (o.d === 3) o.y += n;
            else if (o.d === 2) o.x -= n; else o.x += n;
            return o;
        };
        const pick = a => a[Math.floor(rnd() * a.length)];

        // 窄道在场上、**或者已经预告了**的时候,不再撒障碍。
        //
        // 只挡「在场上」是不够的:预告有一秒半,这一秒半里照常生成的那几个
        // 障碍,等云推过来的时候正好和缝口叠在一起 ——
        // **玩家一边要对准缝,一边要躲缝口上的东西,而缝只有一条。**
        // 缝里改放吃的:按住平飞的那一秒同时也是在进食。
        const wall = this.f.walls[0];
        if (wall || this.f.warn) {
            const gy = wall ? wall.gapY : this.f.warn.y;
            if (rnd() < 0.55) f.foods.push({ x: VW + 16, y: gy, type: pick(FOOD_TYPES) });
            return;
        }
        // **狂潮:一次撒好几样,几乎不放障碍。**
        // 留一点障碍是故意的 —— 全清的话「无敌」这件事就没有意义了,
        // 而撞碎障碍本身是这十秒里最痛快的一件
        if (f.frenzy > 0) {
            if (rnd() < FRENZY_HAZARD) {
                this._hazard(1);
            } else {
                // **连成一条弧线。** 间距按「这一拍世界跑多远 ÷ 一拍撒几颗」现算,
                // 相位跨拍累加 —— 于是它不是一拍一簇,是一条一直淌过来的带子
                const per = f.speed * 60 / 1000 * FRENZY_SPEED
                          * f.spawnInterval * FRENZY_TICK / FRENZY_FOOD;
                const lo = (f.vert ? laneX(0) : LANE_TOP) + FRENZY_COL_GAP;
                const hi = (f.vert ? laneX(LANES - 1) : LANE_BOTTOM) - FRENZY_COL_GAP;
                const mid = (lo + hi) / 2;
                const amp = (hi - lo) / 2 * 0.95;
                for (let i = 0; i < FRENZY_FOOD; i++) {
                    // 一列三颗,摞在弧线上的那一点上下
                    const c = mid + Math.sin(f.arcPhase) * amp;
                    const type = pick(FOOD_TYPES);
                    for (let j = 0; j < FRENZY_COL; j++) {
                        const p = { ...spot(), type };
                        const cy = c + (j - (FRENZY_COL - 1) / 2) * FRENZY_COL_GAP;
                        if (f.vert) p.x = Math.round(cy); else p.y = Math.round(cy);
                        f.foods.push(shift(p, Math.round(i * per)));
                    }
                    f.arcPhase += FRENZY_ARC;
                }
            }
            return;
        }

        const r = rnd();

        // 飞法道具自己一条线:自己掷骰子、自己的间隔、放在门上。
        // **它和三个纯加成不是一类东西** —— 那三个是白捡的,它是要还的
        const mode = this._modeReady();
        if (mode && rnd() < this._modeRate()) {
            f.modeAt = f.elapsed + MODE_SPAWN_GAP;
            f.powerups.push({ ...this._doorSpot(), type: MODE_TYPE[mode] });
            return;
        }

        if (r < POWER_RATE && f.elapsed >= f.powerAt) {
            const type = pick(POWERUPS);
            /**
             * **飞法道具放在当前那扇门的正中。**
             *
             * 「后期越来越多地遇到飞法」这件事,如果道具是随机撒在天上的,
             * 那它就只是「越来越多地看见」—— 一个清醒的玩家会绕开:
             * 它有代价,而后期正是最不想冒险的时候。于是难度那条线断了。
             *
             * 放在门上之后它**就是路本身**:想躲开得走一条更难的线。
             * 这是个真选择(拿 = 换飞法 + 食材翻倍,躲 = 挤那条边),
             * 而不是「顺手捡到」也不是「强塞给你」。
             * 其它三个纯加成照旧撒在够得着的地方 —— 它们没有代价,不该抢路。
             */
            f.powerups.push({ ...spot(), type });
            f.powerAt = f.elapsed + POWER_GAP;
        } else if (r < POWER_RATE + f.hazard && f.elapsed >= f.hazAt) {
            // 障碍**不跟着哇鸥走** —— 跟着走就成了追着人扔石头,
            // 而它靠的是「一簇里必留一条空道」那套规矩
            // **一簇几个也要摇。** 清一色的单个本身就是一种规律 ——
            // 开局那几波在 1~3 之间摇,偏小但会有意外
            // 四条道,最多堵三条 —— 摇 1~2,后期靠波数往上加
            const n = 1 + Math.floor(f.wave / 4) + (rnd() < 0.45 ? 1 : 0);
            this._hazard(n);
            f.hazAt = f.elapsed + HAZ_MIN_MS;
        } else {
            // 横着一排。**同一个高度、同一种** —— 一排饵块读起来是「一排饵块」,
            // 一排杂七杂八读起来是「一堆东西」
            const row = pick(FOOD_ROW);
            const type = pick(FOOD_TYPES);
            const at = spot();
            const gap = Math.round(f.speed * 60 * FOOD_ROW_SEC);
            for (let i = 0; i < row; i++) {
                f.foods.push(shift({ ...at, type }, i * gap));
            }
        }

        // 天气影响额外生成。**x 要错开半屏** ——
        // 原来它和上面那一次是同一个 x,雨天/雾天于是常常出现
        // 一个障碍和一样食材叠在一起:两个圈重在一处,谁也认不出哪个能吃。
        // 生成节奏本来就靠 x 上的间距做疏密,加塞的那个不错开就是在破坏它
        const EXTRA_X = VW / 2;
        // 雨天加塞的那一个**不进链**:它排在半屏之后,而下一簇会在它之前
        // 到达 —— 让它改写 lastGap 的话,下一簇就是照着一个还没轮到的局面
        // 排的,「上一簇的空道走得到下一簇」这条保证当场作废。
        // 它也绝不落在当前那条通道上(见 _hazard 的 chain=false)
        if (this.state.weather === 'rainy' && rnd() < 0.3) this._hazard(1, EXTRA_X, false);
        if (this.state.weather === 'foggy' && rnd() < 0.25) {
            const row = pick(FOOD_ROW), type = pick(FOOD_TYPES), at = spot();
            const gap = Math.round(f.speed * 60 * FOOD_ROW_SEC);
            for (let i = 0; i < row; i++) {
                f.foods.push(shift({ ...at, type }, EXTRA_X + i * gap));
            }
        }
    }

    /**
     * 放一簇障碍,**留一条空道**。
     *
     * 密度是这一局越来越难的主要来源,但「难」和「不讲理」只隔一层:
     * 满屏障碍没有缝,玩家学不到任何东西,只会觉得游戏在耍他。
     * 留的那条道随机,所以还是得看、得躲,只是保证躲得掉。
     */
    /**
     * 一簇障碍。**留出来的那条空道,必须是从上一簇的空道走得到的。**
     *
     * 原来每一簇各自 `Math.floor(rnd() * LANES)` 随机挑一条 —— 两簇之间
     * 只隔一个生成间隔(后期 420 毫秒),而换一条道要 0.26 秒、换两条 0.5 秒。
     * 于是迟早会出现「上一簇的口在最上面,下一簇的口在最下面」:
     * **看得见、也知道该往哪走,就是来不及** —— 这就是「退无可退」。
     *
     * 现在按「这段时间哇鸥最多挪得动几条道」算出一个跨度,
     * 新的空道只能落在上一条的这个范围里。间隔宽的时候(开局 860ms)
     * 能跨三条,路线照样绕;间隔压到底线的时候只能跨一条,
     * 但**那一条一定走得到**。
     */
    /**
     * @param {number} n     这一簇放几个
     * @param {number} dx    再往生成口外推多远(天气加塞用)
     * @param {boolean} chain 进不进「上一簇 → 这一簇」那条链
     */
    _hazard(n, dx = 0, chain = true) {
        const f = this.f, rnd = this.rng;
        const pick = a => a[Math.floor(rnd() * a.length)];
        // 纵向的道距是 48(一次跃起),横着飞是 47.5 —— 两边都按自己的算
        const step = f.vert ? V_HALF * 2 / (LANES - 1) : LANE_H;
        const reach = CLIMB_PX_PER_SEC * (f.spawnInterval / 1000);
        const jump = Math.max(1, Math.min(LANES - 1, Math.floor(reach / step)));
        /**
         * 留出来的**不是一条道,是一扇门** —— 间隔压到 620 毫秒以下之后开两条。
         *
         * 一条道的时候,连着两簇的空道各挪一条,玩家就得每 0.5 秒精确换一次道,
         * 一次不准就没了 —— 那不是路线,是节拍器。开两条相邻的道之后:
         * 上一扇门 [g, g+1] 和下一扇 [g', g'+1] 之间 |g'-g| ≤ 1,
         * **两扇门必然共用至少一条道** —— 也就是说总存在「不动也能过去」的走法,
         * 想抄近路再自己挪。这条保证比「留一条空道」强一个量级。
         */
        const openW = chain && f.spawnInterval < 620 ? 2 : 1;
        let gap;
        if (chain) {
            // 起点范围:两条宽的门可以有一半探出画面(见 _nextGap)
            const glo = -(openW - 1), ghi = LANES - 1;
            const from = Math.max(glo, Math.min(ghi,
                f.lastGap ?? (glo + Math.floor(rnd() * (ghi - glo + 1)))));
            gap = this._nextGap(from, jump, glo, ghi);
            f.lastGap = gap;
            f.lastW = openW;
        } else {
            // 加塞的那一个不进链,也**绝不落在当前那扇门上** ——
            // 它排在半屏之后,而玩家这会儿正照着那扇门走
            gap = f.lastGap ?? Math.floor(rnd() * LANES);
        }
        const w = chain ? openW : (f.lastW ?? 1);
        const lanes = [];
        for (let i = 0; i < LANES; i++) if (i < gap || i >= gap + w) lanes.push(i);
        // 洗牌后取前 n 条 —— 直接随机取会重复,重复了等于少放一个
        for (let i = lanes.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }
        const g = this._gate();
        for (const i of lanes.slice(0, Math.min(n, lanes.length))) {
            // **不钉在道的正中,前后左右各晃一点。** 钉死的话满屏是一张网格,
            // 而网格是「看一眼就知道后面长什么样」。
            // 晃动量卡在 ±7:门那条道的中心离它最近的障碍还有 40 像素,
            // 判定半径 15 —— **晃归晃,门必须还是门**
            const j = (rnd() * 2 - 1) * LANE_JITTER;
            const back = (rnd() * 2 - 1) * LANE_JITTER * 2;
            f.obstacles.push(f.vert
                ? { x: laneX(i) + j, y: g.y + (g.d === 1 ? -dx - back : dx + back),
                    d: g.d, type: pick(OBSTACLES) }
                : { x: g.x + (g.d === 2 ? -dx - back : dx + back), y: laneY(i) + j,
                    d: g.d, type: pick(OBSTACLES) });
        }
    }

    _finish(reason) {
        if (!this.running) return;
        this.destroy();
        const f = this.f;
        this.onEnd?.({
            reason,                                    // 'quit' | 'crash' | 'hungry'
            // 饿回去的算飞完了一趟,不是摔了 —— 它是自己决定回巢的
            survived: reason !== 'crash',
            dist: Math.round(f.elapsed / 1000 * M_PER_SEC),
            wave: f.wave + 1,
            score: f.score,
            collected: f.collected,
            itemCount: f.itemCount,
            maxCombo: f.maxCombo,
            flips: f.flipCount,
            usedItems: { shield: f.shieldN > 0, magnet: f.magnetMs > 0, double: f.rushMs > 0 },
        });
    }

    /* ---------- 绘制 ---------- */

    _draw() {
        const ctx = this.ctx, f = this.f;
        const weather = this.state.weather ?? 'sunny';
        const t = f.vt;                      // 背景和翅膀走画面时间,倒计时里也动

        this.phase = dayPhase(now());
        this._bakeSky(weather, this.phase);
        const off = Math.round(f.climbOff);
        ctx.drawImage(this.sky.cv, 0, off);
        // 让开的那一条用天空最上面那一行**拉出来**填 —— 不用知道当下是什么天、
        // 什么时辰,那一行本来就是那个颜色
        if (off > 0) ctx.drawImage(this.sky.cv, 0, 0, VW, 1, 0, 0, VW, off);
        // 飞行时云和远处的鸟走得比大坝上快,才有在赶路的感觉。
        //
        // **但装饰云在这一场里得退到背景里去** —— 别处它只是天上的云,
        // 这一场里「云」是会要命的东西(障碍之一就是乌云),
        // 而入夜之后 shadedSprite 把装饰云也压成灰的,两者在天上一模一样。
        // 玩家分不清哪朵能穿、哪朵不能,飞一会儿眼睛就花了。
        ctx.save();
        ctx.translate(0, off);               // 云和远处的鸟属于天,跟着一起沉
        ctx.globalAlpha = this.phase === 'night' ? 0.42 : this.phase === 'day' ? 0.8 : 0.6;
        drawClouds(ctx, t * 3, weather, this.phase);
        ctx.globalAlpha = 1;
        drawFarGulls(ctx, t * 2);
        ctx.restore();
        // 底边取 VH 和 VH+off 里大的那个:俯冲时 off 是负的,湖面涨上来,
        // 下面那一段得一直铺到屏幕底,否则会露出上一帧的残像
        drawSea(ctx, weather, HORIZON + off, VH + Math.max(0, off), t * 2, this.phase);
        this._drawCeiling(ctx, f);
        this._drawVWalls(ctx, f);

        for (const o of f.foods)     this._drawItem(ctx, o.type, o.x, o.y);
        for (const o of f.powerups)  this._drawPowerup(ctx, o, t);
        for (const o of f.obstacles) this._drawObstacle(ctx, o);
        this._drawWalls(ctx, f);

        this._drawRush(ctx, f);
        this._drawBird(ctx, f);
        this._drawYaya(ctx, f);

        if (weather === 'rainy') drawRain(ctx, t, HORIZON);
        if (weather === 'foggy') drawFog(ctx, t, HORIZON);
        this._drawPops(ctx, f);
        this._drawFrenzy(ctx, f);
        this._drawWave(ctx, f);
        this._drawHunger(ctx, f);
        this._drawCut(ctx, f);          // 黑边压在最上面

        this.screen.present();
    }

    /**
     * 云顶。**只有颠倒的时候才有** —— 平常上边界只是「顶住不动」,
     * 而颠倒之后重力朝上,那一头就成了会要命的那一边。
     *
     * 必须画出来。**一条看不见的死线是最不讲理的那种难**:
     * 玩家松手往上飘,飘着飘着少一条命,而画面上什么都没发生过。
     * 画成一层压下来的乌云,和窄道那两片是同一种东西 ——
     * 他不用学新东西就知道那是碰不得的。
     */
    _drawCeiling(ctx, f) {
        if (f.gdir > 0) return;
        for (let x = 0; x < VW; x += 4) {
            // 疙瘩按屏幕坐标算就够了 —— 这一层不动
            const b = ((x * 2654435761) >>> 0) % 3 * 3;
            const y = SKY_TOP - b;
            ctx.fillStyle = '#8a99a3';
            ctx.fillRect(x, 0, 4, y);
            ctx.fillStyle = '#5f6d78';                 // 贴着下面那一面压暗
            ctx.fillRect(x, Math.max(0, y - 6), 4, Math.min(6, y));
            ctx.fillStyle = '#4a3628';                 // 描边
            ctx.fillRect(x, y - 1, 4, 1);
        }
    }

    /**
     * 纵向时两边的云墙 —— 「从云缝里往上钻」的那两片云。
     *
     * 它同时是三件事,所以只画一次就够:**能动的范围有多宽**(玩法上是
     * 192 像素的五条道)、**为什么这么宽**(云挤的,不是我规定的)、
     * 以及**这一段和窄道是同一种东西**(玩家见过,不用重新学)。
     *
     * 疙瘩一律**往外长**,和窄道那条规矩一样:画面上的缝只会比判定的缝更宽,
     * 绝不会出现「撞上一块看着明明没碰到的云」。
     */
    _drawVWalls(ctx, f) {
        if (!f.vert) return;
        const inL = V_LEFT - 18, inR = V_RIGHT + 18;   // 哇鸥贴住墙时正好挨着
        /**
         * **云纹是横的,而且往下淌。** 这一段唯一还在告诉玩家「你在往上爬」
         * 的就是它 —— 天是一片渐变,不动;食材和障碍从上面下来,但那是
         * 「东西在动」,不是「我在动」。两片云墙是画面上最大的一块面积,
         * 让它的纹路匀速往下走,爬升这件事才成立。
         *
         * 纹路按「云自己的坐标」算(y + 走过的距离),不按屏幕坐标 ——
         * 按屏幕算的话花纹会原地闪,而不是流过去。
         */
        const scroll = Math.floor(f.vt * 0.052);
        for (let y = 0; y < VH; y += 4) {
            const w = (y + scroll) & 0xffff;           // 云自己的坐标
            const b = ((w * 2654435761) >>> 0) % 3 * 4;
            const h = Math.min(4, VH - y);
            const l = Math.round(inL - b), r = Math.round(inR + b);
            ctx.fillStyle = '#8a99a3';
            if (l > 0) ctx.fillRect(0, y, l, h);
            if (r < VW) ctx.fillRect(r, y, VW - r, h);
            // 横着的暗纹,每 28 像素一道 —— 往下淌的就是它
            if (w % 28 < 4) {
                ctx.fillStyle = '#78868f';
                if (l > 0) ctx.fillRect(0, y, l, h);
                if (r < VW) ctx.fillRect(r, y, VW - r, h);
            }
            ctx.fillStyle = '#5f6d78';                 // 贴着缝的那一面压暗
            if (l > 6) ctx.fillRect(l - 6, y, 6, h);
            if (r < VW) ctx.fillRect(r, y, Math.min(6, VW - r), h);
            ctx.fillStyle = '#4a3628';                 // 描边
            if (l > 0) ctx.fillRect(l - 1, y, 1, h);
            if (r < VW) ctx.fillRect(r, y, 1, h);
        }
    }

    /**
     * 过场的黑边。四边一起收拢,收到最紧的那一刻切,然后张开。
     *
     * **收的中心是「哇鸥要去的地方」,不是画面正中。** 第一版四边各按屏幕
     * 比例收,而横着飞时哇鸥在 x=60、纵向时它要去 (310, 248) ——
     * 收到最紧的那一刻主角正好被下面那道黑边盖住了:
     * 一段专门用来交代「你现在归哪条轴管」的动画,偏偏把人藏了起来。
     *
     * 现在每一边只收到**离目标点 KEEP 那么近**为止:窗口最后一定框着主角,
     * 而且框的正是他落脚的地方 —— 黑边张开时他已经在那儿了。
     */
    _drawCut(ctx, f) {
        if (!f.cut) return;
        const c = f.cut;
        const p = Math.min(1, c.t / CUT_MS);
        const q = p < CUT_HOLD ? p / CUT_HOLD : 1 - (p - CUT_HOLD) / (1 - CUT_HOLD);
        const e = q * q * (3 - 2 * q);
        const KEEP_X = 90, KEEP_Y = 50;
        const to = this._station(c.to);
        const l = Math.round(Math.max(0, to.x - KEEP_X) * e);
        const r = Math.round(Math.max(0, VW - to.x - KEEP_X) * e);
        const t = Math.round(Math.max(0, to.y - KEEP_Y) * e);
        const b = Math.round(Math.max(0, VH - to.y - KEEP_Y) * e);
        ctx.fillStyle = '#241a13';
        ctx.fillRect(0, 0, VW, t);
        ctx.fillRect(0, VH - b, VW, b);
        ctx.fillRect(0, 0, l, VH);
        ctx.fillRect(VW - r, 0, r, VH);
        // 黑块要有边。像素画里一块没有描边的纯黑不像幕布,像画布破了个洞
        const w = VW - l - r, h = VH - t - b;
        ctx.fillStyle = '#c98a1e';
        if (t) ctx.fillRect(l, t - 1, w, 1);
        if (b) ctx.fillRect(l, VH - b, w, 1);
        if (l) ctx.fillRect(l - 1, t, 1, h);
        if (r) ctx.fillRect(VW - r, t, 1, h);
    }

    /**
     * 觅食狂潮的画面:开场一片金光,全程四处放烟花。
     *
     * **这十秒是奖励,画面得说出来。** 一百一十连击是这一局最难的一件事,
     * 如果兑现的时候只是「食材变多了」,那玩家未必知道自己达成了什么 ——
     * 金光和烟花不是装饰,是**收据**。
     *
     * 烟花不存粒子:按时间算出「现在有哪三簇、各自炸开多久了」,
     * 位置用时间哈希出来。**不存状态的特效不会漏、不会泄、不会在暂停后爆一堆。**
     */
    _drawFrenzy(ctx, f) {
        if (f.frenzy <= 0) return;
        const t = f.elapsed;
        const since = FRENZY_MS - f.frenzy;
        // **整屏压一层跳动的金。** 前一版只有边框和烟花,中间那一大片还是
        // 平常的天 —— 而「中奖」这件事应该是整个屏幕的事,不是四条边的事
        const wash = 0.07 + 0.04 * Math.sin(t * 0.02);
        ctx.fillStyle = `rgba(245, 184, 61, ${wash.toFixed(3)})`;
        ctx.fillRect(0, 0, VW, VH);
        // **速度线横穿整屏。** 世界这会儿是平常的 2.2 倍,而「快」这件事
        // 光靠东西跑得快是看不出来的(眼睛没有参照物)—— 得有线
        for (let i = 0; i < 22; i++) {
            const h = (i * 2654435761) >>> 0;
            const y = (h % (VH - 20)) + 10;
            const len = 30 + (h >>> 7) % 90;
            const x = VW - ((i * 53 + t * 0.9) % (VW + 160));
            ctx.fillStyle = i % 3 ? 'rgba(255, 253, 244, 0.30)' : 'rgba(245, 184, 61, 0.42)';
            ctx.fillRect(Math.round(x), y, len, 1);
        }
        // **金色纸屑往下飘。** 烟花是一下一下的,纸屑是一直在的 ——
        // 两个加起来才是「一直在响」
        for (let i = 0; i < 26; i++) {
            const h = (i * 40503 + 7) >>> 0;
            const x = (h % VW);
            const y = ((h >>> 5) % VH + t * 0.055 + i * 7) % VH;
            const c = i % 4;
            ctx.fillStyle = c === 0 ? 'rgba(255, 253, 244, 0.8)'
                          : c === 1 ? 'rgba(245, 184, 61, 0.85)'
                          : c === 2 ? 'rgba(239, 119, 87, 0.75)'
                                    : 'rgba(255, 224, 138, 0.8)';
            ctx.fillRect(Math.round(x), Math.round(y), 2, 3);
        }
        // 开场那一下:整屏压一层金,中间一圈扩开的环
        if (since < FRENZY_IN) {
            const p = 1 - since / FRENZY_IN;
            ctx.fillStyle = `rgba(255, 224, 138, ${(p * 0.5).toFixed(3)})`;
            ctx.fillRect(0, 0, VW, VH);
            const r = Math.round((1 - p) * VW * 0.6) + 8;
            ctx.fillStyle = `rgba(255, 253, 244, ${(p * 0.9).toFixed(3)})`;
            for (let n = 0; n < 40; n++) {
                const th = n / 40 * Math.PI * 2;
                ctx.fillRect(Math.round(VW / 2 + Math.cos(th) * r),
                             Math.round(VH / 2 + Math.sin(th) * r * 0.55), 3, 3);
            }
        }
        // 全程:四处炸烟花。同时最多五簇,每簇活 700 毫秒 ——
        // 三簇的时候一眼只看得见一两朵,「绚烂」这个词撑不起来
        for (let i = 0; i < 5; i++) {
            const k = Math.floor(t / 240) - i;
            if (k < 0) continue;
            const age = t - k * 240;
            if (age > 700) continue;
            const h = (k * 2654435761) >>> 0;
            const cx = 40 + (h % (VW - 80));
            const cy = 26 + ((h >>> 9) % 130);
            const p = age / 700;
            const rad = 5 + p * 44;
            const a = (1 - p) * 0.92;
            ctx.fillStyle = k % 3 === 0 ? `rgba(255, 253, 244, ${a.toFixed(3)})`
                          : k % 3 === 1 ? `rgba(245, 184, 61, ${a.toFixed(3)})`
                                        : `rgba(239, 119, 87, ${a.toFixed(3)})`;
            for (let n = 0; n < 12; n++) {
                const th = n / 12 * Math.PI * 2 + k;
                ctx.fillRect(Math.round(cx + Math.cos(th) * rad),
                             Math.round(cy + Math.sin(th) * rad), 2, 2);
            }
        }
        // 四边一直在跳的金框。**老虎机响的时候灯是一刻不停的** ——
        // 只在开头闪一下、结尾闪一下,中间那八秒就退回成「食材变多了」
        const beat = Math.floor(t / 110) % 2 === 0;
        ctx.fillStyle = beat ? 'rgba(245, 184, 61, 0.5)' : 'rgba(255, 253, 244, 0.32)';
        const th = beat ? 4 : 2;
        ctx.fillRect(0, 0, VW, th);
        ctx.fillRect(0, VH - th, VW, th);
        ctx.fillRect(0, 0, th, VH);
        ctx.fillRect(VW - th, 0, th, VH);
        // 快结束的时候整屏压一层暗金 —— 「要没了」也得看得见
        if (f.frenzy < 2200 && beat) {
            ctx.fillStyle = 'rgba(201, 138, 30, 0.16)';
            ctx.fillRect(0, 0, VW, VH);
        }
    }

    /**
     * 吃到一口冒的那朵金花。**每一口都得有回音。**
     *
     * 老虎机的快感有一半在「叮」那一声上 —— 屏幕上必须有一件事和「又吃到一个」
     * 一对一地对上,不然满屏的食材就只是背景在动。
     *
     * 只在狂潮里画:平常一秒吃一两个,冒花是噪音;狂潮里一秒十来个,
     * 连成一片才是那个味道。缓冲封顶 16 个(见 POP_MAX)——
     * **特效的内存一定要有上限**,不然一局飞十分钟能攒出几千个。
     */
    _drawPops(ctx, f) {
        if (f.frenzy <= 0) return;
        for (const p of f.pops) {
            const age = f.elapsed - p.t;
            if (age > 320) continue;
            const q = age / 320;
            const r = 4 + q * 13;
            const a = 1 - q;
            ctx.fillStyle = q < 0.4 ? `rgba(255, 253, 244, ${a.toFixed(3)})`
                                    : `rgba(245, 184, 61, ${a.toFixed(3)})`;
            for (let n = 0; n < 6; n++) {
                const th2 = n / 6 * Math.PI * 2 + p.t * 0.01;
                ctx.fillRect(Math.round(p.x + Math.cos(th2) * r),
                             Math.round(p.y + Math.sin(th2) * r), 2, 2);
            }
        }
    }

    /**
     * 肚子条。**只有饿起来之后才画** —— 前五分钟画一条满的进度条在那儿,
     * 玩家会一直盯着一个不动的东西。
     *
     * 画在画面正上方横贯一条:这时候它是唯一还会要人命的计时器,
     * 得和分数、命数分开,不能挤在角落里当第三个小 chip。
     */
    _drawHunger(ctx, f) {
        if (f.elapsed < HUNGRY_AT) return;
        const y = 8, h = 7, pad = 30;
        const w = VW - pad * 2;
        ctx.fillStyle = '#241a13';
        ctx.fillRect(pad - 2, y - 2, w + 4, h + 4);
        ctx.fillStyle = '#5f6d78';
        ctx.fillRect(pad, y, w, h);
        // 快见底的时候整条闪 —— 到这一步玩家的眼睛全在障碍上,不闪根本看不见
        const low = f.hunger < 0.3;
        const blink = low && Math.floor(f.elapsed / 180) % 2 === 0;
        ctx.fillStyle = blink ? '#f5b83d' : low ? '#e8384f' : f.hunger < 0.6 ? '#ef7757' : '#77b255';
        ctx.fillRect(pad, y, Math.max(0, Math.round(w * f.hunger)), h);

        const left = f.hungryFlash - f.elapsed;
        if (left > 0) {
            const p = left / 1600;
            ctx.fillStyle = `rgba(232, 56, 79, ${(p * 0.8).toFixed(3)})`;
            ctx.fillRect(0, y + h + 6, VW, 3);
            ctx.fillStyle = `rgba(255, 253, 244, ${(p * 0.9).toFixed(3)})`;
            ctx.fillRect(0, y + h + 7, VW, 1);
        }
    }

    /**
     * 上一档的时候横过屏幕的那道光。**升档必须看得见** ——
     * 悄悄提速只会让人觉得「我怎么突然打不过了」,而不是「又上了一档」。
     * 只有一道横带,不写字:画布上没有像素字体,写字会糊。
     */
    _drawWave(ctx, f) {
        const left = (f.waveFlashUntil ?? 0) - f.elapsed;
        if (left <= 0) return;
        const p = left / 900;                       // 1 → 0
        const y = 40 + (1 - p) * 36;
        ctx.fillStyle = `rgba(245, 184, 61, ${(p * 0.75).toFixed(3)})`;
        ctx.fillRect(0, y, VW, 3);
        ctx.fillStyle = `rgba(255, 253, 244, ${(p * 0.9).toFixed(3)})`;
        ctx.fillRect(0, y + 1, VW, 1);
        // 波数用短竖条数出来 —— 一根一波,十根并成一根长的
        const n = f.wave + 1;
        ctx.fillStyle = `rgba(245, 184, 61, ${(p * 0.9).toFixed(3)})`;
        for (let i = 0; i < Math.min(n, 10); i++) {
            ctx.fillRect(VW / 2 - Math.min(n, 10) * 5 + i * 10, y - 9, 4, 7);
        }
        if (n > 10) ctx.fillRect(VW / 2 - 60, y - 9, 3, 7);
    }

    /** 天空是静态的,天气不变就不用重画 */
    _bakeSky(weather, phase) {
        const key = weather + ':' + phase;
        if (this.skyWeather === key) return;
        this.skyWeather = key;
        this.sky = this.sky ?? this.screen.layer();
        this.sky.ctx.clearRect(0, 0, VW, VH);
        // 0.55:飞行视角在高空,西山要退远退矮,别顶进食材的生成区
        paintSky(this.sky.ctx, weather, HORIZON, 0.55, phase);
    }

    /**
     * 天上飞的东西分两类,**只给危险的那一类做记号** ——
     * 而这副记号**招到第一只伙计鸥之后才有**(见 start() 里的 marks):
     *
     *   食材  光板一张,什么都不加      能吃
     *   障碍  四个红直角框住            碰不得
     *   道具  白盘 + 金边(本来就有)   能吃,而且是好东西
     *
     * 第一版是「食材白盘 + 障碍红框深底」,两类都加了装饰 —— 辨识度是有了,
     * 但满屏白块红块,天空全被糊住,画面比玩法还吵。
     *
     * **只有一类需要记号。** 「有红角的不能碰,没有的能吃」是一条完整的规则,
     * 而它只花掉四个直角的墨。红角还正好落在判定框的四角上 ——
     * 顺带把「看着碰上了」和「算作碰上了」对齐了。
     */
    _drawItem(ctx, name, x, y) {
        if (this.sprites?.draw(ctx, name, x, y, 16)) return;
        drawSprite(ctx, sprite(name, ICON_GRIDS[name]), x, y);
    }

    /** 道具多一圈呼吸的光边,和普通食材区分开 */
    _drawPowerup(ctx, o, t) {
        const r = Math.sin(t * 0.006 + o.x) > 0 ? 12 : 11;
        // 底盘用浪花白 + 金边:三个道具里有金币色也有海水青,
        // 铺金色底会跟 double 糊成一片
        plate(ctx, o.x, o.y, r, '#c98a1e');
        plate(ctx, o.x, o.y, r - 1, '#fffdf4');
        this._drawItem(ctx, o.type, o.x, o.y);
        // 颠倒不是纯加成,它要人付出点什么。**外面再套一圈闪的金边** ——
        // 三个白盘道具是「见了就吃」,这一个得让人认出来是另一类:
        // 看清了再决定要不要伸头,是这个道具的全部乐趣
        if (MODE_TYPE[o.type]) {
            const on = Math.floor(t / 120) % 2 === 0;
            ctx.fillStyle = on ? '#f5b83d' : '#c98a1e';
            const d = r + 3;
            for (let k = -d; k <= d; k += 3) {
                ctx.fillRect(Math.round(o.x + k), Math.round(o.y - d), 2, 2);
                ctx.fillRect(Math.round(o.x + k), Math.round(o.y + d), 2, 2);
                ctx.fillRect(Math.round(o.x - d), Math.round(o.y + k), 2, 2);
                ctx.fillRect(Math.round(o.x + d), Math.round(o.y + k), 2, 2);
            }
        }
    }

    /**
     * 窄道:两片乌云和中间那条缝,外加还没到之前的预告。
     *
     * 缝的边缘画成起伏的云疙瘩,但**疙瘩一律往外让,不往缝里长** ——
     * 判定的缝是平的(±CORRIDOR_GAP),画面上的缝只会比它更宽。
     * 反过来的话,玩家会撞上一块看着明明没碰到的云,
     * 而「我看见的和游戏算的不是一回事」是最伤人的一种不公平。
     */
    _drawWalls(ctx, f) {
        // 还没来:一条横穿画面的虚线标出缝在哪,右边缘一个方框
        if (f.warn) {
            const y = Math.round(f.warn.y);
            const blink = Math.floor(f.elapsed / 110) % 2 === 0;
            ctx.fillStyle = blink ? '#f5b83d' : '#c98a1e';
            for (let x = 0; x < VW; x += 12) ctx.fillRect(x, y, 6, 1);
            ctx.fillRect(VW - 10, y - CORRIDOR_GAP, 4, CORRIDOR_GAP * 2);
            ctx.fillRect(VW - 22, y - CORRIDOR_GAP, 16, 2);
            ctx.fillRect(VW - 22, y + CORRIDOR_GAP - 2, 16, 2);
            // **缝会往哪边走,也得预告。** 三分钟之后它是斜的,
            // 而「进得去」和「走得完」是两件事 —— 只标进口等于只说了一半:
            // 出口那条线画暗一档,中间几个箭头指出往哪挪
            const bend = f.warn.bend ?? 0;
            if (bend) {
                const y2 = Math.round(y + bend);
                ctx.fillStyle = '#c98a1e';
                for (let x = 0; x < VW; x += 24) ctx.fillRect(x, y2, 4, 1);
                const dir = Math.sign(bend);
                ctx.fillStyle = blink ? '#f5b83d' : '#c98a1e';
                for (let i = 1; i <= 3; i++) {
                    const ax = Math.round(VW * i / 4);
                    const ay = Math.round(y + bend * i / 4);
                    for (let k = 0; k < 4; k++) {          // 一个小人字箭头
                        ctx.fillRect(ax - 4 + k, ay + dir * k, 2, 2);
                        ctx.fillRect(ax + 4 - k, ay + dir * k, 2, 2);
                    }
                }
            }
        }

        for (const o of f.walls) this._drawWall(ctx, o);
    }

    _drawWall(ctx, o) {
        const x0 = Math.round(o.x);
        for (let dx = 0; dx < o.w; dx += 4) {
            const x = x0 + dx;
            // **缝的高度逐列算** —— 和判定用的是同一个 gapAt
            const gc = gapAt(o, x);
            const gTop = Math.round(gc - CORRIDOR_GAP);
            const gBot = Math.round(gc + CORRIDOR_GAP);
            if (x + 4 <= 0 || x >= VW) continue;
            const w = Math.min(4, VW - x, x0 + o.w - x);
            // 疙瘩按「离云的左边多远」算,不按屏幕坐标 ——
            // 按屏幕算的话,云一往左走凹凸就在原地抖
            let b = ((dx * 2654435761) >>> 0) % 3 * 4;
            // **两头张成喇叭口。** 进口比中间宽,一是云本来就没有刀切的边,
            // 二是「对准」和「待住」是两件事:让人先进得来,再考他按不按得稳
            const edge = Math.min(dx, o.w - dx);
            if (edge < 26) b += (26 - edge) * 0.9;
            const t = Math.round(gTop - b), u = Math.round(gBot + b);

            ctx.fillStyle = '#8a99a3';
            if (t > 0) ctx.fillRect(x, 0, w, t);
            if (u < HORIZON) ctx.fillRect(x, u, w, HORIZON - u);
            // 云里横着几道暗纹。**没有它就是一块灰板** ——
            // 这么大一片纯色,在一屏都是渐变天空的画面里最扎眼
            ctx.fillStyle = '#78868f';
            for (const d of [16, 30, 48]) {
                if (t - d > 0) ctx.fillRect(x, t - d, w, 2);
                if (u + d < HORIZON) ctx.fillRect(x, u + d - 2, w, 2);
            }
            ctx.fillStyle = '#5f6d78';                  // 贴着缝的那一面压暗
            if (t > 6) ctx.fillRect(x, t - 6, w, 6);
            if (u < HORIZON) ctx.fillRect(x, u, w, Math.min(6, HORIZON - u));
            ctx.fillStyle = '#4a3628';                  // 描边
            if (t > 0) ctx.fillRect(x, t - 1, w, 1);
            if (u < HORIZON) ctx.fillRect(x, u, w, 1);
        }
    }

    _drawObstacle(ctx, o) {
        const grid = SCENERY[OBSTACLE_GRID[o.type]];
        drawSprite(ctx, sprite(OBSTACLE_GRID[o.type], grid), o.x, o.y);
        if (this.f.marks) this._corners(ctx, o.x, o.y, this.f.hazR, this.f.arm);
    }

    /**
     * 四个红直角。**半径就是当前的判定半径** —— 框有多大,判定就有多大,
     * 所以招了老翘之后框会跟着缩:他把判定缩小这件事是**看得见**的。
     *
     * 臂长不到半边:眼睛会自己把四个直角补成一个框,这是白送的,
     * 画满一圈只会把天空糊掉。老翘把臂加长到 7,再压一道亮线 ——
     * **他缩掉的那一圈,得用更清楚的标记还回来**,不然玩家只觉得「变小了」,
     * 不觉得「他在帮我」。
     *
     * 每个角先用深褐描一遍再压红:红在白天的浅蓝天上够跳,
     * 在黄昏那片橙红里会糊,垫一道深褐就哪种天都站得住。
     * (整张画面里只有这一处是纯红,它专管一件事:别碰。)
     */
    _corners(ctx, cx, cy, r, arm = CORNER_ARM) {
        const x = Math.round(cx) - r, y = Math.round(cy) - r, d = r * 2;
        const w = 2;
        const keen = arm > CORNER_ARM;          // 老翘在
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const px = x + (sx ? d - w : 0), py = y + (sy ? d - w : 0);
            const ax = x + (sx ? d - arm : 0), ay = y + (sy ? d - arm : 0);
            ctx.fillStyle = '#241a13';
            ctx.fillRect(ax - 1, py - 1, arm + 2, w + 2);   // 横臂的底
            ctx.fillRect(px - 1, ay - 1, w + 2, arm + 2);   // 竖臂的底
            ctx.fillStyle = '#e8384f';
            ctx.fillRect(ax, py, arm, w);
            ctx.fillRect(px, ay, w, arm);
            if (keen) {                                     // 里侧压一道亮线
                ctx.fillStyle = '#ffd0c4';
                ctx.fillRect(ax, py + (sy ? 0 : w - 1), arm, 1);
                ctx.fillRect(px + (sx ? 0 : w - 1), ay, 1, arm);
            }
        }
    }

    /**
     * 颠倒的时候**整只翻过来画**,而不是换一套图。
     *
     * 素材是冻着的(朋友在拿这批图做参考动画),而且也不该为这二十秒
     * 再画四帧倒着的哇鸥 —— 画布沿着它自己那条水平中线镜像一下就是了。
     * 翻的是画笔不是图:四帧、护盾、受伤变色全都跟着走。
     */
    _drawBird(ctx, f) {
        if (f.mode === 'flat') { this._bird(ctx, f); return; }
        // **换的是画笔,不是图。** 四种飞法各是一次镜像或一次 90° 转 ——
        // 这两种变换在像素画里都是无损的(像素还是像素,不会糊出半透明的边),
        // 而哇鸥的素材是冻着的,一帧都不能新画
        const bx = Math.round(f.birdX), by = Math.round(f.birdY);
        ctx.save();
        ctx.translate(bx, by);
        if (f.mode === 'climb') ctx.rotate(-Math.PI / 2);        // 头朝上
        else if (f.mode === 'dive') ctx.rotate(Math.PI / 2);     // 头朝下
        else if (f.mir) ctx.scale(-1, 1);                        // 照镜子
        else ctx.scale(1, -1);                                   // 颠倒
        ctx.translate(-bx, -by);
        this._bird(ctx, f);
        ctx.restore();
    }

    _bird(ctx, f) {
        const t = f.vt;                      // 翅膀的节奏走画面时间
        // 挨打后闪 450ms:这一条是玩法时间,和 hurtUntil 同一把尺子
        const hurt = f.elapsed < f.hurtUntil;
        if (hurt && Math.floor(f.elapsed / 70) % 2 === 0) {
            if (f.shieldMs > 0) this._drawShield(ctx, f);
            return;
        }

        if (this.sprites?.drawAnim(ctx, 'waou', 'fly', t, f.birdX, f.birdY, 32)) {
            if (f.shieldMs > 0) this._drawShield(ctx, f);
            return;
        }

        // 挑翅膀帧:**按的是哪个键要能从画面上看出来**。
        // 刚拍完那 220ms 一定是扬起的那一帧 —— 反馈得贴着按键,
        // 不能等速度真的变正了才换,那时候手感已经过去了
        // **按重力那一头折算**:颠倒的时候「蹬一下」是往下走的,
        // 而画面已经整只翻过来了 —— 用 vy*gdir,四帧的意思就还是原来那个意思
        const rvy = f.vy * f.gdir;
        let i = Math.floor(t / 1000 * 10) % 4;
        if (t - f.flapAt < 180 || rvy < -1.5) i = 0;   // 蹬出去 -> 翅膀扬起
        else if (f.glide) i = 1;                       // 平飞    -> 摊平
        else if (rvy > 2.5) i = 2;                     // 顺着掉  -> 翅膀压下
        const key = hurt ? 'waou_hurt' + i : 'waou' + i;
        const cv = hurt
            ? sprite(key, WAOU[i], { remap: { w: '#ffd0c4', V: '#f0b8b0' } })
            : sprite(key, WAOU[i]);
        drawSprite(ctx, cv, f.birdX, f.birdY);

        if (f.shieldMs > 0) this._drawShield(ctx, f);
    }

    /**
     * 丫丫挡下来的那一下:她自己从哇鸥背后探出来,顶半秒。
     *
     * 不画成一圈光效 —— **玩家得知道是谁挡的**。多花的钱要看得见回来,
     * 一个只在数字上生效的伙计,和没招是一样的。
     */
    _drawYaya(ctx, f) {
        const left = f.yayaFlash - f.elapsed;
        if (left <= 0) return;
        const p = left / 800;
        // 摆在哇鸥**前上方**:她是飞到前头去替你挨的那一下,
        // 不是从背后冒出来。压在哇鸥头上的话像多长了个脑袋
        const y = f.birdY - 14 - Math.round(p * 8);
        drawSprite(ctx, sprite('crew_yaya', ICON_GRIDS.crew_yaya), f.birdX + 22, y);
        ctx.fillStyle = `rgba(119, 178, 85, ${(p * 0.9).toFixed(3)})`;
        ctx.fillRect(f.birdX - 14, Math.round(f.birdY) + 14, 28, 2);
    }

    /**
     * 护盾:一圈像素虚线环,不用 arc(),免得出软边。
     * **还能挡几次就画几圈** —— 次数是这个道具现在唯一的资源,
     * 得让人一眼数得出来,而不是去状态栏上找一个数字。
     * 快到期的时候整圈闪:它是会过期的,这一条也得看得见。
     */
    _drawShield(ctx, f) {
        const cx = Math.round(f.birdX), cy = Math.round(f.birdY);
        const spin = Math.floor(f.elapsed / 90);
        const dim = f.shieldMs < 6000 && Math.floor(f.elapsed / 160) % 2 === 0;
        ctx.fillStyle = dim ? '#c98a1e' : '#ffe08a';
        for (let n = 0; n < Math.min(f.shieldN, SHIELD_N_MAX); n++) {
            const r = 22 + n * 4;
            for (let a = 0; a < 24; a++) {
                if ((a + spin + n * 4) % 3 === 0) continue;   // 缺几段,看得出在转
                const rad = a / 24 * Math.PI * 2;
                ctx.fillRect(Math.round(cx + Math.cos(rad) * r),
                             Math.round(cy + Math.sin(rad) * r), 2, 2);
            }
        }
    }

    /**
     * 冲刺:身后拖一串速风线,身上罩一层金。
     *
     * **「变快了」这件事人眼是分不出来的** —— 世界从 3 像素/帧变成 5.4,
     * 数字上快了八成,看着只是「还是那样」。真正让人觉得在冲的是三样:
     * 主角自己往前探了一头(见 _update 里的 birdX)、身后拉出线、身上有光。
     * 三样都便宜,合起来那八秒才对得起一个只出现一次的道具。
     */
    _drawRush(ctx, f) {
        if (f.rushMs <= 0) return;
        const cx = Math.round(f.birdX), cy = Math.round(f.birdY);
        const t = Math.floor(f.vt / 40);
        // 身后的风线。**高低和长短都得散开** —— 等长等距的话是一把梳子,
        // 而梳子看着是静止的;错开之后同样几根线才像风。
        // 纵向的时候「身后」在下面,整组跟着转九十度
        for (let i = 0; i < 10; i++) {
            const h = (i * 1103515245 + 12345) >>> 0;
            const off = ((h >>> 9) % 31) - 15;
            const len = 12 + ((h >>> 4) % 24);
            const back = 20 + ((i * 37 + t * 9) % 150);
            ctx.fillStyle = i % 3 ? '#ffe08a' : '#f5b83d';
            // 「身后」跟着飞法走:平常在右…不,平常在左(世界往左跑,
            // 风从身后被甩到左边);镜像时在右,爬升时在下,俯冲时在上
            if (f.mode === 'climb') ctx.fillRect(cx + off, cy + back, 1, len);
            else if (f.mode === 'dive') ctx.fillRect(cx + off, cy - back - len, 1, len);
            else if (f.mir) ctx.fillRect(cx + back, cy + off, len, 1);
            else if (cx - back + len > 0) ctx.fillRect(cx - back, cy + off, len, 1);
        }
        // 罩在身上的金:快到点的时候闪,和护盾一个道理
        const low = f.rushMs < 2000 && Math.floor(f.elapsed / 130) % 2 === 0;
        if (!low) {
            ctx.fillStyle = 'rgba(245, 184, 61, 0.5)';
            ctx.fillRect(cx - 17, cy - 17, 34, 2);
            ctx.fillRect(cx - 17, cy + 15, 34, 2);
            ctx.fillRect(cx - 17, cy - 15, 2, 30);
            ctx.fillRect(cx + 15, cy - 15, 2, 30);
        }
        // 撞碎一个障碍的那一下,眼前炸一小片
        if ((f.smash ?? 0) > f.elapsed) {
            ctx.fillStyle = '#fffdf4';
            for (const [dx, dy] of [[20, -12], [26, 4], [16, 14], [30, -6]]) {
                ctx.fillRect(cx + dx, cy + dy, 3, 3);
            }
        }
    }
}

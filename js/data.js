/**
 * 静态目录:食谱、明信片、成就、对话树。
 * 这些不进存档 —— 存档只记玩家进度(见 state.js)。
 * 所以在这里增删条目不需要写存档迁移。
 *
 * 例外:FOODS 和 ITEMS 的**键**会作为 backpack / items 的字段进存档,
 * 改键名要同步改 state.js 的 FOOD_KEYS 并补一条迁移。改 name / icon 不用。
 */

/** 食材。键进存档,名字和图标不进。 */
export const FOODS = {
    erkuai:   { name: '饵块',   icon: 'erkuai' },
    potato:   { name: '洋芋',   icon: 'potato' },
    rice:     { name: '米',     icon: 'rice' },
    douhua:   { name: '豆花',   icon: 'douhua' },
    flower:   { name: '鲜花',   icon: 'flower' },
    mushroom: { name: '菌子',   icon: 'mushroom' },
    rusan:    { name: '乳扇',   icon: 'rusan' },
    chili:    { name: '辣椒',   icon: 'chili' },
    sugar:    { name: '红糖',   icon: 'sugar' },
};

export const RECIPES = [
    { id: 'shao_erkuai', name: '烧饵块',   icon: 'shao_erkuai', cost: { erkuai: 2, chili: 1 },                reward: 10, levelReq: 1 },
    { id: 'yangyu_baba', name: '洋芋粑粑', icon: 'yangyu_baba', cost: { potato: 3 },                          reward: 12, levelReq: 1 },
    { id: 'liangxia',    name: '米凉虾',   icon: 'liangxia', cost: { rice: 2, sugar: 1 },                  reward: 18, levelReq: 2 },
    { id: 'douhua_mx',   name: '豆花米线', icon: 'douhua_mx', cost: { rice: 2, douhua: 2 },                 reward: 22, levelReq: 2 },
    { id: 'xiaoguo_mx',  name: '小锅米线', icon: 'xiaoguo_mx', cost: { rice: 3, chili: 2 },                  reward: 28, levelReq: 3 },
    { id: 'xianhua_bing',name: '鲜花饼',   icon: 'xianhua_bing', cost: { flower: 3, erkuai: 1 },               reward: 32, levelReq: 3 },
    { id: 'kao_rusan',   name: '烤乳扇',   icon: 'kao_rusan', cost: { rusan: 2, flower: 1 },                reward: 38, levelReq: 4 },
    { id: 'jianshouqing',name: '见手青',   icon: 'jianshouqing', cost: { mushroom: 3 },                        reward: 60, levelReq: 4 },
    { id: 'qiguoji',     name: '汽锅鸡',   icon: 'qiguoji',  cost: { mushroom: 2, chili: 2, potato: 2 },   reward: 70, levelReq: 5 },
];

/** 明信片:昆明地标。从近到远,顺序就是收集顺序。 */
export const POSTCARDS = [
    { id: 0, name: '海埂大坝',     icon: 'waou',     note: '喂海鸥的地方。我就是在这儿被喂胖的。' },
    { id: 1, name: '西山龙门',     icon: 'map',      note: '睡美人躺在那儿,几千年没翻过身。' },
    { id: 2, name: '翠湖',         icon: 'flower',   note: '城里那帮亲戚冬天都挤在这儿。' },
    { id: 3, name: '金马碧鸡坊',   icon: 'coin',     note: '据说六十年才金碧交辉一次,我没赶上。' },
    { id: 4, name: '昆明老街',     icon: 'shop',     note: '巷子窄,但香味传得远。' },
    { id: 5, name: '云大会泽院',   icon: 'postcard', note: '秋天满地银杏,踩上去脆脆的。' },
    { id: 6, name: '斗南花市',     icon: 'flower',   note: '鲜花饼的鲜花从这儿来,凌晨最热闹。' },
    { id: 7, name: '篆新农贸市场', icon: 'erkuai',   note: '食材图鉴的老家。什么都有。' },
    { id: 8, name: '南屏街',       icon: 'star',     note: '人多,掉在地上的东西也多。' },
    { id: 9, name: '石林',         icon: 'mushroom', note: '飞了很久才到。石头长得像菌子。' },
];

/**
 * 成就。P4 重做:原来七条全是飞行玩法的遗物,P2 的放置、P3 的表演/小屋/伙计
 * 一条都没有 —— 玩家把放置内核玩通了,成就页还是空的。
 *
 * 现在按**玩法分组**、每组内分档,并且每条给瓶盖(见 CAP_VALUE)。
 * 瓶盖是装扮的唯一货币:成就不再只是一个弹窗,它是装扮的进度条。
 *
 *   group  归到哪一栏,见 ACH_GROUPS
 *   tier   1/2/3,档次越高瓶盖越多
 *   check  只读 state,不能有副作用 —— 它每 tick 都会被跑一遍
 *
 * check 里用到的计数器都在 state.stats 里(存档 v7 加的)。
 * 用计数器而不是拿背包/图鉴反推,是因为花掉的、送出去的都该算数。
 */
export const ACH_GROUPS = {
    forage: '觅食',
    stall:  '摊子',
    dam:    '大坝',
    hut:    '小屋',
    roam:   '见闻',
};

/** 档次 → 瓶盖。三档的差距要够大,不然玩家不会为了高档去绕远路。 */
export const CAP_VALUE = { 1: 1, 2: 3, 3: 8 };

export const ACHIEVEMENTS = [
    // ---- 觅食 ----
    { id: 'first_fly',   group: 'forage', tier: 1, name: '初次觅食',   desc: '完成第一次觅食',
      check: s => s.totalScore >= 5 },
    { id: 'collect_50',  group: 'forage', tier: 1, name: '会捡了',     desc: '累计得分 50',
      check: s => s.totalScore >= 50 },
    { id: 'combo_20',    group: 'forage', tier: 2, name: '手不抖',     desc: '达成 20 连击',
      check: s => s.maxCombo >= 20 },
    { id: 'fly_50',      group: 'forage', tier: 2, name: '天天下水',   desc: '累计出去觅食 50 次',
      check: s => s.stats.flights >= 50 },
    { id: 'collect_500', group: 'forage', tier: 3, name: '眼疾嘴快',   desc: '累计得分 500',
      check: s => s.totalScore >= 500 },
    { id: 'combo_50',    group: 'forage', tier: 3, name: '一气呵成',   desc: '达成 50 连击',
      check: s => s.maxCombo >= 50 },
    { id: 'dist_2k',     group: 'forage', tier: 1, name: '飞出去了',   desc: '一趟飞出 2000 米',
      check: s => (s.stats.bestDist ?? 0) >= 2000 },
    { id: 'dist_8k',     group: 'forage', tier: 2, name: '越飞越远',   desc: '一趟飞出 8000 米',
      check: s => (s.stats.bestDist ?? 0) >= 8000 },
    { id: 'wave_10',     group: 'forage', tier: 2, name: '扛住十波',   desc: '一趟撑到第 10 波',
      check: s => (s.stats.bestWave ?? 0) >= 10 },
    { id: 'wave_16',     group: 'forage', tier: 3, name: '饿着也飞',   desc: '一趟撑过第 5 分钟',
      check: s => (s.stats.bestWave ?? 0) >= 16 },

    // ---- 摊子 ----
    { id: 'rich_100',    group: 'stall',  tier: 1, name: '攒下第一笔', desc: '拥有 100 鸥币',
      check: s => s.coins >= 100 },
    { id: 'cook_5',      group: 'stall',  tier: 1, name: '小摊主',     desc: '完成 5 个订单',
      check: s => s.completedOrders >= 5 },
    { id: 'served_200',  group: 'stall',  tier: 2, name: '出餐两百份', desc: '摊子累计出餐 200 份',
      check: s => s.stats.served >= 200 },
    { id: 'offline_1d',  group: 'stall',  tier: 2, name: '托付给它',   desc: '累计离线挂机 24 小时',
      check: s => s.stats.offlineMs >= 24 * 3600_000 },
    { id: 'stove_5',     group: 'stall',  tier: 2, name: '炉火纯青',   desc: '炉子升到 5 级',
      check: s => s.upgrades.stove >= 5 },
    { id: 'rich_5000',   group: 'stall',  tier: 3, name: '有点家底了', desc: '拥有 5000 鸥币',
      check: s => s.coins >= 5000 },

    // ---- 大坝 ----
    { id: 'fed_100',     group: 'dam',    tier: 2, name: '有人捧场',   desc: '表演累计被投喂 100 次',
      check: s => s.stats.fed >= 100 },
    { id: 'show_all',    group: 'dam',    tier: 3, name: '全套节目',   desc: '解锁全部节目',
      check: s => s.level >= 6 && s.postcards.length >= 6
                  && s.achievements.includes('cook_5') && s.achievements.includes('combo_20') },
    { id: 'event_20',    group: 'dam',    tier: 2, name: '什么都撞见过', desc: '遇上 20 次大坝上的事',
      check: s => s.stats.events >= 20 },
    { id: 'crew_3',      group: 'dam',    tier: 2, name: '有帮手了',   desc: '招到 3 只伙计鸥',
      check: s => s.crew.length >= 3 },
    { id: 'crew_6',      group: 'dam',    tier: 3, name: '一整队',     desc: '招齐 6 只伙计鸥',
      check: s => s.crew.length >= 6 },

    // ---- 小屋 ----
    { id: 'drink_1',     group: 'hut',    tier: 1, name: '请你喝一杯', desc: '第一次请哇鸥喝东西',
      check: s => s.stats.drinks >= 1 },
    { id: 'c4_win_5',    group: 'hut',    tier: 2, name: '棋逢对手',   desc: '四子棋赢 5 局',
      check: s => s.stats.c4win >= 5 },
    { id: 'fortune_all', group: 'hut',    tier: 3, name: '八签见全',   desc: '八种占卜结果都见过',
      check: s => s.fortuneSeen.length >= 8 },
    { id: 'affinity_30', group: 'hut',    tier: 2, name: '处熟了',     desc: '好感度到 30',
      check: s => s.affinity >= 30 },
    { id: 'drink_30',    group: 'hut',    tier: 3, name: '老交情',     desc: '累计请哇鸥喝 30 杯',
      check: s => s.stats.drinks >= 30 },

    // ---- 见闻 ----
    { id: 'level_5',     group: 'roam',   tier: 1, name: '滇池老鸥',   desc: '达到 5 级',
      check: s => s.level >= 5 },
    { id: 'postcard_3',  group: 'roam',   tier: 1, name: '到此一游',   desc: '收集 3 张明信片',
      check: s => s.postcards.length >= 3 },
    { id: 'dress_3',     group: 'roam',   tier: 2, name: '会打扮了',   desc: '拥有 3 件装扮',
      check: s => s.cosmetics.length >= 3 },
    { id: 'codex_all',   group: 'roam',   tier: 3, name: '图鉴集齐',   desc: '九种食材全见过',
      check: s => Object.keys(FOODS).every(k => (s.codex[k] ?? 0) > 0) },
    { id: 'level_10',    group: 'roam',   tier: 3, name: '大坝名鸥',   desc: '达到 10 级',
      check: s => s.level >= 10 },
    { id: 'postcard_all',group: 'roam',   tier: 3, name: '走遍昆明',   desc: '集齐全部明信片',
      check: s => s.postcards.length >= POSTCARDS.length },
];

/** 全部瓶盖加起来有多少。装扮定价拿它当分母,别定到玩家永远买不齐。 */
export const TOTAL_CAPS = ACHIEVEMENTS.reduce((n, a) => n + CAP_VALUE[a.tier], 0);

/* ============================================================
   装扮:哇鸥戴的东西
   ============================================================ */

/**
 * 装扮。用瓶盖买,不用鸥币 —— 鸥币要留给摊位升级,两条线抢一个钱包的话,
 * 玩家买了帽子就升不了炉子,装扮会变成「明知道该忍住的浪费」。
 * 瓶盖只从成就来,于是「打扮」这件事的进度条就是成就本身。
 *
 * 两个槽位,一个槽只戴一件。做多了每件都被摊薄,不如少而认得出。
 * 素材和锚点在 tools/wear.py,五件各有两套图(小屋近景 / 大坝小图)。
 *
 * need 里的条件是「与」关系,空对象表示一开始就能买。
 * 门槛都挂在别的玩法上:花环要去过斗南花市、头巾要招够伙计、
 * 铃铛要和哇鸥处熟 —— 逼着玩家把三条线都碰一遍。
 */
export const SLOTS = { hat: '头上', neck: '脖子' };

export const COSMETICS = [
    { id: 'douli',    slot: 'hat',  name: '竹斗笠',   cost: 5,  need: {},
      note: '滇池边渔家戴的那种。下雨天真的挡雨,虽然它本来也不怕淋。' },
    { id: 'weijin',   slot: 'neck', name: '红围巾',   cost: 8,  need: {},
      note: '冬天鸥群回来的时候戴最应景。它自己说这叫「入乡随俗」。' },
    { id: 'huahuan',  slot: 'hat',  name: '鲜花环',   cost: 12, need: { postcard: 6 },
      note: '斗南花市凌晨扔下的碎花,它捡回来自己编的。戴一天就蔫。' },
    { id: 'lanhua',   slot: 'hat',  name: '蓝花头巾', cost: 18, need: { achievement: 'crew_3' },
      note: '扎染的靛蓝布,白点是扎起来没上到色的地方。伙计鸥送的。' },
    { id: 'tongling', slot: 'neck', name: '小铜铃',   cost: 25, need: { affinity: 30 },
      note: '它在屋里走动的时候会响。哇鸥说这样你就知道它没跑远。' },
];

/**
 * 摊位升级。四条线各管一件事,别互相重叠:
 *   炉子   出餐快    —— 在线收益的主轴
 *   招牌   卖得贵    —— 同样吃食材,赚得多
 *   货架   离线攒得久 —— 决定挂机上限
 *   保温箱 离线少亏   —— 决定离线打几折
 *
 * 成本走标准放置曲线 base × 1.5^(等级-1),等级越高越贵。
 * mul(lv) 返回该等级的系数,1 级一律是基准值。
 */
/**
 * 成本曲线在 2026-08-31 的数值体检之后整体上调过一轮。
 *
 * 之前整条线一共只要 22496 鸥币,休闲玩家第 4 天就买满了 ——
 * 之后二十多天的收入完全没有去处,放置游戏最核心的「赚 → 买 → 赚更快」
 * 那个圈,第一周就断掉了。现在底价 ×5、公比 1.5 → 1.62、上限各 +2,
 * 目标是把买满推到第二十天以后。
 *
 * 改这里之后**一定要跑 `node tools/sim.mjs`** —— 这条曲线不是拍脑袋能对的。
 */
export const UPGRADES = {
    stove:  { name: '炉子',   icon: 'stove',    desc: '出餐更快',
              max: 12, base: 60,   mul: lv => 1 + (lv - 1) * 0.24 },
    sign:   { name: '招牌',   icon: 'sign',     desc: '每份卖得更贵',
              max: 12, base: 90,   mul: lv => 1 + (lv - 1) * 0.15 },
    shelf:  { name: '货架',   icon: 'shelf', desc: '离线能攒更久',
              max: 10, base: 150,  mul: lv => 2 + (lv - 1) },          // 小时
    warmer: { name: '保温箱', icon: 'warmer',    desc: '离线少亏一点',
              max: 10, base: 200,  mul: lv => 0.40 + (lv - 1) * 0.05 },// 折扣
};

/** 升到下一级要多少钱。已满级返回 null。 */
export function upgradeCost(key, level) {
    const u = UPGRADES[key];
    if (!u || level >= u.max) return null;
    return Math.round(u.base * Math.pow(2.5, level - 1));
}

/**
 * 升到下一级还要几个瓶盖。**只有每条线最后三级要。**
 *
 * 瓶盖原来只有装扮一个去处 —— 一样只能换帽子的货币,拿到手也就那样。
 * 现在它管的是**每条升级线的最后三级**:前面九级鸥币能堆出来,
 * 最后三级堆不出来,得拿成就换。
 *
 * 「钱买不到的那一段」比「又一个数字」有意思:它把成就从一张清单
 * 变成了通往满级的必经之路,而且不用再往数值曲线上加一个无底洞。
 *
 * 供需要对得上:成就一共给 135 个瓶盖,装扮花掉 68,这四条线的
 * 最后三级(2+4+6)×4 = 48。剩 19 个富余,外加「换羽」事件偶尔掉一个。
 * **改这里之前先把这笔账重算一遍。**
 */
export function upgradeCaps(key, level) {
    const u = UPGRADES[key];
    if (!u || level >= u.max) return 0;
    const target = level + 1;
    const from = u.max - 2;                       // 最后三级从这级起
    return target < from ? 0 : (target - from + 1) * 2;   // 2 / 4 / 6
}

/** 摊位格子按等级解锁:1 级 1 格,3 级 2 格,6 级 3 格 */
export const STALL_SLOTS = [
    { slot: 1, levelReq: 1 },
    { slot: 2, levelReq: 3 },
    { slot: 3, levelReq: 6 },
];
export const slotsAt = level => STALL_SLOTS.filter(s => s.levelReq <= level).length;

/** 一格出一份的基准间隔(毫秒)。除以炉子系数就是实际间隔。 */
export const SERVE_MS = 45_000;

/**
 * 表演节目单。哇鸥不出去觅食的时候就在大坝上表演,路人看了会投喂 ——
 * **这是食材的被动来源**,补上「摊位一直吃、食材却只能手动囤」的缺口。
 *
 * 节目越多,围观的人越多,投喂越勤,给的东西也越杂。
 * 解锁条件刻意分散在等级/成就/明信片三处:让「去过的地方多」这件事
 * 真的有回报,而不只是图鉴上的一个格子。
 *
 * need 里的条件是「与」关系,空对象表示一开始就会。
 */
export const SHOWS = [
    { id: 'flap',   name: '扑棱翅膀',     need: {},                          pool: ['erkuai', 'potato'] },
    { id: 'beg',    name: '讨食的眼神',   need: { level: 2 },                pool: ['erkuai', 'potato', 'rice'] },
    { id: 'catch',  name: '空中接食',     need: { level: 3 },                pool: ['rice', 'douhua'] },
    { id: 'spin',   name: '原地转圈',     need: { achievement: 'cook_5' },   pool: ['douhua', 'chili'] },
    { id: 'tour',   name: '讲昆明见闻',   need: { postcards: 3 },            pool: ['chili', 'sugar'] },
    { id: 'dance',  name: '踩点跳舞',     need: { achievement: 'combo_20' }, pool: ['sugar', 'flower'] },
    { id: 'duet',   name: '和鸥群合唱',   need: { level: 6 },                pool: ['flower', 'rusan'] },
    { id: 'legend', name: '见手青的故事', need: { postcards: 6 },            pool: ['rusan', 'mushroom'] },
];

/** 一次投喂的基准间隔(毫秒)。节目越多越短。 */
export const SHOW_MS = 20_000;

/** 天气对围观人数的影响。下雨大坝上没人看。 */
export const SHOW_WEATHER = { sunny: 1.0, rainy: 0.5, foggy: 0.8 };

/* ============================================================
   小屋:哇鸥住的草棚,就在海埂大坝旁边的堤岸上
   ============================================================ */

/**
 * 一天里的时段。**全游戏只有这一个时钟** —— 大坝的天光和小屋开不开门
 * 都从这儿读,两边各算一套的话迟早对不上(之前就是)。
 *
 * 哇鸥在小屋的窗口:
 *   11:30 – 13:30   晌午回来歇脚(醒着)
 *   19:00 – 22:30   晚上待在屋里(醒着)
 *   22:30 – 05:30   睡着(能看,别吵)
 * 其余时间它都在大坝上 —— 那边有它的摊子和表演,小屋是空的。
 */
export const HOURS = {
    noon:    { name: '晌午', note: '哇鸥回草棚歇脚',   span: '11:30–13:30' },
    evening: { name: '晚上', note: '哇鸥在草棚里待着', span: '19:00–22:30' },
    night:   { name: '深夜', note: '哇鸥睡着了',       span: '22:30–05:30' },
};

const mins = d => d.getHours() * 60 + d.getMinutes();

/** 现在哇鸥在不在小屋。不在就是 null(它在大坝上)。 */
export function hourSlot(now = new Date()) {
    const m = mins(now);
    if (m >= 690 && m < 810) return 'noon';        // 11:30–13:30
    if (m >= 1140 && m < 1350) return 'evening';   // 19:00–22:30
    if (m >= 1350 || m < 330) return 'night';      // 22:30–次日 05:30
    return null;
}

/** 哇鸥此刻是不是在大坝上(摊位表演要靠它) */
export const onDam = (now = new Date()) => hourSlot(now) === null;

/**
 * 天光。和 hourSlot 分开是因为两者管的事不一样:
 * 前者管「哇鸥在哪」,这个管「画面什么颜色」——
 * 哇鸥 11:30 回屋,但天不会在 11:30 变暗。
 */
export function dayPhase(now = new Date()) {
    const m = mins(now);
    if (m >= 360 && m < 1050) return 'day';        // 06:00–17:30
    if (m >= 1050 && m < 1170) return 'dusk';      // 17:30–19:30
    return 'night';
}

/**
 * 海鸥一族的占卜。看天气,再看捡来那枚贝壳上的花纹 —— 一共只有八种结果。
 * 八种是硬上限:再多就成了随机文案,少了又转不出新鲜感。
 */
export const SHELL_MARKS = ['一道纹', '两道纹', '三道纹', '螺旋纹', '星点纹', '断口纹', '光面', '缺角'];

/**
 * 八种签。
 *
 * **不带任何数值效果。** 一个「大凶」真去砍掉当天的产出,玩家只会学会
 * 「凶了就今天别上线」—— 一个每日一次的仪式,不该变成开或不开游戏的理由。
 * 所以 tip 写成建议而不是加成:它指向的是玩法里本来就有的选择
 * (今天该屯还是该开摊、要不要多飞两趟),读起来像有用,实际不动数值。
 *
 *   name  签名,卡片上的大字
 *   text  一句话,哇鸥的口气
 *   long  卡片正文。要能单独成立 —— 卡片是要发出去给没玩过的人看的
 *   yi/ji 宜 / 忌。挑玩法里真实存在的动作,别写「宜出行」这种通用话
 */
export const FORTUNES = [
    { id: 0, name: '大吉 · 顺风',   text: '风会推着你走。今天飞多远都不累。',
      long: '西北风顺着湖面推过来,翅膀不用怎么使劲就往前送。这种天不多,一年到头也就那么几回。',
      yi: '出去觅食,飞远一点', ji: '窝着不动' },
    { id: 1, name: '吉 · 满仓',     text: '摊子上的东西卖得动,别舍不得摆。',
      long: '坝上人多,锅一开就有人凑过来。这种日子该把好菜摆出去,压在货架上不会自己变成钱。',
      yi: '把贵的菜摆上摊', ji: '囤着舍不得卖' },
    { id: 2, name: '小吉 · 有客',   text: '会有生人递东西给你吃。接着就是了。',
      long: '会有不认识的人蹲下来,把手里的东西掰一半给你。哇鸥说这种时候别躲,躲了人家下次就不给了。',
      yi: '在坝上多待会儿表演', ji: '一整天都在外面飞' },
    { id: 3, name: '平 · 无浪',     text: '什么都不会发生。这也挺好的。',
      long: '湖面平得像块玻璃,一整天没什么动静。哇鸥说这种日子最适合把该修的修了、该攒的攒了。',
      yi: '升级摊子', ji: '指望天上掉东西' },
    { id: 4, name: '平 · 起雾',     text: '看不清。但看不清不一定是坏事。',
      long: '水汽从湖心漫上来,对岸的西山只剩一道影子。看不清的时候,菌子反而长得旺。',
      yi: '进山找菌子', ji: '飞太远,认不得路' },
    { id: 5, name: '小凶 · 空爪',   text: '抓什么掉什么。少飞两趟,歇着。',
      long: '爪子不听使唤,眼看到嘴的东西一次次滑出去。哇鸥说这种日子它一般就不出门了,在棚里躺着。',
      yi: '回小屋喝杯茶', ji: '硬要连着飞' },
    { id: 6, name: '凶 · 逆风',     text: '别去太远。今天的湖面不认人。',
      long: '风从西山那边压下来,顶着飞一步退半步。滇池看着温和,起风的时候是不认人的。',
      yi: '守着摊子', ji: '往湖心去' },
    { id: 7, name: '大凶 · 见手青', text: '今天别碰菌子。真的。',
      long: '哇鸥不肯多说,只是把爪子背到身后。「反正今天别碰菌子。看见了也绕开走。」',
      yi: '吃点熟的', ji: '碰任何菌子' },
];

/** 天气各自的偏移,让同一枚贝壳在不同天气下转出不同结果 */
const WEATHER_SHIFT = { sunny: 0, rainy: 5, foggy: 3 };

/**
 * 占卜一次。天气 + 贝壳花纹 → 八分之一。
 * @param {string} weather
 * @param {number} mark 贝壳花纹的下标,0..7
 */
export function divine(weather, mark) {
    const i = (mark + (WEATHER_SHIFT[weather] ?? 0)) % FORTUNES.length;
    return { fortune: FORTUNES[i], mark: SHELL_MARKS[mark] };
}

/**
 * 每天上线随机得到一样,玩家带给哇鸥。
 * 云南是产咖啡的,普洱茶更不用说 —— 两样都是本地的。
 */
export const DRINKS = {
    puer:   { name: '普洱茶', icon: 'sugar',  give: '哇鸥抿了一口,眯起眼睛。「这个……有点像雨后的土。好喝。」', affinity: 3 },
    coffee: { name: '咖啡',   icon: 'erkuai', give: '哇鸥小口啜着。「保山来的?我尝得出来。」它精神了不少。', affinity: 3 },
};
export const DRINK_KEYS = Object.keys(DRINKS);

/* ============================================================
   季节 · 伙计鸥 · 图鉴
   ============================================================ */

/**
 * 季节。按真实月份走 —— 红嘴鸥每年 11 月到次年 3 月在昆明越冬,
 * 这是真事,不该让它变成一个游戏内的抽象计时器。
 *
 * 代价是夏天会冷清好几个月。这是**故意的**:冬天鸥群回来的时候
 * 才有那个「热闹起来了」的落差,一年到头都一样热闹就没有季节了。
 */
/**
 * 四季。`hireMul` 是招伙计鸥的价钱倍数。
 *
 * **原来非冬天是直接招不了**(canHire: false)。设定上没错 —— 鸥群冬天才来
 * 昆明 —— 但代价是**一年里七个月这套系统整个碰不到**:六只伙计、六个图标、
 * 六条被动,夏天打开游戏的人一样都看不着。对一个别人可能只玩一次的游戏
 * 来说,这个代价太大了。
 *
 * 改成加价:门不关死,但冬天依然是划算的时候。价钱按「鸥群离得多远」排 ——
 * 冬天它们就在坝上,秋天快回来了,春天刚飞走,夏天在西伯利亚。
 * 非冬天招人的说法是「托人捎信,让它提前飞回来一趟」。
 */
export const SEASONS = {
    winter: { name: '冬', note: '鸥群从西伯利亚来了,大坝上全是人', traffic: 1.4, rare: 1.0, hireMul: 1.0 },
    spring: { name: '春', note: '鸥群陆陆续续往北飞',               traffic: 1.0, rare: 1.0, hireMul: 2.0 },
    summer: { name: '夏', note: '雨季,菌子疯长,但游客少',           traffic: 0.8, rare: 2.0, hireMul: 2.5 },
    autumn: { name: '秋', note: '天高,等着鸥群回来',                 traffic: 1.1, rare: 1.2, hireMul: 1.5 },
};

/** 这一只这会儿要多少钱。非冬天要托人捎信,贵一截 */
export const hireCost = (crew, season) => Math.round(crew.cost * season.hireMul);

export function seasonOf(now = new Date()) {
    const m = now.getMonth() + 1;
    if (m >= 11 || m <= 3) return 'winter';
    if (m <= 5) return 'spring';
    if (m <= 8) return 'summer';
    return 'autumn';
}

/**
 * 伙计鸥。一只带一条被动。冬天鸥群在昆明,招人最便宜;别的季节也招得到,
 * 只是要托人捎信,价钱按季节翻(见 SEASONS.hireMul)。
 *
 * 每只只管一件事,不叠加同类效果 —— 六只各管各的,玩家一眼看得出该先招谁。
 * 招募条件卡在好感度上:得先和哇鸥处熟了,它才肯把亲戚介绍给你。
 */
export const CREW = [
    { id: 'huihui', name: '灰灰', cost: 400, icon: 'crew_huihui',  affinity: 6,
      effect: { stove: 0.20 }, desc: '出餐快 20%',
      line: '「我翅膀有力,颠锅归我。」' },
    { id: 'apang',  name: '阿胖', cost: 700, icon: 'crew_apang',  affinity: 12,
      effect: { price: 0.15 }, desc: '每份贵 15%',
      line: '「我认得出谁兜里有钱。」' },
    { id: 'xiaobai',name: '小白', cost: 1100, icon: 'crew_xiaobai', affinity: 20,
      effect: { show: 0.25 }, desc: '表演招人,投喂快 25%',
      line: '「我会翻跟头。真的。」' },
    { id: 'laoqiao',name: '老翘', cost: 1800, icon: 'crew_laoqiao', affinity: 30,
      effect: { haul: 1 },     desc: '每次觅食多带 1 个',
      line: '「飞了十二年,哪片水下面有什么我都记得。」' },
    { id: 'dundun', name: '墩墩', cost: 2600, icon: 'crew_dundun', affinity: 42,
      effect: { offline: 0.10 }, desc: '离线少亏 10%',
      line: '「你不在的时候,我看着摊子。」' },
    { id: 'yaya',   name: '丫丫', cost: 3800, icon: 'crew_yaya', affinity: 56,
      effect: { rare: 0.5 },   desc: '稀有食材多出 50%',
      line: '「菌子在哪儿,我闻得到。」' },
];

/** 招进来的伙计加总。没招人时全是 0。 */
export function crewBonus(hired = []) {
    const b = { stove: 0, price: 0, show: 0, haul: 0, offline: 0, rare: 0 };
    for (const c of CREW) {
        if (!hired.includes(c.id)) continue;
        for (const [k, v] of Object.entries(c.effect)) b[k] += v;
    }
    return b;
}

/** 图鉴里每样食材的来路,给玩家一条「去哪找」的线索 */
export const FOOD_SOURCE = {
    erkuai:   '觅食常见 · 表演也常收到',
    potato:   '觅食常见 · 表演也常收到',
    rice:     '觅食常见',
    douhua:   '觅食 · 表演',
    flower:   '表演(要先解锁「踩点跳舞」)',
    mushroom: '稀有 · 雨季翻倍 · 表演要 6 张明信片',
    rusan:    '稀有 · 表演要 6 张明信片',
    chili:    '觅食 · 表演',
    sugar:    '觅食 · 表演',
};

/* ============================================================
   新手引导
   ============================================================ */

/**
 * 开场引导。目标很具体:**让一个第一次打开的人在半分钟里看懂三条线怎么咬合** ——
 * 出去觅食囤材料 → 摊子自动吃材料出餐 → 不出去的时候在坝上表演,被投喂补材料。
 *
 * 这三条各自都不难懂,难的是它们是一个圈。九个页签一次铺开,
 * 没人会自己拼出这个圈来。
 *
 * **每一步靠 done() 判定,不靠「玩家点了哪个按钮」。**
 * 挂在按钮上的引导一旦玩家用别的路径达成(比如从大坝页直接跳摊子),
 * 就会卡在原地等一个永远不会来的点击。读状态则怎么绕都对。
 *
 *   done(s, ui)  返回 true 就进下一步;每次重绘都会跑,必须是纯读取
 *   tab          这一步该待在哪一页,用来高亮页签
 */
export const TUTORIAL = [
    {
        tab: 'dock',
        title: '先去坝上转一圈',
        text: '点「出发觅食」。拖着哇鸥飞,吃到的东西就是摊子的材料。',
        done: s => s.stats.flights >= 1,
    },
    {
        tab: 'cook',
        title: '把菜摆上',
        text: '材料带回来了。去「摊子」点一下空格子,选一道菜 —— 摆上之后它会自己出餐,你不用守着。',
        done: s => s.stalls.some(x => x.recipe),
    },
    {
        tab: 'cook',
        title: '等它出第一份',
        text: '摊子在自己算时间,关掉页面也照算(会打个折)。同时哇鸥没出去的时候会在坝上表演,路人投喂就是材料的被动来源 —— 这三件事是一个圈。',
        done: s => s.stats.served >= 1,
    },
    {
        tab: 'hut',
        title: '去小屋看看它',
        text: '中午和晚上哇鸥回堤岸边的草棚待着。那儿能占卜、下棋、请它喝一杯 —— 好感度高了才招得到伙计。',
        done: (s, ui) => ui.screen === 'hut',
    },
];

/** 走完引导给的见面礼。正好够买一顶斗笠 —— 顺手把「装扮」这条线也指出来。 */
export const TUTORIAL_GIFT = 5;

/* ============================================================
   折耳根
   ============================================================ */

/**
 * 折耳根 —— 常年游荡在海埂大坝的一只橘猫。梦想也是去冰岛,
 * 所以跟哇鸥一起在摊上打工。不上班的时候就摊在大坝上睡觉。
 *
 * 名字是云南人都懂的那个梗:折耳根(鱼腥草)是本地菜里最有争议的一味,
 * 爱的爱死恨的恨死 —— 拿来当一只谁都想撸又谁都撸不着的橘猫的名字正好。
 *
 * **开局就在,不用招。** 她是摊子的一部分,不是伙计鸥那套要花钱要好感度的
 * 系统 —— 那套是「你把生意做大了」,她是「一开始就有人陪着你」,两回事。
 *
 * 干的活:**站柜台**。做好的菜她会端给对的客人,但她是猫,慢。
 * 你自己动手总比她快 —— 她兜底,不抢活。
 */
export const HELPER = {
    name: '折耳根',
    /** 她隔多久端一盘出去(毫秒)。慢是故意的:她一快,玩家就没事干了 */
    serveMs: 7000,
    line: '「冰岛啊……听说那边海鸥也多。」',
};

/* ============================================================
   出摊:白天亲手做菜卖给游客
   ============================================================ */

/**
 * 出摊是**主动玩法**,和摊位自动出餐是两回事:
 *
 *   摊位自动出餐  你不在的时候也在卖,卖给大坝上溜达的野猫、麻雀、
 *                 其他海鸥 —— 它们不挑,给什么吃什么,所以价钱也低
 *   出摊          你亲手做,卖给真正来买的游客。人挑嘴、要等,
 *                 但一份能卖上价
 *
 * 这样两条线不打架:自动出餐是底,出摊是你愿意花时间就能拿到的上限。
 *
 * **只在白天出摊。** 哇鸥中午和晚上回小屋,晚上坝上也没人买 ——
 * 时段本身就是这个玩法的节制,不用再加「每天几次」的计数器。
 */

/**
 * 四件厨具。布局照着老爹快餐店那一路:订单在上、食谱在右、案台在中、烤箱在左下。
 *
 * 每件厨具管一类活,**别互相顶替** —— 玩家看一眼菜谱就知道该往哪儿拖:
 *
 *   board 砧板  切。快,不怕过火,是新手最先学会的一步
 *   pan   煎盘  煎。窗口窄,最考手速
 *   stove 灶台  炒和煮。中等
 *   oven  烤箱  烤和蒸。慢,但**窗口特别宽**,所以能一边烤一边干别的 ——
 *               「游客不在时提前做」靠的就是它
 */
export const TOOLS = {
    board: { name: '砧板', icon: 'board', spot: 'mid',  window: 0.60 },
    pan:   { name: '煎盘', icon: 'pan',   spot: 'mid',  window: 0.38 },
    stove: { name: '灶台', icon: 'wok',   spot: 'mid',  window: 0.48 },
    oven:  { name: '烤箱', icon: 'oven',  spot: 'left', window: 0.80 },
};

/**
 * 火候。**过头和不到家一样糟** —— 这是这个玩法唯一的手上功夫。
 *
 * 一步的进度条从 0 走到 1;`window` 是「刚好」那一段占的比例,贴着 1 结束。
 * 走过 1 就开始糊,`burnMs` 之后彻底焦。
 *
 * 三档而不是连续打分:连续分数玩家读不出来自己差在哪,
 * 三档是「生了 / 好了 / 焦了」,一眼知道下次该早点还是晚点。
 */
export const QUALITY = {
    raw:   { name: '还生着', mul: 0.45, color: '#8a99a3' },
    good:  { name: '刚好',   mul: 1.00, color: '#77b255' },
    burnt: { name: '焦了',   mul: 0.45, color: '#c14e33' },
};
export const BURN_MS = 5000;      // 过了火之后再等这么久就彻底焦

/**
 * 每道菜怎么做。一步 = **把某样食材拖到某件厨具上,再在火候窗口里端下来**。
 *
 * 步骤照着真做法写,不是随便凑的节奏:烧饵块先烤饵块再切辣椒配,
 * 见手青得下锅炒两遍(不炒透会看见小人,这个梗得留着)。
 * 玩家第一次做完一道菜,应该顺带知道了这道菜是怎么来的。
 */
export const RECIPE_STEPS = {
    shao_erkuai: [
        { ing: 'erkuai', tool: 'stove', ms: 3500, name: '烤饵块' },
        { ing: 'chili',  tool: 'board', ms: 1500, name: '切辣椒' },
    ],
    yangyu_baba: [
        { ing: 'potato', tool: 'board', ms: 1600, name: '切洋芋' },
        { ing: 'potato', tool: 'pan',   ms: 4000, name: '煎两面' },
    ],
    liangxia: [
        { ing: 'rice',  tool: 'stove', ms: 2500, name: '煮米浆' },
        { ing: 'sugar', tool: 'board', ms: 1200, name: '刨红糖' },
    ],
    douhua_mx: [
        { ing: 'rice',   tool: 'stove', ms: 3000, name: '烫米线' },
        { ing: 'douhua', tool: 'board', ms: 1500, name: '舀豆花' },
    ],
    xiaoguo_mx: [
        { ing: 'chili', tool: 'board', ms: 1500, name: '切小米辣' },
        { ing: 'rice',  tool: 'stove', ms: 5000, name: '小铜锅煮开' },
    ],
    kao_rusan: [
        { ing: 'rusan',  tool: 'pan',   ms: 3800, name: '架上去烤' },
        { ing: 'flower', tool: 'board', ms: 1500, name: '调玫瑰酱' },
    ],
    jianshouqing: [
        { ing: 'mushroom', tool: 'board', ms: 2000, name: '切片' },
        { ing: 'mushroom', tool: 'stove', ms: 5000, name: '大火炒' },
        { ing: 'mushroom', tool: 'stove', ms: 5000, name: '再炒一遍' },
    ],
    xianhua_bing: [
        { ing: 'flower', tool: 'board', ms: 2000, name: '剁鲜花馅' },
        { ing: 'erkuai', tool: 'oven',  ms: 11000, name: '进烤箱' },
    ],
    qiguoji: [
        { ing: 'potato',   tool: 'board', ms: 2000, name: '切配菜' },
        { ing: 'mushroom', tool: 'stove', ms: 4000, name: '爆香' },
        { ing: 'chili',    tool: 'oven',  ms: 16000, name: '上汽蒸' },
    ],
};

/**
 * 厨具升级。**花的是鸥币,和摊位那四条线分开** ——
 * 摊位那四条改的是「你不在的时候赚多少」,这四条改的是「你在的时候能多快」。
 * 两笔钱都从一个钱包出,但玩家心里分得清:一条是躺着赚,一条是站着赚。
 *
 *   slots  同时能做几份
 *   power  火力。时间按 1/power 缩短,窗口按比例跟着缩 —— 更快但不更容易
 */
export const KITCHEN = {
    board: { name: '砧板', desc: '切得更快、能同时切几样', base: 400,  max: 5 },
    pan:   { name: '煎盘', desc: '多一口煎盘、火更旺',      base: 900,  max: 5 },
    stove: { name: '灶台', desc: '多一个灶眼、火更旺',      base: 700,  max: 5 },
    oven:  { name: '烤箱', desc: '多一格、烤得更快',        base: 1500, max: 5 },
};

/** 第 lv 级要多少钱。满级返回 null */
export function kitchenCost(key, lv) {
    const k = KITCHEN[key];
    if (!k || lv >= k.max) return null;
    return Math.round(k.base * Math.pow(2.2, lv - 1));
}

/** 某件厨具在 lv 级时的格数和火力 */
export const toolSlots = lv => 1 + Math.floor((lv - 1) / 2);
export const toolPower = lv => 1 + (lv - 1) * 0.18;

/**
 * 一步最短要多久。**升级只能快到这儿为止。**
 *
 * 火力提高会把时长按 1/power 缩短,而「刚好」的窗口是时长的一个比例 ——
 * 于是升级同时把窗口也按比例缩掉了。满级之后最短的一步只有 0.7 秒,
 * 窗口 0.6 秒:**玩家花钱买到的是「更难点中」**,这是反过来的。
 * 一个休闲玩法里,升级该让人更轻松,不是更手忙脚乱。
 *
 * 到了这个下限之后,再升级换来的是**格子数**(能同时开几样),
 * 而不是继续压缩反应时间 —— 那才是「产能变大」该有的样子。
 */
export const MIN_STEP_MS = 1600;

/**
 * 「刚好」那一段最少要有多久(毫秒)。
 *
 * 光有 MIN_STEP_MS 还不够:一步 1.6 秒、煎盘的窗口占 38%,
 * 算下来「刚好」只有 1 秒出头。**同时开三四样的时候,这一秒是不够用的** ——
 * 手指还在拖上一样,这一锅就糊了。所以再兜一道绝对下限。
 */
export const GOOD_MIN_MS = 1800;

/**
 * 餐盘。纯外观 + 一点点加价 —— **加价必须小**,
 * 不然它就从「我喜欢这个花纹」变成「我不得不买这个花纹」。
 */
export const PLATES = {
    plain:  { name: '白瓷盘',   cost: 0,     bonus: 0,    tint: '#fffdf4' },
    blue:   { name: '青花盘',   cost: 3000,  bonus: 0.04, tint: '#62c4cc' },
    wood:   { name: '木托盘',   cost: 8000,  bonus: 0.07, tint: '#cf9862' },
    copper: { name: '紫铜盘',   cost: 20000, bonus: 0.10, tint: '#c14e33' },
};

export const SERVICE = {
    /** 亲手做的比自动出餐值钱多少。主动玩法总得有回报,不然没人愿意动手 */
    priceMul: 1.8,
    /** 出餐台最多放几份。放不下就不能再做了 —— 逼玩家去招呼客人,不是一直闷头做 */
    stockMax: 12,
    /** 游客隔多久来一个(毫秒)。招牌越好来得越勤 */
    comeMs: 9000,
    /** 一个游客最多等多久 */
    patienceMs: 42_000,
    /** 摊前最多站几个 */
    queueMax: 4,
    /**
     * 摊子开着的时段,给界面上那句话用。
     * **这串字是 serviceOpen() 的人话版本,改判断就得同时改它。**
     * 现在的判断是「哇鸥在大坝上」,也就是 HOURS 里三段回屋时间之外的时候。
     */
    span: '05:30–11:30 / 13:30–19:00',
};

/* ============================================================
   篆新市场:拿鸥币换材料
   ============================================================ */

/**
 * 进货。这是**鸥币唯一的第二个去处**,加它是为了修两个数值体检查出来的毛病:
 *
 *   1. 升级线买满之后鸥币无处可花 —— 现在它能换成材料
 *   2. 稀有材料是真瓶颈(第 30 天鲜花 1、菌子 106,而豆花 37025)
 *      —— 现在缺什么可以买什么
 *
 * **每天限量**,这是整个设计的关键。不限量的话稀有材料就变成纯粹用钱买,
 * 觅食和表演立刻都不用玩了 —— 那是拿一个洞去补另一个洞。
 * 限量之后市场是「补缺口」,不是「代替玩法」。
 *
 * 价格按稀有度拉开:普通的便宜到随便买,菌子贵到你会掂量一下。
 * 设定上是篆新农贸市场收摊的阿姨每天顺路来坝上摆一小摊 ——
 * 摆一小摊,所以东西就那么点。
 */
export const MARKET_LEVEL = 4;      // 4 级开门。太早开会盖掉前期觅食的存在感

export const MARKET = {
    erkuai:   { price: 8,   daily: 30 },
    potato:   { price: 8,   daily: 30 },
    rice:     { price: 10,  daily: 30 },
    douhua:   { price: 14,  daily: 24 },
    chili:    { price: 14,  daily: 24 },
    sugar:    { price: 18,  daily: 24 },
    flower:   { price: 60,  daily: 10 },
    rusan:    { price: 110, daily: 8 },
    mushroom: { price: 180, daily: 6 },
};

/* ============================================================
   大坝上的随机事件
   ============================================================ */

/**
 * 随机事件。哇鸥站在大坝上的时候,每隔一阵会撞上一件事。
 *
 * **只在大坝时间走**,和表演共用同一条判据(rules.js 的 damMsIn)——
 * 它人在小屋里,大坝上发生什么都跟它没关系。
 *
 * 三条约束,是为了让事件是「调味」而不是「主收入」:
 *   1. 一次的量都不大,抵不上一趟觅食
 *   2. 有好有坏。全是好事的话,事件就只是个慢速的自动奖励
 *   3. 离线也照常发生,但要打折并且封顶(见 rules.js 的 EVENT_OFFLINE_CAP),
 *      不然出门一趟回来是三十条日志
 *
 * when 是触发条件,全是「与」关系:
 *   weather 只在这种天气   season 只在这个季节   minLevel 等级门槛
 * effect 见 rules.js 的 applyEvent。
 */
export const EVENTS = [
    // ---- 常见:补点普通食材 ----
    { id: 'bread',  w: 10, name: '整包面包',
      text: '有人把一整包面包撕了往下撒,鸥群炸了锅。哇鸥抢到几块。',
      effect: { food: { erkuai: 2, potato: 1 } } },
    { id: 'boatrice', w: 8, name: '渔船靠岸',
      text: '渔船靠上来卸货,筐底漏下来一小把米。',
      effect: { food: { rice: 2 } } },
    { id: 'market', w: 7, name: '篆新的阿姨',
      text: '篆新市场收摊的阿姨路过,顺手把一把干辣椒撂在栏杆上。',
      effect: { food: { chili: 2 } } },
    { id: 'sugar',  w: 6, name: '甩掉的糖水',
      text: '有人喝剩半杯木瓜水倒在地上,红糖沉在底下,被它舔走了。',
      effect: { food: { sugar: 2 } } },

    // ---- 天气 / 季节限定 ----
    { id: 'mushroom', w: 7, name: '雨后一片菌子',
      text: '雨停了,堤边草里冒出一小片菌子。它挑了个看起来最不像有毒的。',
      when: { season: 'summer' }, effect: { food: { mushroom: 2 } } },
    { id: 'fog', w: 5, name: '大雾里的乳扇',
      text: '雾大得看不见对岸。有人摸黑把一袋乳扇落在长椅上了。',
      when: { weather: 'foggy' }, effect: { food: { rusan: 1 } } },
    { id: 'flowers', w: 5, name: '花车漏的',
      text: '斗南来的花车过坝,颠下来一小捧,还是新鲜的。',
      when: { season: 'winter' }, effect: { food: { flower: 3 } } },
    { id: 'kinfolk', w: 6, name: '老乡鸥',
      text: '一只从西伯利亚一起飞来的老乡落在旁边,叽咕了半天才走。',
      when: { season: 'winter' }, effect: { affinity: 2 } },

    // ---- 给钱 / 给别的 ----
    { id: 'photo', w: 8, name: '蹲了一下午的摄影师',
      text: '有人举着长镜头蹲了一下午,临走往罐子里塞了几块钱。',
      when: { weather: 'sunny' }, effect: { coins: 12 } },
    { id: 'student', w: 6, name: '来写生的学生',
      text: '云大的学生支着画板画它,画完把画举给它看。它假装看懂了。',
      effect: { coins: 8, affinity: 1 } },
    { id: 'moult', w: 3, name: '换羽',
      text: '它抖了抖翅膀,掉下来一根还算完整的瓶盖。',
      effect: { caps: 1 } },
    { id: 'shell', w: 4, name: '奇怪的贝壳',
      text: '浪打上来一枚花纹没见过的贝壳。「这个……可以再算一卦。」',
      effect: { resetFortune: true } },
    { id: 'card', w: 3, name: '吹来的明信片',
      text: '风把一张明信片贴到它脚边,边角还带着水印。',
      when: { minLevel: 3 }, effect: { postcard: true } },
    { id: 'toolbox', w: 4, name: '游客落下的东西',
      text: '长椅上落了个塑料袋,里面装着些说不上用处的小玩意。',
      effect: { item: true } },

    // ---- 坏事 ----
    { id: 'kid', w: 7, name: '追鸥的小孩',
      text: '一个小孩举着面包追着鸥群跑,围观的人一哄而散,节目演不下去了。',
      effect: { stopShow: true } },
    { id: 'patrol', w: 5, name: '来巡的人',
      text: '有人来查摊子,它把锅一盖装作没营业。等人走了,汤都凉了。',
      effect: { stopStall: true } },
    { id: 'storm', w: 5, name: '说下就下',
      text: '雷阵雨说来就来,坝上一下子空了。它躲在栏杆底下等雨停。',
      when: { weather: 'rainy' }, effect: { stopShow: true } },
    { id: 'quiet', w: 6, name: '没什么人',
      text: '大坝上空荡荡的,它对着水面站了很久。',
      when: { season: 'summer' }, effect: {} },
];

export const ITEMS = {
    shield: { name: '护盾', icon: 'shield', desc: '挡下一次撞击' },
    magnet: { name: '磁铁', icon: 'magnet', desc: '吸附附近食材' },
    double: { name: '双倍', icon: 'double', desc: '本局得分翻倍' },
};

/**
 * 天气。昆明四季如春,但雨季(6–10 月)雷阵雨说来就来,
 * 早晨滇池上常起水汽 —— 所以是「晴 / 雨 / 雾」而不是海边那套。
 */
export const WEATHER = {
    sunny: { name: '晴天', icon: 'sun',  speed: 1.0, note: '风平浪静' },
    rainy: { name: '雨天', icon: 'rain', speed: 1.3, note: '雷阵雨,风大障碍多' },
    foggy: { name: '水汽', icon: 'fog',  speed: 0.9, note: '看不清,但菌子多' },
};

/** 订单模板。接单时从这里随机抽。 */
// ORDER_TEMPLATES 删了 —— 订单和出摊是同一件事的两种写法,见 v9→v10 迁移。


export const CHAT_NODES = [
    { id: 0, bot: '哇——!我是哇鸥。去年冬天跟着大部队从西伯利亚飞过来的,春天它们都回去了,我没走。',
      options: [{ text: '为什么不回去?', next: 1 }, { text: '你在这儿干嘛?', next: 2 }, { text: '这边有什么好吃的?', next: 3 }] },
    { id: 1, bot: '路太远啦,而且……这边有烧饵块。你吃过没有?外面烤得脆脆的,里面软的,刷上酱,还能卷根油条。',
      options: [{ text: '就为了这个?', next: 4 }, { text: '听起来是挺香', next: 5 }] },
    { id: 2, bot: '在海埂大坝支了个小摊。你们人类喂了我们这么多年,总得回请一次吧。',
      options: [{ text: '生意怎么样?', next: 6 }, { text: '海鸥开店?', next: 7 },
                { text: '就你一个人?', next: 10 }] },
    { id: 3, bot: '多了去了。豆花米线、洋芋粑粑、鲜花饼……夏天还有米凉虾,红糖水里浮着一条条的,冰冰凉。',
      options: [{ text: '菌子呢?', next: 8 }, { text: '鲜花还能做饼?', next: 9 }] },
    { id: 4, bot: '嘿嘿,也不全是。这边冬天不冷,湖面不结冰,晒得到太阳。西伯利亚那边……你懂的。',
      options: [{ text: '也是', next: 0 }, { text: '你挺会挑地方', next: 0 }] },
    { id: 5, bot: '那下次一起去篆新买饵块!早上七点去最好,刚做出来的还烫手。',
      options: [{ text: '一言为定', next: 0 }, { text: '七点太早了', next: 0 }] },
    { id: 6, bot: '还行吧。冬天亲戚们都来了,大坝上全是人,生意最好。夏天它们一走,就我一个守着摊子。',
      options: [{ text: '那不是很孤单', next: 10 }, { text: '夏天卖点凉的', next: 0 }] },
    { id: 7, bot: '怎么不行?我翅膀短是短了点,颠锅是颠不动,但收钱很在行。',
      options: [{ text: '厉害', next: 0 }, { text: '让我看看你颠锅', next: 0 }] },
    { id: 8, bot: '菌子!雨季才有。不过见手青得炒熟透了才行,不然……会看见小人。我见过一次,它们排队买我的饵块。',
      options: [{ text: '那不是挺好', next: 0 }, { text: '你还是炒熟吧', next: 0 }] },
    { id: 9, bot: '能啊,斗南拉来的玫瑰,揉进馅里。整个昆明的花都从那儿走,凌晨三点最热闹,比白天还挤。',
      options: [{ text: '想去看看', next: 0 }, { text: '花市凌晨开?', next: 0 }] },

    // 折耳根从这儿露名字。**玩家能看见她睡在坝上、站在柜台后面,
    // 却一直没处知道她叫什么** —— 一个有名字的角色和一只路过的猫,差别就在这。
    // 两条路都通到 10:问「就你一个人?」,或者顺着「那不是很孤单」问下去。
    { id: 10, bot: '不是。还有折耳根 —— 一只橘猫,常年在坝上晃。上班的时候她站柜台,'
                 + '不上班就摊在棚子里睡,叫都叫不醒。',
      options: [{ text: '折耳根?这名字……', next: 11 }, { text: '猫怎么会来打工', next: 12 }] },
    { id: 11, bot: '云南人一听就懂的那个梗。爱的爱死,恨的恨死,中间没有人。'
                 + '她说这样别人一次就记得住她。',
      options: [{ text: '确实记住了', next: 0 }, { text: '那你喜欢吃吗', next: 13 }] },
    { id: 12, bot: '她也想去冰岛。她说那边海鸥多、鱼也多;我说那边冷,她说她有毛。'
                 + '所以我们俩现在一起攒钱。',
      options: [{ text: '一起攒?', next: 0 }, { text: '猫怕冷吧', next: 0 }] },
    { id: 13, bot: '……我是鸟,我吃鱼。这个问题下次再说。',
      options: [{ text: '躲什么', next: 0 }, { text: '好吧', next: 0 }] },
];

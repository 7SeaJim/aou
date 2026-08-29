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
    { id: 'shao_erkuai', name: '烧饵块',   icon: 'erkuai',   cost: { erkuai: 2, chili: 1 },                reward: 10, levelReq: 1 },
    { id: 'yangyu_baba', name: '洋芋粑粑', icon: 'potato',   cost: { potato: 3 },                          reward: 12, levelReq: 1 },
    { id: 'liangxia',    name: '米凉虾',   icon: 'sugar',    cost: { rice: 2, sugar: 1 },                  reward: 18, levelReq: 2 },
    { id: 'douhua_mx',   name: '豆花米线', icon: 'douhua',   cost: { rice: 2, douhua: 2 },                 reward: 22, levelReq: 2 },
    { id: 'xiaoguo_mx',  name: '小锅米线', icon: 'chili',    cost: { rice: 3, chili: 2 },                  reward: 28, levelReq: 3 },
    { id: 'xianhua_bing',name: '鲜花饼',   icon: 'flower',   cost: { flower: 3, erkuai: 1 },               reward: 32, levelReq: 3 },
    { id: 'kao_rusan',   name: '烤乳扇',   icon: 'rusan',    cost: { rusan: 2, flower: 1 },                reward: 38, levelReq: 4 },
    { id: 'jianshouqing',name: '见手青',   icon: 'mushroom', cost: { mushroom: 3 },                        reward: 60, levelReq: 4 },
    { id: 'qiguoji',     name: '汽锅鸡',   icon: 'mushroom', cost: { mushroom: 2, chili: 2, potato: 2 },   reward: 70, levelReq: 5 },
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

export const ACHIEVEMENTS = [
    { id: 'first_fly',   name: '初次觅食',     desc: '完成第一次觅食',   check: s => s.totalScore >= 5 },
    { id: 'collect_50',  name: '会捡了',       desc: '累计得分 50',      check: s => s.totalScore >= 50 },
    { id: 'cook_5',      name: '小摊主',       desc: '完成 5 个订单',    check: s => s.completedOrders >= 5 },
    { id: 'rich_100',    name: '攒下第一笔',   desc: '拥有 100 欧币',    check: s => s.coins >= 100 },
    { id: 'postcard_3',  name: '到此一游',     desc: '收集 3 张明信片',  check: s => s.postcards.length >= 3 },
    { id: 'level_5',     name: '滇池老鸥',     desc: '达到 5 级',        check: s => s.level >= 5 },
    { id: 'combo_20',    name: '手不抖',       desc: '达成 20 连击',     check: s => s.maxCombo >= 20 },
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
export const UPGRADES = {
    stove:  { name: '炉子',   icon: 'chili',    desc: '出餐更快',
              max: 10, base: 60,  mul: lv => 1 + (lv - 1) * 0.28 },
    sign:   { name: '招牌',   icon: 'shop',     desc: '每份卖得更贵',
              max: 10, base: 90,  mul: lv => 1 + (lv - 1) * 0.18 },
    shelf:  { name: '货架',   icon: 'backpack', desc: '离线能攒更久',
              max: 8,  base: 150, mul: lv => 2 + (lv - 1) },          // 小时
    warmer: { name: '保温箱', icon: 'sugar',    desc: '离线少亏一点',
              max: 8,  base: 200, mul: lv => 0.40 + (lv - 1) * 0.05 },// 折扣
};

/** 升到下一级要多少钱。已满级返回 null。 */
export function upgradeCost(key, level) {
    const u = UPGRADES[key];
    if (!u || level >= u.max) return null;
    return Math.round(u.base * Math.pow(1.5, level - 1));
}

/** 摊位格子按等级解锁:1 级 1 格,3 级 2 格,6 级 3 格 */
export const STALL_SLOTS = [
    { slot: 1, levelReq: 1 },
    { slot: 2, levelReq: 3 },
    { slot: 3, levelReq: 6 },
];
export const slotsAt = level => STALL_SLOTS.filter(s => s.levelReq <= level).length;

/** 一格出一份的基准间隔(毫秒)。除以炉子系数就是实际间隔。 */
export const SERVE_MS = 24_000;

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

export const FORTUNES = [
    { id: 0, name: '大吉 · 顺风',   text: '风会推着你走。今天飞多远都不累。' },
    { id: 1, name: '吉 · 满仓',     text: '摊子上的东西卖得动,别舍不得摆。' },
    { id: 2, name: '小吉 · 有客',   text: '会有生人递东西给你吃。接着就是了。' },
    { id: 3, name: '平 · 无浪',     text: '什么都不会发生。这也挺好的。' },
    { id: 4, name: '平 · 起雾',     text: '看不清。但看不清不一定是坏事。' },
    { id: 5, name: '小凶 · 空爪',   text: '抓什么掉什么。少飞两趟,歇着。' },
    { id: 6, name: '凶 · 逆风',     text: '别去太远。今天的湖面不认人。' },
    { id: 7, name: '大凶 · 见手青', text: '今天别碰菌子。真的。' },
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
export const SEASONS = {
    winter: { name: '冬', note: '鸥群从西伯利亚来了,大坝上全是人', traffic: 1.4, rare: 1.0, canHire: true },
    spring: { name: '春', note: '鸥群陆陆续续往北飞',               traffic: 1.0, rare: 1.0, canHire: false },
    summer: { name: '夏', note: '雨季,菌子疯长,但游客少',           traffic: 0.8, rare: 2.0, canHire: false },
    autumn: { name: '秋', note: '天高,等着鸥群回来',                 traffic: 1.1, rare: 1.2, canHire: false },
};

export function seasonOf(now = new Date()) {
    const m = now.getMonth() + 1;
    if (m >= 11 || m <= 3) return 'winter';
    if (m <= 5) return 'spring';
    if (m <= 8) return 'summer';
    return 'autumn';
}

/**
 * 伙计鸥。冬天鸥群回来时可以招募,一只带一条被动。
 *
 * 每只只管一件事,不叠加同类效果 —— 六只各管各的,玩家一眼看得出该先招谁。
 * 招募条件卡在好感度上:得先和哇鸥处熟了,它才肯把亲戚介绍给你。
 */
export const CREW = [
    { id: 'huihui', name: '灰灰', cost: 400,  affinity: 6,
      effect: { stove: 0.20 }, desc: '出餐快 20%',
      line: '「我翅膀有力,颠锅归我。」' },
    { id: 'apang',  name: '阿胖', cost: 700,  affinity: 12,
      effect: { price: 0.15 }, desc: '每份贵 15%',
      line: '「我认得出谁兜里有钱。」' },
    { id: 'xiaobai',name: '小白', cost: 1100, affinity: 20,
      effect: { show: 0.25 }, desc: '表演招人,投喂快 25%',
      line: '「我会翻跟头。真的。」' },
    { id: 'laoqiao',name: '老翘', cost: 1800, affinity: 30,
      effect: { haul: 1 },     desc: '每次觅食多带 1 个',
      line: '「飞了十二年,哪片水下面有什么我都记得。」' },
    { id: 'dundun', name: '墩墩', cost: 2600, affinity: 42,
      effect: { offline: 0.10 }, desc: '离线少亏 10%',
      line: '「你不在的时候,我看着摊子。」' },
    { id: 'yaya',   name: '丫丫', cost: 3800, affinity: 56,
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
export const ORDER_TEMPLATES = [
    { name: '早点摊常客', reward: 18, need: { erkuai: 3 } },
    { name: '一碗米线',   reward: 30, need: { rice: 2, douhua: 1 } },
    { name: '洋芋管够',   reward: 22, need: { potato: 4 } },
    { name: '带盒鲜花饼', reward: 35, need: { flower: 3, erkuai: 1 } },
    { name: '来点辣的',   reward: 26, need: { chili: 3, potato: 2 } },
];

export const CHAT_NODES = [
    { id: 0, bot: '哇——!我是哇鸥。去年冬天跟着大部队从西伯利亚飞过来的,春天它们都回去了,我没走。',
      options: [{ text: '为什么不回去?', next: 1 }, { text: '你在这儿干嘛?', next: 2 }, { text: '这边有什么好吃的?', next: 3 }] },
    { id: 1, bot: '路太远啦,而且……这边有烧饵块。你吃过没有?外面烤得脆脆的,里面软的,刷上酱,还能卷根油条。',
      options: [{ text: '就为了这个?', next: 4 }, { text: '听起来是挺香', next: 5 }] },
    { id: 2, bot: '在海埂大坝支了个小摊。你们人类喂了我们这么多年,总得回请一次吧。',
      options: [{ text: '生意怎么样?', next: 6 }, { text: '海鸥开店?', next: 7 }] },
    { id: 3, bot: '多了去了。豆花米线、洋芋粑粑、鲜花饼……夏天还有米凉虾,红糖水里浮着一条条的,冰冰凉。',
      options: [{ text: '菌子呢?', next: 8 }, { text: '鲜花还能做饼?', next: 9 }] },
    { id: 4, bot: '嘿嘿,也不全是。这边冬天不冷,湖面不结冰,晒得到太阳。西伯利亚那边……你懂的。',
      options: [{ text: '也是', next: 0 }, { text: '你挺会挑地方', next: 0 }] },
    { id: 5, bot: '那下次一起去篆新买饵块!早上七点去最好,刚做出来的还烫手。',
      options: [{ text: '一言为定', next: 0 }, { text: '七点太早了', next: 0 }] },
    { id: 6, bot: '还行吧。冬天亲戚们都来了,大坝上全是人,生意最好。夏天它们一走,就我一个守着摊子。',
      options: [{ text: '那不是很孤单', next: 0 }, { text: '夏天卖点凉的', next: 0 }] },
    { id: 7, bot: '怎么不行?我翅膀短是短了点,颠锅是颠不动,但收钱很在行。',
      options: [{ text: '厉害', next: 0 }, { text: '让我看看你颠锅', next: 0 }] },
    { id: 8, bot: '菌子!雨季才有。不过见手青得炒熟透了才行,不然……会看见小人。我见过一次,它们排队买我的饵块。',
      options: [{ text: '那不是挺好', next: 0 }, { text: '你还是炒熟吧', next: 0 }] },
    { id: 9, bot: '能啊,斗南拉来的玫瑰,揉进馅里。整个昆明的花都从那儿走,凌晨三点最热闹,比白天还挤。',
      options: [{ text: '想去看看', next: 0 }, { text: '花市凌晨开?', next: 0 }] },
];

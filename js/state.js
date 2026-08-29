/**
 * 存档结构、默认值与版本迁移。
 *
 * 存档只放「玩家进度」,不放图鉴、食谱这类静态目录 —— 那些在 data.js 里。
 * 好处:改目录不用写迁移,存档也更小(存档码是要玩家复制的)。
 */

export const SAVE_VERSION = 6;

// 食材的键。改这里要同步 data.js 的 FOODS,并且 SAVE_VERSION +1 补一条迁移 ——
// 这些键是 backpack 的字段名,直接进存档。
export const FOOD_KEYS = [
    'erkuai', 'potato', 'rice', 'douhua', 'flower', 'mushroom', 'rusan', 'chili', 'sugar',
];
export const ITEM_KEYS = ['shield', 'magnet', 'double'];
export const UPGRADE_KEYS = ['stove', 'sign', 'shelf', 'warmer'];

export const DAILY_TRIES = 5;

export function createInitialState() {
    return {
        version: SAVE_VERSION,
        coins: 0,
        level: 1,
        exp: 0,
        expNext: 10,
        totalScore: 0,
        maxCombo: 0,
        backpack: { erkuai: 2, potato: 2, rice: 1, douhua: 1, flower: 0, mushroom: 0, rusan: 0, chili: 1, sugar: 0 },
        items: { shield: 0, magnet: 0, double: 0 },
        postcards: [],            // 已获得的明信片 id
        achievements: [],         // 已达成的成就 id
        unlockedRecipes: ['shao_erkuai'],
        orders: [],
        completedOrders: 0,
        dailyTries: DAILY_TRIES,
        lastDate: '',
        weather: 'sunny',
        weatherAt: 0,
        chatNode: 0,

        // ---- 放置玩法 ----
        /** 上次在线时刻。离线产出全靠它算,所以每次存盘都要刷新。 */
        lastSeen: Date.now(),
        /** 摊位格子。ms 是这一格攒了多久还没出餐,留着余数才不会每次 tick 丢时间。 */
        stalls: [{ recipe: null, ms: 0 }],
        upgrades: { stove: 1, sign: 1, shelf: 1, warmer: 1 },
        /** 表演攒了多久还没被投喂。和摊位的 ms 一样,留余数才不会每 tick 丢时间。 */
        showMs: 0,

        // ---- 小屋 ----
        /** 好感度。喝茶喝咖啡、下棋都会涨。 */
        affinity: 0,
        /** 今天手上这杯。每天上线随机给一样,送出去就没了。 */
        drink: null,
        drinkDate: '',
        /** 今日占卜。一天一次,记下来是为了在别处也能显示今日运势。 */
        fortune: null,
        fortuneMark: '',
        fortuneDate: '',
        /** 四子棋战绩 */
        c4: { win: 0, lose: 0, draw: 0 },

        // ---- 养成 ----
        /** 招进来的伙计鸥 id */
        crew: [],
        /** 图鉴:每样食材**累计**见过多少个。花掉了也不减 —— 图鉴记的是见闻,不是库存。 */
        codex: {},
    };
}

/* ---------- 迁移 ---------- */

/**
 * migrations[n] 把 v(n) 的存档升到 v(n+1)。
 * 加字段时:SAVE_VERSION +1,并在这里补一条。不要再用 `if (!x) x = 默认值`
 * 那种 falsy 判断 —— 字段真值为 0 或 '' 时会被误判成缺失。
 */
const migrations = {
    // v5 -> v6:加伙计鸥和食材图鉴。只添字段。
    5(old) {
        // 图鉴按背包里现有的东西开个底 —— 手上有的,显然是见过的。
        // 不开底的话老玩家升上来是一本空图鉴,看着像坏了。
        const codex = {};
        for (const [k, v] of Object.entries(old.backpack ?? {})) {
            if (Number.isFinite(v) && v > 0) codex[k] = v;
        }
        return { ...old, version: 6, crew: [], codex };
    },

    // v4 -> v5:加小屋(占卜 / 四子棋 / 请喝茶)。只添字段。
    4(old) {
        return {
            ...old,
            version: 5,
            affinity: 0,
            drink: null, drinkDate: '',
            fortune: null, fortuneMark: '', fortuneDate: '',
            c4: { win: 0, lose: 0, draw: 0 },
        };
    },

    // v3 -> v4:加表演玩法。只添一个计时字段。
    3(old) {
        return { ...old, version: 4, showMs: 0 };
    },

    // v2 -> v3:加放置玩法。只添字段,老档的东西一样不动。
    2(old) {
        return {
            ...old,
            version: 3,
            // 老档没有 lastSeen。给「现在」而不是 0 —— 给 0 的话第一次进来
            // 会按「离线了 56 年」结算,直接把上限撸满。
            lastSeen: Date.now(),
            stalls: [{ recipe: null, ms: 0 }],
            upgrades: { stove: 1, sign: 1, shelf: 1, warmer: 1 },
        };
    },

    // v1 -> v2:海边换成滇池,食材和食谱全换了名字。
    // 老档的 backpack 键(fries/burger/…)在新版里不存在,不迁移的话
    // 玩家攒的东西会连同背包一起消失,而 normalize() 只会默默补 0。
    1(old) {
        const s = { ...old, version: 2 };

        // 一对一换名。数量原样带过来 —— 玩家攒的就是玩家的。
        const FOOD_MAP = {
            fries: 'potato',      // 炸薯条 -> 洋芋,最接近的一个
            burger: 'erkuai',     // 主食换主食
            fish: 'rice',
            shell: 'douhua',
            seaweed: 'chili',
            egg: 'sugar',
            bread: 'erkuai',      // 也并进饵块,所以下面要用加法
        };
        const bag = {};
        for (const k of FOOD_KEYS) bag[k] = 0;
        for (const [oldKey, newKey] of Object.entries(FOOD_MAP)) {
            const n = Number(old.backpack?.[oldKey]);
            if (Number.isFinite(n) && n > 0) bag[newKey] += n;   // 两个旧键并到一个新键,得累加
        }
        s.backpack = bag;

        const RECIPE_MAP = {
            fries: 'shao_erkuai', salad: 'xiaoguo_mx', fishburger: 'douhua_mx',
            shell_soup: 'liangxia', egg_burger: 'yangyu_baba', seafood: 'qiguoji',
        };
        s.unlockedRecipes = [...new Set(
            (Array.isArray(old.unlockedRecipes) ? old.unlockedRecipes : [])
                .map(id => RECIPE_MAP[id] ?? id)
        )];

        // 明信片全换了内容,旧 id 对不上新地标,清空重收。
        // 成就 id 没变,留着。
        s.postcards = [];
        s.orders = [];        // 订单里存着旧食材的 need,留着会变成永远交不掉的单
        return s;
    },

    // v0 = template/index.html 时代的旧档(没有 version 字段)
    0(old) {
        // 注意:这里刻意不用 createInitialState() 和 FOOD_KEYS ——
        // 它们跟着最新版本走,而这一步的产物必须是 **v1 形状**,好让 migrations[1] 认得。
        // 用当前常量的话,v0 老档的背包会在这一步就被清零,下一步再也捞不回来。
        // 迁移函数只能依赖写死的、当时的字段表。
        const s = { version: 1, backpack: {}, items: {}, postcards: [], achievements: [],
                    unlockedRecipes: ['fries'], orders: [], chatNode: 0 };
        const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

        s.coins = num(old.coins, 0);
        s.level = num(old.level, 1);
        s.exp = num(old.exp, 0);
        s.expNext = num(old.expNext, 10);
        s.totalScore = num(old.totalScore, 0);
        s.maxCombo = num(old.maxCombo, 0);
        s.completedOrders = num(old.completedOrders, 0);
        s.dailyTries = num(old.dailyTries, DAILY_TRIES);
        s.lastDate = typeof old.lastDate === 'string' ? old.lastDate : '';
        s.weather = old.weather || 'sunny';
        s.weatherAt = num(old.weatherTimer, 0);   // 旧名 weatherTimer
        s.chatNode = num(old.chatTree, 0);        // 旧名 chatTree

        // v1 时代的食材键,写死在这儿
        for (const k of ['fries', 'burger', 'fish', 'shell', 'seaweed', 'egg', 'bread']) {
            s.backpack[k] = num(old.backpack?.[k], 0);
        }
        for (const k of ['shield', 'magnet', 'double']) s.items[k] = num(old.items?.[k], 0);

        // 旧档存的是完整明信片对象数组,现在只存已获得的 id
        if (Array.isArray(old.postcards)) {
            s.postcards = old.postcards
                .filter(p => p && p.obtained)
                .map(p => p.id)
                .filter(id => typeof id === 'number');
        }
        if (Array.isArray(old.achievements)) s.achievements = old.achievements.slice();
        if (Array.isArray(old.unlockedRecipes)) s.unlockedRecipes = old.unlockedRecipes.slice();
        if (Array.isArray(old.orders)) s.orders = old.orders.slice();

        s.version = 1;
        return s;
    },
};

/** 把任意版本的存档升到当前版本。无法识别时返回 null,由调用方决定是否开新档。 */
export function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;

    let s = raw;
    let v = typeof s.version === 'number' ? s.version : 0;

    while (v < SAVE_VERSION) {
        const step = migrations[v];
        if (!step) return null;              // 版本断链,宁可判定失败也别静默丢数据
        s = step(s);
        v = s.version;
    }
    if (v > SAVE_VERSION) return null;       // 来自更新的版本,当前代码看不懂

    return normalize(s);
}

/** 补齐可能缺失的字段并夹紧数值,防止手改存档码把游戏搞崩 */
function normalize(s) {
    const base = createInitialState();
    const out = { ...base, ...s, version: SAVE_VERSION };

    out.backpack = { ...base.backpack, ...(s.backpack || {}) };
    out.items = { ...base.items, ...(s.items || {}) };

    for (const k of FOOD_KEYS) out.backpack[k] = clampInt(out.backpack[k], 0, 9999);
    for (const k of ITEM_KEYS) out.items[k] = clampInt(out.items[k], 0, 99);

    out.coins = clampInt(out.coins, 0, 9_999_999);
    out.level = clampInt(out.level, 1, 999);
    out.exp = clampInt(out.exp, 0, 9_999_999);
    out.expNext = clampInt(out.expNext, 1, 9_999_999);
    out.totalScore = clampInt(out.totalScore, 0, 9_999_999);
    out.maxCombo = clampInt(out.maxCombo, 0, 99_999);
    out.completedOrders = clampInt(out.completedOrders, 0, 999_999);
    out.dailyTries = clampInt(out.dailyTries, 0, DAILY_TRIES);

    out.postcards = uniq(asArray(out.postcards).filter(n => Number.isInteger(n)));
    out.achievements = uniq(asArray(out.achievements).filter(x => typeof x === 'string'));
    out.unlockedRecipes = uniq(asArray(out.unlockedRecipes).filter(x => typeof x === 'string'));
    // 第一道菜必须是开着的,否则新手卡死在「什么都做不了」
    if (!out.unlockedRecipes.includes('shao_erkuai')) out.unlockedRecipes.unshift('shao_erkuai');
    out.orders = asArray(out.orders).filter(o => o && typeof o === 'object').slice(0, 8);

    // ---- 放置字段 ----
    // lastSeen 夹在 [很久以前, 现在]:存档码是玩家可改的,
    // 填个未来时间会让离线结算算出负数,填个 0 会直接撸满上限。
    const now = Date.now();
    const seen = Math.floor(Number(out.lastSeen));
    out.lastSeen = Number.isFinite(seen) ? Math.min(Math.max(seen, now - 30 * 86400_000), now) : now;

    out.upgrades = { ...base.upgrades, ...(out.upgrades || {}) };
    for (const k of UPGRADE_KEYS) out.upgrades[k] = clampInt(out.upgrades[k], 1, 20);

    out.showMs = clampInt(out.showMs, 0, 10 * 60_000);

    out.affinity = clampInt(out.affinity, 0, 9999);
    out.drink = typeof out.drink === 'string' ? out.drink : null;
    out.drinkDate = typeof out.drinkDate === 'string' ? out.drinkDate : '';
    out.fortune = Number.isInteger(out.fortune) && out.fortune >= 0 && out.fortune < 8
        ? out.fortune : null;
    out.fortuneMark = typeof out.fortuneMark === 'string' ? out.fortuneMark : '';
    out.fortuneDate = typeof out.fortuneDate === 'string' ? out.fortuneDate : '';
    out.crew = uniq(asArray(out.crew).filter(x => typeof x === 'string')).slice(0, 20);
    out.codex = (() => {
        const c = {};
        for (const k of FOOD_KEYS) c[k] = clampInt(out.codex?.[k], 0, 9_999_999);
        return c;
    })();

    out.c4 = {
        win: clampInt(out.c4?.win, 0, 99999),
        lose: clampInt(out.c4?.lose, 0, 99999),
        draw: clampInt(out.c4?.draw, 0, 99999),
    };

    out.stalls = asArray(out.stalls).slice(0, 3).map(st => ({
        recipe: typeof st?.recipe === 'string' ? st.recipe : null,
        ms: clampInt(st?.ms, 0, 10 * 60_000),
    }));
    if (out.stalls.length === 0) out.stalls = [{ recipe: null, ms: 0 }];

    return out;
}

const asArray = v => (Array.isArray(v) ? v : []);
const uniq = a => [...new Set(a)];

function clampInt(v, lo, hi) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
}

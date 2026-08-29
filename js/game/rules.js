/**
 * 游戏规则:等级、成就、订单、天气、制作。
 *
 * 全是纯函数或对 state 的直接改动,不碰 DOM。所有会改变存档的动作
 * 都返回一个「事件」数组,由 UI 层决定怎么呈现(弹窗/吐司/音效)。
 * 这样规则可以单独测,也不会像原来那样在逻辑里直接 alert()。
 */

import {
    RECIPES, ACHIEVEMENTS, ORDER_TEMPLATES, WEATHER,
    UPGRADES, upgradeCost, slotsAt, SERVE_MS,
    SHOWS, SHOW_MS, SHOW_WEATHER, POSTCARDS,
    DRINKS, DRINK_KEYS, SHELL_MARKS, divine, hourSlot, onDam,
    CREW, crewBonus, SEASONS, seasonOf,
} from '../data.js';
import { DAILY_TRIES } from '../state.js';
import { now as clockNow } from '../clock.js';

const WEATHER_MS = 5 * 60 * 1000;

/* ---------- 每日 / 天气 ---------- */

/**
 * 跨天则重置觅食次数。
 * 注意:用的是客户端时钟,改系统时间就能刷次数。单机无所谓,
 * 将来若有排行榜,次数必须由服务端时间判定。
 */
export function refreshDaily(state, now = new Date()) {
    const today = now.toDateString();
    if (state.lastDate === today) return false;
    state.lastDate = today;
    state.dailyTries = DAILY_TRIES;

    // 每天上线随机给一杯,带去小屋请哇鸥喝。
    // 昨天那杯没送出去就作废 —— 攒一星期一次性灌进去没什么意思。
    state.drink = DRINK_KEYS[Math.floor(Math.random() * DRINK_KEYS.length)];
    state.drinkDate = today;
    return true;
}

export function refreshWeather(state, now = Date.now()) {
    if (now - state.weatherAt < WEATHER_MS) return false;
    const r = Math.random();
    state.weather = r < 0.6 ? 'sunny' : r < 0.85 ? 'rainy' : 'foggy';
    state.weatherAt = now;
    return true;
}

export const weatherOf = state => WEATHER[state.weather] ?? WEATHER.sunny;

/* ---------- 经验与等级 ---------- */

export function addExp(state, amount) {
    const events = [];
    state.exp += Math.max(0, Math.floor(amount));

    while (state.exp >= state.expNext) {
        state.exp -= state.expNext;
        state.level++;
        state.expNext = Math.floor(state.expNext * 1.4) + 5;
        events.push({ type: 'levelup', level: state.level });

        for (const r of RECIPES) {
            if (r.levelReq <= state.level && !state.unlockedRecipes.includes(r.id)) {
                state.unlockedRecipes.push(r.id);
                events.push({ type: 'recipe', recipe: r });
            }
        }
    }
    return events;
}

/* ---------- 成就 ---------- */

export function checkAchievements(state) {
    const events = [];
    for (const a of ACHIEVEMENTS) {
        if (state.achievements.includes(a.id)) continue;
        if (!a.check(state)) continue;
        state.achievements.push(a.id);
        events.push({ type: 'achievement', achievement: a });
    }
    return events;
}

/* ---------- 背包 ---------- */

export const canAfford = (state, cost) =>
    Object.entries(cost).every(([k, v]) => (state.backpack[k] ?? 0) >= v);

/** 缺什么、缺多少 */
export const missingFor = (state, cost) =>
    Object.entries(cost)
        .map(([k, v]) => ({ key: k, need: v - (state.backpack[k] ?? 0) }))
        .filter(m => m.need > 0);

function spend(state, cost) {
    for (const [k, v] of Object.entries(cost)) state.backpack[k] -= v;
}

/* ---------- 制作 ---------- */

export function cook(state, recipeId) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { ok: false, reason: '没有这个食谱' };
    if (!state.unlockedRecipes.includes(recipe.id)) return { ok: false, reason: '这个食谱还没解锁' };
    if (!canAfford(state, recipe.cost)) {
        return { ok: false, reason: '材料不够', missing: missingFor(state, recipe.cost) };
    }

    spend(state, recipe.cost);
    state.coins += recipe.reward;

    const events = [{ type: 'cook', recipe }, ...addExp(state, 3), ...checkAchievements(state)];
    return { ok: true, events };
}

/* ---------- 订单 ---------- */

export function refreshOrders(state) {
    if (state.level < 2 || state.orders.length > 0) return false;
    const t = ORDER_TEMPLATES[Math.floor(Math.random() * ORDER_TEMPLATES.length)];
    state.orders.push({ id: Date.now(), name: t.name, reward: t.reward, need: { ...t.need } });
    return true;
}

export function deliverOrder(state, orderId) {
    const i = state.orders.findIndex(o => o.id === orderId);
    if (i < 0) return { ok: false, reason: '订单不存在' };

    const order = state.orders[i];
    if (!canAfford(state, order.need)) {
        return { ok: false, reason: '材料不够', missing: missingFor(state, order.need) };
    }

    spend(state, order.need);
    state.coins += order.reward;
    state.completedOrders++;
    state.orders.splice(i, 1);          // 完成即移除,不再留 completed 标记堆在存档里

    const events = [{ type: 'order', order }, ...addExp(state, 5), ...checkAchievements(state)];
    refreshOrders(state);
    return { ok: true, events };
}


/* ============================================================
   摊位:放置玩法的核心

   一句话:摊位自动出餐,吃背包里的食材,产出欧币。
   食材不够就停在那儿等 —— 这条是整个循环的关节,
   它让「出去觅食」和「挂机赚钱」互相咬住,而不是两件不相干的事。

   在线和离线**走同一个 produce()**,只有倍率不同。
   两条路各写一遍的话,迟早算出不一样的数。
   ============================================================ */

/** 天气对客流的影响。下雨大坝上没人,雾天将就。 */
const WEATHER_TRADE = { sunny: 1.0, rainy: 0.8, foggy: 0.9 };

/** 当前的摊位参数,UI 和结算都从这儿取,别各算各的 */
export function stallInfo(state, when = clockNow()) {
    const up = state.upgrades;
    const b = crewBonus(state.crew);
    const season = SEASONS[seasonOf(when)];

    const serveMs = Math.round(SERVE_MS / (UPGRADES.stove.mul(up.stove) * (1 + b.stove)));
    const priceMul = UPGRADES.sign.mul(up.sign)
        * (WEATHER_TRADE[state.weather] ?? 1)
        * (1 + b.price)
        * season.traffic;
    return {
        serveMs,
        priceMul,
        season,
        slots: slotsAt(state.level),
        offlineCapMs: Math.round(UPGRADES.shelf.mul(up.shelf) * 3600_000),
        offlineRate: Math.min(0.95, UPGRADES.warmer.mul(up.warmer) + b.offline),
    };
}

/** 拿这套材料还能做几份 */
function affordable(state, cost) {
    let n = Infinity;
    for (const [k, v] of Object.entries(cost)) {
        n = Math.min(n, Math.floor((state.backpack[k] ?? 0) / v));
    }
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * 推进摊位生产。
 *
 * @param {number} ms   过了多少毫秒
 * @param {number} rate 收益倍率(在线 1,离线打折)
 * @returns {{served:number, coins:number, byRecipe:object, starved:string[]}}
 *
 * 多个格子抢同一批食材时按格子顺序先到先得 —— 简单、可预期,
 * 玩家能靠调整格子顺序决定谁优先。
 */
export function produce(state, ms, rate = 1) {
    const info = stallInfo(state);
    const out = { served: 0, coins: 0, byRecipe: {}, starved: [] };
    if (ms <= 0) return out;

    for (let i = 0; i < state.stalls.length; i++) {
        const st = state.stalls[i];
        if (i >= info.slots) { st.ms = 0; continue; }      // 还没解锁的格子不跑
        const recipe = RECIPES.find(r => r.id === st.recipe);
        if (!recipe) { st.ms = 0; continue; }

        st.ms += ms;
        const wanted = Math.floor(st.ms / info.serveMs);
        if (wanted <= 0) continue;

        const can = affordable(state, recipe.cost);
        const n = Math.min(wanted, can);

        if (n > 0) {
            for (const [k, v] of Object.entries(recipe.cost)) state.backpack[k] -= v * n;
            const gain = Math.round(recipe.reward * info.priceMul * rate) * n;
            state.coins += gain;
            out.served += n;
            out.coins += gain;
            out.byRecipe[recipe.id] = (out.byRecipe[recipe.id] ?? 0) + n;
        }
        st.ms -= n * info.serveMs;

        if (n < wanted) {
            // 材料断了。把计时压回一个周期以内,不然材料一补上
            // 会「一次性补发」几百份,挂机一晚等于白送。
            st.ms = Math.min(st.ms, info.serveMs);
            out.starved.push(recipe.id);
        }
    }
    return out;
}

/** 超过这个时长就不算「在线」了 */
const OFFLINE_MIN_MS = 60_000;

/**
 * 在线推进。main.js 每秒调一次。
 *
 * 时间差超过一分钟的,**转交给离线结算**。笔记本合盖、标签页被浏览器
 * 冻结、系统休眠 —— 这些情况下页面还开着,但下一次 tick 会一口气看到
 * 几小时的时间差。按在线全额结算的话,离线上限和折扣就全绕过去了:
 * 挂着标签页睡一觉,比老老实实关掉页面赚得还多。
 *
 * @returns {null | {served, coins, byRecipe, starved} | {offline: object[]}}
 */
export function tickStalls(state, now = Date.now()) {
    const dt = now - state.lastSeen;
    if (dt <= 0) { state.lastSeen = now; return null; }
    if (dt >= OFFLINE_MIN_MS) return { offline: settleOffline(state, now) };

    state.lastSeen = now;
    const r = produce(state, dt, 1);
    const p = perform(state, dt, 1);
    if (p.fed) r.show = p;
    return r.served > 0 || r.starved.length || p.fed ? r : null;
}

/**
 * 离线结算。进游戏时调一次。
 *
 * 用的是客户端时钟,改系统时间就能刷 —— 和 refreshDaily() 一个处境。
 * 单机无所谓;将来要做榜单,时间必须服务端说了算。
 */
export function settleOffline(state, now = Date.now()) {
    const info = stallInfo(state);
    const away = now - state.lastSeen;
    state.lastSeen = now;

    if (away < OFFLINE_MIN_MS) return [];         // 不到一分钟不当离线
    const ms = Math.min(away, info.offlineCapMs);
    // 表演先跑:路人投喂来的食材,摊位这一轮就能用上
    const show = perform(state, ms, info.offlineRate);
    const r = produce(state, ms, info.offlineRate);
    if (r.served === 0 && r.starved.length === 0 && show.fed === 0) return [];

    return [{
        type: 'offline',
        awayMs: away,
        countedMs: ms,
        capped: away > info.offlineCapMs,
        show,
        ...r,
    }, ...checkAchievements(state)];
}

/** 买升级 */
export function buyUpgrade(state, key) {
    const u = UPGRADES[key];
    if (!u) return { ok: false, reason: '没有这个升级' };
    const lv = state.upgrades[key] ?? 1;
    const cost = upgradeCost(key, lv);
    if (cost === null) return { ok: false, reason: '已经满级了' };
    if (state.coins < cost) return { ok: false, reason: `还差 ${cost - state.coins} 欧币` };

    state.coins -= cost;
    state.upgrades[key] = lv + 1;
    return { ok: true, events: [{ type: 'upgrade', key, level: lv + 1 }] };
}

/** 给某一格换菜。传 null 就是撤下。 */
export function setStall(state, slot, recipeId) {
    const info = stallInfo(state);
    if (slot < 0 || slot >= info.slots) return { ok: false, reason: '这一格还没解锁' };
    if (recipeId !== null && !state.unlockedRecipes.includes(recipeId)) {
        return { ok: false, reason: '这道菜还没解锁' };
    }
    while (state.stalls.length <= slot) state.stalls.push({ recipe: null, ms: 0 });
    state.stalls[slot] = { recipe: recipeId, ms: 0 };   // 换菜清空计时,不让人卡进度
    return { ok: true, events: [] };
}


/* ============================================================
   表演:食材的被动来源

   哇鸥不出去觅食的时候就在大坝上表演,路人看了会投喂。
   摊位一直在吃食材,光靠手动觅食补是补不上的 —— 表演补的就是这个缺口。

   但它**故意补不满**:全解锁大概能养住一个没升过级的格子;
   炉子一升、格子一开,供给立刻跟不上,还是得出去飞。
   补满了的话飞行玩法就又没意义了。
   ============================================================ */

/**
 * [from, to) 这段里,哇鸥有多少毫秒是站在大坝上的。
 *
 * 作息按天重复,但离线可能跨好几个时段,解析地算边界很容易写错;
 * 按五分钟一格采样够准了(最大误差 5 分钟,对挂机游戏无所谓),
 * 而且以后改时段表也不用动这里。
 */
function damMsIn(from, to) {
    if (to <= from) return 0;
    const STEP = 5 * 60_000;
    let on = 0;
    for (let t = from; t < to; t += STEP) {
        const chunk = Math.min(STEP, to - t);
        if (onDam(new Date(t + chunk / 2))) on += chunk;
    }
    return on;
}

/** 当前解锁了哪些节目。等级 / 成就 / 明信片三处都算,去过的地方多是真有回报的。 */
export function unlockedShows(state) {
    return SHOWS.filter(sh => {
        const n = sh.need;
        if (n.level && state.level < n.level) return false;
        if (n.achievement && !state.achievements.includes(n.achievement)) return false;
        if (n.postcards && state.postcards.length < n.postcards) return false;
        return true;
    });
}

/** 表演的当前参数。UI 和结算都从这儿取。 */
export function showInfo(state) {
    const shows = unlockedShows(state);
    const weather = SHOW_WEATHER[state.weather] ?? 1;
    // 节目越多围观越多,投喂越勤
    const b = crewBonus(state.crew);
    const interval = Math.round(
        SHOW_MS / (1 + 0.15 * (shows.length - 1)) / weather / (1 + b.show));
    const pool = [...new Set(shows.flatMap(sh => sh.pool))];
    return {
        shows,
        pool,
        interval,
        // 等级越高,路人一次给得越多
        per: 1 + Math.floor(state.level / 4),
        locked: SHOWS.filter(sh => !shows.includes(sh)),
    };
}

/**
 * 推进表演。和 produce() 一样,在线离线共用,只有倍率不同。
 * @returns {{fed:number, got:object}}
 */
export function perform(state, ms, rate = 1, rnd = Math.random, endAt = clockNow()) {
    const out = { fed: 0, got: {} };
    if (ms <= 0) return out;
    const info = showInfo(state);

    // 只算哇鸥站在大坝上的那部分时间。它在小屋里(尤其睡着的时候)
    // 大坝上是没人的,再有人投喂就说不通了 —— 画面里也确实没画它。
    const onStage = damMsIn(endAt.getTime() - ms, endAt.getTime());
    if (onStage <= 0) return out;

    state.showMs += onStage;
    const times = Math.floor(state.showMs / info.interval);
    if (times <= 0) return out;
    state.showMs -= times * info.interval;

    // 离线打折是「少了几次投喂」,不是「每次少给」—— 给半个食材没法拿
    const n = Math.round(times * rate);
    for (let i = 0; i < n; i++) {
        const k = info.pool[Math.floor(rnd() * info.pool.length)];
        gain(state, k, info.per);
        out.got[k] = (out.got[k] ?? 0) + info.per;
        out.fed++;
    }
    return out;
}


/* ============================================================
   小屋:海埂大坝旁边堤岸上的草棚
   ============================================================ */

/** 现在能不能见到哇鸥。返回 'noon' / 'evening' / 'night'(在睡) / null(出去了) */
export const hutState = (when = clockNow()) => hourSlot(when);

/**
 * 占卜。一天一次 —— 一天能转八次的话,神秘感就没了。
 * 贝壳花纹当场随机抽一枚,天气决定它落到哪一格。
 */
export function castFortune(state, when = clockNow(), rnd = Math.random) {
    const today = when.toDateString();
    if (state.fortuneDate === today) {
        return { ok: false, reason: '今天已经转过一次了,明天再来' };
    }
    const mark = Math.floor(rnd() * SHELL_MARKS.length);
    const { fortune, mark: markName } = divine(state.weather, mark);

    state.fortune = fortune.id;
    state.fortuneMark = markName;
    state.fortuneDate = today;
    return { ok: true, fortune, mark: markName, events: [] };
}

/** 把手上那杯给哇鸥 */
export function giveDrink(state) {
    const key = state.drink;
    const d = DRINKS[key];
    if (!d) return { ok: false, reason: '今天手上没有能给的东西' };

    state.drink = null;
    state.affinity += d.affinity;
    return {
        ok: true, drink: d,
        events: [{ type: 'affinity', by: d.affinity, text: d.give }, ...checkAchievements(state)],
    };
}

/** 记一局四子棋。下过就有好感度,输赢只影响记录。 */
export function recordC4(state, who) {
    const key = who === 'w' ? 'win' : who === 'b' ? 'lose' : 'draw';
    state.c4[key]++;
    const gain = who === 'w' ? 2 : 1;      // 赢了它会不服气,但还是高兴有人陪着下
    state.affinity += gain;
    return { ok: true, events: [{ type: 'affinity', by: gain }, ...checkAchievements(state)] };
}


/* ---------- 养成:伙计鸥 / 季节 / 图鉴 ---------- */

/**
 * 收进背包并记一笔图鉴。**所有加食材的地方都走这里** ——
 * 图鉴记的是「累计见过多少」,花掉了不减,所以不能拿 backpack 反推。
 */
function gain(state, key, n) {
    if (n <= 0) return;
    state.backpack[key] = (state.backpack[key] ?? 0) + n;
    state.codex[key] = (state.codex[key] ?? 0) + n;
}

/** 当前季节 */
export const seasonNow = (when = clockNow()) => ({ key: seasonOf(when), ...SEASONS[seasonOf(when)] });

/**
 * 招一只伙计鸥。
 * 只有冬天能招 —— 鸥群不在昆明的时候,没人可招,这条比任何解锁条件都自然。
 */
export function hireCrew(state, id, when = clockNow()) {
    const c = CREW.find(x => x.id === id);
    if (!c) return { ok: false, reason: '没有这只' };
    if (state.crew.includes(id)) return { ok: false, reason: '它已经在摊上了' };
    if (!SEASONS[seasonOf(when)].canHire) {
        return { ok: false, reason: '鸥群这会儿不在昆明,冬天再来招' };
    }
    if (state.affinity < c.affinity) {
        return { ok: false, reason: `好感度还差 ${c.affinity - state.affinity} —— 哇鸥还没熟到肯把亲戚介绍给你` };
    }
    if (state.coins < c.cost) return { ok: false, reason: `还差 ${c.cost - state.coins} 欧币` };

    state.coins -= c.cost;
    state.crew.push(id);
    return { ok: true, crew: c, events: [{ type: 'crew', crew: c }, ...checkAchievements(state)] };
}

/* ---------- 觅食结算 ---------- */

/**
 * 把一局飞行的结果并入存档。
 * @param {object} result flight.js 的 run() 返回值
 */
/**
 * 一次捡到几个。等级越高,同样一趟带回来的越多 ——
 * 后期摊位吃得快,再按一颗一颗捡就跟不上了。
 */
export const haulPerPickup = (level, crew = []) =>
    1 + Math.floor((level - 1) / 3) + crewBonus(crew).haul;

export function settleFlight(state, result) {
    const events = [];

    const haul = haulPerPickup(state.level, state.crew);
    // 稀有食材吃季节和伙计的加成 —— 雨季的菌子是真的多
    const rare = SEASONS[seasonOf()].rare * (1 + crewBonus(state.crew).rare);
    for (const [k, n] of Object.entries(result.collected)) {
        const isRare = k === 'mushroom' || k === 'rusan';
        gain(state, k, Math.round(n * haul * (isRare ? rare : 1)));
    }
    state.totalScore += result.score;
    if (result.maxCombo > state.maxCombo) state.maxCombo = result.maxCombo;

    // 明信片:收集越多机会越大,但每局最多掉一张
    const chances = Math.floor(result.itemCount / 3);
    // 别写死张数 —— 以前写的 7,加到 10 张之后最后三张永远掉不出来
    const locked = POSTCARDS.map(p => p.id).filter(id => !state.postcards.includes(id));
    if (locked.length && chances > 0) {
        const p = 1 - Math.pow(1 - 0.08, chances);
        if (Math.random() < p) {
            const id = locked[Math.floor(Math.random() * locked.length)];
            state.postcards.push(id);
            events.push({ type: 'postcard', id });
        }
    }

    events.push(...addExp(state, Math.floor(result.score / 5)));
    events.push(...checkAchievements(state));
    refreshOrders(state);

    return events;
}

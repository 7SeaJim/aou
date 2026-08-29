/**
 * 开发用控制台。**只在 `npm run dev` 下挂载** —— main.js 里用
 * `import.meta.env.DEV` 包着动态 import,vite build 时这个常量是 false,
 * 整块连同这个文件一起被摇掉,不会进生产包。
 *
 * 解决的是这个问题:每天只有 5 次觅食、等级要靠攒经验、天气 5 分钟随机换一次,
 * 想看一眼 5 级的内容得先玩两天。调玩法不该是这样。
 *
 * 起服务后在浏览器控制台敲 `wa.help()`。
 */

import { createInitialState, FOOD_KEYS, ITEM_KEYS } from './state.js';
import { RECIPES, POSTCARDS, ACHIEVEMENTS, UPGRADES, DRINK_KEYS } from './data.js';
import { seeded } from './game/rng.js';
import { setClock } from './clock.js';

/* ============================================================
   预设存档。**要加调试场景就改这里。**

   每一项是一个「补丁」,会盖在全新存档上;没写的字段保持默认。
   食谱解锁不用手写,scene() 会按 level 自动补齐。
   ============================================================ */
export const SCENES = {
    /** 全新档,和第一次打开一样 */
    fresh: {},

    /** 刚上手:够做前两道菜,能接到订单 */
    early: {
        level: 2, coins: 60,
        backpack: { erkuai: 6, potato: 4, rice: 3, chili: 2 },
        items: { shield: 1 },
    },

    /** 中期:食谱开了大半,道具管够,明信片收了一半 */
    mid: {
        level: 4, coins: 800,
        stalls: [{ recipe: 'shao_erkuai', ms: 0 }, { recipe: 'liangxia', ms: 0 }],
        upgrades: { stove: 3, sign: 2, shelf: 2, warmer: 2 },
        backpack: { erkuai: 30, potato: 30, rice: 25, douhua: 20, flower: 15, chili: 20, sugar: 15, mushroom: 4, rusan: 4 },
        items: { shield: 5, magnet: 5, double: 5 },
        postcards: [0, 1, 2, 3],
        totalScore: 400, completedOrders: 8,
    },

    /** 后期:满级手感,用来看数值有没有崩 */
    late: {
        level: 9, coins: 20000,
        stalls: [{ recipe: 'qiguoji', ms: 0 }, { recipe: 'jianshouqing', ms: 0 }, { recipe: 'kao_rusan', ms: 0 }],
        upgrades: { stove: 8, sign: 7, shelf: 6, warmer: 6 },
        backpack: Object.fromEntries(FOOD_KEYS.map(k => [k, 99])),
        items: { shield: 20, magnet: 20, double: 20 },
        totalScore: 5000, maxCombo: 30, completedOrders: 60,
    },

    /** 只想反复打飞行:次数管够,别的不管 */
    fly: { level: 5, dailyTries: 999, items: { shield: 9, magnet: 9, double: 9 } },

    /** 调放置数值:摊位摆满、材料管够、升级低级,方便看曲线起点 */
    idle: {
        level: 6, coins: 500,
        backpack: Object.fromEntries(FOOD_KEYS.map(k => [k, 200])),
        stalls: [{ recipe: 'shao_erkuai', ms: 0 }, { recipe: 'douhua_mx', ms: 0 }, { recipe: 'xianhua_bing', ms: 0 }],
    },
};

/** scene 补丁 -> 完整存档 */
function buildScene(name) {
    const patch = SCENES[name];
    if (!patch) throw new Error(`没有这个场景:${name}。可选:${Object.keys(SCENES).join(' / ')}`);

    const s = createInitialState();
    for (const [k, v] of Object.entries(patch)) {
        // backpack / items 是合并而不是替换,补丁里只写关心的那几样就行
        if (k === 'backpack' || k === 'items' || k === 'upgrades') Object.assign(s[k], v);
        else s[k] = Array.isArray(v) ? [...v] : v;
    }
    // 食谱按等级自动解锁,省得补丁里手抄一份
    s.unlockedRecipes = RECIPES.filter(r => r.levelReq <= s.level).map(r => r.id);
    s.lastDate = new Date().toDateString();     // 别一进来就被跨天重置
    // 上一行顺带跳过了 refreshDaily,而每日饮品是在那儿发的 —— 这里补上,
    // 否则所有预设档进小屋都是「今天这杯已经给它了」,请喝那条路根本试不了。
    s.drink = DRINK_KEYS[Math.floor(Math.random() * DRINK_KEYS.length)];
    s.drinkDate = s.lastDate;
    // 图鉴按背包开底 —— 预设档直接塞的背包不走 gain(),不补的话图鉴是空的
    s.codex = { ...s.codex };
    for (const [k, v] of Object.entries(s.backpack)) if (v > 0) s.codex[k] = v;
    return s;
}

const SAVE_KEY = 'aou:save';
const BACKUP_KEY = 'aou:dev-backup';

/**
 * 切场景会盖掉当前存档 —— 先把原档抄一份到备份键,`wa.restore()` 能换回来。
 * 这里直接摸 localStorage 而不走 storage 门面:门面只认一个 key,
 * 而这是纯调试用的旁路,没必要为它给正式接口开口子。
 */
function backup() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) localStorage.setItem(BACKUP_KEY, raw);
    } catch { /* 隐私模式下没得备份,认了 */ }
}

/**
 * @param {object} deps
 * @param {()=>object} deps.getState
 * @param {(fn:(s:object)=>any)=>any} deps.mutate  改存档并触发保存 + 重绘
 * @param {object} deps.storage
 * @param {()=>void} deps.fly            开一局觅食
 * @param {()=>object|null} deps.getFlight
 * @param {object} deps.rules
 */
export function installDev({ getState, mutate, storage, fly, getFlight, rules }) {
    const reload = async (state) => {
        await storage.replace(state);
        location.reload();
    };

    const wa = {
        /** 当前存档。可以直接改,改完敲 wa.save() */
        get s() { return getState(); },
        /** 当前那一局飞行(没在飞时是 null)。可以直接改 wa.flight.f.lives */
        get flight() { return getFlight(); },

        /** 把手改过的 s 落盘 + 重绘 */
        save() { mutate(() => {}); return '已保存'; },

        set(patch) {
            mutate(s => Object.assign(s, patch));
            return this.s;
        },

        /** 食材或道具 +n(负数就是扣) */
        give(key, n = 10) {
            mutate(s => {
                const bag = FOOD_KEYS.includes(key) ? s.backpack
                          : ITEM_KEYS.includes(key) ? s.items : null;
                if (!bag) throw new Error(`没有这个 key:${key}\n食材:${FOOD_KEYS.join(' ')}\n道具:${ITEM_KEYS.join(' ')}`);
                bag[key] = Math.max(0, (bag[key] ?? 0) + n);
            });
            return this.s.backpack;
        },

        /** 背包一次装满 */
        fill(n = 99) {
            mutate(s => {
                for (const k of FOOD_KEYS) s.backpack[k] = n;
                for (const k of ITEM_KEYS) s.items[k] = Math.min(n, 20);
            });
            return this.s.backpack;
        },

        coins(n) { return this.set({ coins: n }).coins; },
        tries(n = 99) { return this.set({ dailyTries: n }).dailyTries; },
        weather(w) { return this.set({ weather: w, weatherAt: Date.now() }).weather; },

        /** 加经验,会正常走升级和解锁食谱的事件 —— 用来测升级弹窗 */
        exp(n = 100) {
            const events = mutate(s => rules.addExp(s, n));
            console.table(events);
            return `Lv.${this.s.level}  ${this.s.exp}/${this.s.expNext}`;
        },

        /** 直接跳到某一级(补齐食谱解锁,不走升级动画) */
        lv(n) {
            mutate(s => {
                s.level = n; s.exp = 0;
                s.expNext = Math.round(10 * Math.pow(1.4, n - 1)) + 5 * (n - 1);
                s.unlockedRecipes = RECIPES.filter(r => r.levelReq <= n).map(r => r.id);
            });
            return `Lv.${this.s.level}`;
        },

        /** 食谱 / 明信片 / 成就全开 */
        unlockAll() {
            mutate(s => {
                s.unlockedRecipes = RECIPES.map(r => r.id);
                s.postcards = POSTCARDS.map(p => p.id);
                s.achievements = ACHIEVEMENTS.map(a => a.id);
            });
            return '全解锁';
        },

        /** 切到预设存档并重载。场景定义在 dev.js 顶部的 SCENES,想加就加 */
        scene(name) {
            if (!name) return Object.keys(SCENES);
            backup();
            reload(buildScene(name));
            return `切到 ${name},重载中…(原档已备份,wa.restore() 换回来)`;
        },

        /** 清档重开。原档会备份,wa.restore() 能换回来 */
        async reset() {
            backup();
            await storage.clear();
            location.reload();
        },

        /**
         * 固定飞行的随机序列。设了之后每一局的食材/障碍生成完全一样,
         * 用来反复跑同一个场景比难度。传 null 恢复真随机。
         *
         * 注意:只管飞行里的生成。天气轮换、明信片掉落、订单抽取在 rules.js 里
         * 还是 Math.random —— 那些不影响「同一局能不能重放」。
         */
        seed(n) {
            devSeed = (n === null || n === undefined) ? null : n;
            return devSeed === null ? '已恢复真随机' : `种子 ${devSeed},下一局起生效`;
        },

        /** 直接开一局(不消耗次数检查,但仍然会扣 dailyTries) */
        fly() { fly(); return '起飞'; },

        /**
         * 假装离线了 n 小时。把 lastSeen 往前拨就行 ——
         * 不用重载:下一次 tick 会看到超过一分钟的时间差,自动走离线结算并弹吐司。
         */
        away(hours = 3) {
            mutate(s => { s.lastSeen = Date.now() - hours * 3600_000; });
            return `假装离线 ${hours} 小时,一秒内结算`;
        },

        /** 给某一格摆菜。recipeId 传 null 撤下。不传 slot 就列出当前摊位。 */
        stall(slot, recipeId) {
            if (slot === undefined) return this.s.stalls;
            const r = mutate(st => rules.setStall(st, slot, recipeId ?? null));
            return r.ok ? this.s.stalls : r.reason;
        },

        /** 看当前产能。调数值时盯这个。 */
        rate() {
            const info = rules.stallInfo(this.s);
            const live = this.s.stalls.slice(0, info.slots).filter(x => x.recipe);
            const perMin = live.reduce((sum, st) => {
                const r = RECIPES.find(x => x.id === st.recipe);
                return sum + (r ? r.reward * info.priceMul * 60_000 / info.serveMs : 0);
            }, 0);
            return {
                '每份间隔': (info.serveMs / 1000).toFixed(1) + 's',
                '价格系数': info.priceMul.toFixed(2),
                '格子': info.slots,
                '每分钟': Math.round(perMin) + ' 欧币',
                '离线上限': info.offlineCapMs / 3600_000 + 'h',
                '离线折扣': Math.round(info.offlineRate * 100) + '%',
            };
        },

        /** 把月份拨到某个季节。冬天才招得到伙计,不然要等到 11 月。 */
        season(name) {
            const m = { winter: 0, spring: 4, summer: 6, autumn: 9 }[name];
            if (m === undefined) return "传 'winter' / 'spring' / 'summer' / 'autumn'";
            devMonth = m;
            setClock(devNow);
            return rules.seasonNow().name + '季';
        },

        /** 招一只伙计(跳过季节和好感度检查,纯看数值) */
        hire(id) {
            mutate(s => {
                if (!s.crew.includes(id)) s.crew.push(id);
            });
            return this.s.crew;
        },

        /** 小屋:把时钟拨到某个时段看效果。传 null 恢复真实时间。 */
        hour(h) {
            if (h === null || h === undefined) { devHour = null; setClock(null); return '恢复真实时间'; }
            devHour = h;
            setClock(devNow);
            return `时钟按 ${h} 点算 —— ${['深夜','','','','','','出去了','出去了','出去了','出去了','出去了','晌午','晌午','晌午','出去了','出去了','出去了','出去了','晚上','晚上','晚上','晚上','深夜','深夜'][h] || '出去了'}`;
        },

        /** 再发一杯,用来反复试「请哇鸥喝」 */
        drink(kind) {
            mutate(s => { s.drink = kind ?? DRINK_KEYS[Math.floor(Math.random() * DRINK_KEYS.length)]; });
            return this.s.drink;
        },

        /** 清掉今天的占卜记录,好再转一次 */
        reFortune() {
            mutate(s => { s.fortuneDate = ''; });
            return '可以再转一卦了';
        },

        /** 表演的当前状态。调解锁条件和投喂速度时盯这个。 */
        shows() {
            const i = rules.showInfo(this.s);
            return {
                '已解锁': i.shows.map(x => x.name).join('、') || '(无)',
                '还差': i.locked.map(x => x.name).join('、') || '(全开了)',
                '投喂间隔': (i.interval / 1000).toFixed(1) + 's',
                '一次给': i.per + ' 个',
                '能给的种类': i.pool.length,
                '每分钟约': Math.round(60_000 / i.interval * i.per) + ' 个食材',
            };
        },

        /** 四条升级线一次拉满,看数值天花板 */
        maxUp() {
            mutate(s => {
                for (const [k, u] of Object.entries(UPGRADES)) s.upgrades[k] = u.max;
            });
            return this.rate();
        },

        /** 导出存档码(切场景前想留一手可以先存一份) */
        async code() {
            const { encodeSave } = await import('./storage/savecode.js');
            const c = await encodeSave(this.s);
            console.log(c);
            return `${c.length} 字符,已打印`;
        },

        /** 用存档码覆盖当前档 */
        async load(code) {
            const { decodeSave } = await import('./storage/savecode.js');
            const st = await decodeSave(code);
            if (!st) throw new Error('存档码读不出来');
            backup();
            await reload(st);
        },

        /** 把 scene / load 之前那份存档换回来 */
        async restore() {
            const raw = localStorage.getItem(BACKUP_KEY);
            if (!raw) return '没有备份';
            localStorage.setItem(SAVE_KEY, raw);
            location.reload();
        },

        help() {
            console.log(`%c哇鸥 · 开发控制台`, 'font-weight:bold;font-size:14px');
            console.table({
                'wa.s':            '当前存档(可直接改,改完 wa.save())',
                'wa.scene(name)':  `切预设存档并重载 — ${Object.keys(SCENES).join(' / ')}`,
                'wa.reset()':      '清档重开(原档自动备份)',
                'wa.restore()':    '把 scene/reset 之前那份存档换回来',
                'wa.lv(n)':        '跳到 n 级(补齐食谱解锁)',
                'wa.exp(n)':       '加经验,走正常的升级事件',
                'wa.coins(n)':     '设欧币',
                'wa.give(k, n)':   '食材/道具 +n',
                'wa.fill(n)':      '背包装满',
                'wa.tries(n)':     '设觅食次数(默认 99)',
                'wa.weather(w)':   "天气 — 'sunny' / 'rainy' / 'foggy'",
                'wa.unlockAll()':  '食谱/明信片/成就全开',
                'wa.seed(n)':      '固定飞行随机序列,同一局可重放',
                'wa.fly()':        '直接开一局',
                'wa.away(h)':      '假装离线 h 小时后重载,看离线结算',
                'wa.rate()':       '当前产能:间隔 / 每分钟 / 离线上限',
                'wa.stall(i, id)': '给第 i 格摆菜,id 传 null 撤下',
                'wa.maxUp()':      '四条升级线拉满',
                'wa.shows()':      '表演:解锁了哪些节目、多久投喂一次',
                'wa.hour(h)':      '把时钟拨到 h 点(小屋按时段开门)',
                'wa.drink(k)':     "再发一杯 —— 'puer' / 'coffee'",
                'wa.reFortune()':  '清掉今日占卜,好再转一次',
                'wa.season(s)':    "拨季节 — 'winter' / 'summer' …(冬天才招得到伙计)",
                'wa.hire(id)':     '直接招一只伙计,跳过条件',
                'wa.flight':       '当前这一局(可改 .f.lives / .f.speed)',
                'wa.code()':       '导出存档码',
            });
            console.log('URL 参数(打开就生效):?scene=mid  ?seed=42  ?tries=99  ?weather=rainy  ?time=night(待机界面时段)');
            return '';
        },
    };

    window.wa = wa;

    /* ---------- URL 参数:把常用的调试起点做成可以直接分享的链接 ---------- */
    const q = new URLSearchParams(location.search);
    if (q.has('seed')) devSeed = Number(q.get('seed'));
    if (q.has('hour')) { devHour = Number(q.get('hour')); setClock(devNow); }
    if (q.has('season')) {
        devMonth = { winter: 0, spring: 4, summer: 6, autumn: 9 }[q.get('season')] ?? null;
        if (devMonth !== null) setClock(devNow);
    }
    if (q.has('tries')) mutate(s => { s.dailyTries = Number(q.get('tries')); });
    if (q.has('weather')) mutate(s => { s.weather = q.get('weather'); s.weatherAt = Date.now(); });

    console.log(
        `%c哇鸥 dev%c  wa.help() 看命令` +
        (devSeed === null ? '' : `  ·  种子 ${devSeed}`),
        'background:#e8384f;color:#fff;padding:2px 6px;border-radius:2px',
        'color:#7d6853',
    );
    return wa;
}

/** 当前种子。null = 真随机 */
let devSeed = null;
/** 调试用的时钟覆盖。null = 用真实时间 */
let devHour = null;
/** 调试用的月份覆盖。null = 用真实月份 */
let devMonth = null;

/** 全游戏读时间都走 clock.js,dev 把它换成这个,好拨小时和月份 */
export function devNow() {
    const d = new Date();
    if (devHour !== null) d.setHours(devHour, 0, 0, 0);
    if (devMonth !== null) d.setMonth(devMonth);
    return d;
}

/** main.js 用它拿飞行的随机源;没设种子就返回 undefined,Flight 用默认的 Math.random */
export function devRng() {
    return devSeed === null ? undefined : seeded(devSeed);
}

/**
 * 启动时处理 ?scene= —— 必须在读档之后、建 UI 之前跑,
 * 所以单独一个函数,不塞进 installDev。
 * @returns {object|null} 要用的存档;null 表示照常读档
 */
export function devScene() {
    const name = new URLSearchParams(location.search).get('scene');
    if (!name) return null;
    backup();
    console.log(`%c[dev] 使用预设存档 ${name}(原档已备份,wa.restore() 换回来)`, 'color:#e8384f');
    return buildScene(name);
}

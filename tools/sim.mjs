/**
 * 数值模拟器:不开浏览器,把 rules.js 按天跑一遍,把曲线打出来。
 *
 * 想回答的是这几个问题 —— 光靠自己玩是答不出来的,一个放置游戏的问题
 * 都在「第十天」「第三十天」那儿,而没人会为了调数值真玩一个月:
 *
 *   · 升到 10 级要几天?
 *   · 一百二十根瓶盖够不够买齐五件装扮?差多少?
 *   · 夏天(游客 0.8、招不到伙计)会不会冷清到玩不下去?
 *   · 摊子会不会一直饿着 —— 材料到底跟不跟得上?
 *   · 鸥币会不会通胀到升级树见底、再赚也没处花?
 *
 * 用法:
 *   node tools/sim.mjs                       默认:三种玩家各跑 30 天,从冬天开始
 *   node tools/sim.mjs --days 60 --who active
 *   node tools/sim.mjs --start 2026-06-01    从夏天开始跑,专门看淡季
 *   node tools/sim.mjs --csv                 输出 CSV,拿去画图
 *
 * **它模拟的是规则,不是飞行玩法。** 一局觅食吃到多少东西是代入的假设
 * (见 RUN),因为飞行需要 canvas 和一双真手。假设写在下面,不服就改数字重跑 ——
 * 这正是它的用处:换个假设看曲线怎么动,比争论「手感好不好」有用。
 */

import { createInitialState, DAILY_TRIES } from '../js/state.js';
import * as rules from '../js/game/rules.js';
import { setClock } from '../js/clock.js';
import {
    RECIPES, UPGRADES, upgradeCost, COSMETICS, CREW,
    FOODS, SEASONS, seasonOf, ACHIEVEMENTS, TOTAL_CAPS, CAP_VALUE, MARKET,
} from '../js/data.js';

/* ============================================================
   假设。改这里,不要改下面的逻辑。
   ============================================================ */

/**
 * 一局觅食。数字是照着 flight.js 的生成密度估的:
 * 生成间隔 max(700, 1100 - 等级×50) 毫秒,七成是食材,剩下是障碍和道具。
 * 一局撑多久取决于人 —— 三条命,新手一分钟,熟手两分多。
 */
const RUN = {
    casual: { sec: 55, catch: 0.55, combo: 9 },
    active: { sec: 95, catch: 0.72, combo: 22 },
    idle:   { sec: 40, catch: 0.45, combo: 5 },
};

/** 玩家画像:一天上线几次、每次待多久、用掉几次觅食 */
const WHO = {
    idle:   { name: '纯挂机', sessions: [20], minutes: 2, tries: 1 },
    casual: { name: '休闲',   sessions: [9, 20], minutes: 6, tries: 3 },
    active: { name: '活跃',   sessions: [9, 12, 16, 21], minutes: 15, tries: 5 },
};

const FOOD_TYPES = ['erkuai', 'potato', 'rice', 'douhua', 'chili', 'sugar'];

/* ============================================================
   跑
   ============================================================ */

let T = 0;                                   // 模拟时钟(毫秒)
setClock(() => new Date(T));

function oneRun(who, level) {
    const r = RUN[who];
    const interval = Math.max(700, 1100 - level * 50);
    const spawns = Math.floor(r.sec * 1000 / interval);
    const foods = Math.round(spawns * 0.7);
    const got = Math.round(foods * r.catch);
    const collected = {};
    for (let i = 0; i < got; i++) {
        const k = FOOD_TYPES[i % FOOD_TYPES.length];
        collected[k] = (collected[k] ?? 0) + 1;
    }
    // 计分和 flight.js 一致:每个 5 分,连击 5 以上 +2,10 以上 +5
    const score = got * (r.combo >= 10 ? 10 : r.combo >= 5 ? 7 : 5);
    return { collected, score, maxCombo: r.combo, itemCount: got };
}

/** 这一刻该做的决定。贪心但不作弊:每一步都走规则层的公开函数。 */
function decide(s) {
    // 摊子:空格子摆上「做得起且最赚」的那道
    const info = rules.stallInfo(s);
    const affordable = r => Object.entries(r.cost).every(([k, v]) => (s.backpack[k] ?? 0) >= v * 4);
    for (let i = 0; i < info.slots; i++) {
        const cur = RECIPES.find(r => r.id === s.stalls[i]?.recipe);
        // 已经摆着、而且材料还跟得上的就不动。
        // **材料断了就换一道** —— 真人会发现锅空了,不会让它干烧一个月;
        // 不换的话模拟出来的「断料天数」全是模拟器自己犯的傻。
        if (cur && affordable(cur)) continue;
        const open = RECIPES.filter(r => s.unlockedRecipes.includes(r.id))
            .filter(affordable)
            .sort((a, b) => b.reward - a.reward);
        if (open[0] && open[0].id !== cur?.id) rules.setStall(s, i, open[0].id);
    }
    // 进货:缺什么补什么。稀有的先买 —— 它们才是瓶颈,普通的本来就堆着
    if (rules.marketOpen(s)) {
        for (const k of ['mushroom', 'rusan', 'flower', 'sugar', 'chili', 'douhua']) {
            if ((s.backpack[k] ?? 0) < 60) rules.buyFood(s, k, Infinity);
        }
    }
    // 出摊。模拟器不跑那个小游戏(它要一双手),按「一次出摊做成几份」代入:
    // 白天上线一次,手脚麻利的能出六七份,这里取中等
    if (rules.serviceOpen()) {
        for (let i = 0; i < 5; i++) {
            const open = RECIPES.filter(r => s.unlockedRecipes.includes(r.id))
                .filter(r => rules.canAfford(s, r.cost))
                .sort((a, b) => b.reward - a.reward);
            if (!open[0]) break;
            if (!rules.startDish(s, open[0].id).ok) break;
            rules.finishDish(s, open[0].id);
            rules.serveGuest(s, open[0].id);
        }
    }
    // 升级:留一倍余钱,别把身家全砸进去
    for (let n = 0; n < 4; n++) {
        const best = Object.keys(UPGRADES)
            .map(k => ({ k, c: upgradeCost(k, s.upgrades[k]) }))
            .filter(x => x.c !== null && s.coins > x.c * 2)
            .sort((a, b) => a.c - b.c)[0];
        if (!best) break;
        rules.buyUpgrade(s, best.k);
    }
    // 伙计:能招就招(冬天才招得到,规则自己会挡)
    for (const c of CREW) if (!s.crew.includes(c.id)) rules.hireCrew(s, c.id);
    // 装扮:买得起就买
    for (const c of COSMETICS) if (!s.cosmetics.includes(c.id)) rules.buyCosmetic(s, c.id);
    // 小屋:一天一卦、一杯 —— 好感度是招伙计的门槛
    rules.castFortune(s);
    if (s.drink) rules.giveDrink(s);
}

function simulate(who, days, startMs) {
    const p = WHO[who];
    const s = createInitialState();
    T = startMs;
    s.lastSeen = T;
    s.lastDate = '';
    s.weatherAt = 0;
    const rows = [];
    let starvedDays = 0;

    // 从**当天零点**起算,不是从 startMs 起算 —— 后者会把「20 点上线」
    // 变成「开跑之后第 20 小时」,整条作息平移好几个钟头,
    // 于是纯挂机那档全落在小屋时段里,表演一次都没触发。第一版就栽在这儿。
    const midnight = new Date(startMs);
    midnight.setHours(0, 0, 0, 0);

    for (let d = 0; d < days; d++) {
        const day0 = midnight.getTime() + d * 86400_000;
        let starvedToday = false;

        for (const hour of p.sessions) {
            T = day0 + hour * 3600_000;
            rules.refreshDaily(s, new Date(T));
            rules.refreshWeather(s, T);

            const off = rules.settleOffline(s, T);
            if (off[0]?.starved?.length) starvedToday = true;

            // 觅食
            for (let i = 0; i < p.tries && s.dailyTries > 0; i++) {
                s.dailyTries--;
                rules.settleFlight(s, oneRun(who, s.level));
            }
            decide(s);

            // 在线:一秒一拍
            for (let m = 0; m < p.minutes * 60; m++) {
                T += 1000;
                const r = rules.tickStalls(s, T);
                if (r?.starved?.length) starvedToday = true;
            }
            decide(s);
        }
        // 这一天剩下的时间是离线的,推到第二天第一次上线时才结算
        if (starvedToday) starvedDays++;

        rows.push({
            day: d + 1,
            season: SEASONS[seasonOf(new Date(day0))].name,
            level: s.level,
            coins: s.coins,
            caps: s.caps,
            bag: Object.values(s.backpack).reduce((a, b) => a + b, 0),
            ach: s.achievements.length,
            wear: s.cosmetics.length,
            crew: s.crew.length,
            aff: s.affinity,
            up: Object.values(s.upgrades).reduce((a, b) => a + b, 0),
            maxed: Object.keys(UPGRADES).every(k => s.upgrades[k] >= UPGRADES[k].max),
            over: Object.values(s.backpack).some(v => v > 9999),
            served: s.stats.served,
            fed: s.stats.fed,
        });
    }
    return { s, rows, starvedDays };
}

/* ============================================================
   报告
   ============================================================ */

const args = process.argv.slice(2);
const arg = (k, d) => {
    const i = args.indexOf('--' + k);
    return i >= 0 ? args[i + 1] : d;
};
const days = Number(arg('days', 30));
const start = new Date(arg('start', '2026-01-05T08:00:00')).getTime();
const only = arg('who', null);
const csv = args.includes('--csv');

const pad = (v, n) => String(v).padStart(n);

for (const who of (only ? [only] : ['idle', 'casual', 'active'])) {
    const { s, rows, starvedDays } = simulate(who, days, start);
    const p = WHO[who];

    if (csv) {
        console.log(`# ${who}`);
        console.log('day,season,level,coins,caps,bag,ach,wear,crew,affinity,upgrades,served,fed');
        for (const r of rows) console.log(Object.values(r).join(','));
        continue;
    }

    console.log(`\n${'='.repeat(72)}`);
    console.log(`${p.name}(一天上 ${p.sessions.length} 次,每次 ${p.minutes} 分钟,`
        + `觅食 ${p.tries} 趟)· ${days} 天 · 从 ${new Date(start).toLocaleDateString('zh-CN')} 起`);
    console.log('='.repeat(72));
    console.log(' 天  季  级      鸥币   瓶盖   背包  成就  装扮 伙计 好感  升级  出餐   投喂');
    for (const r of rows) {
        if (r.day % Math.max(1, Math.round(days / 15)) && r.day !== days) continue;
        console.log(`${pad(r.day, 3)}  ${r.season}  ${pad(r.level, 2)} ${pad(r.coins, 9)}`
            + ` ${pad(r.caps, 5)} ${pad(r.bag, 6)} ${pad(r.ach, 5)} ${pad(r.wear, 5)}`
            + ` ${pad(r.crew, 4)} ${pad(r.aff, 4)} ${pad(r.up, 5)} ${pad(r.served, 6)} ${pad(r.fed, 6)}`);
    }

    const last = rows[rows.length - 1];
    const dayAt = f => rows.find(f)?.day ?? null;
    const say = (q, a) => console.log(`  ${q.padEnd(26, '·')} ${a}`);
    console.log('\n  ── 回答 ──');
    say('升到 10 级', dayAt(r => r.level >= 10) ? `第 ${dayAt(r => r.level >= 10)} 天` : `${days} 天没到,只有 ${last.level} 级`);
    say('买齐 5 件装扮', dayAt(r => r.wear >= COSMETICS.length) ? `第 ${dayAt(r => r.wear >= COSMETICS.length)} 天` : `没买齐,${last.wear}/${COSMETICS.length} 件,手上 ${last.caps} 根瓶盖`);
    say('招齐 6 只伙计', dayAt(r => r.crew >= 6) ? `第 ${dayAt(r => r.crew >= 6)} 天` : `没招齐,${last.crew}/6 只`);
    // 瓶盖按「已达成成就的档次」直接算,别拿「手上的 + 买掉的」倒推 ——
    // 引导那 5 根见面礼不是成就给的,倒推会算出超过 100% 的怪数
    const earned = ACHIEVEMENTS.filter(a => s.achievements.includes(a.id))
        .reduce((n, a) => n + CAP_VALUE[a.tier], 0);
    say('成就', `${last.ach}/${ACHIEVEMENTS.length},成就给了 ${earned}/${TOTAL_CAPS} 根瓶盖`);
    say('摊子断过料的天数', `${starvedDays}/${days} 天`);
    // 整条升级线一共要多少钱 —— 这是鸥币**唯一**的去处
    const treeCost = Object.entries(UPGRADES).reduce((sum, [k, u]) => {
        for (let lv = 1; lv < u.max; lv++) sum += upgradeCost(k, lv);
        return sum;
    }, 0);
    const maxDay = dayAt(r => r.maxed);
    const upMax = Object.values(UPGRADES).reduce((a, u) => a + u.max, 0);
    say('升级线', `${last.up}/${upMax} 级`
        + (maxDay ? ` — 第 ${maxDay} 天就买满了(全线一共 ${treeCost} 鸥币)` : ''));
    say('末日鸥币', `${last.coins}`
        + (maxDay ? ` —— 满级之后又赚了 ${last.coins - rows[maxDay - 1].coins},没处花` : ''));
    say('末日背包', `${last.bag} 个材料`
        + (dayAt(r => r.over) ? ` — 第 ${dayAt(r => r.over)} 天起有单样超过 9999(存档上限,重载会被削)` : ''));
    // 哪几样材料是瓶颈。总量爆掉不代表不缺 —— 缺的永远是那两三样稀有的,
    // 而摊子只要摆了用得上它们的菜,就会一直干烧。
    const low = Object.entries(s.backpack)
        .sort((a, b) => a[1] - b[1]).slice(0, 3)
        .map(([k, v]) => `${FOODS[k].name}${v}`).join(' ');
    const high = Object.entries(s.backpack)
        .sort((a, b) => b[1] - a[1])[0];
    say('材料最少的三样', `${low}(最多的是${FOODS[high[0]].name}${high[1]})`);

    const bySeason = {};
    for (const r of rows) (bySeason[r.season] ??= []).push(r);
    const perDay = Object.entries(bySeason).map(([k, v]) => {
        const gain = v[v.length - 1].served - v[0].served;
        return `${k}${(gain / v.length).toFixed(0)}份/天`;
    }).join(' ');
    say('各季出餐速度', perDay);
}

/**
 * 出摊的局面。**只管规则和背景画面,厨房那一堆家什是 DOM。**
 *
 * 为什么厨房不画在 canvas 上:这个玩法的核心动作是**把食材拖到厨具上**。
 * 在 440×310 的画布上做拖拽命中判定,手机上每个厨具不到一个指头宽,
 * 还得自己写惯性、自己画拖影、自己处理多点触控 —— 而这些浏览器本来就有。
 * 画布画它该画的:湖、柜台、排队的人、趴在柜台上的折耳根。
 *
 * 布局照着老爹快餐店那一路,压成一屏:
 *     上   订单
 *     中   砧板 / 煎盘 / 灶台
 *     左下 烤箱
 *     右   食谱 + 手上正在做的菜
 *
 * 一道菜的推进:
 *     开一道 → 它进 dishes,停在第 0 步
 *     把这一步的食材拖到对的厨具 → 占一格,开始计时
 *     在火候窗口里点一下端下来 → 记一次品质,进下一步
 *     所有步骤走完 → 自动装盘进出餐台,品质取几步的平均
 */

import { PixelScreen, sprite, drawStanding } from './pixmap.js';
import { SCENERY, ICON_GRIDS } from './pixels.js';
import { pal, shadow, drawRain, drawFog, VW, VH } from './scene.js';
import { now } from '../clock.js';
import { shadedSprite } from './tint.js';
import {
    RECIPES, RECIPE_STEPS, TOOLS, QUALITY, BURN_MS, SERVICE, HELPER, FOODS,
    GOOD_MIN_MS, GOOD_MAX_MS, MIN_STEP_MS, dayPhase,
} from '../data.js';
import * as rules from './rules.js';

// 出摊这一场的分层。**和大坝那一场的比例不一样是故意的** ——
// 大坝看的是风景,这儿看的是做菜。原来天和湖占了一半屏幕、案子挤在最底下
// 那一条,做菜的地方还没有空甲板大。现在外面压到 45%,案子那头拿走 55%。
const HORIZON = 52;
const RAIL_Y = 70;
const DECK_Y = 124;      // 游客脚下
const COUNTER_Y = 138;   // 柜台面

/**
 * 客人里有多大比例点「你现在做得出来的」。
 * 剩下那三成留给压力 —— 全给做得出来的,出摊就成了照着单子做。
 * **这是个可以调的旋钮**:嫌被问倒得太多就调高,嫌太顺就调低。
 */
const READY_BIAS = 0.7;

// 队伍只排在左边 —— 右边那 200px 被食谱面板盖着,排过去的人看不见
const QUEUE_X = [72, 154, 236, 318, 400];

/** 案板面的高度。案上那三件东西都踩在这条线上 */
export const BENCH_Y = 192;
const FRONT_Y = 196;     // 案子正面从这儿往下
const FLOOR_Y = 290;     // 地面

/**
 * 四件家什各自摆在哪儿。**这张表是画面和点击判定的同一个来源** ——
 * 画在这儿、点在那儿地各写一份坐标,挪个位置就会「看着在这儿、点不到」。
 *
 *   cx/by   精灵图的中心 x 和底边 y(drawStanding 就按这两个数摆)
 *   hit     点击/放下的判定框 [x, y, 宽, 高],比图本身大一圈 ——
 *           手指按下去的地方不会那么准,尤其砧板只有 14 高
 *   food    正在做的东西画在哪儿(底边中心),多个格子沿 x 排开
 *   bar     火候条画在哪儿。前三件在东西上方,烤箱的画在它自己的玻璃窗上
 */
export const STATIONS = {
    board: { key: 'kw_board', cx: 62,  by: BENCH_Y,
             hit: [36, 166, 54, 28],  food: { x: 62, y: 184, gap: 13 },
             bar: { x: 40, y: 168, w: 44 } },
    pan:   { key: 'kw_pan',   cx: 158, by: BENCH_Y,
             hit: [136, 164, 46, 30], food: { x: 152, y: 188, gap: 11 },
             bar: { x: 140, y: 166, w: 36 } },
    stove: { key: 'kw_stove', cx: 266, by: BENCH_Y,
             hit: [230, 148, 72, 46], food: { x: 266, y: 168, gap: 15 },
             bar: { x: 236, y: 146, w: 60 } },
    oven:  { key: 'kw_oven',  cx: 92,  by: 268,
             hit: [49, 220, 88, 50],  food: { x: 92, y: 252, gap: 17 },
             bar: { x: 57, y: 258, w: 70 } },
};

let uid = 1;

export class Service {
    constructor(canvas, getState, mutate, onChange) {
        this.screen = new PixelScreen(canvas, VW, VH);
        this.getState = getState;
        this.mutate = mutate;
        /** 局面变了(来人、走人、上灶、装盘)—— 重建界面 */
        this.onChange = onChange;
        /** 每帧一次,只用来刷进度条。界面自己装上,见 UI 构造函数 */
        this.onFrame = null;
        this.rafId = null;
        this.reset();
        this._loop = this._loop.bind(this);
    }

    reset() {
        this.t = 0;
        this.guests = [];
        this.dishes = [];
        /** 每件厨具上占着的活。长度跟着升级走,所以每次进场重算 */
        this.tools = {};
        for (const key of Object.keys(TOOLS)) {
            this.tools[key] = new Array(rules.toolInfo(this.getState(), key).slots).fill(null);
        }
        this.nextGuestAt = 2500;
        this.catAt = 0;
        this.sold = 0;
        this.gone = 0;
        this.lastGrade = null;
    }

    start() { if (!this.rafId) { this.last = 0; this.rafId = requestAnimationFrame(this._loop); } }
    stop() { if (this.rafId) cancelAnimationFrame(this.rafId); this.rafId = null; }

    /* ---------- 给界面看的快照 ---------- */

    snapshot() {
        const s = this.getState();
        return {
            guests: this.guests.map(g => ({
                id: g.id, want: g.want,
                left: Math.max(0, 1 - (this.t - g.at) / SERVICE.patienceMs),
                ready: (s.stock[g.want]?.n ?? 0) > 0,
            })),
            dishes: this.dishes.filter(d => RECIPE_STEPS[d.recipe]?.[d.step]).map(d => {
                const step = RECIPE_STEPS[d.recipe][d.step];
                return {
                    id: d.id, recipe: d.recipe, step: d.step,
                    total: RECIPE_STEPS[d.recipe].length,
                    ing: step.ing, tool: step.tool, stepName: step.name,
                    busy: d.busy,
                };
            }),
            tools: Object.fromEntries(Object.keys(TOOLS).map(k => [k,
                this.tools[k].map(j => j && this._cook(j))])),
            stock: s.stock,
            stockCount: rules.stockCount(s),
            sold: this.sold, gone: this.gone, lastGrade: this.lastGrade,
        };
    }

    /** 一格上正在做的东西:进度、火候档次 */
    _cook(j) {
        const p = (this.t - j.at) / j.ms;
        return {
            dishId: j.dishId, recipe: j.recipe, ing: j.ing, name: j.name,
            p: Math.min(1.6, p), ms: j.ms,
            grade: gradeOf(p, TOOLS[j.tool].window, j.ms),
        };
    }

    /* ---------- 玩家动作 ---------- */

    /** 开一道菜。材料这时就扣 */
    open(recipeId) {
        const r = this.mutate(st => rules.startDish(st, recipeId));
        if (!r.ok) return r;
        this.dishes.push({ id: uid++, recipe: recipeId, step: 0, quals: [], busy: false });
        this.onChange?.();
        return { ok: true, recipe: r.recipe };
    }

    /** 把某道菜的当前这一步放到某件厨具上 */
    place(dishId, toolKey) {
        const d = this.dishes.find(x => x.id === dishId);
        if (!d || d.busy) return { ok: false };
        const step = RECIPE_STEPS[d.recipe][d.step];
        if (step.tool !== toolKey) {
            return { ok: false, reason: `${step.name}要用${TOOLS[step.tool].name}` };
        }
        const line = this.tools[toolKey];
        const slot = line.indexOf(null);
        if (slot < 0) return { ok: false, reason: `${TOOLS[toolKey].name}满了` };

        const power = rules.toolInfo(this.getState(), toolKey).power;
        line[slot] = {
            dishId, recipe: d.recipe, ing: step.ing, name: step.name,
            // **升级只能快到 MIN_STEP_MS 为止。** 再往下压的话,
            // 「刚好」那一段跟着缩,花钱买来的是更难点中 —— 见 data.js 的注释
            tool: toolKey, at: this.t, ms: Math.max(MIN_STEP_MS, step.ms / power),
        };
        d.busy = true;
        this.onChange?.();
        return { ok: true };
    }

    /**
     * 这个客人点什么。**只点你今天做得出来的。**
     *
     * 原来是从「解锁了的菜」里随机抽 —— 于是常常有人点一道你根本缺料的菜,
     * 那一单就白占一个位子四十多秒,而玩家除了干等什么也做不了。
     * 这不是难度,是**运气惩罚**:摊子开着的时段本来就短,一个死单能吃掉
     * 十几分之一的营业时间。
     *
     * 现实里的摊子也是这样:今天没有的,牌子上大半不写 —— 但也总有人进来
     * 问一句「有没有那个谁」。所以是**七成点得出来的、三成随便点**(READY_BIAS)。
     *
     * 全给做得出来的太顺:出摊就成了照着单子做,没有「哎呀这个没料了」那一下。
     * 留三成是留压力,但它现在是**可以准备的压力** —— 玩家知道备料越全、
     * 被问倒的次数越少,这就和纯运气不一样了。
     *
     * 两头都兜底:没有能做的就全抽做不出来的,没有做不出来的就只抽能做的。
     */
    _pickWant(s) {
        const open = s.unlockedRecipes.filter(id => RECIPE_STEPS[id]);
        if (!open.length) return null;
        const ready = [], missing = [];
        for (const id of open) {
            const ok = (s.stock[id]?.n ?? 0) > 0 ||
                       rules.canAfford(s, RECIPES.find(r => r.id === id).cost);
            (ok ? ready : missing).push(id);
        }
        // **先按比例挑池子,再看池子空不空。** 反过来写的话,
        // 「没有做不出来的菜」那种情况会白白吃掉三成的抽签
        let pool = Math.random() < READY_BIAS ? ready : missing;
        if (!pool.length) pool = ready.length ? ready : missing;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /**
     * 端走这台上最该端的那一份 —— 走得最靠前的那格。
     *
     * 现在一台上可能同时有三格,但玩家看到的是「灶台上有东西」这一件事,
     * 不是三个编号。**让他指着东西说「这个」,而不是先数清是第几格。**
     */
    takeBest(toolKey) {
        const cells = this.tools[toolKey] ?? [];
        let best = -1, bp = -1;
        cells.forEach((j, i) => {
            if (!j) return;
            const p = (this.t - j.at) / j.ms;
            if (p > bp) { bp = p; best = i; }
        });
        return best < 0 ? { ok: false } : this.take(toolKey, best);
    }

    /** 从厨具上端下来。火候就是在这一下定的 */
    take(toolKey, slot) {
        const j = this.tools[toolKey]?.[slot];
        if (!j) return { ok: false };
        const c = this._cook(j);
        this.tools[toolKey][slot] = null;

        const d = this.dishes.find(x => x.id === j.dishId);
        if (!d) { this.onChange?.(); return { ok: true }; }
        d.busy = false;
        d.quals.push(QUALITY[c.grade].mul);
        d.step++;
        this.lastGrade = c.grade;

        if (d.step >= RECIPE_STEPS[d.recipe].length) {
            const q = d.quals.reduce((a, b) => a + b, 0) / d.quals.length;
            // **先从 dishes 里摘掉再 mutate。** mutate 会顺手触发一次重绘,
            // 而这时 d.step 已经越过最后一步 —— 快照里去读第 step 步会拿到 undefined。
            // 「改完状态再通知」这条,在同步重绘的架子上必须严格照办。
            this.dishes = this.dishes.filter(x => x.id !== d.id);
            this.mutate(st => rules.finishDish(st, d.recipe, q));
            this.onChange?.();
            return { ok: true, done: true, recipe: d.recipe, grade: c.grade, quality: q };
        }
        this.onChange?.();
        return { ok: true, grade: c.grade };
    }

    serve(guestId) {
        const i = this.guests.findIndex(g => g.id === guestId);
        if (i < 0) return { ok: false };
        const g = this.guests[i];
        const r = this.mutate(st => rules.serveGuest(st, g.want));
        if (!r.ok) return r;
        this.guests.splice(i, 1);
        this.sold++;
        this.onChange?.();
        return r;
    }

    /* ---------- 推进 ---------- */

    _tick(dt) {
        this.t += dt;
        let changed = false;
        const s = this.getState();

        // 来人。招牌越好来得越勤
        const come = SERVICE.comeMs / Math.max(0.6, rules.stallInfo(s).priceMul);
        if (this.t >= this.nextGuestAt && this.guests.length < SERVICE.queueMax) {
            this.nextGuestAt = this.t + come * (0.7 + Math.random() * 0.6);
            const want = this._pickWant(s);
            if (want) {
                this.guests.push({
                    id: uid++, at: this.t, face: Math.floor(Math.random() * 4),
                    want,
                });
                changed = true;
            }
        }
        // 等不及就走
        for (let i = this.guests.length - 1; i >= 0; i--) {
            if (this.t - this.guests[i].at > SERVICE.patienceMs) {
                this.guests.splice(i, 1); this.gone++; changed = true;
            }
        }
        // 折耳根站柜台:做好的菜她会端给对的客人,但她是猫,慢。
        // 你自己动手总比她快 —— 她兜底,不抢活。
        if (this.t - this.catAt >= HELPER.serveMs) {
            const g = this.guests.find(x => (s.stock[x.want]?.n ?? 0) > 0);
            if (g) { this.catAt = this.t; this.serve(g.id); changed = true; }
        }
        // **只有局面变了才通知重绘。**
        // 原来这儿还有一条「每 200 毫秒也算变了」,为的是让火候进度条动起来 ——
        // 代价是整个厨房的 innerHTML 一秒重建五次:页面一闪一闪,拖到一半的
        // 那张牌被换掉,拖拽根本没法用。进度条现在走 onFrame,只改几个
        // style.width,不碰结构。
        if (changed) this.onChange?.();
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this._tick(dt);
        this._draw();
        // 每帧只刷进度条那几根,不重建结构 —— 和摊位那几条进度条一个路子
        this.onFrame?.();
    }

    /* ---------- 背景 ---------- */

    _draw() {
        const { ctx } = this.screen;
        // 天光跟着真时间走,不写死成白天 —— 摊子现在开到 19:00,
        // 傍晚那一段外面的大坝是橘的,摊子还亮得像正午的话,一眼就出戏
        const phase = dayPhase(now());
        const P = pal(this.getState().weather ?? 'sunny', phase);
        paintBackdrop(ctx, P);
        this._drawGuests(ctx);
        paintCounter(ctx, P);
        this._drawCat(ctx, phase);
        this._drawStations(ctx);
        this._drawPlates(ctx);
        // 天气也得下到这一场来。**大坝那边一直有,这边从来没画过** ——
        // 雨天的出摊界面于是是一整片没有雨的灰,看着就像贴图坏了。
        // 只下到栏杆那一线为止:柜台以里是棚子底下,淋不着
        const weather = this.getState().weather ?? 'sunny';
        if (weather === 'rainy') drawRain(ctx, this.t, RAIL_Y + 6);
        if (weather === 'foggy') drawFog(ctx, this.t, RAIL_Y + 6);
        this.screen.present();
    }

    _drawGuests(ctx) {
        const KEYS = ['onlooker_a', 'onlooker_b', 'onlooker_c', 'onlooker_d'];
        this.guests.forEach((g, i) => {
            const x = QUEUE_X[i] ?? QUEUE_X[QUEUE_X.length - 1];
            const key = KEYS[g.face % KEYS.length];
            // 影子。大坝那边的人都有,这边一直漏了 ——
            // 没影子的人不管画得多好,都是**贴**在背景上的
            shadow(ctx, x, DECK_Y - 2, 12, 0.16);
            drawStanding(ctx, sprite(key, SCENERY[key]), x, DECK_Y - 2);
            const top = DECK_Y - 28;
            bubble(ctx, x, top, g.want);
            // 耐心条**画进气泡里**,贴着它的下沿。
            // 原来吊在气泡上方三格,那个位置正好压在栏杆上 ——
            // 一条绿杠浮在栏杆上、和底下的人看不出关系,读起来就是一处坏图。
            // 它是「这一单还能等多久」,本来就该长在这一单的牌子上。
            const left = Math.max(0, 1 - (this.t - g.at) / SERVICE.patienceMs);
            ctx.fillStyle = '#4a3628';
            ctx.fillRect(x - 10, top - 6, 20, 3);
            ctx.fillStyle = left > 0.45 ? '#77b255' : left > 0.2 ? '#f5b83d' : '#e8384f';
            ctx.fillRect(x - 9, top - 5, Math.round(18 * left), 1);
        });
    }

    /**
     * 案上那四件家什,以及每件上头正在做的东西和它的火候条。
     *
     * **东西画在画布上,判定框在 DOM 上**,两边共用 STATIONS 那张表。
     * 原来这四件是四个一模一样的木框子,框里几个方格 —— 看着像流水线的工位。
     * 现在它们各是各的形状、各占各的地方,拖过去就是把菜放到那件东西上。
     */
    _drawStations(ctx) {
        for (const [key, st] of Object.entries(STATIONS)) {
            const cv = sprite(st.key, SCENERY[st.key]);
            drawStanding(ctx, cv, st.cx, st.by);

            const jobs = this.tools[key].map(j => j && this._cook(j)).filter(Boolean);
            if (!jobs.length) continue;

            // 灶台和烤箱在烧的时候炉膛里见火。坐标是各自那张图上炉门的位置
            if (key === 'stove') this._fire(ctx, 167, 171, 42, 10, jobs);
            if (key === 'oven')  this._fire(ctx, 38,  239, 56, 14, jobs);

            const n = jobs.length;
            jobs.forEach((j, i) => {
                const x = st.food.x + (i - (n - 1) / 2) * st.food.gap;
                const g = ICON_GRIDS[FOODS[j.ing].icon];
                if (g) drawStanding(ctx, sprite(FOODS[j.ing].icon, g), x, st.food.y);
            });
            this._bar(ctx, st, key, jobs);
        }
    }

    /**
     * 炉膛里的火。做得越久烧得越旺,焦了转成暗红。
     *
     * **画成一排高低不齐的火苗,不是一条色带。** 一条整齐的橙色横条读起来
     * 是「进度条」或者「贴图坏了」,只有参差的舌头才像在烧。
     */
    _fire(ctx, x, y, w, h, jobs) {
        const hottest = Math.max(...jobs.map(j => Math.min(1.2, j.p)));
        const burnt = jobs.some(j => j.grade === 'burnt');
        const base = burnt ? '#8a2f1e' : '#c14e33';
        const tip = burnt ? '#c14e33' : '#f5b83d';
        ctx.fillStyle = '#3a1d12';
        ctx.fillRect(x, y, w, h);
        // 火苗的高低按位置定死,不随机 —— 每帧换一套高度会闪得人眼疼
        const H = [0.55, 0.85, 0.7, 1, 0.6, 0.9, 0.75, 0.95, 0.65, 0.8];
        const step = 4;
        for (let i = 0; x + i * step < x + w; i++) {
            const grow = 0.35 + Math.min(1, hottest) * 0.65;
            const t = Math.max(2, Math.round(h * H[i % H.length] * grow));
            ctx.fillStyle = base;
            ctx.fillRect(x + i * step, y + h - t, step - 1, t);
            ctx.fillStyle = tip;
            ctx.fillRect(x + i * step, y + h - Math.round(t * 0.45), step - 1, Math.round(t * 0.45));
        }
    }

    /**
     * 火候条。**「刚好」那一段画成一块亮的** —— 玩家盯的是这块,不是数字。
     * 条子紧贴着东西本身,不另开一处:眼睛不用在两个地方来回跑。
     */
    _bar(ctx, st, key, jobs) {
        const { x, y, w } = st.bar;
        ctx.fillStyle = '#241a13';
        ctx.fillRect(x - 1, y - 1, w + 2, 7);
        ctx.fillStyle = '#5f6d78';
        ctx.fillRect(x, y, w, 5);
        const j = jobs.reduce((a, b) => (b.p > a.p ? b : a));
        // **绿带子必须和 gradeOf 算的是同一段。** 这儿要是还按原始 window 画,
        // 玩家瞄的位置和实际判定就对不上 —— 明明卡在绿带子里却判了个「生的」,
        // 那是最让人下头的一种不公平。所以这两处共用一套算法。
        const win = goodBand(TOOLS[key].window, j.ms);
        ctx.fillStyle = 'rgba(119,178,85,.85)';
        ctx.fillRect(x + Math.round(w * (1 - win) / 1.6), y,
                     Math.round(w * win * 1.8 / 1.6), 5);
        ctx.fillStyle = QUALITY[j.grade].color;
        ctx.fillRect(x, y, Math.round(w * Math.min(1, j.p / 1.6)), 5);
        // 刚好的时候给条子镶一道金边,余光里也能看见
        if (j.grade === 'good') {
            ctx.fillStyle = '#f5b83d';
            ctx.fillRect(x - 1, y - 1, w + 2, 1);
            ctx.fillRect(x - 1, y + 5, w + 2, 1);
        }
    }

    /** 案子右边那一摞做好的。出餐台以前只是右栏里一个数字,现在看得见 */
    _drawPlates(ctx) {
        const stock = this.getState().stock ?? {};
        let i = 0;
        for (const [id, o] of Object.entries(stock)) {
            for (let n = 0; n < (o?.n ?? 0) && i < 8; n++, i++) {
                const x = 356 + (i % 3) * 34;
                const y = BENCH_Y - (i < 3 ? 0 : 15);
                ctx.fillStyle = '#4a3628';
                ctx.fillRect(x - 11, y - 4, 22, 4);
                ctx.fillStyle = o.q > 0.85 ? '#f7ecca' : o.q > 0.6 ? '#dfc98e' : '#b8b0a0';
                ctx.fillRect(x - 10, y - 3, 20, 2);
                const r = RECIPES.find(v => v.id === id);
                const g = r && ICON_GRIDS[r.icon];
                if (g) drawStanding(ctx, sprite(r.icon, g), x, y - 3);
            }
        }
    }

    /** 折耳根在柜台后面。上班的时候她坐在这儿,尾巴一甩一甩 */
    _drawCat(ctx, phase) {
        const cv = shadedSprite('cat_work', SCENERY.cat_work, phase);
        const bob = Math.sin(this.t * 0.0021) > 0 ? 0 : 1;
        drawStanding(ctx, cv, 470, COUNTER_Y + 2 + bob);
    }
}

/**
 * 火候判定。进度 p 从 0 走到 1;`window` 是「刚好」那一段占的比例,贴着 1 结束。
 * 走过 1 开始糊,再过 BURN_MS 彻底焦。
 */
/**
 * 这一步实际的「刚好」半宽。
 *
 * 名义上窗口是时长的一个比例,但**两头都夹住**:
 *
 *   下限 GOOD_MIN_MS  太短的一步,窗口不到一秒,同时开三四样时够不着
 *   上限 GOOD_MAX_MS  太长的一步,窗口宽到二十几秒,等于不用看火 ——
 *                     结果是越贵越慢的菜火候越不用管,正好反了
 *
 * 一整段的宽度是 1.8w(早 1.0w + 晚 0.8w),由此从毫秒反解出 w。
 *
 * **判定和画条子共用这一个函数** —— 两边各算一套的话,
 * 玩家会遇到「明明停在绿带子里却判了生的」,那是最让人下头的不公平。
 */
export const goodBand = (window, ms) => {
    const span = 1.8 * Math.max(1, ms);
    return Math.min(GOOD_MAX_MS / span, Math.max(GOOD_MIN_MS / span, window));
};

export function gradeOf(p, window, ms) {
    const w = goodBand(window, ms);
    if (p < 1 - w) return 'raw';               // 还没到
    if (p <= 1 + w * 0.8) return 'good';       // 刚好那一段,跨过 1 一点还来得及
    return 'burnt';                            // 过了就糊
}

/* ---------- 背景各层 ---------- */

function paintBackdrop(ctx, P) {
    const step = HORIZON / P.sky.length;
    P.sky.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, Math.round(i * step), VW, Math.ceil(step) + 1);
    });
    const seaStep = (RAIL_Y - HORIZON) / P.sea.length;
    P.sea.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, Math.round(HORIZON + i * seaStep), VW, Math.ceil(seaStep) + 1);
    });
    ctx.fillStyle = P.crest;
    for (let i = 0; i < 20; i++) {
        ctx.fillRect((i * 53) % VW, HORIZON + 4 + (i * 5) % Math.max(1, RAIL_Y - HORIZON - 6), 5, 1);
    }
    const S = P.stone;
    ctx.fillStyle = S.ink; ctx.fillRect(0, RAIL_Y, VW, 3);
    ctx.fillStyle = S.light; ctx.fillRect(0, RAIL_Y + 1, VW, 1);
    for (let x = 12; x < VW; x += 44) { ctx.fillStyle = S.ink; ctx.fillRect(x, RAIL_Y, 3, 13); }
    // 客人站的那条甲板。**是地板,不是墙。**
    //
    // 原来这儿是一整片木色 + 每 23 格一道**竖**缝 —— 竖缝画在一块平贴的
    // 木色上,读出来就是一堵板壁,客人于是像贴在墙上,整片透视全塌了。
    // 地板要的是三件事:
    //
    //   横的板缝    人眼是靠线的方向判断这个面是躺着的还是立着的
    //   前后有明暗  贴着栏杆那头在阴影里,靠近柜台这头受光
    //   一道前沿    地板到柜台之间那条暗边,是「这儿有个高差」的唯一交代
    const W = P.wood;
    ctx.fillStyle = W.ink;  ctx.fillRect(0, RAIL_Y + 13, VW, VH - RAIL_Y - 13);
    const deckTop = RAIL_Y + 15, deckH = DECK_Y - deckTop;
    for (let i = 0; i < 3; i++) {                       // 从后往前一层层提亮
        ctx.fillStyle = [W.dark, W.wood, W.light][i];
        ctx.fillRect(0, deckTop + Math.round(deckH * i / 3), VW,
                     Math.ceil(deckH / 3) + 1);
    }
    ctx.fillStyle = W.ink;                              // 横板缝,越靠前越宽
    let y = deckTop + 4, gap = 5;
    while (y < DECK_Y - 2) { ctx.fillRect(0, y, VW, 1); y += gap; gap += 2; }
    ctx.fillRect(0, DECK_Y - 2, VW, 2);                 // 前沿
}

/**
 * 柜台,以及柜台里头那一片。
 *
 * 柜台以下占了画面下面 44%。原来那儿是一整块 `#241a13` 的纯色 ——
 * 注释写着「交给 DOM 的厨房盖住」,但 DOM 只盖住了厨具那几个盒子,
 * 盒子之间、烤箱右边、操作条周围全露着,一大片死黑,看着像贴图没加载出来。
 *
 * 现在按**摊子里边**来画:横铺的木板墙、一道搁板、脚下的地面,
 * 顶上再压一道从外面漏进来的光。露出来的地方就都是该露的东西了。
 */
function paintCounter(ctx, P) {
    const W = P.wood;
    ctx.fillStyle = W.ink;   ctx.fillRect(0, DECK_Y, VW, VH - DECK_Y);
    ctx.fillStyle = W.light; ctx.fillRect(0, DECK_Y + 2, VW, 7);
    ctx.fillStyle = W.wood;  ctx.fillRect(0, DECK_Y + 9, VW, COUNTER_Y - DECK_Y);
    ctx.fillStyle = W.dark;  ctx.fillRect(0, COUNTER_Y, VW, 3);
    paintInterior(ctx, P);
}

/**
 * 柜台里边:板壁 + 搁板 + **案子** + 地面。
 *
 * 案子是后加的:四件家什得站在什么东西上,悬在空中的灶台不成立。
 * 案面那条线就是 BENCH_Y —— 家什的底边全踩在它上面,烤箱嵌在案子正面。
 */
function paintInterior(ctx, P) {
    const top = COUNTER_Y + 3;
    const night = P.night;
    // 夜里整体压暗一档,但**绝不压到纯黑** —— 分不出层次的暗和坏图没区别
    const wall = night ? '#4a3524' : '#5e4229';
    const plank = night ? '#3d2b1d' : '#4e3722';
    const glow = night ? '#6b4d2f' : '#8a6039';

    ctx.fillStyle = wall;
    ctx.fillRect(0, top, VW, FRONT_Y - top);
    // 横板:每 11 像素一道缝,靠上的几道亮一点(外面的光斜着照进来)
    for (let y = top + 11; y < BENCH_Y - 6; y += 11) {
        const near = 1 - Math.min(1, (y - top) / 70);
        ctx.fillStyle = near > 0.35 ? glow : plank;
        ctx.fillRect(0, y, VW, 1);
    }
    ctx.fillStyle = glow;
    ctx.fillRect(0, top, VW, 2);

    // 一道搁板。上面摆几个坛子罐子,让这面墙不只是一面墙
    const shelfY = top + 26;
    ctx.fillStyle = plank; ctx.fillRect(0, shelfY, VW, 3);
    ctx.fillStyle = glow;  ctx.fillRect(0, shelfY, VW, 1);
    const jars = [[18, 9, '#9c6b43'], [34, 7, '#7d8a6b'], [206, 8, '#9c6b43'],
                  [224, 6, '#8a5a4a'], [300, 9, '#7d8a6b'], [318, 7, '#9c6b43']];
    for (const [x, h, c] of jars) {
        ctx.fillStyle = night ? '#4a3524' : c;
        ctx.fillRect(x, shelfY - h, 10, h);
        ctx.fillStyle = plank;
        ctx.fillRect(x, shelfY - h - 2, 10, 2);
    }

    // 案面。**这条亮边就是「东西站在上面」那句话** ——
    // 少了它,家什看着是贴在墙上而不是摆在案上
    ctx.fillStyle = '#4a3628'; ctx.fillRect(0, BENCH_Y - 6, VW, 2);
    ctx.fillStyle = night ? '#a97f52' : '#cf9862'; ctx.fillRect(0, BENCH_Y - 4, VW, 4);
    ctx.fillStyle = night ? '#c49a68' : '#e0b077'; ctx.fillRect(0, BENCH_Y - 4, VW, 1);
    ctx.fillStyle = '#4a3628'; ctx.fillRect(0, BENCH_Y, VW, 2);

    // 案子正面。烤箱嵌在左边,右边是两格敞开的架子 ——
    // **这一片占了三成屏幕,空着就是三成的空。** 摊子底下本来就堆着东西:
    // 摞起来的碗、装米线的筐、几袋米、一只煤气罐。
    ctx.fillStyle = night ? '#6b4a2e' : '#9c6b43';
    ctx.fillRect(0, FRONT_Y, VW, FLOOR_Y - FRONT_Y);
    ctx.fillStyle = night ? '#4a3524' : '#6b4a2e';
    ctx.fillRect(0, FRONT_Y, VW, 2);
    paintUnderBench(ctx, night);

    // 地面:比案子暗,给一条踢脚线分开
    ctx.fillStyle = plank;  ctx.fillRect(0, FLOOR_Y, VW, VH - FLOOR_Y);
    ctx.fillStyle = wall;   ctx.fillRect(0, FLOOR_Y, VW, 2);
    ctx.fillStyle = night ? '#33241a' : '#42301e';
    for (let x = 6; x < VW; x += 29) ctx.fillRect(x, FLOOR_Y + 2, 1, VH - FLOOR_Y - 2);
}

/** 案子底下那两格敞开的架子。摊子底下堆的东西,不是装饰,是这行的样子 */
function paintUnderBench(ctx, night) {
    const dim = c => (night ? mixHex(c, '#2a1d14', 0.45) : c);

    /**
     * 案子底下那两格架子。
     *
     * 返工过一轮,两个毛病是连着的:
     *
     * **一、东西太多太小。** 原来塞了十五件(三摞碗、三个米袋、三个竹筐、
     * 三层蒸笼、煤气罐),每件只有二十来格,挤在一片暗色里全成了「带条纹的
     * 方块」。少画几件、每件画大一点,反而看得清是什么。
     *
     * **二、透视对不上。** 上面的案面是往前递进的横板,这儿却是完全正面的
     * 平面 —— 一个说「稍微俯视」,一个说「正对着看」。
     * 修法是让每层隔板**露出顶面**:先画板的顶面,东西摆在顶面上,
     * 最后再把板的前沿压在东西的脚上。这一压就是「它站在板子上」那句话。
     */
    const top = FRONT_Y + 8, bot = FLOOR_Y - 4;
    const mid = Math.round((top + bot) / 2);

    const backPanel = (x, w) => {
        ctx.fillStyle = dim('#2a1d14'); ctx.fillRect(x, top, w, bot - top);
        ctx.fillStyle = dim('#3d2b1d'); ctx.fillRect(x, top, w, 3);
        ctx.fillStyle = dim('#6b4a2e');                                   // 立柱
        ctx.fillRect(x - 3, top - 2, 3, bot - top + 4);
        ctx.fillRect(x + w, top - 2, 3, bot - top + 4);
        ctx.fillStyle = dim('#8a6039');
        ctx.fillRect(x - 3, top - 2, 1, bot - top + 4);
        ctx.fillRect(x + w, top - 2, 1, bot - top + 4);
    };
    /** 隔板的顶面。东西就摆在这一条上 */
    const boardTop = (x, y, w) => {
        ctx.fillStyle = dim('#8a6039'); ctx.fillRect(x, y - 3, w, 3);
    };
    /** 隔板的前沿。**最后画**,压住东西的脚 —— 这一压就是「摆在板上」 */
    const boardLip = (x, y, w) => {
        ctx.fillStyle = dim('#4e3722'); ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = '#241a13';      ctx.fillRect(x, y + 3, w, 1);
    };

    /** 一摞碗。碗口朝上收一格,才不是一叠纸 */
    const bowls = (x, y, n, c) => {
        for (let i = 0; i < n; i++) {
            const yy = y - i * 6;
            ctx.fillStyle = '#241a13';      ctx.fillRect(x, yy - 6, 22, 6);
            ctx.fillStyle = dim(c);         ctx.fillRect(x + 1, yy - 5, 20, 4);
            ctx.fillStyle = dim('#241a13'); ctx.fillRect(x + 2, yy - 5, 18, 1);
        }
        ctx.fillStyle = '#241a13';  ctx.fillRect(x + 2, y - n * 6 - 2, 18, 2);
        ctx.fillStyle = dim('#fffdf4'); ctx.fillRect(x + 3, y - n * 6 - 1, 16, 1);
    };
    /** 一袋米:上窄下宽,口扎起来 */
    const sack = (x, y, w, h, c) => {
        ctx.fillStyle = '#241a13';
        ctx.fillRect(x, y - h, w, h);
        ctx.fillRect(x + 3, y - h - 5, w - 6, 5);
        ctx.fillStyle = dim(c);
        ctx.fillRect(x + 1, y - h + 1, w - 2, h - 1);
        ctx.fillRect(x + 4, y - h - 4, w - 8, 4);
        ctx.fillStyle = dim('#fffdf4'); ctx.fillRect(x + 2, y - h + 2, 3, h - 4);
        ctx.fillStyle = '#241a13';      ctx.fillRect(x + 2, y - h - 1, w - 4, 2);
    };
    /** 装米线的竹筐:竖纹 + 露在外头的一把米线 */
    const basket = (x, y, w, h) => {
        ctx.fillStyle = '#241a13';      ctx.fillRect(x, y - h, w, h);
        ctx.fillStyle = dim('#cf9862'); ctx.fillRect(x + 1, y - h + 1, w - 2, h - 2);
        ctx.fillStyle = dim('#9c6b43');
        for (let i = 2; i < w - 2; i += 4) ctx.fillRect(x + i, y - h + 4, 2, h - 6);
        ctx.fillStyle = dim('#e0b077'); ctx.fillRect(x + 1, y - h + 1, w - 2, 3);
        ctx.fillStyle = dim('#fffdf4'); ctx.fillRect(x + 4, y - h - 2, w - 8, 3);
        ctx.fillStyle = '#241a13';      ctx.fillRect(x + 4, y - h - 3, w - 8, 1);
    };

    /* ---------- 左边那格:碗 + 米袋 ---------- */
    backPanel(186, 96);
    boardTop(183, mid, 102);
    bowls(196, mid - 3, 3, '#f7ecca');
    bowls(236, mid - 3, 2, '#dfe4e8');
    boardLip(183, mid, 102);
    boardTop(183, bot, 102);
    sack(194, bot - 3, 32, 30, '#dfc98e');
    sack(236, bot - 3, 30, 26, '#b8b0a0');
    boardLip(183, bot, 102);

    /* ---------- 右边那格:竹筐 + 蒸笼 + 煤气罐 ---------- */
    backPanel(324, 100);
    boardTop(321, mid, 106);
    basket(332, mid - 3, 38, 22);
    basket(380, mid - 3, 38, 22);
    boardLip(321, mid, 106);
    boardTop(321, bot, 106);
    for (let i = 0; i < 3; i++) {                                       // 一摞蒸笼
        const yy = bot - 3 - i * 9;
        ctx.fillStyle = '#241a13';      ctx.fillRect(332, yy - 9, 44, 9);
        ctx.fillStyle = dim('#cf9862'); ctx.fillRect(333, yy - 8, 42, 7);
        ctx.fillStyle = dim('#e0b077'); ctx.fillRect(333, yy - 8, 42, 2);
    }
    const gx = 386, gy = bot - 3;                                       // 煤气罐
    ctx.fillStyle = '#241a13';      ctx.fillRect(gx, gy - 34, 28, 34);
    ctx.fillStyle = '#241a13';      ctx.fillRect(gx + 3, gy - 38, 22, 4);
    ctx.fillStyle = dim('#8a99a3'); ctx.fillRect(gx + 1, gy - 33, 26, 33);
    ctx.fillStyle = dim('#8a99a3'); ctx.fillRect(gx + 4, gy - 37, 16, 4);
    ctx.fillStyle = dim('#dfe4e8'); ctx.fillRect(gx + 3, gy - 33, 4, 32);
    ctx.fillStyle = dim('#5f6d78'); ctx.fillRect(gx + 1, gy - 20, 26, 3);
    ctx.fillStyle = '#241a13';      ctx.fillRect(gx + 10, gy - 44, 8, 6);
    ctx.fillStyle = dim('#5f6d78'); ctx.fillRect(gx + 11, gy - 43, 6, 4);
    boardLip(321, bot, 106);
}

/** 两个十六进制色按比例混。夜里把架子上的东西整体压暗一档用 */
function mixHex(a, b, k) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const m = (x, y) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
    return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

function bubble(ctx, cx, y, recipeId) {
    const r = RECIPES.find(v => v.id === recipeId);
    ctx.fillStyle = '#fffdf4';
    ctx.fillRect(cx - 12, y - 22, 24, 20);
    ctx.fillStyle = '#4a3628';
    ctx.fillRect(cx - 13, y - 23, 26, 1);
    ctx.fillRect(cx - 13, y - 2, 26, 1);
    ctx.fillRect(cx - 13, y - 22, 1, 20);
    ctx.fillRect(cx + 12, y - 22, 1, 20);
    ctx.fillRect(cx - 2, y - 1, 4, 3);
    if (r && ICON_GRIDS[r.icon]) ctx.drawImage(sprite(r.icon, ICON_GRIDS[r.icon]), cx - 8, y - 20);
}

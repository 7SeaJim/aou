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
import { pal, VW, VH } from './scene.js';
import { now } from '../clock.js';
import { shadedSprite } from './tint.js';
import {
    RECIPES, RECIPE_STEPS, TOOLS, QUALITY, BURN_MS, SERVICE, HELPER, dayPhase,
} from '../data.js';
import * as rules from './rules.js';

const HORIZON = 76;
const RAIL_Y = 100;
const DECK_Y = 158;      // 游客脚下
const COUNTER_Y = 170;   // 柜台面

// 队伍只排在左边 —— 右边那 200px 被食谱面板盖着,排过去的人看不见
const QUEUE_X = [52, 108, 164, 220, 276];

let uid = 1;

export class Service {
    constructor(canvas, getState, mutate, onChange) {
        this.screen = new PixelScreen(canvas, VW, VH);
        this.getState = getState;
        this.mutate = mutate;
        this.onChange = onChange;
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
            p: Math.min(1.6, p),
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
            tool: toolKey, at: this.t, ms: step.ms / power,
        };
        d.busy = true;
        this.onChange?.();
        return { ok: true };
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
            const open = s.unlockedRecipes.filter(id => RECIPE_STEPS[id]);
            if (open.length) {
                this.guests.push({
                    id: uid++, at: this.t, face: Math.floor(Math.random() * 4),
                    want: open[Math.floor(Math.random() * open.length)],
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
        // 火候到点了要提醒一下:进度条本身在动,这里只管重绘节奏
        if (Math.floor(this.t / 200) !== Math.floor((this.t - dt) / 200)) changed = true;
        if (changed) this.onChange?.();
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this._tick(dt);
        this._draw();
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
        this.screen.present();
    }

    _drawGuests(ctx) {
        const KEYS = ['onlooker_a', 'onlooker_b', 'onlooker_c', 'onlooker_d'];
        this.guests.forEach((g, i) => {
            const x = QUEUE_X[i] ?? QUEUE_X[QUEUE_X.length - 1];
            const key = KEYS[g.face % KEYS.length];
            drawStanding(ctx, sprite(key, SCENERY[key]), x, DECK_Y);
            const top = DECK_Y - 26;
            bubble(ctx, x, top, g.want);
            const left = Math.max(0, 1 - (this.t - g.at) / SERVICE.patienceMs);
            ctx.fillStyle = '#4a3628';
            ctx.fillRect(x - 11, top - 26, 22, 4);
            ctx.fillStyle = left > 0.45 ? '#77b255' : left > 0.2 ? '#f5b83d' : '#e8384f';
            ctx.fillRect(x - 10, top - 25, Math.round(20 * left), 2);
        });
    }

    /** 折耳根在柜台后面。上班的时候她坐在这儿,尾巴一甩一甩 */
    _drawCat(ctx, phase) {
        const cv = shadedSprite('cat_work', SCENERY.cat_work, phase);
        const bob = Math.sin(this.t * 0.0021) > 0 ? 0 : 1;
        drawStanding(ctx, cv, 320, COUNTER_Y + 2 + bob);
    }
}

/**
 * 火候判定。进度 p 从 0 走到 1;`window` 是「刚好」那一段占的比例,贴着 1 结束。
 * 走过 1 开始糊,再过 BURN_MS 彻底焦。
 */
export function gradeOf(p, window, ms) {
    if (p < 1 - window) return 'raw';          // 还没到
    if (p <= 1 + window * 0.6) return 'good';  // 刚好那一段,跨过 1 一点还来得及
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
    const W = P.wood;
    ctx.fillStyle = W.ink; ctx.fillRect(0, RAIL_Y + 13, VW, VH - RAIL_Y - 13);
    ctx.fillStyle = W.wood; ctx.fillRect(0, RAIL_Y + 15, VW, DECK_Y - RAIL_Y - 15);
    ctx.fillStyle = W.dark;
    for (let x = 10; x < VW; x += 23) ctx.fillRect(x, RAIL_Y + 15, 1, DECK_Y - RAIL_Y - 15);
}

/** 柜台。它下面那一大片交给 DOM 的厨房盖住,所以只画到台面 */
function paintCounter(ctx, P) {
    const W = P.wood;
    ctx.fillStyle = W.ink;   ctx.fillRect(0, DECK_Y, VW, VH - DECK_Y);
    ctx.fillStyle = W.light; ctx.fillRect(0, DECK_Y + 2, VW, 7);
    ctx.fillStyle = W.wood;  ctx.fillRect(0, DECK_Y + 9, VW, COUNTER_Y - DECK_Y);
    ctx.fillStyle = W.dark;  ctx.fillRect(0, COUNTER_Y, VW, 3);
    ctx.fillStyle = '#241a13'; ctx.fillRect(0, COUNTER_Y + 3, VW, VH - COUNTER_Y - 3);
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

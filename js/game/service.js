/**
 * 出摊:白天亲手做菜卖给游客。越肩视角 —— 我们站在哇鸥背后往外看。
 *
 * 从下往上四层:哇鸥的后脑勺(压在最下,只露一点)→ 工作台(灶台 / 烤箱 /
 * 出餐台)→ 柜台 → 柜台外面排队的游客 → 更远处的湖。
 *
 * **画布只负责看,操作在下面的面板里。** 在 440×310 的画布上做点击判定,
 * 手机上那几个工位每个不到一个指头宽 —— 那不是操作,那是抽奖。
 * 面板上是正经按钮,画布告诉你现在是个什么局面。
 *
 * 做菜的过程**不进存档**:走开就没了,材料也搭进去(materials 在开工时就扣,
 * 理由见 rules.js 的 startDish)。**只有做好的成品进存档** ——
 * 「游客不在的时候提前做」这件事,靠的就是成品留得住。
 */

import { PixelScreen, sprite, drawStanding } from './pixmap.js';
import { SCENERY, ICON_GRIDS } from './pixels.js';
import { pal, VW, VH } from './scene.js';
import { shadedSprite } from './tint.js';
import { RECIPES, RECIPE_STEPS, STATIONS, SERVICE, FOODS } from '../data.js';
import * as rules from './rules.js';

const HORIZON = 84;
const RAIL_Y = 110;
const DECK_Y = 168;      // 游客脚下
const COUNTER_Y = 178;   // 柜台面
const BENCH_Y = 214;     // 工作台面

/** 三个工位在台面上的位置 */
const SPOTS = {
    stove: { x: 30, w: 108, name: '灶台' },
    oven:  { x: 158, w: 124, name: '烤箱' },
    pass:  { x: 302, w: 118, name: '出餐台' },
};

/** 游客站的四个位置 */
const QUEUE_X = [86, 158, 230, 302];

let uid = 1;

export class Service {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {()=>object} getState
     * @param {(fn:(s:object)=>any)=>any} mutate
     * @param {()=>void} onChange 局面变了,通知 UI 重绘面板
     */
    constructor(canvas, getState, mutate, onChange) {
        this.screen = new PixelScreen(canvas, VW, VH);
        this.getState = getState;
        this.mutate = mutate;
        this.onChange = onChange;
        this.t = 0;
        this.rafId = null;
        this.reset();
        this._loop = this._loop.bind(this);
    }

    reset() {
        this.guests = [];
        this.jobs = { stove: [null], oven: new Array(STATIONS.oven.slots).fill(null) };
        this.nextGuestAt = 2000;
        this.t = 0;
        this.gone = 0;          // 等不及走掉的人数,这一场的
        this.sold = 0;
    }

    start() {
        if (this.rafId) return;
        this.last = 0;
        this.rafId = requestAnimationFrame(this._loop);
    }

    stop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    /* ---------- 玩法 ---------- */

    /** 面板要显示的一切。UI 只读这个,不去翻内部字段 */
    snapshot() {
        const s = this.getState();
        return {
            guests: this.guests.map(g => ({
                id: g.id, want: g.want,
                left: Math.max(0, 1 - (this.t - g.at) / SERVICE.patienceMs),
                ready: (s.stock[g.want] ?? 0) > 0,
            })),
            jobs: {
                stove: this.jobs.stove.map(j => this._job(j)),
                oven: this.jobs.oven.map(j => this._job(j)),
            },
            stock: { ...s.stock },
            stockCount: rules.stockCount(s),
            sold: this.sold,
            gone: this.gone,
        };
    }

    _job(j) {
        if (!j) return null;
        const plan = RECIPE_STEPS[j.recipe];
        const step = plan.steps[j.i];
        const done = j.i >= plan.steps.length;
        return {
            recipe: j.recipe,
            stepName: done ? '好了' : step.name,
            kind: done ? 'done' : step.kind,
            // wait 步骤的进度;tap 步骤没有进度,等你点
            progress: !done && step.kind === 'wait'
                ? Math.min(1, (this.t - j.stepAt) / step.ms) : 1,
        };
    }

    /** 开一道菜。自动挑那道菜该用的工位的空位 */
    startDish(recipeId) {
        const plan = RECIPE_STEPS[recipeId];
        if (!plan) return { ok: false, reason: '这道菜还没写做法' };
        const line = this.jobs[plan.station];
        const slot = line.indexOf(null);
        if (slot < 0) return { ok: false, reason: `${STATIONS[plan.station].name}满了` };

        const r = this.mutate(st => rules.startDish(st, recipeId));
        if (!r.ok) return r;
        line[slot] = { recipe: recipeId, i: 0, stepAt: this.t };
        this.onChange?.();
        return { ok: true, recipe: r.recipe };
    }

    /** 点一下工位。tap 步骤靠它推进,做好了靠它收进出餐台 */
    tap(station, slot) {
        const j = this.jobs[station]?.[slot];
        if (!j) return { ok: false };
        const plan = RECIPE_STEPS[j.recipe];
        if (j.i >= plan.steps.length) {                 // 收走
            this.mutate(st => rules.finishDish(st, j.recipe));
            this.jobs[station][slot] = null;
            this.onChange?.();
            return { ok: true, done: true, recipe: j.recipe };
        }
        const step = plan.steps[j.i];
        if (step.kind !== 'tap') return { ok: false, reason: '还没到你动手的时候' };
        j.i++;
        j.stepAt = this.t;
        this.onChange?.();
        return { ok: true };
    }

    /** 卖给一个客人 */
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

        // 来人。招牌越好来得越勤
        const info = rules.stallInfo(this.getState());
        const come = SERVICE.comeMs / Math.max(0.6, info.priceMul);
        if (this.t >= this.nextGuestAt && this.guests.length < SERVICE.queueMax) {
            this.nextGuestAt = this.t + come * (0.7 + Math.random() * 0.6);
            const open = this.getState().unlockedRecipes.filter(id => RECIPE_STEPS[id]);
            if (open.length) {
                this.guests.push({
                    id: uid++, at: this.t,
                    want: open[Math.floor(Math.random() * open.length)],
                    face: Math.floor(Math.random() * 4),
                });
                changed = true;
            }
        }
        // 等不及就走
        for (let i = this.guests.length - 1; i >= 0; i--) {
            if (this.t - this.guests[i].at > SERVICE.patienceMs) {
                this.guests.splice(i, 1);
                this.gone++;
                changed = true;
            }
        }
        // wait 步骤到点就自动进下一步
        for (const [station, line] of Object.entries(this.jobs)) {
            line.forEach((j, k) => {
                if (!j) return;
                const plan = RECIPE_STEPS[j.recipe];
                if (j.i >= plan.steps.length) return;
                const step = plan.steps[j.i];
                if (step.kind !== 'wait') return;
                const ms = station === 'oven' ? step.ms : step.ms;
                if (this.t - j.stepAt >= ms) { j.i++; j.stepAt = this.t; changed = true; }
            });
        }
        if (changed) this.onChange?.();
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this._tick(dt);
        this._draw();
    }

    /* ---------- 画 ---------- */

    _draw() {
        const { ctx } = this.screen;
        const s = this.getState();
        const P = pal(s.weather ?? 'sunny', 'day');
        paintBackdrop(ctx, P);
        this._drawGuests(ctx, P);
        paintCounter(ctx, P);
        this._drawStations(ctx, P);
        paintWaou(ctx, this.t);
        this.screen.present();
    }

    _drawGuests(ctx, P) {
        const KEYS = ['onlooker_a', 'onlooker_b', 'onlooker_c', 'onlooker_d'];
        this.guests.forEach((g, i) => {
            const x = QUEUE_X[i] ?? QUEUE_X[QUEUE_X.length - 1];
            const key = KEYS[g.face % KEYS.length];
            drawStanding(ctx, sprite(key, SCENERY[key]), x, DECK_Y);
            // 头顶的想法泡:要什么 + 还能等多久
            const top = DECK_Y - 26;
            bubble(ctx, x, top, g.want);
            const left = Math.max(0, 1 - (this.t - g.at) / SERVICE.patienceMs);
            ctx.fillStyle = '#4a3628';
            ctx.fillRect(x - 11, top - 26, 22, 4);
            ctx.fillStyle = left > 0.45 ? '#77b255' : left > 0.2 ? '#f5b83d' : '#e8384f';
            ctx.fillRect(x - 10, top - 25, Math.round(20 * left), 2);
        });
    }

    _drawStations(ctx, P) {
        // 灶台
        const st = this.jobs.stove[0];
        paintStove(ctx, P, SPOTS.stove, st ? this._job(st) : null, this.t);
        // 烤箱
        paintOven(ctx, P, SPOTS.oven, this.jobs.oven.map(j => this._job(j)), this.t);
        // 出餐台
        paintPass(ctx, P, SPOTS.pass, this.getState().stock);
    }
}

/* ---------- 各层的画法 ---------- */

function paintBackdrop(ctx, P) {
    // 天
    const step = HORIZON / P.sky.length;
    P.sky.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, Math.round(i * step), VW, Math.ceil(step) + 1);
    });
    // 湖
    const seaStep = (RAIL_Y - HORIZON) / P.sea.length;
    P.sea.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, Math.round(HORIZON + i * seaStep), VW, Math.ceil(seaStep) + 1);
    });
    ctx.fillStyle = P.crest;
    for (let i = 0; i < 22; i++) {
        ctx.fillRect((i * 53) % VW, HORIZON + 4 + (i * 5) % (RAIL_Y - HORIZON - 6), 5, 1);
    }
    // 远处的栏杆
    const S = P.stone;
    ctx.fillStyle = S.ink; ctx.fillRect(0, RAIL_Y, VW, 3);
    ctx.fillStyle = S.light; ctx.fillRect(0, RAIL_Y + 1, VW, 1);
    for (let x = 12; x < VW; x += 44) {
        ctx.fillStyle = S.ink; ctx.fillRect(x, RAIL_Y, 3, 14);
    }
    // 游客站的甲板
    const W = P.wood;
    ctx.fillStyle = W.ink; ctx.fillRect(0, RAIL_Y + 14, VW, VH - RAIL_Y - 14);
    ctx.fillStyle = W.wood; ctx.fillRect(0, RAIL_Y + 16, VW, DECK_Y - RAIL_Y - 16);
    ctx.fillStyle = W.dark;
    for (let x = 10; x < VW; x += 23) ctx.fillRect(x, RAIL_Y + 16, 1, DECK_Y - RAIL_Y - 16);
}

/** 柜台:把画面横着切成「外面」和「里面」两半 */
function paintCounter(ctx, P) {
    const W = P.wood;
    ctx.fillStyle = W.ink;
    ctx.fillRect(0, DECK_Y, VW, VH - DECK_Y);
    ctx.fillStyle = W.light;
    ctx.fillRect(0, DECK_Y + 2, VW, 8);                 // 台面受光那条
    ctx.fillStyle = W.wood;
    ctx.fillRect(0, DECK_Y + 10, VW, COUNTER_Y - DECK_Y);
    ctx.fillStyle = W.dark;
    ctx.fillRect(0, COUNTER_Y, VW, 4);
    // 台面下面是店里,暗一档
    ctx.fillStyle = '#2b2018';
    ctx.fillRect(0, COUNTER_Y + 4, VW, VH - COUNTER_Y - 4);
    // 工作台
    ctx.fillStyle = W.ink;   ctx.fillRect(0, BENCH_Y - 6, VW, VH - BENCH_Y + 6);
    ctx.fillStyle = W.dark;  ctx.fillRect(0, BENCH_Y - 4, VW, VH - BENCH_Y + 4);
    ctx.fillStyle = W.wood;  ctx.fillRect(0, BENCH_Y - 4, VW, 6);
}

/** 工位的柜体。三个工位共用这一层木壳,区别在里面装什么 */
function cabinet(ctx, P, x, w, label) {
    const W = P.wood;
    ctx.fillStyle = W.ink;   ctx.fillRect(x - 3, BENCH_Y + 2, w + 6, 60);
    ctx.fillStyle = W.dark;  ctx.fillRect(x - 2, BENCH_Y + 3, w + 4, 58);
    ctx.fillStyle = W.wood;  ctx.fillRect(x - 2, BENCH_Y + 3, w + 4, 4);
    // 柜门缝
    ctx.fillStyle = W.ink;
    for (let i = x + 10; i < x + w; i += 26) ctx.fillRect(i, BENCH_Y + 44, 1, 17);
}

function progressBar(ctx, x, y, w, p) {
    ctx.fillStyle = '#2b2018'; ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#4a3628'; ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = '#62c4cc'; ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * p), 4);
}

/** 灶台:两口铁锅坐在灶眼上,开火的时候底下窜火苗 */
function paintStove(ctx, P, spot, job, t) {
    const { x, w } = spot;
    cabinet(ctx, P, x, w, '灶台');
    const cx = x + w / 2;
    // 灶眼
    ctx.fillStyle = '#3a2f26';
    ctx.fillRect(x + 8, BENCH_Y + 30, w - 16, 12);
    if (job) {
        for (let i = 0; i < 6; i++) {
            const fx = x + 12 + i * ((w - 24) / 5);
            const h = 4 + (Math.sin(t * 0.012 + i * 1.7) > 0 ? 2 : 0);
            ctx.fillStyle = i % 2 ? '#ffd24a' : '#ef7757';
            ctx.fillRect(Math.round(fx), BENCH_Y + 40 - h, 3, h);
        }
    }
    // 锅
    ctx.fillStyle = '#5d564c';
    ctx.fillRect(cx - 22, BENCH_Y + 22, 44, 10);
    ctx.fillStyle = '#3a352e';
    ctx.fillRect(cx - 22, BENCH_Y + 30, 44, 3);
    ctx.fillStyle = '#7d7668';
    ctx.fillRect(cx - 24, BENCH_Y + 21, 48, 2);
    if (job) {
        dishOn(ctx, cx, BENCH_Y + 18, job, t);
        // 锅里冒的热气
        for (let i = 0; i < 3; i++) {
            const q = ((t * 0.0009) + i * 0.33) % 1;
            ctx.fillStyle = `rgba(255,253,244,${(0.4 * (1 - q)).toFixed(2)})`;
            ctx.fillRect(Math.round(cx - 8 + Math.sin(q * 6 + i) * 6), Math.round(BENCH_Y + 16 - q * 18), 3, 2);
        }
        progressBar(ctx, x + 6, BENCH_Y + 48, w - 12, job.progress);
    }
}

/** 烤箱:四个格,门是玻璃的,里面有东西就透出光 */
function paintOven(ctx, P, spot, jobs, t) {
    const { x, w } = spot;
    cabinet(ctx, P, x, w, '烤箱');
    const cw = Math.floor((w - 6) / jobs.length);
    jobs.forEach((j, i) => {
        const bx = x + 3 + i * cw;
        ctx.fillStyle = '#1d150f';
        ctx.fillRect(bx, BENCH_Y + 8, cw - 3, 34);
        ctx.fillStyle = j ? '#f5b83d' : '#5d564c';
        ctx.fillRect(bx, BENCH_Y + 8, cw - 3, 1);
        ctx.fillRect(bx, BENCH_Y + 41, cw - 3, 1);
        ctx.fillRect(bx, BENCH_Y + 8, 1, 34);
        ctx.fillRect(bx + cw - 4, BENCH_Y + 8, 1, 34);
        if (!j) return;
        ctx.fillStyle = 'rgba(245,184,61,0.20)';
        ctx.fillRect(bx + 1, BENCH_Y + 9, cw - 5, 32);
        dishOn(ctx, bx + (cw - 3) / 2, BENCH_Y + 24, j, t);
        progressBar(ctx, bx + 2, BENCH_Y + 44, cw - 7, j.progress);
    });
}

/** 出餐台:一块托盘,做好的菜排在上面 */
function paintPass(ctx, P, spot, stock) {
    const { x, w } = spot;
    cabinet(ctx, P, x, w, '出餐台');
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(x + 2, BENCH_Y + 34, w - 4, 8);
    ctx.fillStyle = '#7d7668';
    ctx.fillRect(x + 2, BENCH_Y + 40, w - 4, 2);
    const list = Object.entries(stock).filter(([, n]) => n > 0);
    list.slice(0, 6).forEach(([id, n], i) => {
        const r = RECIPES.find(v => v.id === id);
        const bx = x + 6 + (i % 3) * 36;
        const by = BENCH_Y + 6 + Math.floor(i / 3) * 18;
        if (r && ICON_GRIDS[r.icon]) ctx.drawImage(sprite(r.icon, ICON_GRIDS[r.icon]), bx, by);
        if (n > 1) {
            ctx.fillStyle = '#4a3628'; ctx.fillRect(bx + 10, by + 9, 9, 8);
            ctx.fillStyle = '#fffdf4';
            ctx.fillRect(bx + 12, by + 11, n > 9 ? 5 : 2, 4);
        }
    });
}

/** 工位上那道菜。做好了会跳一下,提醒你收走 */
function dishOn(ctx, cx, cy, job, t) {
    const r = RECIPES.find(v => v.id === job.recipe);
    if (!r || !ICON_GRIDS[r.icon]) return;
    const up = job.kind === 'done' ? (Math.sin(t * 0.008) > 0 ? 0 : 2) : 0;
    ctx.drawImage(sprite(r.icon, ICON_GRIDS[r.icon]), Math.round(cx - 8), Math.round(cy - 8 - up));
}

/** 游客头顶的想法泡 */
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
    if (r && ICON_GRIDS[r.icon]) {
        ctx.drawImage(sprite(r.icon, ICON_GRIDS[r.icon]), cx - 8, y - 20);
    }
}

/**
 * 哇鸥的后脑勺,压在画面最下面正中。
 * 用小屋那张近景**裁着画** —— 只露出脑袋顶那一小块。
 * 素材一格没改,越肩视角靠的是取景,不是新画一张背面。
 */
function paintWaou(ctx, t) {
    const cv = sprite('hut_waou', SCENERY.hut_waou);
    const bob = Math.sin(t * 0.0016) > 0 ? 0 : 1;
    ctx.drawImage(cv, Math.round(VW / 2 - cv.width / 2), VH - 26 + bob);
}

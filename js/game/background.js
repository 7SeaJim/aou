/**
 * 滇池背景:天空 + 西山睡美人 + 会动的湖面 + 海埂大坝和哇鸥的小吃摊。
 * 跑在主界面底层的 canvas 上,只读 state 的天气,不写存档。
 *
 * 画法见 pixmap.js:先在 440×310 的低分辨率缓冲上作画,再整块放大 2 倍。
 * 天空和栈桥是静态的,烤进两张图层缓存;每帧只重画云、海、天气。
 */

import { PixelScreen } from './pixmap.js';
import {
    VW, VH, paintSky, paintPier, drawSea, drawClouds, drawFarGulls,
    drawPierFoam, drawPerformance, drawBoat, drawRain, drawFog, hitShack,
    paintFarDam, drawReeds, drawStrollers, drawStallSteam, drawUpgradePop, drawCat,
} from './scene.js';
import { unlockedShows, serviceOpen } from './rules.js';
import { dayPhase, onDam } from '../data.js';
import { now } from '../clock.js';

const HORIZON = 150;    // 海天交界
const DECK_Y  = 250;    // 甲板面

export class Background {
    constructor(canvas, getState) {
        this.canvas = canvas;
        this.getState = getState;
        this.screen = new PixelScreen(canvas, VW, VH);
        this.rafId = null;
        this.t = 0;
        this.bakedKey = null;
        /** 上一帧的 showMs。它回绕(变小)就说明规则层刚结算了一次投喂,
            画面据此冒一个食材出来 —— 动画和真实产出是同一件事,不是各演各的。 */
        this.lastShowMs = 0;
        /** 上一帧四条升级线的总级数。**变大就说明刚买了升级**,画面冒一串星星。
            这样比从 UI 层一路把「买了」传进来省事,而且不会漏 —— 不管从哪儿买的都算。 */
        this.lastUpTotal = null;
        this.popAt = -1e9;
        this._loop = this._loop.bind(this);
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

    /** 天空和栈桥不随帧变,天气、时段或**升级**一换才重烤 */
    _bake(weather, phase) {
        // 升级件是烤进栈桥图层的,所以升级等级也得进 key ——
        // 不进的话玩家买完升级,画面要等到天气轮换才跟上
        const u = this.getState().upgrades ?? {};
        const key = [weather, phase, u.stove, u.sign, u.shelf, u.warmer].join(':');
        if (this.bakedKey === key) return;
        this.bakedKey = key;

        this.sky = this.sky ?? this.screen.layer();
        this.sky.ctx.clearRect(0, 0, VW, VH);
        paintSky(this.sky.ctx, weather, HORIZON, 1, phase);

        this.pier = this.pier ?? this.screen.layer();
        this.pier.ctx.clearRect(0, 0, VW, VH);
        paintPier(this.pier.ctx, DECK_Y, VH, weather, phase, this.getState().upgrades);
    }

    /** 屏幕坐标落在草棚上了吗。main.js 拿它做点击判定。 */
    hitShack(clientX, clientY) {
        const r = this.canvas.getBoundingClientRect();
        const x = (clientX - r.left) * (VW / r.width);
        const y = (clientY - r.top) * (VH / r.height);
        return hitShack(x, y, DECK_Y);
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this.t += dt;
        this._draw();
    }

    _draw() {
        const weather = this.getState().weather ?? 'sunny';
        const when = now();
        const phase = dayPhase(when);
        const { ctx } = this.screen;
        const t = this.t;
        this._bake(weather, phase);

        ctx.drawImage(this.sky.cv, 0, 0);
        drawClouds(ctx, t, weather, phase);
        drawFarGulls(ctx, t);
        drawSea(ctx, weather, HORIZON, VH, t, phase);
        // 远堤要压在海面之上 —— 海是每帧重画的,烤进静态图层会被盖掉
        paintFarDam(ctx, weather, HORIZON, phase);
        drawBoat(ctx, HORIZON + 24, t, weather);
        drawPierFoam(ctx, weather, DECK_Y, t, phase);
        ctx.drawImage(this.pier.cv, 0, 0);
        // 路过的人不看时段 —— 大坝上白天晚上都有人散步
        drawStrollers(ctx, DECK_Y, t, phase);
        // 折耳根:不出摊的时候她就在坝上睡觉。出摊时她在柜台后面,这儿就不画了
        if (!serviceOpen(when)) drawCat(ctx, DECK_Y, t, phase);

        const up = this.getState().upgrades;
        drawStallSteam(ctx, DECK_Y, t, up);
        const total = up ? up.stove + up.sign + up.shelf + up.warmer : 0;
        if (this.lastUpTotal !== null && total > this.lastUpTotal) this.popAt = t;
        this.lastUpTotal = total;
        drawUpgradePop(ctx, DECK_Y, t - this.popAt);
        // 哇鸥只在「不在小屋」的时段出现在大坝上 —— 它睡着的时候
        // 大坝上还站着一只在表演,那就是两个哇鸥了。
        if (onDam(when)) {
            const showMs = this.getState().showMs ?? 0;
            const fedNow = showMs < this.lastShowMs;
            this.lastShowMs = showMs;
            drawPerformance(ctx, 336, DECK_Y - 13, t,
                unlockedShows(this.getState()).length, fedNow,
                this.getState().wearing, phase);
        }

        // 近景压在所有东西之上,包括哇鸥 —— 被前景挡住一点才有纵深
        drawReeds(ctx, weather, t, phase);

        if (weather === 'rainy') drawRain(ctx, t);
        if (weather === 'foggy') drawFog(ctx, t);

        this.screen.present();
    }
}

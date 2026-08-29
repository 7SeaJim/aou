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
} from './scene.js';
import { unlockedShows } from './rules.js';
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

    /** 天空和栈桥不随帧变,天气或时段一换才重烤 */
    _bake(weather, phase) {
        const key = weather + ':' + phase;
        if (this.bakedKey === key) return;
        this.bakedKey = key;

        this.sky = this.sky ?? this.screen.layer();
        this.sky.ctx.clearRect(0, 0, VW, VH);
        paintSky(this.sky.ctx, weather, HORIZON, 1, phase);

        this.pier = this.pier ?? this.screen.layer();
        this.pier.ctx.clearRect(0, 0, VW, VH);
        paintPier(this.pier.ctx, DECK_Y, VH, weather, phase);
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
        drawBoat(ctx, HORIZON + 24, t, weather);
        drawPierFoam(ctx, weather, DECK_Y, t, phase);
        ctx.drawImage(this.pier.cv, 0, 0);
        // 哇鸥只在「不在小屋」的时段出现在大坝上 —— 它睡着的时候
        // 大坝上还站着一只在表演,那就是两个哇鸥了。
        if (onDam(when)) {
            const showMs = this.getState().showMs ?? 0;
            const fedNow = showMs < this.lastShowMs;
            this.lastShowMs = showMs;
            drawPerformance(ctx, 336, DECK_Y - 13, t, unlockedShows(this.getState()).length, fedNow);
        }

        if (weather === 'rainy') drawRain(ctx, t);
        if (weather === 'foggy') drawFog(ctx, t);

        this.screen.present();
    }
}

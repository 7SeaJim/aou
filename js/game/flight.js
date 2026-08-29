/**
 * 觅食飞行小游戏。
 *
 * 相比 template 里的旧实现修了三处:
 *  1. 双倍道具原来在拾取时 ×2、结算时又 ×2,实际变成四倍
 *  2. 生成节奏写死 spawnTimer += 16.67,等于假设永远 60fps。
 *     在 120/144Hz 屏上游戏会快一倍。现在用真实 delta time。
 *  3. 掉湖里和主动退出都走同一个结算,死了照样拿奖励。现在分开。
 *
 * 本模块不碰存档,只在一局结束后把结果交给 rules.settleFlight()。
 */

import { weatherOf } from './rules.js';
import { PixelScreen, sprite, drawSprite } from './pixmap.js';
import {
    VW, VH, paintSky, drawSea, drawClouds, drawFarGulls, drawRain, drawFog,
} from './scene.js';
import { ICON_GRIDS, SCENERY, WAOU } from './pixels.js';
import { dayPhase } from '../data.js';
import { now } from '../clock.js';

/** 显示画布的尺寸。玩法本身跑在 440×310 的虚拟坐标里(见 scene.js), */
/** 由 PixelScreen 整数倍放大贴出来 —— 半像素坐标在像素画里就是糊。 */
export const W = 880;
export const H = 620;

const HORIZON = 250;          // 飞行视角:海平线压在下面,大半屏是天
const BIRD_X = 60;
const HIT_R = 17;
// 飞行里会掉的食材。稀有的(菌子、乳扇)不放常规掉落池,靠天气加成出
const FOOD_TYPES = ['erkuai', 'potato', 'rice', 'douhua', 'chili', 'sugar'];
const OBSTACLES = ['cloud', 'balloon', 'kite'];
const POWERUPS = ['shield', 'magnet', 'double'];
const OBSTACLE_GRID = { cloud: 'storm', balloon: 'balloon', kite: 'kite' };

/** 切角方块。像素画里的「圆」,比正方形软,又不用画 arc() */
function plate(ctx, x, y, r, color) {
    const cx = Math.round(x), cy = Math.round(y), d = r * 2;
    ctx.fillStyle = color;
    ctx.fillRect(cx - r + 3, cy - r, d - 6, d);
    ctx.fillRect(cx - r, cy - r + 3, d, d - 6);
    ctx.fillRect(cx - r + 1, cy - r + 1, d - 2, d - 2);
}

export class Flight {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {object} opts.state       只读取等级/天气/道具,不修改
     * @param {object} opts.sprites     可选,精灵图集(见 sprite.js)
     * @param {()=>number} [opts.rng]   随机源。传一个播种的进来,同一局就能重放
     *                                  (见 rng.js / dev.js 的 wa.seed)
     * @param {(r:object)=>void} opts.onEnd
     * @param {(s:object)=>void} opts.onTick  HUD 刷新
     */
    constructor({ canvas, state, sprites = null, rng = Math.random, onEnd, onTick }) {
        this.canvas = canvas;
        this.screen = new PixelScreen(canvas, VW, VH);
        this.ctx = this.screen.ctx;
        this.sky = null;
        this.skyWeather = null;
        this.state = state;
        this.sprites = sprites;
        this.rng = rng;
        this.onEnd = onEnd;
        this.onTick = onTick;

        this.running = false;
        this.paused = false;
        this.rafId = null;
        this.lastTs = 0;

        this._onMove = this._onMove.bind(this);
        this._loop = this._loop.bind(this);
    }

    start() {
        const w = weatherOf(this.state);
        const lv = this.state.level;

        this.f = {
            score: 0,
            lives: 3,
            birdY: VH / 2,
            targetY: VH / 2,
            hurtUntil: 0,
            foods: [], obstacles: [], powerups: [],
            spawnTimer: 0,
            spawnInterval: Math.max(700, 1100 - lv * 50),
            speed: (1.25 + (lv - 1) * 0.2) * w.speed,
            elapsed: 0,
            ramp: 0,          // 提速计时,和 elapsed 分开:elapsed 还兼着动画时钟
            combo: 0,
            maxCombo: 0,
            collected: {},
            itemCount: 0,
            // 道具在开局消耗,一局有效
            shield: (this.state.items.shield ?? 0) > 0,
            magnet: (this.state.items.magnet ?? 0) > 0,
            double: (this.state.items.double ?? 0) > 0,
        };

        this.canvas.addEventListener('pointermove', this._onMove);
        this.running = true;
        this.paused = false;
        this.lastTs = 0;
        this.rafId = requestAnimationFrame(this._loop);
        this._emit();
        return { shield: this.f.shield, magnet: this.f.magnet, double: this.f.double };
    }

    setPaused(v) {
        this.paused = v;
        if (!v) this.lastTs = 0;        // 恢复时丢弃暂停期间的时间差
    }

    /** 玩家主动退出:算成功结算 */
    quit() { this._finish('quit'); }

    /** 外部强制停止,不结算(比如离开界面) */
    destroy() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.canvas.removeEventListener('pointermove', this._onMove);
    }

    /* ---------- 内部 ---------- */

    _onMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const y = (e.clientY - rect.top) * (VH / rect.height);
        this.f.targetY = Math.max(22, Math.min(HORIZON - 14, y));
    }

    _emit() {
        this.onTick?.({
            score: this.f.score, lives: this.f.lives, combo: this.f.combo,
            shield: this.f.shield, magnet: this.f.magnet, double: this.f.double,
        });
    }

    _loop(ts) {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._loop);
        if (this.paused) { this.lastTs = ts; return; }

        // 真实 delta,并夹紧上限:切后台回来时 ts 会跳很大,
        // 不夹的话物体会瞬移穿过哇鸥
        const dt = this.lastTs ? Math.min(ts - this.lastTs, 50) : 16.7;
        this.lastTs = ts;

        this._update(dt);
        if (this.running) this._draw();
    }

    _update(dt) {
        const f = this.f;
        const k = dt / 16.7;                 // 以 60fps 为基准的步长系数
        f.elapsed += dt;

        f.birdY += (f.targetY - f.birdY) * Math.min(1, 0.12 * k);

        // 生成
        f.spawnTimer += dt;
        if (f.spawnTimer >= f.spawnInterval) {
            f.spawnTimer = 0;
            this._spawn();
        }

        const move = f.speed * k;
        const hit = (o) => Math.abs(BIRD_X - o.x) < HIT_R && Math.abs(f.birdY - o.y) < HIT_R;

        // 食材
        for (let i = f.foods.length - 1; i >= 0; i--) {
            const o = f.foods[i];
            o.x -= move;
            if (o.x < -24) { f.foods.splice(i, 1); continue; }

            if (f.magnet) {
                const dx = BIRD_X - o.x, dy = f.birdY - o.y;
                if (Math.abs(dx) < 70 && Math.abs(dy) < 70) {
                    o.x += dx * 0.04 * k;
                    o.y += dy * 0.04 * k;
                }
            }
            if (hit(o)) {
                f.foods.splice(i, 1);
                f.collected[o.type] = (f.collected[o.type] ?? 0) + 1;
                f.itemCount++;
                f.combo++;
                if (f.combo > f.maxCombo) f.maxCombo = f.combo;

                let gain = 5;
                if (f.combo >= 5) gain += 2;
                if (f.combo >= 10) gain += 5;
                if (f.double) gain *= 2;      // 只在这里翻倍,结算时不再翻
                f.score += gain;
                this._emit();
            }
        }

        // 障碍
        for (let i = f.obstacles.length - 1; i >= 0; i--) {
            const o = f.obstacles[i];
            o.x -= move;
            if (o.x < -24) { f.obstacles.splice(i, 1); continue; }
            if (!hit(o)) continue;

            f.obstacles.splice(i, 1);
            if (f.shield) {
                f.shield = false;
                this._emit();
                continue;
            }
            f.lives--;
            f.combo = 0;
            f.hurtUntil = f.elapsed + 450;      // 闪一下,给个挨打的反馈
            this._emit();
            if (f.lives <= 0) { this._finish('crash'); return; }
        }

        // 道具
        for (let i = f.powerups.length - 1; i >= 0; i--) {
            const o = f.powerups[i];
            o.x -= move;
            if (o.x < -24) { f.powerups.splice(i, 1); continue; }
            if (!hit(o)) continue;
            f.powerups.splice(i, 1);
            f[o.type] = true;
            this._emit();
        }

        // 每 5 秒提速一档
        const cap = this.state.level >= 3 ? 3 : 2.5;
        f.ramp += dt;
        if (f.ramp > 5000 && f.speed < cap) {
            f.ramp -= 5000;
            f.speed += 0.06;
            f.spawnInterval = Math.max(500, f.spawnInterval - 20);
        }
    }

    _spawn() {
        const f = this.f;
        const rnd = this.rng;
        const y = () => 30 + rnd() * (HORIZON - 60);
        const pick = a => a[Math.floor(rnd() * a.length)];
        const r = rnd();

        if (r < 0.7)       f.foods.push({ x: VW + 16, y: y(), type: pick(FOOD_TYPES) });
        else if (r < 0.95) f.obstacles.push({ x: VW + 16, y: y(), type: pick(OBSTACLES) });
        else               f.powerups.push({ x: VW + 16, y: y(), type: pick(POWERUPS) });

        // 天气影响额外生成
        if (this.state.weather === 'rainy' && rnd() < 0.3) {
            f.obstacles.push({ x: VW + 16, y: y(), type: pick(OBSTACLES) });
        }
        if (this.state.weather === 'foggy' && rnd() < 0.25) {
            f.foods.push({ x: VW + 16, y: y(), type: pick(FOOD_TYPES) });
        }
    }

    _finish(reason) {
        if (!this.running) return;
        this.destroy();
        const f = this.f;
        this.onEnd?.({
            reason,                                    // 'quit' | 'crash'
            survived: reason !== 'crash',
            score: f.score,
            collected: f.collected,
            itemCount: f.itemCount,
            maxCombo: f.maxCombo,
            usedItems: { shield: f.shield, magnet: f.magnet, double: f.double },
        });
    }

    /* ---------- 绘制 ---------- */

    _draw() {
        const ctx = this.ctx, f = this.f;
        const weather = this.state.weather ?? 'sunny';
        const t = f.elapsed;

        this.phase = dayPhase(now());
        this._bakeSky(weather, this.phase);
        ctx.drawImage(this.sky.cv, 0, 0);
        // 飞行时云和远处的鸟走得比大坝上快,才有在赶路的感觉
        drawClouds(ctx, t * 3, weather, this.phase);
        drawFarGulls(ctx, t * 2);
        drawSea(ctx, weather, HORIZON, VH, t * 2, this.phase);

        for (const o of f.foods)     this._drawItem(ctx, o.type, o.x, o.y);
        for (const o of f.powerups)  this._drawPowerup(ctx, o, t);
        for (const o of f.obstacles) this._drawObstacle(ctx, o);

        this._drawBird(ctx, f);

        if (weather === 'rainy') drawRain(ctx, t, HORIZON);
        if (weather === 'foggy') drawFog(ctx, t, HORIZON);

        this.screen.present();
    }

    /** 天空是静态的,天气不变就不用重画 */
    _bakeSky(weather, phase) {
        const key = weather + ':' + phase;
        if (this.skyWeather === key) return;
        this.skyWeather = key;
        this.sky = this.sky ?? this.screen.layer();
        this.sky.ctx.clearRect(0, 0, VW, VH);
        // 0.55:飞行视角在高空,西山要退远退矮,别顶进食材的生成区
        paintSky(this.sky.ctx, weather, HORIZON, 0.55, phase);
    }

    /** 食材/道具直接用 UI 图标那批 16×16,捡到的东西和背包里长得一样 */
    _drawItem(ctx, name, x, y) {
        if (this.sprites?.draw(ctx, name, x, y, 16)) return;
        drawSprite(ctx, sprite(name, ICON_GRIDS[name]), x, y);
    }

    /** 道具多一圈呼吸的光边,和普通食材区分开 */
    _drawPowerup(ctx, o, t) {
        const r = Math.sin(t * 0.006 + o.x) > 0 ? 12 : 11;
        // 底盘用浪花白 + 金边:三个道具里有金币色也有海水青,
        // 铺金色底会跟 double 糊成一片
        plate(ctx, o.x, o.y, r, '#c98a1e');
        plate(ctx, o.x, o.y, r - 1, '#fffdf4');
        this._drawItem(ctx, o.type, o.x, o.y);
    }

    _drawObstacle(ctx, o) {
        const grid = SCENERY[OBSTACLE_GRID[o.type]];
        drawSprite(ctx, sprite(OBSTACLE_GRID[o.type], grid), o.x, o.y);
    }

    _drawBird(ctx, f) {
        const t = f.elapsed;
        // 挨打后闪 450ms:两帧一亮一灭
        const hurt = t < f.hurtUntil;
        if (hurt && Math.floor(t / 70) % 2 === 0) {
            if (f.shield) this._drawShield(ctx, f);
            return;
        }

        if (this.sprites?.drawAnim(ctx, 'waou', 'fly', t, BIRD_X, f.birdY, 32)) {
            if (f.shield) this._drawShield(ctx, f);
            return;
        }

        // 爬升/下降时挑对应的翅膀帧,飞行手感看得见
        const dy = f.targetY - f.birdY;
        let i = Math.floor(t / 1000 * 10) % 4;
        if (dy < -6) i = 0;                       // 往上拉 -> 翅膀扬起
        else if (dy > 6) i = 2;                   // 往下扎 -> 翅膀压下
        const key = hurt ? 'waou_hurt' + i : 'waou' + i;
        const cv = hurt
            ? sprite(key, WAOU[i], { remap: { w: '#ffd0c4', V: '#f0b8b0' } })
            : sprite(key, WAOU[i]);
        drawSprite(ctx, cv, BIRD_X, f.birdY);

        if (f.shield) this._drawShield(ctx, f);
    }

    /** 护盾:一圈像素虚线环,不用 arc(),免得出软边 */
    _drawShield(ctx, f) {
        const cx = Math.round(BIRD_X), cy = Math.round(f.birdY), r = 22;
        const spin = Math.floor(f.elapsed / 90);
        ctx.fillStyle = '#ffe08a';
        for (let a = 0; a < 24; a++) {
            if ((a + spin) % 3 === 0) continue;      // 缺几段,看得出在转
            const rad = a / 24 * Math.PI * 2;
            ctx.fillRect(Math.round(cx + Math.cos(rad) * r),
                         Math.round(cy + Math.sin(rad) * r), 2, 2);
        }
    }
}

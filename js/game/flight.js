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
import * as sfx from '../audio.js';
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

/** 障碍占生成的比例:开局 22%,一路涨到 55% */
const HAZARD_0 = 0.22;
const HAZARD_MAX = 0.55;
/** 多久算一波。到点报一次,让玩家知道是游戏变难了不是自己变菜了 */
const WAVE_MS = 20_000;
/**
 * 可飞的高度切成几条道。**一簇障碍必留一条空的** ——
 * 密度上去之后如果不留道,就成了随机送死,那不叫难,叫不讲理。
 */
const LANES = 5;

/* ---------- 五分钟之后:饿 ---------- */
/** 从这一刻起开始饿。前五分钟只用管躲 */
const HUNGRY_AT = 300_000;
/** 一条满的肚子撑多久(毫秒)。什么都不吃的话 */
const HUNGRY_MS = 13_000;
/** 吃到一样补多少。0.17 → 大约每两秒得吃到一个 */
const HUNGRY_FEED = 0.17;
/**
 * 飞一秒算多少米。**距离就是活着的时间换算过来的,不累加实际位移。**
 *
 * 原来是每帧把移动量加起来 —— 后期速度是开局的三四倍,同样撑一秒
 * 记的距离就差三四倍,「飞了多远」变成了「后期占多大便宜」。
 * 而这个玩法真正考的是撑了多久,那就直接按时间算:
 * 数字匀速往上走,读起来也踏实。
 *
 * 40:2000 米(第一档成就)约 50 秒,8000 米(第二档)约 3 分半。
 */
const M_PER_SEC = 40;

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
            // 开局的节奏和速度。往后都是从这两个数按飞行时长推的,见 _difficulty()
            baseInterval: Math.max(700, 1100 - lv * 50),
            baseSpeed: (1.25 + (lv - 1) * 0.2) * w.speed,
            spawnInterval: Math.max(700, 1100 - lv * 50),
            speed: (1.25 + (lv - 1) * 0.2) * w.speed,
            hazard: HAZARD_0,
            elapsed: 0,
            hunger: 1,        // 肚子。五分钟之后才开始掉,掉光就回巢
            hungryFlash: 0,
            wave: 0,          // 第几波。每 20 秒一波,HUD 上要报
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
            wave: this.f.wave + 1,
            dist: Math.round(this.f.elapsed / 1000 * M_PER_SEC),
            hungry: this.f.elapsed >= HUNGRY_AT,
            hunger: this.f.hunger,
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
                sfx.play('pickup');
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
                f.hunger = Math.min(1, f.hunger + HUNGRY_FEED);
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
                sfx.play('event');      // 护盾挡下:响一下但不是挨打那声
                f.shield = false;
                this._emit();
                continue;
            }
            sfx.play('hit');
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

        this._difficulty();
        this._hunger(dt);
    }

    /**
     * 难度只跟着**飞了多久**走,不跟分数、不跟等级(等级只定开局那一档)。
     *
     * 原来是「每 5 秒 +0.06,封顶 2.5」—— 一分四十秒就摸到顶,之后再飞十分钟
     * 也是同一个速度、同一个障碍密度。**一局的终点应该是撞死了,不是不再变难了。**
     *
     * 现在三样一起涨,而且**不封顶**:
     *   speed     线性涨,一分钟大约快一倍
     *   interval  越来越密,底线 260ms —— 再密就成了一堵墙
     *   hazard    障碍占生成的比例,22% 一路涨到 55%
     *
     * 涨到后面必死,这是故意的:活得越久分越高,但没有「安全地刷」这条路。
     */
    /**
     * 五分钟之后开始饿。
     *
     * 前五分钟这个玩法只考一件事:躲。躲到后来速度快了、障碍密了,
     * 最省事的活法反而是**贴着一条空道一直飘,一口都不吃** ——
     * 越往后越难的曲线,养出来的是最无聊的打法。
     *
     * 所以第五分钟起加一条一直在掉的肚子条:掉光就是飞饿了,回巢。
     * 吃到一样补一截,大约每两秒得吃到一个。**从这一刻起,躲和吃得同时办**,
     * 而这两件事是打架的 —— 食材和障碍在同一片天上。
     */
    _hunger(dt) {
        const f = this.f;
        if (f.elapsed < HUNGRY_AT) return;
        if (f.hungryFlash === 0) {           // 刚饿的那一下要报一声
            f.hungryFlash = f.elapsed + 1600;
            sfx.play('hit');
            this._emit();
        }
        f.hunger -= dt / HUNGRY_MS;
        if (f.hunger <= 0) { f.hunger = 0; this._finish('hungry'); }
    }

    _difficulty() {
        const f = this.f;
        const mins = f.elapsed / 60000;
        f.speed = f.baseSpeed * (1 + mins * 0.9);
        f.spawnInterval = Math.max(260, f.baseInterval - mins * 280);
        f.hazard = Math.min(HAZARD_MAX, HAZARD_0 + mins * 0.12);

        // 每 20 秒报一波。**得让玩家听见、看见它变难了** ——
        // 悄悄变难只会让人觉得「我怎么突然打不过了」,而不是「又上了一档」
        const wave = Math.floor(f.elapsed / WAVE_MS);
        if (wave > f.wave) {
            f.wave = wave;
            sfx.play('event');
            f.waveFlashUntil = f.elapsed + 900;
            this._emit();
        }
    }

    _spawn() {
        const f = this.f;
        const rnd = this.rng;
        const top = 30, span = HORIZON - 60;
        const y = () => top + rnd() * span;
        /** 第 i 条道的中间高度 */
        const laneY = i => top + span * (i + 0.5) / LANES;
        const pick = a => a[Math.floor(rnd() * a.length)];
        const r = rnd();

        if (r < 0.05) {
            f.powerups.push({ x: VW + 16, y: y(), type: pick(POWERUPS) });
        } else if (r < 0.05 + f.hazard) {
            this._hazard(1 + Math.floor(f.wave / 4), laneY);
        } else {
            f.foods.push({ x: VW + 16, y: y(), type: pick(FOOD_TYPES) });
        }

        // 天气影响额外生成
        if (this.state.weather === 'rainy' && rnd() < 0.3) this._hazard(1, laneY);
        if (this.state.weather === 'foggy' && rnd() < 0.25) {
            f.foods.push({ x: VW + 16, y: y(), type: pick(FOOD_TYPES) });
        }
    }

    /**
     * 放一簇障碍,**留一条空道**。
     *
     * 密度是这一局越来越难的主要来源,但「难」和「不讲理」只隔一层:
     * 满屏障碍没有缝,玩家学不到任何东西,只会觉得游戏在耍他。
     * 留的那条道随机,所以还是得看、得躲,只是保证躲得掉。
     */
    _hazard(n, laneY) {
        const f = this.f, rnd = this.rng;
        const pick = a => a[Math.floor(rnd() * a.length)];
        const gap = Math.floor(rnd() * LANES);
        const lanes = [];
        for (let i = 0; i < LANES; i++) if (i !== gap) lanes.push(i);
        // 洗牌后取前 n 条 —— 直接随机取会重复,重复了等于少放一个
        for (let i = lanes.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }
        for (const i of lanes.slice(0, Math.min(n, LANES - 1))) {
            f.obstacles.push({ x: VW + 16, y: laneY(i), type: pick(OBSTACLES) });
        }
    }

    _finish(reason) {
        if (!this.running) return;
        this.destroy();
        const f = this.f;
        this.onEnd?.({
            reason,                                    // 'quit' | 'crash' | 'hungry'
            // 饿回去的算飞完了一趟,不是摔了 —— 它是自己决定回巢的
            survived: reason !== 'crash',
            dist: Math.round(f.elapsed / 1000 * M_PER_SEC),
            wave: f.wave + 1,
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
        this._drawWave(ctx, f);
        this._drawHunger(ctx, f);

        this.screen.present();
    }

    /**
     * 肚子条。**只有饿起来之后才画** —— 前五分钟画一条满的进度条在那儿,
     * 玩家会一直盯着一个不动的东西。
     *
     * 画在画面正上方横贯一条:这时候它是唯一还会要人命的计时器,
     * 得和分数、命数分开,不能挤在角落里当第三个小 chip。
     */
    _drawHunger(ctx, f) {
        if (f.elapsed < HUNGRY_AT) return;
        const y = 8, h = 7, pad = 30;
        const w = VW - pad * 2;
        ctx.fillStyle = '#241a13';
        ctx.fillRect(pad - 2, y - 2, w + 4, h + 4);
        ctx.fillStyle = '#5f6d78';
        ctx.fillRect(pad, y, w, h);
        // 快见底的时候整条闪 —— 到这一步玩家的眼睛全在障碍上,不闪根本看不见
        const low = f.hunger < 0.3;
        const blink = low && Math.floor(f.elapsed / 180) % 2 === 0;
        ctx.fillStyle = blink ? '#f5b83d' : low ? '#e8384f' : f.hunger < 0.6 ? '#ef7757' : '#77b255';
        ctx.fillRect(pad, y, Math.max(0, Math.round(w * f.hunger)), h);

        const left = f.hungryFlash - f.elapsed;
        if (left > 0) {
            const p = left / 1600;
            ctx.fillStyle = `rgba(232, 56, 79, ${(p * 0.8).toFixed(3)})`;
            ctx.fillRect(0, y + h + 6, VW, 3);
            ctx.fillStyle = `rgba(255, 253, 244, ${(p * 0.9).toFixed(3)})`;
            ctx.fillRect(0, y + h + 7, VW, 1);
        }
    }

    /**
     * 上一档的时候横过屏幕的那道光。**升档必须看得见** ——
     * 悄悄提速只会让人觉得「我怎么突然打不过了」,而不是「又上了一档」。
     * 只有一道横带,不写字:画布上没有像素字体,写字会糊。
     */
    _drawWave(ctx, f) {
        const left = (f.waveFlashUntil ?? 0) - f.elapsed;
        if (left <= 0) return;
        const p = left / 900;                       // 1 → 0
        const y = 40 + (1 - p) * 36;
        ctx.fillStyle = `rgba(245, 184, 61, ${(p * 0.75).toFixed(3)})`;
        ctx.fillRect(0, y, VW, 3);
        ctx.fillStyle = `rgba(255, 253, 244, ${(p * 0.9).toFixed(3)})`;
        ctx.fillRect(0, y + 1, VW, 1);
        // 波数用短竖条数出来 —— 一根一波,十根并成一根长的
        const n = f.wave + 1;
        ctx.fillStyle = `rgba(245, 184, 61, ${(p * 0.9).toFixed(3)})`;
        for (let i = 0; i < Math.min(n, 10); i++) {
            ctx.fillRect(VW / 2 - Math.min(n, 10) * 5 + i * 10, y - 9, 4, 7);
        }
        if (n > 10) ctx.fillRect(VW / 2 - 60, y - 9, 3, 7);
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

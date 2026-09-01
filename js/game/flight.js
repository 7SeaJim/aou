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

import { weatherOf, runwayBonus } from './rules.js';
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
/**
 * 命中半径。**吃的判得松,撞的判得紧,这是故意不对称的。**
 *
 * 原来食材和障碍共用一个 17。可后期一个东西一帧要走十几像素,
 * 从看见到擦身而过只剩两三帧 —— 同一个数字下,「差一点没吃到」和
 * 「差一点没撞上」出现得一样多,但玩家只会记住前者:
 * **没吃到是我的损失,没撞上是理所当然。**
 *
 * 所以食材放到 22(比画面上那颗看着还大一圈,伸头就够得着),
 * 障碍收到 15(擦着边过去算你过去了)。道具跟食材走。
 */
const FOOD_R = 22;
const HAZARD_R = 15;

/* ---------- 两个键 ----------
 *
 * 原来是**拖着哇鸥走**:手指在哪它就在哪。够直观,但没有手感可言 ——
 * 位置直接归你,不存在「来不及」,飞行的难度就只剩下眼力。
 *
 * 现在改成两个键,中间隔着一层重力:
 *
 *   跃起(空格 / 屏幕左半)   拍一下翅膀,往上蹿一段再落回来
 *   平飞(方向键右 / 右半)   按住的时候不掉,横着飘
 *   什么都不按               掉
 *
 * 三个状态各管一个方向,合起来是完整的上下控制 —— **但每一次改变高度
 * 都要提前一点点**,那一点点就是手感。飞不是「移到那儿」,是「攒够高度」。
 */
/**
 * 每帧的下坠加速度(以 60fps 为基准,和 move 一样乘 k)。
 *
 * 第一版是 0.09,弧线又高又慢:拍一下要 0.54 秒才到顶,而且**刚拍完
 * 想往下走,得先花半秒把那股上冲的劲抵消掉**。于是常见的死法是
 * 「看见了、也知道该往哪躲、就是身子还在往上飘」—— 那不是难,是迟钝。
 *
 * 现在把整条弧线按时间压短,高度基本不变(48px):
 * 到顶 0.30 秒,从静止往下掉 0.30 秒也走 50px。**上下都在三分之一秒内起效。**
 */
const GRAVITY = 0.30;
/** 拍一下翅膀给的初速度。升到最高约 48 像素 —— 五条道里的一道多一点 */
const FLAP_VY = -5.4;
/** 下坠的终速。不封的话最后一段快到看不清自己是怎么掉下去的 */
const MAX_VY = 6.5;
/** 平飞时把纵向速度按住的力度。不是直接归零 —— 那样切换起来像瞬移 */
const GLIDE_K = 0.5;
/** 能飞的上下边。上面撞天花板只是停住,下面碰水面要挨一下 */
const SKY_TOP = 22;
/**
 * 判「掉进湖里」的高度。
 *
 * 原来是 HORIZON − 16:算的是「32 高的图,底边正好压在海平线上」。
 * 但**图有 32 高不等于鸟有 32 高** —— 哇鸥的脚在中心往下约 11 像素,
 * 底下那几行是空的。于是判定发生时它还整只浮在山那一带的天上,
 * 画面上离水面差着一截,玩家只看见「无缘无故掉了一条命」。
 *
 * 现在压到海平线再往下 4 像素:触发的那一刻哇鸥的身子一半在水里。
 * **判定线该画在玩家看得见的那个东西上,不是画在图片的边界上。**
 */
const SEA_TOP = HORIZON + 4;
// 飞行里会掉的食材。稀有的(菌子、乳扇)不放常规掉落池,靠天气加成出
const FOOD_TYPES = ['erkuai', 'potato', 'rice', 'douhua', 'chili', 'sugar'];
const OBSTACLES = ['cloud', 'balloon', 'kite'];
const POWERUPS = ['shield', 'magnet', 'double'];
const OBSTACLE_GRID = { cloud: 'storm', balloon: 'balloon', kite: 'kite' };

/**
 * 一级、晴天的开局速度(每 60fps 帧走多少虚拟像素)。
 *
 * 1.25 是飘(横穿一次屏要六秒,开局一分钟几乎不用动手),
 * 2.6 又太急(还没坐稳东西就到脸上了)。2.0 落在中间:
 * 一秒 120 像素,横穿一次屏 3.7 秒,从露头到眼前有三秒多。
 *
 * **开头这一分钟决定了他要不要玩第二局** —— 太闲和太慌是同一个死法。
 */
const SPEED_0 = 2.0;

/**
 * 提速的斜率:每飞一分钟,速度在开局的基础上多涨这么多。
 *
 * 底盘抬高之后斜率就得压下来 —— 照旧的 0.9 走,五分钟时会比原来快四成,
 * 反应时间掉到半秒以下,那不是难,是看运气。
 */
const SPEED_GROW = 0.22;
/**
 * 生成间隔每分钟压缩多少毫秒,以及压到哪儿为止。
 *
 * 底线定在 380ms 而不是 300:**留出来的不是反应时间,是「拍两下」的时间。**
 * 换两条道要连着拍两下并且提前起手,间隔比这个还短的话,
 * 第二下永远来不及 —— 那时候躲不躲得掉就跟操作没关系了。
 */
const SPAWN_GROW = 110;
const SPAWN_MIN = 420;

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
/** 食材出现在哇鸥当下高度的上下这么多像素之内。约等于两下翅膀 */
const REACH = 72;

/* ---------- 窄道:唯一一件非平飞不可的事 ----------
 *
 * 两个键里,平飞一直是可有可无的那个:躲障碍靠的是「换到空的那条道」,
 * 而换道用跃起和松手就够了 —— **一个从来不用按的键等于没有。**
 *
 * 窄道是专门为它造的局面:一整片乌云横过来,只留一条缝,
 * 而缝的高度是固定的。你得先飞到那个高度,然后**在里面待住一秒多** ——
 * 松手就掉出去,多拍一下就撞上顶。这一秒多里,平飞是唯一的解。
 *
 * 每三波来一次(约一分钟),提前 1.5 秒在右边缘标出缝在哪 ——
 * **不预告的话它就不是考验,是埋伏。**
 */
const CORRIDOR_EVERY = 3;       // 每几波来一次
const CORRIDOR_WARN = 1500;     // 提前多久预告
const CORRIDOR_S = 1.3;         // 穿过去要多久(秒)。宽度按当时的速度换算
const CORRIDOR_GAP = 32;        // 缝的半高。哇鸥 32 高,判定半径 15
const CORRIDOR_MIN_W = 220;
const CORRIDOR_MAX_W = 520;

/**
 * 开局先数三秒。
 *
 * 点完「出发觅食」画面一换,东西就已经在往脸上飞了 —— 玩家还没看清
 * 自己在哪儿、这局是什么天气、两个键长什么样,第一条命就没了。
 * **一局的第一秒不该用来找自己。**
 *
 * 这三秒里世界照转、两个键照用、水面不扣命,但**不计时、不生成、不判死**:
 * 距离从 0 开始,难度从 0 分钟开始 —— 它是白送的三秒热身,不是白扣的三秒。
 */
const COUNTDOWN_MS = 3000;

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

        this._onDown = this._onDown.bind(this);
        this._onUp = this._onUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this._loop = this._loop.bind(this);
    }

    start() {
        const w = weatherOf(this.state);
        const lv = this.state.level;
        // 跑道给的三条加成。没建跑道时全是 0,下面的算式原样退回原来的数
        const rw = runwayBonus(this.state);

        this.f = {
            score: 0,
            lives: 3,
            birdY: VH / 2,
            vy: 0,
            glide: false,       // 方向键右按着没有
            flapAt: -1e9,       // 上一次拍翅膀,画翅膀那一下要用
            hurtUntil: 0,
            countdown: COUNTDOWN_MS,
            // 画面时间。**和 elapsed 分开** —— elapsed 是「这一局飞了多久」,
            // 倒计时里它必须是 0(距离、难度、波数全从它推);
            // 而云、浪、翅膀这些在倒计时里也得动,不然像卡住了
            vt: 0,
            foods: [], obstacles: [], powerups: [],
            walls: [],        // 窄道。同一时间最多一片
            warn: null,       // 窄道的预告:{ y, at }
            spawnTimer: 0,
            // 开局的节奏和速度。往后都是从这两个数按飞行时长推的,见 _difficulty()
            baseInterval: Math.max(560, 900 - lv * 40),
            baseSpeed: (SPEED_0 + (lv - 1) * 0.19) * w.speed,
            spawnInterval: Math.max(560, 900 - lv * 40),
            speed: (SPEED_0 + (lv - 1) * 0.19) * w.speed,
            hazard: Math.max(0.08, HAZARD_0 - rw.flag),   // 风向旗:障碍少一些
            flag: rw.flag,
            // 助跑坡:**不再是全程按比例减速**,减的是提速的斜率 —— 见 _difficulty()
            ramp: rw.ramp,
            hungryMs: HUNGRY_MS * (1 + rw.trough),  // 食槽:肚子撑得更久
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

        this._bind();
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
        this._unbind();
    }

    /* ---------- 内部 ---------- */

    _bind() {
        // 画布上按下也算:**左半边点一下 = 跃起,右半边按住 = 平飞**。
        // 手机上没有键盘,而满屏可点比去够一个小按钮靠谱得多 ——
        // 屏幕下面那两个按钮同时也是「告诉你有这两个键」的说明。
        this.canvas.addEventListener('pointerdown', this._onDown);
        this.canvas.addEventListener('pointerup', this._onUp);
        this.canvas.addEventListener('pointercancel', this._onUp);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        // 切走的时候浏览器不会补一个 keyup —— 不听 blur 的话,
        // 回来会发现平飞一直按着,而玩家手上什么都没按
        window.addEventListener('blur', this._onBlur);
    }

    _unbind() {
        this.canvas.removeEventListener('pointerdown', this._onDown);
        this.canvas.removeEventListener('pointerup', this._onUp);
        this.canvas.removeEventListener('pointercancel', this._onUp);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
    }

    /** 拍一下翅膀。暂停时不响应 —— 暂停界面上还有按钮要点 */
    flap() {
        if (!this.running || this.paused) return;
        this.f.vy = FLAP_VY;
        this.f.flapAt = this.f.vt;
        sfx.play('flap');
    }

    /** 平飞按住 / 松开。UI 上那两个按钮也走这两个口 */
    setGlide(on) {
        if (!this.running) return;
        this.f.glide = !!on && !this.paused;
    }

    _onDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (e.clientX - rect.left < rect.width / 2) this.flap();
        else this.setGlide(true);
    }

    _onUp() { this.setGlide(false); }

    _onKeyDown(e) {
        // **按住空格不能变成无重力。** 系统的自动重复会一秒发几十个 keydown,
        // 每个都拍一下翅膀的话,压着不放就直接飞上天了
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.flap(); }
        else if (e.code === 'ArrowRight') { e.preventDefault(); this.setGlide(true); }
    }

    _onKeyUp(e) {
        if (e.code === 'ArrowRight') this.setGlide(false);
    }

    _onBlur() { this.setGlide(false); }

    _emit() {
        this.onTick?.({
            score: this.f.score, lives: this.f.lives, combo: this.f.combo,
            wave: this.f.wave + 1,
            dist: Math.round(this.f.elapsed / 1000 * M_PER_SEC),
            hungry: this.f.elapsed >= HUNGRY_AT,
            count: Math.max(0, Math.ceil(this.f.countdown / 1000)),
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
        f.vt += dt;

        // 倒计时:先飞着玩三秒。这里 return 掉的是「计时、生成、判死」,
        // 不是「动」—— 手上的两个键从第一帧起就是通的
        if (f.countdown > 0) {
            const before = Math.ceil(f.countdown / 1000);
            f.countdown -= dt;
            const after = Math.ceil(f.countdown / 1000);
            if (after !== before) sfx.play(after > 0 ? 'tab' : 'event');
            this._fly(k);
            this._emit();
            return;
        }

        f.elapsed += dt;

        this._fly(k);

        // 生成
        f.spawnTimer += dt;
        if (f.spawnTimer >= f.spawnInterval) {
            f.spawnTimer = 0;
            this._spawn();
        }

        const move = f.speed * k;
        const hit = (o, r) => Math.abs(BIRD_X - o.x) < r && Math.abs(f.birdY - o.y) < r;

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
            if (hit(o, FOOD_R)) {
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
            }
        }

        // 障碍
        for (let i = f.obstacles.length - 1; i >= 0; i--) {
            const o = f.obstacles[i];
            o.x -= move;
            if (o.x < -24) { f.obstacles.splice(i, 1); continue; }
            if (!hit(o, HAZARD_R)) continue;

            f.obstacles.splice(i, 1);
            if (f.shield) {
                sfx.play('event');      // 护盾挡下:响一下但不是挨打那声
                f.shield = false;
                continue;
            }
            sfx.play('hit');
            f.lives--;
            f.combo = 0;
            f.hurtUntil = f.elapsed + 450;      // 闪一下,给个挨打的反馈
            if (f.lives <= 0) { this._finish('crash'); return; }
        }

        // 道具
        for (let i = f.powerups.length - 1; i >= 0; i--) {
            const o = f.powerups[i];
            o.x -= move;
            if (o.x < -24) { f.powerups.splice(i, 1); continue; }
            if (!hit(o, FOOD_R)) continue;
            f.powerups.splice(i, 1);
            f[o.type] = true;
        }

        this._walls(move);
        if (!this.running) return;       // 撞在窄道上没命了

        this._difficulty();
        this._hunger(dt);

        // **每帧都报一次。** 距离是按时间涨的,而 HUD 只在 _emit() 的时候刷 ——
        // 原来 _emit 只在「捡到东西 / 挨了一下 / 上一档」的时候叫,
        // 于是屏幕上的米数是一跳一跳的:碰到道具才蹦一下,平时纹丝不动。
        // 玩家一眼就能看出来那不是在飞,是在数捡了几个。
        // 一帧只是改几个 textContent,不重建任何结构,这个代价可以忽略。
        this._emit();
    }

    /**
     * 难度只跟着**飞了多久**走,不跟分数、不跟等级(等级只定开局那一档)。
     *
     * 原来是「每 5 秒 +0.06,封顶 2.5」—— 一分四十秒就摸到顶,之后再飞十分钟
     * 也是同一个速度、同一个障碍密度。**一局的终点应该是撞死了,不是不再变难了。**
     *
     * 现在三样一起涨,而且**不封顶**:
     *   speed     线性涨,一分钟多涨 22%
     *   interval  越来越密,底线 420ms —— 再密就成了一堵墙
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
    /**
     * 纵向的一步。平飞不是把速度直接归零 —— 那样一按一松像瞬移,
     * 而且从下坠切到平飞会「咔」一下停在半空。按住的是**阻力**,
     * 半个巴掌的时间飘平,看着才像一只鸟在借风。
     */
    _fly(k) {
        const f = this.f;
        if (f.glide) f.vy += (0 - f.vy) * Math.min(1, GLIDE_K * k);
        else f.vy = Math.min(MAX_VY, f.vy + GRAVITY * k);
        f.birdY += f.vy * k;

        if (f.birdY < SKY_TOP) { f.birdY = SKY_TOP; f.vy = 0; }   // 顶到天,停住
        else if (f.birdY > SEA_TOP) this._splash();
    }

    /**
     * 掉到水面上。**扣一条命,然后自己蹬水起飞** ——
     * 不直接判死是因为这是只海鸥:落在滇池上再飞起来是它每天干的事,
     * 而一个「碰到底就结束」的下边界,配上重力,会让人不敢往下飞。
     * 下半屏的食材本来就该有人去捡。
     */
    _splash() {
        const f = this.f;
        f.birdY = SEA_TOP;
        // 蹬水比空中拍一下有力得多(升 120px 而不是 45px)。
        // **这样一次失误只会是一条命** —— 弹得矮的话,还没回过神就又拍下去了,
        // 一个走神扣两三条,那是在罚玩家没盯着屏幕,不是在考他会不会飞
        f.vy = FLAP_VY * 1.6;
        if (f.countdown > 0) return;          // 倒计时里随便掉,不算
        if (f.elapsed < f.hurtUntil) return;  // 挨打的那几百毫秒里不重复扣
        if (f.shield) { sfx.play('event'); f.shield = false; return; }
        sfx.play('hit');
        f.lives--;
        f.combo = 0;
        f.hurtUntil = f.elapsed + 450;
        if (f.lives <= 0) this._finish('crash');
    }

    _hunger(dt) {
        const f = this.f;
        if (f.elapsed < HUNGRY_AT) return;
        if (f.hungryFlash === 0) {           // 刚饿的那一下要报一声
            f.hungryFlash = f.elapsed + 1600;
            sfx.play('hit');
        }
        f.hunger -= dt / f.hungryMs;
        if (f.hunger <= 0) { f.hunger = 0; this._finish('hungry'); }
    }

    _difficulty() {
        const f = this.f;
        const mins = f.elapsed / 60000;
        // 助跑坡减的是**斜率**,不是速度本身。
        // 原来它按比例砍 baseSpeed —— 全程一个固定折扣,开局就慢,
        // 而开局本来已经够慢了;玩家买完只觉得「更飘了」,而且从头到尾
        // 一个手感,根本看不出这钱花在哪。
        // 现在它买的是「变快来得晚一点」:同样的开局,同样的手感,
        // 但你能多撑一程 —— 那正好记在最远距离上,看得见。
        f.speed = f.baseSpeed * (1 + mins * SPEED_GROW * (1 - f.ramp));
        f.spawnInterval = Math.max(SPAWN_MIN, f.baseInterval - mins * SPAWN_GROW);
        f.hazard = Math.min(HAZARD_MAX - f.flag, Math.max(0.08, HAZARD_0 - f.flag) + mins * 0.12);

        // 每 20 秒报一波。**得让玩家听见、看见它变难了** ——
        // 悄悄变难只会让人觉得「我怎么突然打不过了」,而不是「又上了一档」
        const wave = Math.floor(f.elapsed / WAVE_MS);
        if (wave > f.wave) {
            f.wave = wave;
            sfx.play('event');
            f.waveFlashUntil = f.elapsed + 900;
            // 第 2、5、8… 波各来一片窄道 —— 约一分钟一次。
            // 从第二波起是为了先让人把两个键摸熟,别一上来就考试
            if (wave >= 2 && wave % CORRIDOR_EVERY === 2) this._announceWall();
        }
    }

    /** 排一片窄道。先只放预告,1.5 秒后云才真的推过来 */
    _announceWall() {
        const f = this.f;
        if (f.warn || f.walls.length) return;      // 一片没过去不排下一片
        const top = 30, span = HORIZON - 60;
        const lane = Math.floor(this.rng() * LANES);
        f.warn = { y: top + span * (lane + 0.5) / LANES, at: f.elapsed + CORRIDOR_WARN };
        sfx.play('event');
    }

    /**
     * 窄道的一步:该推出来的推出来,已经在场上的往左走、判碰。
     *
     * 宽度按**当时的速度**换算成 CORRIDOR_S 秒 —— 写死一个像素宽度的话,
     * 开局要在里面待三秒(熬人),后期只要半秒(等于没有)。
     * 要固定的是「按住多久」,不是「多少像素」。
     */
    _walls(move) {
        const f = this.f;
        if (f.warn && f.elapsed >= f.warn.at) {
            const w = Math.max(CORRIDOR_MIN_W,
                      Math.min(CORRIDOR_MAX_W, f.speed * 60 * CORRIDOR_S));
            f.walls.push({ x: VW + 8, w: Math.round(w), gapY: f.warn.y });
            f.warn = null;
        }
        for (let i = f.walls.length - 1; i >= 0; i--) {
            const o = f.walls[i];
            o.x -= move;
            if (o.x + o.w < -8) { f.walls.splice(i, 1); continue; }
            const inX = BIRD_X + HAZARD_R > o.x && BIRD_X - HAZARD_R < o.x + o.w;
            if (!inX || Math.abs(f.birdY - o.gapY) < CORRIDOR_GAP) continue;
            if (f.elapsed < f.hurtUntil) continue;
            if (f.shield) { sfx.play('event'); f.shield = false; continue; }
            sfx.play('hit');
            f.lives--;
            f.combo = 0;
            f.hurtUntil = f.elapsed + 450;
            // **撞了就把它卷进缝里。** 一片云要走一秒多,不这么做的话
            // 挨打的无敌时间一过又撞一下,一片墙能吃掉三条命 ——
            // 那是在罚「没躲开」这一个错误三次
            f.birdY = o.gapY;
            f.vy = 0;
            if (f.lives <= 0) { this._finish('crash'); return; }
        }
    }

    _spawn() {
        const f = this.f;
        const rnd = this.rng;
        const top = 30, span = HORIZON - 60;
        /**
         * 食材出在哪个高度。**在够得着的范围里随机,而不是整片天随机。**
         *
         * 原来是整片天均匀抽:后期一个东西从露头到擦身而过只有一秒出头,
         * 抽在另一头的那些**从出生起就吃不到** —— 玩家看着它飘过去,
         * 学不到任何东西,只觉得这游戏在馋他。
         *
         * 现在以哇鸥当下的高度为中心、上下各 REACH 抽。REACH 是两下翅膀
         * 的距离:够得着,但得动;而它飞过来的这一秒里哇鸥自己也在动,
         * 所以并不会变成「张嘴等着」。
         */
        const foodY = () => {
            const c = f.birdY + (rnd() * 2 - 1) * REACH;
            return Math.max(top, Math.min(top + span, c));
        };
        /** 第 i 条道的中间高度 */
        const laneY = i => top + span * (i + 0.5) / LANES;
        const pick = a => a[Math.floor(rnd() * a.length)];

        // 窄道在场上的时候不再撒障碍 —— 云已经把天占满了,
        // 再塞东西就是在一条唯一的路上设伏。
        // 缝里改放吃的:**按住平飞的那一秒同时也是在进食**,
        // 这样它不只是一道关卡,还接上了第五分钟之后的肚子条
        const wall = this.f.walls[0];
        if (wall) {
            if (rnd() < 0.55) {
                f.foods.push({ x: VW + 16, y: wall.gapY, type: pick(FOOD_TYPES) });
            }
            return;
        }

        const r = rnd();

        if (r < 0.05) {
            f.powerups.push({ x: VW + 16, y: foodY(), type: pick(POWERUPS) });
        } else if (r < 0.05 + f.hazard) {
            // 障碍**不跟着哇鸥走** —— 跟着走就成了追着人扔石头,
            // 而它靠的是「一簇里必留一条空道」那套规矩
            this._hazard(1 + Math.floor(f.wave / 4), laneY);
        } else {
            f.foods.push({ x: VW + 16, y: foodY(), type: pick(FOOD_TYPES) });
        }

        // 天气影响额外生成
        if (this.state.weather === 'rainy' && rnd() < 0.3) this._hazard(1, laneY);
        if (this.state.weather === 'foggy' && rnd() < 0.25) {
            f.foods.push({ x: VW + 16, y: foodY(), type: pick(FOOD_TYPES) });
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
        const t = f.vt;                      // 背景和翅膀走画面时间,倒计时里也动

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
        this._drawWalls(ctx, f);

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

    /**
     * 窄道:两片乌云和中间那条缝,外加还没到之前的预告。
     *
     * 缝的边缘画成起伏的云疙瘩,但**疙瘩一律往外让,不往缝里长** ——
     * 判定的缝是平的(±CORRIDOR_GAP),画面上的缝只会比它更宽。
     * 反过来的话,玩家会撞上一块看着明明没碰到的云,
     * 而「我看见的和游戏算的不是一回事」是最伤人的一种不公平。
     */
    _drawWalls(ctx, f) {
        // 还没来:一条横穿画面的虚线标出缝在哪,右边缘一个方框
        if (f.warn) {
            const y = Math.round(f.warn.y);
            const blink = Math.floor(f.elapsed / 110) % 2 === 0;
            ctx.fillStyle = blink ? '#f5b83d' : '#c98a1e';
            for (let x = 0; x < VW; x += 12) ctx.fillRect(x, y, 6, 1);
            ctx.fillRect(VW - 10, y - CORRIDOR_GAP, 4, CORRIDOR_GAP * 2);
            ctx.fillRect(VW - 22, y - CORRIDOR_GAP, 16, 2);
            ctx.fillRect(VW - 22, y + CORRIDOR_GAP - 2, 16, 2);
        }

        for (const o of f.walls) this._drawWall(ctx, o);
    }

    _drawWall(ctx, o) {
        const x0 = Math.round(o.x);
        const gTop = Math.round(o.gapY - CORRIDOR_GAP);
        const gBot = Math.round(o.gapY + CORRIDOR_GAP);
        for (let dx = 0; dx < o.w; dx += 4) {
            const x = x0 + dx;
            if (x + 4 <= 0 || x >= VW) continue;
            const w = Math.min(4, VW - x, x0 + o.w - x);
            // 疙瘩按「离云的左边多远」算,不按屏幕坐标 ——
            // 按屏幕算的话,云一往左走凹凸就在原地抖
            let b = ((dx * 2654435761) >>> 0) % 3 * 4;
            // **两头张成喇叭口。** 进口比中间宽,一是云本来就没有刀切的边,
            // 二是「对准」和「待住」是两件事:让人先进得来,再考他按不按得稳
            const edge = Math.min(dx, o.w - dx);
            if (edge < 26) b += (26 - edge) * 0.9;
            const t = Math.round(gTop - b), u = Math.round(gBot + b);

            ctx.fillStyle = '#8a99a3';
            if (t > 0) ctx.fillRect(x, 0, w, t);
            if (u < HORIZON) ctx.fillRect(x, u, w, HORIZON - u);
            // 云里横着几道暗纹。**没有它就是一块灰板** ——
            // 这么大一片纯色,在一屏都是渐变天空的画面里最扎眼
            ctx.fillStyle = '#78868f';
            for (const d of [16, 30, 48]) {
                if (t - d > 0) ctx.fillRect(x, t - d, w, 2);
                if (u + d < HORIZON) ctx.fillRect(x, u + d - 2, w, 2);
            }
            ctx.fillStyle = '#5f6d78';                  // 贴着缝的那一面压暗
            if (t > 6) ctx.fillRect(x, t - 6, w, 6);
            if (u < HORIZON) ctx.fillRect(x, u, w, Math.min(6, HORIZON - u));
            ctx.fillStyle = '#4a3628';                  // 描边
            if (t > 0) ctx.fillRect(x, t - 1, w, 1);
            if (u < HORIZON) ctx.fillRect(x, u, w, 1);
        }
    }

    _drawObstacle(ctx, o) {
        const grid = SCENERY[OBSTACLE_GRID[o.type]];
        drawSprite(ctx, sprite(OBSTACLE_GRID[o.type], grid), o.x, o.y);
    }

    _drawBird(ctx, f) {
        const t = f.vt;                      // 翅膀的节奏走画面时间
        // 挨打后闪 450ms:这一条是玩法时间,和 hurtUntil 同一把尺子
        const hurt = f.elapsed < f.hurtUntil;
        if (hurt && Math.floor(f.elapsed / 70) % 2 === 0) {
            if (f.shield) this._drawShield(ctx, f);
            return;
        }

        if (this.sprites?.drawAnim(ctx, 'waou', 'fly', t, BIRD_X, f.birdY, 32)) {
            if (f.shield) this._drawShield(ctx, f);
            return;
        }

        // 挑翅膀帧:**按的是哪个键要能从画面上看出来**。
        // 刚拍完那 220ms 一定是扬起的那一帧 —— 反馈得贴着按键,
        // 不能等速度真的变正了才换,那时候手感已经过去了
        let i = Math.floor(t / 1000 * 10) % 4;
        if (t - f.flapAt < 180 || f.vy < -1.5) i = 0;  // 往上蹿 -> 翅膀扬起
        else if (f.glide) i = 1;                       // 平飞    -> 摊平
        else if (f.vy > 2.5) i = 2;                    // 往下掉  -> 翅膀压下
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

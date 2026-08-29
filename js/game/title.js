/**
 * 待机界面:哇鸥站在长虫山的观景台上眺望昆明。
 *
 * 构图从远到近四层:
 *   天  —— 色带,按时段换配色(白天 / 傍晚 / 夜晚,每次进来随机)
 *   远山 + 滇池 —— 城市后面那条,交代这是个盆地
 *   城  —— 一片高高低低的楼,**万达双塔**明显高出一截,是认得出昆明的那个点
 *   崖 + 石栏杆 + 哇鸥 —— 前景,哇鸥贴着右缘,只看得见左半边
 *
 * 和游戏里的画面同一套管线(见 pixmap.js):440×310 低分辨率作画再整数倍放大。
 */

import { PixelScreen, sprite, drawStanding, bands, dither } from './pixmap.js';
import { SCENERY } from './pixels.js';
import { VW, VH } from './scene.js';

const HORIZON = 168;        // 城市脚下那条线
/**
 * 石栏杆的透视线:远端(左)高而细,近端(右)低而粗。
 * 这条线定了整张图的视角 —— 平着铺一条水平栏杆的话就是张示意图,
 * 斜着走才像有人站在观景台侧后方拍下来的。
 */
const RAIL_L = 198, RAIL_R = 272;
const railY = x => Math.round(RAIL_L + (RAIL_R - RAIL_L) * (x / VW));
const railThick = x => 3 + Math.round(6 * x / VW);

/**
 * 三个时段。城市的窗户亮多少、崖有多黑,都跟着走。
 * lit 是每栋楼点灯的概率 —— 白天为 0,夜里几乎全亮。
 */
const TIMES = {
    day: {
        sky:   ['#4aa8dc', '#63b9e6', '#84cbee', '#a8dcf2', '#c9eaf4', '#e4f0e6', '#f6ecd2'],
        far:   '#93b0c0', water: '#63b6c4',
        city:  '#7d97a8', cityDark: '#5f7a8c',
        cliff: '#6b6154', cliffDark: '#4a423a',
        lit: 0, glow: null,
    },
    dusk: {
        sky:   ['#2e2a52', '#463663', '#6b4271', '#9a4f70', '#c86a63', '#e8975c', '#f6c77a'],
        far:   '#5d4a66', water: '#8a5f74',
        city:  '#4a3b52', cityDark: '#33293c',
        cliff: '#3d3138', cliffDark: '#281f26',
        lit: 0.45, glow: '#f6c77a',
    },
    night: {
        sky:   ['#0b1226', '#101a33', '#17233f', '#1e2b49', '#26334f', '#2f3b58', '#3a4560'],
        far:   '#1d2740', water: '#152038',
        city:  '#1b2740', cityDark: '#121a2e',
        cliff: '#1a202e', cliffDark: '#10141f',
        lit: 0.85, glow: '#9fc0e0',
    },
};

/** 城市天际线。固定一份,不要每次随机 —— 城市轮廓每进一次就换一个样,反而假。 */
const SKYLINE = [
    [8, 26], [22, 18], [34, 34], [48, 22], [58, 40], [72, 28], [84, 20],
    [96, 46], [110, 30], [124, 24], [136, 38], [150, 26], [162, 44],
    [176, 22], [188, 32], [200, 28],
    /* 双塔在这儿,留出空档 */
    [268, 30], [280, 22], [292, 42], [306, 26], [318, 36], [330, 20],
    [342, 30], [356, 24], [368, 40], [382, 26], [396, 34], [410, 20], [424, 28],
];

const WANDA_X = 232;        // 双塔的左缘

export class TitleScreen {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas, time = pickTime()) {
        this.screen = new PixelScreen(canvas, VW, VH);
        this.time = TIMES[time] ? time : 'day';
        this.t = 0;
        this.rafId = null;
        this._loop = this._loop.bind(this);
    }

    start() {
        if (this.rafId) return;
        this.last = 0;
        this._bake();
        this.rafId = requestAnimationFrame(this._loop);
    }

    stop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    /** 除了云和灯的闪烁,整张图是静的 —— 烤一次就行 */
    _bake() {
        const T = TIMES[this.time];
        const layer = this.screen.layer();
        const c = layer.ctx;

        paintSky(c, T);
        paintFar(c, T);
        paintCity(c, T);
        paintNear(c, T);
        paintCliff(c, T);
        this.baked = layer;
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this.t += dt;

        const { ctx } = this.screen;
        ctx.drawImage(this.baked.cv, 0, 0);
        drawWindowBlink(ctx, TIMES[this.time], this.t);
        drawGull(ctx, this.t);
        this.screen.present();
    }
}

/**
 * 每次进来随机一个时段。
 * 开发时可以用 ?time=night 钉住 —— 不然截图对比全靠碰运气。
 */
export function pickTime() {
    const forced = typeof location !== 'undefined'
        && new URLSearchParams(location.search).get('time');
    if (forced && TIMES[forced]) return forced;
    return ['day', 'dusk', 'night'][Math.floor(Math.random() * 3)];
}

/* ---------- 各层 ---------- */

function paintSky(c, T) {
    const step = HORIZON / T.sky.length;
    bands(c, VW, 0, HORIZON, T.sky.map((col, i) => [Math.round(i * step), col]));
    for (let i = 1; i < T.sky.length; i++) {
        const y = Math.round(i * step);
        dither(c, VW, y - 1, T.sky[i], 2, i);
        dither(c, VW, y, T.sky[i - 1], 2, i + 1);
    }
    if (T.lit > 0.6) {                       // 夜里撒点星
        c.fillStyle = '#cdd8ea';
        for (let i = 0; i < 40; i++) {
            const x = (i * 97 + 13) % VW;
            const y = (i * 41) % 90;
            if ((i * 7) % 3) c.fillRect(x, y, 1, 1);
        }
    }
}

/**
 * 近处的城区 + 脚下的山坡。
 * 城市那条线到崖顶之间原本整块没画,直接漏出了 .px-screen 的 CSS 底色 ——
 * 一片浅青,看着像水,其实是个洞。从长虫山往下看,这一段是近处的楼和山坡。
 */
function paintNear(c, T) {
    const top = HORIZON;

    // 先铺满底色再往上画。只画散落的楼和坡的话,缝隙里会漏出
    // .px-screen 的 CSS 底色 —— 一片浅青,看着像水,其实是个洞。
    // 下边界跟着栏杆的斜线走,不是一条水平线。
    for (let x = 0; x < VW; x++) {
        const bottom = railY(x) + 2;
        for (let y = top; y < bottom; y++) {
            const f = (y - top) / (bottom - top);
            c.fillStyle = mixHex(T.city, T.cliff, Math.min(1, f * 1.15));
            c.fillRect(x, y, 1, 1);
        }
    }

    // 近处的楼:比远景那排矮、密、暗,给出「往下看」的层次
    for (let i = 0; i < 34; i++) {
        const x = (i * 13 + (i % 3) * 4) % (VW + 20) - 10;
        const w = 9 + (i % 4) * 3;
        const h = 14 + (i % 5) * 7;
        const y = top + 4 + (i % 6) * 9;
        c.fillStyle = T.cityDark;
        c.fillRect(x, y, w, h);
        c.fillStyle = T.city;
        c.fillRect(x, y, 2, h);
        if (T.lit > 0) {
            c.fillStyle = T.glow;
            for (let wy = y + 3; wy < y + h - 2; wy += 5) {
                for (let wx = x + 3; wx < x + w - 2; wx += 4) {
                    if (hash(x * 3 + wy + wx) < T.lit * 0.7) c.fillRect(wx, wy, 1, 1);
                }
            }
        }
    }
    // 山坡:一层比一层暗,压到崖根
    const slope = [[0.35, T.cityDark], [0.62, mixHex(T.cityDark, T.cliff, 0.5)], [0.82, T.cliff]];
    for (const [f, col] of slope) {
        c.fillStyle = col;
        for (let x = 0; x < VW; x++) {
            const bottom = railY(x) + 2;
            const y = Math.round(top + (bottom - top) * f)
                + Math.round(Math.sin(x * 0.031 + f * 9) * 4 + Math.sin(x * 0.011) * 3);
            c.fillRect(x, y, 1, bottom - y);
        }
    }
}

/** 十六进制混色。远近层次靠它过渡,别硬切。 */
function mixHex(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    return '#' + c(r1, r2) + c(g1, g2) + c(b1, b2);
}

/** 远山 + 山脚下的滇池,交代这是个被山围着的坝子 */
function paintFar(c, T) {
    c.fillStyle = T.far;
    const ridge = [[0, 6], [40, 14], [80, 22], [120, 16], [160, 26], [200, 18],
                   [240, 28], [290, 20], [340, 24], [390, 12], [440, 6]];
    for (let i = 0; i + 1 < ridge.length; i++) {
        const [x0, h0] = ridge[i], [x1, h1] = ridge[i + 1];
        for (let x = x0; x < x1; x++) {
            const h = Math.round(h0 + (h1 - h0) * (x - x0) / (x1 - x0));
            c.fillRect(x, HORIZON - 24 - h, 1, h + 24);
        }
    }
    c.fillStyle = T.water;
    c.fillRect(0, HORIZON - 10, VW, 10);
    c.fillStyle = T.city;
    for (let x = 0; x < VW; x += 3) c.fillRect(x, HORIZON - 6, 2, 1);   // 水面的一点碎光
}

function paintCity(c, T) {
    // 普通楼房
    for (const [x, h] of SKYLINE) {
        const w = 10;
        c.fillStyle = T.city;
        c.fillRect(x, HORIZON - h, w, h);
        c.fillStyle = T.cityDark;
        c.fillRect(x + w - 2, HORIZON - h, 2, h);
        if (T.lit > 0) {
            c.fillStyle = T.glow;
            for (let y = HORIZON - h + 3; y < HORIZON - 2; y += 4) {
                for (let wx = x + 2; wx < x + w - 3; wx += 3) {
                    if (hash(x + y + wx) < T.lit) c.fillRect(wx, y, 1, 1);
                }
            }
        }
    }
    // 万达双塔:整张图的地标,底边压在城市那条线上
    const cv = sprite('wanda:' + (T.lit > 0 ? 'lit' : 'day'), SCENERY.wanda, {
        remap: T.lit > 0
            ? { A: T.city, w: T.city, a: T.cityDark, y: T.glow }
            : { A: '#9db2c0', w: '#b8c9d4', a: '#7089a0', y: '#c8d8e0' },
    });
    c.drawImage(cv, WANDA_X, HORIZON - cv.height);
}

/**
 * 前景三件:崖 / 透视栏杆 / 左下的草木。
 * 深度顺序是 城市 → 栏杆 → 哇鸥 → 草木,哇鸥站在栏杆前面(近端)。
 */
function paintCliff(c, T) {
    // 崖:栏杆线以下全是,越往下越暗
    for (let x = 0; x < VW; x++) {
        const top = railY(x) + 2;
        for (let y = top; y < VH; y++) {
            const f = (y - top) / (VH - top);
            c.fillStyle = mixHex(T.cliff, T.cliffDark, Math.min(1, f * 1.4));
            c.fillRect(x, y, 1, 1);
        }
    }
    c.fillStyle = T.cliffDark;
    for (let i = 0; i < 120; i++) {                // 岩石的碎面
        const x = (i * 71) % VW;
        const y = railY(x) + 12 + (i * 37) % 70;
        if (y < VH) c.fillRect(x, y, 2 + (i % 3), 2);
    }

    paintRailing(c, T);
    paintFoliage(c, T);
}

/** 透视栏杆:近端粗、柱子疏;远端细、柱子密 */
function paintRailing(c, T) {
    const stone = T.lit > 0.6 ? ['#4a5468', '#66718a', '#333b4c']
                : T.lit > 0   ? ['#8a7a80', '#a9979c', '#5f5257']
                :               ['#b8b0a0', '#d6cfc2', '#7d7668'];
    const [mid, light, dark] = stone;

    // 立柱:间距和高度都随 x 增大 —— 越近越疏越长
    let x = 4, gap = 20;
    while (x < VW + 20) {
        const y = railY(x);
        const t = railThick(x) + 2;
        const h = 14 + Math.round(30 * x / VW);
        c.fillStyle = mid;  c.fillRect(x, y, t, h);
        c.fillStyle = light; c.fillRect(x, y, 2, h);
        c.fillStyle = dark; c.fillRect(x + t - 2, y, 2, h);
        x += Math.round(gap);
        gap *= 1.16;
    }
    // 扶手:压在立柱上
    for (let px = 0; px < VW; px++) {
        const y = railY(px), t = railThick(px);
        c.fillStyle = light; c.fillRect(px, y - t, 1, 2);
        c.fillStyle = mid;   c.fillRect(px, y - t + 2, 1, t);
        c.fillStyle = dark;  c.fillRect(px, y + 2, 1, 2);
    }
}

/**
 * 左下角的草木。整张图最近的一层,压在画面边缘上 ——
 * 有它才像「摄影师从灌木后面偷拍到的」,没它就是张风景示意图。
 *
 * 叶子用真正的叶形(两头尖、中间宽)画,不用圆点堆 ——
 * 圆点堆出来是一团黑饼,只有叶尖的轮廓才让人认出这是植物。
 */
function paintFoliage(c, T) {
    // 比崖再暗一档,但要留得出形 —— 夜里全黑成一片就白画了
    const dark = mixHex(T.cliffDark, '#0f2214', 0.75);
    const leaf = mixHex(T.cliffDark, '#22401f', 0.7);
    const hi   = mixHex(leaf, T.city, 0.34);

    // 从左下角朝右上散开的一丛。角度、长度都排过,不要随机 ——
    // 随机出来的叶子会互相打架,人眼一看就假。
    const blades = [
        // [根部x, 根部y, 角度(度), 长, 宽, 颜色]
        // 大的压在最外层,尖子探到画面中段 —— 这层是「镜头前的枝叶」,
        // 缩在角落里就成了一丛小草,那个偷拍的意思就没了。
        [-10, 320, -58, 118, 22, dark],
        [14, 326, -72, 132, 24, dark],
        [40, 330, -48, 104, 20, dark],
        [-14, 286, -26, 92, 18, dark],
        [-16, 250, -8, 62, 14, dark],
        [64, 330, -66, 96, 17, leaf],
        [30, 322, -86, 100, 15, leaf],
        [-6, 300, -18, 74, 14, leaf],
        [88, 332, -56, 72, 14, leaf],
        [8, 310, -40, 62, 11, hi],
        [50, 326, -76, 66, 11, hi],
        [-10, 268, -14, 48, 9, hi],
    ];
    for (const [bx, by, deg, len, wid, col] of blades) drawLeaf(c, bx, by, deg, len, wid, col);

    // 贴着底边的一条暗草皮,把叶子的根收在一起
    c.fillStyle = dark;
    for (let x = 0; x < 175; x++) {
        const h = Math.round(22 + Math.sin(x * 0.08) * 7 + Math.max(0, (120 - x) * 0.34));
        c.fillRect(x, VH - h, 1, h);
    }
}

/** 一片叶子:沿轴线走,宽度按两头尖中间宽的透镜形收放 */
function drawLeaf(c, x0, y0, deg, len, wid, color) {
    const a = deg * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    c.fillStyle = color;
    for (let i = 0; i <= len; i++) {
        const f = i / len;
        const w = Math.round(wid * Math.sin(Math.PI * f) ** 0.75);
        if (w <= 0) continue;
        const cx = Math.round(x0 + dx * i);
        const cy = Math.round(y0 + dy * i);
        // 垂直于轴线铺一条,近似即可 —— 低分辨率下看不出误差
        for (let j = -w; j <= w; j++) {
            const px = Math.round(cx - dy * j * 0.5);
            const py = Math.round(cy + dx * j * 0.5);
            if (px >= 0 && px < VW && py >= 0 && py < VH) c.fillRect(px, py, 1, 1);
        }
    }
}

/** 夜里几扇窗一闪一闪,让静图有口气 */
function drawWindowBlink(ctx, T, t) {
    if (!T.glow || T.lit < 0.3) return;
    ctx.fillStyle = T.glow;
    for (let i = 0; i < 14; i++) {
        if (Math.sin(t * 0.0011 + i * 2.3) < 0.7) continue;
        const [x, h] = SKYLINE[(i * 5) % SKYLINE.length];
        ctx.fillRect(x + 3 + (i % 3) * 3, HORIZON - h + 4 + (i % 4) * 4, 1, 1);
    }
}

/** 哇鸥:贴着右缘,只看得见左半边。轻微起伏,像在呼吸。 */
function drawGull(ctx, t) {
    const cv = sprite('gull_big', SCENERY.gull_big);
    const bob = Math.sin(t * 0.0013) > 0 ? 0 : 1;
    const x = VW - cv.width + 14;
    // 脚落在栏杆近端上;它画在栏杆之后,所以是站在栏杆前面的
    const y = railY(x + cv.width / 2) - cv.height + 3 + bob;
    ctx.drawImage(cv, x, y);
}

/** 稳定的伪随机,同一个 seed 每次结果一样 —— 窗户不能每帧换位置 */
function hash(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
}

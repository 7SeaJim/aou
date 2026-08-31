/**
 * 画面的公共部分:天空、湖面、大坝、天气。
 *
 * 滇池背景(background.js)和觅食飞行(flight.js)共用这里的画法,
 * 所以两个场景的天和海是同一片,飞出去和落回来不会像换了个游戏。
 *
 * 全部在低分辨率缓冲上作画(见 pixmap.js),坐标都是整数,没有渐变和圆弧 ——
 * 像素画里的「渐变」是色带 + 抖动,「圆」是一格一格摆出来的。
 */

import { sprite, drawSprite, drawStanding, bands, dither } from './pixmap.js';
import { drawWear } from './wear.js';
import { PHASE, mix, shade, shadedSprite } from './tint.js';
import { PAL, SCENERY, ICON_GRIDS } from './pixels.js';

/** 虚拟分辨率。880×620 的显示画布正好放大 2 倍。 */
export const VW = 440;
export const VH = 310;

/* ---------- 天气配色 ---------- */

const SKY = {
    sunny: ['#3f9edd', '#57b3e6', '#7cc9ec', '#a3dcf0', '#c6eaf2', '#e4f2e2', '#fbe6bf'],
    rainy: ['#46545f', '#54636e', '#63727c', '#74838c', '#88959d', '#9aa6ac', '#adb7bb'],
    foggy: ['#89a3b8', '#98b0c2', '#a7bccb', '#b6c7d4', '#c5d2dc', '#d4dde4', '#e3e9ec'],
};

const SEA = {
    sunny: ['#6fcbd2', '#4fb0bf', '#3697ad', '#2b8299', '#226d84', '#1d5f76'],
    rainy: ['#54727e', '#476470', '#3c5661', '#324853', '#293b45', '#22323a'],
    foggy: ['#93c2c8', '#7fadb6', '#6d9aa4', '#5d8792', '#4e7480', '#42646f'],
};

const FOAM  = { sunny: '#fffdf4', rainy: '#c4d2d6', foggy: '#eef5f6' };
const CREST = { sunny: '#a5e3e0', rainy: '#6f8a94', foggy: '#b8d6da' };

/** 远景一律往天空色靠,拉开空气透视 */
const FAR = { sunny: '#7ea8b8', rainy: '#5a6a74', foggy: '#a8bcc8' };

/* ---------- 天光 ---------- */

/**
 * 时段调色。上面那几张色板是「白天」的基准,傍晚和夜里在它们之上整体偏色 + 压暗。
 *
 * 为什么不给每个 (天气 × 时段) 各写一张:3×3 = 9 张手调色板,
 * 加一档天气就要再加三张,而且很难保证九张之间的关系一致。
 * 偏色 + 压暗是一个函数,改一次全都跟着变。
 */
// PHASE / shade / shadedSprite / mix 都搬去 tint.js 了 —— wear.js 也要用,
// 而 scene.js 本来就 import wear.js,反过来再 import 会成环。

const paletteCache = new Map();

/** 取某个 (天气, 时段) 下的整套颜色。算一次就缓存,每帧重算 40 个 mix 没必要。
    导出是给运势卡片用的 —— 卡片必须和游戏画面同一套颜色,各调一份迟早会漂。 */
export function pal(weather, phase = 'day') {
    const key = weather + ':' + phase;
    let p = paletteCache.get(key);
    if (p) return p;
    const w = k => k[weather] ?? k.sunny;
    p = {
        sky:   w(SKY).map(c => shade(c, phase)),
        sea:   w(SEA).map(c => shade(c, phase)),
        far:   shade(w(FAR), phase),
        foam:  shade(w(FOAM), phase),
        crest: shade(w(CREST), phase),
        wood:  { ink: '#4a3628', light: '#e0b077', wood: '#cf9862', dark: '#9c6b43' },
        // 石色:大坝靠湖那侧是水泥矮栏,不是木头。给它一组自己的色,
        // 满画面木色里插一道冷灰,层次立刻分得开
        stone: { ink: '#5d564c', light: '#d8d2c6', mid: '#b8b0a0', dark: '#7d7668' },
        night: phase === 'night',
    };
    for (const k of Object.keys(p.wood)) p.wood[k] = shade(p.wood[k], phase);
    for (const k of Object.keys(p.stone)) p.stone[k] = shade(p.stone[k], phase);
    paletteCache.set(key, p);
    return p;
}

/* ---------- 天空 ---------- */

/**
 * 天空 + 远景。静态内容,调用方烤进图层缓存,不用每帧重画。
 * @param {number} horizon   水天交界线
 * @param {number} [hillScale] 西山的高度缩放,见 paintXishan
 */
export function paintSky(ctx, weather, horizon, hillScale = 1, phase = 'day') {
    const P = pal(weather, phase);
    const sky = P.sky;
    // 七条色带,越靠近海平面越亮 —— 大气散射在像素画里就长这样
    const step = horizon / sky.length;
    bands(ctx, VW, 0, horizon, sky.map((c, i) => [Math.round(i * step), c]));
    // 交界处撒一行抖动,硬边就不那么生硬
    for (let i = 1; i < sky.length; i++) {
        const y = Math.round(i * step);
        dither(ctx, VW, y - 1, sky[i], 2, i);
        dither(ctx, VW, y, sky[i - 1], 2, i + 1);
    }

    // 白天挂太阳,夜里挂月亮 —— 傍晚两个都不画,那会儿太阳刚好在西山背后
    if (weather === 'sunny' && phase === 'day') paintSun(ctx, 372, 40);
    if (phase === 'night') paintMoon(ctx, 372, 44);
    if (phase === 'night') paintStars(ctx, horizon);

    paintXishan(ctx, weather, horizon, hillScale, phase);
}

/** 夜里的月亮。比太阳小一圈,冷色。 */
function paintMoon(ctx, cx, cy) {
    const disc = [[-2,-6,4],[-4,-5,8],[-5,-4,10],[-5,-3,10],[-6,-2,12],[-6,-1,12],
                  [-6,0,12],[-6,1,12],[-5,2,10],[-5,3,10],[-4,4,8],[-2,5,4]];
    ctx.fillStyle = '#c9d6e8';
    for (const [dx, dy, w] of disc) ctx.fillRect(cx + dx - 1, cy + dy, w + 2, 1);
    ctx.fillStyle = '#eef3fa';
    for (const [dx, dy, w] of disc) ctx.fillRect(cx + dx, cy + dy, w, 1);
    ctx.fillStyle = '#b8c6dc';                       // 几个环形山
    ctx.fillRect(cx - 2, cy - 2, 3, 2);
    ctx.fillRect(cx + 2, cy + 2, 2, 2);
}

/** 星星。位置钉在一个哈希上,别每帧乱跳。 */
function paintStars(ctx, horizon) {
    // 两个线性序列取模会互相关联,撒出来是一条斜线。得过一遍散列。
    const rnd = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < 70; i++) {
        const x = Math.floor(rnd(i) * VW);
        const y = Math.floor(rnd(i + 500) * Math.max(1, horizon - 34));
        ctx.fillStyle = rnd(i + 900) > 0.75 ? '#ffffff' : '#c2cee6';
        ctx.fillRect(x, y, 1, 1);
    }
}

/** 像素太阳:一圈亮边 + 实心盘,再来四道短光芒 */
function paintSun(ctx, cx, cy) {
    const disc = [
        [-3, -8, 6], [-5, -7, 10], [-6, -6, 12], [-7, -5, 14], [-7, -4, 14],
        [-8, -3, 16], [-8, -2, 16], [-8, -1, 16], [-8, 0, 16], [-8, 1, 16],
        [-8, 2, 16], [-8, 3, 16], [-7, 4, 14], [-7, 5, 14], [-6, 6, 12],
        [-5, 7, 10], [-3, 8, 6],
    ];
    ctx.fillStyle = '#ffe08a';
    for (const [dx, dy, w] of disc) ctx.fillRect(cx + dx - 1, cy + dy, w + 2, 1);
    ctx.fillStyle = '#f5b83d';
    for (const [dx, dy, w] of disc) ctx.fillRect(cx + dx, cy + dy, w, 1);
    ctx.fillStyle = '#ffe08a';
    for (const [x, y, w, h] of [[cx - 1, cy - 14, 2, 3], [cx - 1, cy + 12, 2, 3],
                                [cx - 14, cy - 1, 3, 2], [cx + 12, cy - 1, 3, 2]]) {
        ctx.fillRect(x, y, w, h);
    }
}

/**
 * 西山睡美人。滇池西岸那道山脊,从东岸看过去像个仰卧的女子 ——
 * 北边是头发披进水里,然后额头、鼻梁(全山最高)、嘴、下巴,
 * 脖子那道深凹把头和身子分开,再往南是胸、腰、腿,一路铺回水面。
 *
 * 存成 (x, 高出海平线多少) 的折线、中间线性插值,比堆一摞矩形好调:
 * 想让鼻子再挺一点就改一个数。
 */
const XISHAN = [
    [16, 0], [30, 5], [44, 12], [56, 20],                   // 头发
    [66, 30], [74, 34], [82, 35], [88, 31],                 // 额头 + 眉骨
    [94, 33], [99, 42], [104, 43], [108, 36], [112, 32],    // 鼻梁 鼻尖 人中
    [116, 34], [122, 35], [127, 30],                        // 嘴 下巴
    [134, 20], [142, 16],                                   // 脖子
    [152, 28], [166, 36], [182, 38], [196, 34],             // 胸
    [214, 26], [232, 24],                                   // 腰
    [252, 20], [272, 14], [292, 9], [312, 5], [332, 2], [350, 0],   // 腿
];

/** 两个颜色按 t 混合(0 = a,1 = b) */


/**
 * 远景里的东西要整体往天色退,不然会比它站着的那座山看起来近得多,
 * 像贴上去的剪纸。
 */
function farSprite(name, grid, weather, amount = 0.5, keep = {}, phase = 'day') {
    const tone = shade(FAR[weather] ?? FAR.sunny, phase);
    const remap = {};
    for (const ch of new Set(grid.join(''))) {
        if (ch !== '.' && PAL[ch]) {
            remap[ch] = mix(shade(PAL[ch], phase), tone, keep[ch] ?? amount);
        }
    }
    // 缓存键必须带上远近和天气时段。以前只用 name —— 同一张图既画近的又画远的
    // 时,后调的那次会直接拿到前一次的缓存,远的近的长得一模一样。
    return sprite(`${name}:far:${weather}:${phase}:${amount}`, grid, { remap });
}

/**
 * 天际线:西山 + 远处一带的小山头。
 * @param {number} [scale] 山高的缩放。飞行视角是在高空看,山要更远更矮,
 *                 不然山脊会顶进食材的生成区,东西掉在山上就看不清了。
 */
function paintXishan(ctx, weather, horizon, scale = 1, phase = 'day') {
    const far = pal(weather, phase).far;
    ctx.fillStyle = far;
    for (let i = 0; i + 1 < XISHAN.length; i++) {
        const [x0, h0] = XISHAN[i], [x1, h1] = XISHAN[i + 1];
        for (let x = x0; x < x1; x++) {
            const h = Math.round((h0 + (h1 - h0) * (x - x0) / (x1 - x0)) * scale);
            if (h > 0) ctx.fillRect(x, horizon - h, 1, h);
        }
    }
    // 更远的一层,往天空的中段退一档。别往地平线那条暖色混 ——
    // 混出来是砂色的,读着像一片雾而不是一道山
    const band = pal(weather, phase).sky[4];
    const r = v => Math.max(1, Math.round(v * scale));
    ctx.fillStyle = mix(far, band, 0.45);
    ctx.fillRect(352, horizon - r(5), 34, r(5));
    ctx.fillRect(362, horizon - r(8), 16, r(3));
    ctx.fillRect(386, horizon - r(3), 40, r(3));
}

/* ---------- 云 ---------- */

const CLOUDS = [
    { grid: 'cloud_a', y: 30, speed: 0.0035, phase: 0 },
    { grid: 'cloud_b', y: 62, speed: 0.0060, phase: 0.45 },
    { grid: 'cloud_a', y: 88, speed: 0.0090, phase: 0.75 },
];

/** 三层云错速飘,近的快 —— 廉价又好使的视差 */
export function drawClouds(ctx, t, weather, phase = 'day') {
    const alpha = weather === 'foggy' ? 0.5 : 1;
    ctx.globalAlpha = alpha;
    for (const c of CLOUDS) {
        const cv = shadedSprite(c.grid, SCENERY[c.grid], phase);
        const span = VW + cv.width;
        const x = span - ((t * c.speed + c.phase * span) % span);
        ctx.drawImage(cv, Math.round(x - cv.width), c.y);
    }
    ctx.globalAlpha = 1;
}

/** 远处盘旋的鸥群:三个像素的剪影,有它画面才「活」。
    设定上是同批来越冬的红嘴鸥,哇鸥是没跟着回去的那只 */
export function drawFarGulls(ctx, t) {
    ctx.fillStyle = '#6b8fa0';
    for (let i = 0; i < 3; i++) {
        const p = t * 0.00018 + i * 0.37;
        const x = Math.round(60 + i * 46 + Math.cos(p * 6.28) * 40);
        const y = Math.round(54 + i * 16 + Math.sin(p * 12.6) * 5);
        const up = Math.sin(t * 0.006 + i) > 0;      // 翅膀上下扇
        ctx.fillRect(x - 2, y + (up ? 0 : 1), 2, 1);
        ctx.fillRect(x, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + (up ? 0 : 1), 2, 1);
    }
}

/* ---------- 海面 ---------- */

/**
 * 海面:六条色带 + 一层层往前推的浪头。
 * 浪头是横杠,不是正弦曲线 —— 低分辨率下曲线只会糊成一团。
 */
export function drawSea(ctx, weather, horizon, bottom, t, phase = 'day') {
    const P = pal(weather, phase);
    const sea = P.sea;
    const h = bottom - horizon;
    // 近处的色带厚、远处的薄,做出透视
    const cuts = [0, 0.06, 0.15, 0.28, 0.46, 0.70].map(f => Math.round(f * h));
    bands(ctx, VW, horizon, bottom, cuts.map((y, i) => [y, sea[i]]));

    // 海天交界的一道亮线
    ctx.fillStyle = P.foam;
    ctx.fillRect(0, horizon, VW, 1);

    // 浪头:每层一个速度,越近越快越长
    const crest = P.crest;
    const foam = P.foam;
    for (let row = 1; row < cuts.length; row++) {
        const y = horizon + cuts[row] - 1;
        const len = 3 + row * 2;
        const gap = 36 - row * 2;
        const speed = 0.004 + row * 0.006;
        const off = (t * speed) % (len + gap);
        ctx.fillStyle = row >= 4 ? foam : crest;
        let i = 0;
        for (let x = -len; x < VW; x += len + gap, i++) {
            // 每段抖一下长度和高度,不然一排等长等距的横杠像刻度尺
            const jx = (i * 37 % 11) - 5;
            const jy = row >= 3 && i % 3 === 0 ? 1 : 0;
            ctx.fillRect(Math.round(x + off + jx), y - jy, len, 1);
            if (row >= 3 && i % 2 === 0) {
                ctx.fillRect(Math.round(x + off + jx + len), y + 1 - jy, 2, 1);
            }
        }
    }

    if (weather === 'sunny' && phase !== 'night') {
        // 太阳在水面上的碎光,横着一小段一小段闪
        ctx.fillStyle = '#fffdf4';
        for (let i = 0; i < 22; i++) {
            const y = horizon + 4 + ((i * 7) % (h - 8));
            const sway = Math.sin(t * 0.004 + i * 1.7);
            if (sway < 0.2) continue;
            const w = 2 + (i % 3);
            ctx.fillRect(Math.round(348 + Math.sin(t * 0.002 + i) * 26 - w / 2), y, w, 1);
        }
    }
}

/* ---------- 海埂大坝 ---------- */

/**
 * 草棚在大坝上的位置和点击范围。**画和点用同一份坐标** ——
 * 分开写的话挪一次位置就会出现「看着在这儿、点不到」的鬼问题。
 * 判定框比图本身放宽几像素,手指没那么准。
 */
/** 甲板厚度。栏杆脚、后排陈设、板缝都从它算,别在下面各写各的数字。 */
export const DECK_H = 26;

export const SHACK_HIT = { cx: 172, w: 34, h: 30, pad: 6 };

/** 点在草棚上了吗。x/y 是虚拟坐标(440×310)。 */
export function hitShack(x, y, deckY) {
    const { cx, w, h, pad } = SHACK_HIT;
    const top = deckY - 13 - h;
    return x >= cx - w / 2 - pad && x <= cx + w / 2 + pad
        && y >= top - pad && y <= deckY - 13 + pad;
}

/** 画一根斜撑:一格一格铺,不用 lineTo,免得出抗锯齿的软边 */
function brace(ctx, x0, y0, x1, y1, color, edge) {
    const n = Math.abs(x1 - x0);
    const sx = x1 > x0 ? 1 : -1;
    for (let i = 0; i <= n; i += 1) {
        const x = x0 + i * sx;
        const y = Math.round(y0 + (y1 - y0) * (i / n));
        ctx.fillStyle = edge;
        ctx.fillRect(x, y - 1, 1, 5);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 3);
    }
}

/**
 * 木栈桥。静态内容,烤进图层缓存。
 * @param {number} deckY 甲板面
 */
export function paintPier(ctx, deckY, bottom, weather = 'sunny', phase = 'day',
                          upgrades = null) {
    const P = pal(weather, phase).wood;

    // 桥墩:先画,让甲板压在上面
    for (const x of [24, 92, 160, 228, 296, 364, 424]) {
        ctx.fillStyle = P.ink;
        ctx.fillRect(x - 5, deckY, 10, bottom - deckY);
        ctx.fillStyle = P.dark;
        ctx.fillRect(x - 4, deckY, 8, bottom - deckY);
        ctx.fillStyle = P.wood;
        ctx.fillRect(x - 3, deckY, 3, bottom - deckY);
        // 横撑
        ctx.fillStyle = P.ink;
        ctx.fillRect(x - 5, deckY + 26, 10, 4);
        ctx.fillStyle = P.dark;
        ctx.fillRect(x - 4, deckY + 27, 8, 2);
    }
    // 相邻桥墩之间的 X 交叉撑 + 一道横梁。
    // 之前是每根墩子各自往右下拉一条斜线,两头都不落在别的构件上,
    // 看着像随手划的几道杠;交叉撑两端都咬在墩子上,才像个能站人的结构。
    const posts = [24, 92, 160, 228, 296, 364, 424];
    const top = deckY + 8, bot = deckY + 42;
    for (let i = 0; i + 1 < posts.length; i++) {
        const a = posts[i], b = posts[i + 1];
        brace(ctx, a, top, b, bot, P.dark, P.ink);
        brace(ctx, a, bot, b, top, P.wood, P.ink);
    }
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, deckY + 40, VW, 5);
    ctx.fillStyle = P.dark;
    ctx.fillRect(0, deckY + 41, VW, 3);

    // 甲板。原来只有 14 格高,所有东西只能挤在一条线上,画面就平了。
    // 加宽到 26 格之后能站两排:后排贴着栏杆,前排贴着甲板前沿。
    const S = pal(weather, phase).stone;
    const railBase = deckY - DECK_H;         // 栏杆脚 = 甲板后沿
    const railTop = railBase - 13;

    // 靠湖那侧的水泥矮栏。**镂空的**,不做成实心挡板 ——
    // 实心的会把水面从中间切断,画面反而更闷;镂空的柱子之间透出水,
    // 才有「隔着栏杆看湖」的感觉。
    ctx.fillStyle = S.ink;
    ctx.fillRect(0, railTop, VW, 4);         // 扶手
    ctx.fillStyle = S.light;
    ctx.fillRect(0, railTop + 1, VW, 2);
    for (let x = 6; x < VW; x += 22) {       // 立柱
        ctx.fillStyle = S.ink;
        ctx.fillRect(x, railTop, 4, railBase - railTop);
        ctx.fillStyle = S.mid;
        ctx.fillRect(x + 1, railTop + 2, 2, railBase - railTop - 3);
    }
    ctx.fillStyle = S.dark;
    ctx.fillRect(0, railBase - 4, VW, 4);    // 栏杆脚线,压住甲板后沿

    // 甲板:一块块木板,缝隙用暗色
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, deckY - DECK_H, VW, DECK_H);
    ctx.fillStyle = P.wood;
    ctx.fillRect(0, deckY - DECK_H + 1, VW, DECK_H - 2);
    ctx.fillStyle = P.dark;
    ctx.fillRect(0, deckY - DECK_H + 1, VW, 3);     // 后沿在阴影里
    ctx.fillStyle = P.light;
    ctx.fillRect(0, deckY - 13, VW, 2);     // 受光的板面前沿
    ctx.fillStyle = P.dark;
    ctx.fillRect(0, deckY - 3, VW, 2);      // 背光的板边
    for (let x = 6; x < VW; x += 19) {      // 板缝
        ctx.fillStyle = P.dark;
        ctx.fillRect(x, deckY - DECK_H + 4, 1, DECK_H - 7);
    }

    // 陈设分两排。后排走空气透视(farSprite),前排原色 ——
    // 光是错开 y 还不够,人眼靠的是对比度判断远近。
    const back = deckY - DECK_H + 4;
    drawStanding(ctx, farSprite('barrel', SCENERY.barrel, weather, 0.34, {}, phase), 212, back);
    drawStanding(ctx, farSprite('crate', SCENERY.crate, weather, 0.34, {}, phase), 230, back);
    drawStanding(ctx, farSprite('crate', SCENERY.crate, weather, 0.34, {}, phase), 246, back);
    drawStanding(ctx, farSprite('bollard', SCENERY.bollard, weather, 0.34, {}, phase), 66, back);
    drawStanding(ctx, farSprite('barrel', SCENERY.barrel, weather, 0.34, {}, phase), 356, back);

    paintStall(ctx, deckY, phase, upgrades);
    for (const bx of [300, 396]) {
        shadow(ctx, bx, deckY - 13, 8);
        drawStanding(ctx, shadedSprite('bollard', SCENERY.bollard, phase), bx, deckY - 13);
    }
    // 大坝上一排路灯,给画面几根竖线。夜里灯头要亮起来。
    // 夜里灯头点亮:'y' 是灯罩、'w' 是灯芯,这两格不跟着压暗
    const lampCv = shadedSprite('lamp', SCENERY.lamp, phase,
        phase === 'night' ? { y: '#ffe08a', w: '#fff6d0' } : {});
    // 路灯的 x 躲开栏杆立柱的间距(每 22 格一根),免得杆子和柱子重成一根。
    // 灯杆本身也加长过了(见 tools/scenery.py):**灯头必须高过栏杆**,
    // 第一版灯头正好落在栏杆横杆上,两样东西糊成一团 —— 那不是位置问题,
    // 是高度不够,挪到哪儿都救不回来。
    for (const x of [17, 259, 413]) {
        shadow(ctx, x, deckY - 13, 10, 0.26);
        drawStanding(ctx, lampCv, x, deckY - 13);
    }

    // 哇鸥的草棚。整个大坝上唯一能点进去的东西,所以它得比别的陈设显眼:
    // 位置固定,SHACK_HIT 里同一份坐标给点击判定用,两边别各写各的。
    shadow(ctx, SHACK_HIT.cx, deckY - 13, 26);
    drawStanding(ctx, shadedSprite('shack', SCENERY.shack, phase),
                 SHACK_HIT.cx, deckY - 13);
    if (phase !== 'day') {                         // 屋里透出来的光
        ctx.fillStyle = phase === 'night' ? '#ffd98a' : '#ffe6b0';
        ctx.fillRect(SHACK_HIT.cx - 5, deckY - 13 - 12, 10, 6);
    }
}

/**
 * 中景:大坝往远处延伸的那一段。
 *
 * 原来画面只有三层 —— 天、水、脚下的栈桥,中间是空的,所以看着像三条平铺的带子。
 * 大坝本身是长的,让它拐一道弯伸进远处,是最省事也最真实的一层中景:
 * 不用新素材,一条带子加几根越来越小的灯柱就够了。
 *
 * 颜色一律走 P.far —— 远处的东西必须往天空色靠,这是空气透视,
 * 用原色画出来的话它会跳到前面来,纵深反而更糟。
 */
export function paintFarDam(ctx, weather, horizon, phase = 'day') {
    const P = pal(weather, phase);
    const y = horizon + 10;

    // 堤身:右边高左边低,做出一点透视的斜度。
    // 比 far 再暗一档 —— 纯 far 色和天太近,远堤会糊在水天线里看不见
    const body = mix(P.far, '#000000', 0.18);
    for (let x = 168; x < VW; x++) {
        const h = Math.round(3 + (x - 168) / 34);
        ctx.fillStyle = body;
        ctx.fillRect(x, y - h, 1, h + 3);
    }
    // 顶面受光,压一条亮线,不然是一坨剪影
    ctx.fillStyle = P.crest;
    for (let x = 172; x < VW; x += 2) {
        ctx.fillRect(x, y - Math.round(2 + (x - 168) / 46), 1, 1);
    }
    // 灯柱:越远越矮越密,这是纵深最直接的读法
    ctx.fillStyle = P.far;
    let x = VW - 8, gap = 26, hh = 13;
    while (x > 178 && hh > 2) {
        ctx.fillRect(x, y - hh, 1, hh);
        ctx.fillRect(x - 1, y - hh - 1, 3, 1);
        x -= gap;
        gap = Math.max(7, Math.round(gap * 0.78));
        hh = Math.max(2, Math.round(hh * 0.82));
    }
}

/**
 * 近景:压在画面最前的芦苇。
 *
 * 一张画只要最前面有一样东西被裁掉一部分,眼睛立刻就认定「我在这个空间里面」。
 * 所以它故意画到出画,而且只用深色 —— 近景不需要细节,需要的是遮挡。
 */
export function drawReeds(ctx, weather, t, phase = 'day') {
    const P = pal(weather, phase);
    const dark = P.night ? '#0f1626' : mix(P.far, '#000000', 0.62);
    const mid = mix(dark, P.far, 0.28);

    // 两丛,分别咬住左下和右下角。每丛几根,高矮错开
    for (const [bx, n, dir] of [[6, 9, 1], [VW - 8, 8, -1]]) {
        for (let i = 0; i < n; i++) {
            const x0 = bx + dir * i * 6;
            const h = 52 + (i * 17) % 34;
            const lean = dir * (5 + (i % 4) * 3);
            const sway = Math.sin(t * 0.0008 + i * 1.7) * 2.5;
            // 秆:从画面底边往上,越往上越往一边倒
            for (let k = 0; k <= h; k++) {
                const f = k / h;
                const x = Math.round(x0 + lean * f * f + sway * f);
                ctx.fillStyle = (i % 3 === 0) ? mid : dark;
                ctx.fillRect(x, VH - k, k < h * 0.55 ? 2 : 1, 1);
            }
            // 叶片:秆中段甩出去两片,光是竖线的话像栅栏不像草
            for (const at of [0.45, 0.72]) {
                const k0 = Math.round(h * at);
                const bx0 = Math.round(x0 + lean * at * at + sway * at);
                const len = 7 + (i % 3) * 4;
                for (let j = 0; j < len; j++) {
                    ctx.fillStyle = dark;
                    ctx.fillRect(bx0 + dir * j, VH - k0 - Math.round(j * j / 9), 1, 1);
                }
            }
        }
    }
}

/**
 * 地上的影子。**这是纵深里最便宜也最有效的一笔** ——
 * 一样东西没有影子就像贴在背景上的纸片,有了影子才像站在地上。
 *
 * 太阳画在右上(paintSun 在 x=372),所以影子一律往左下拉。
 * 用半透明的黑而不是调色板里的暗色:影子要能压在木纹、石头、任何底色上都成立。
 */
export function shadow(ctx, cx, baseY, w, k = 0.22) {
    ctx.fillStyle = `rgba(30, 20, 12, ${k})`;
    const half = Math.round(w / 2);
    // 两层扁椭圆,里深外浅 —— 一条实心黑杠会显得东西浮在半空
    ctx.fillRect(Math.round(cx - half - 2), baseY - 1, w + 4, 2);
    ctx.fillStyle = `rgba(30, 20, 12, ${k * 0.6})`;
    ctx.fillRect(Math.round(cx - half - 5), baseY, w + 8, 1);
}

/**
 * 摊子的四个阶段。**关键是轮廓变,不是往旁边堆东西。**
 *
 * 第一版是摊子本体固定不动,升级就在旁边多摆一个箱子、多摆一个灶 ——
 * 堆到满级是一排叠叠乐,而且「多一个箱子」根本不像「生意做大了」。
 *
 * 现在按**四条线的总级数**(4 到 44)换整张摊子:
 * 路边摊 → 支起棚子 → 木屋铺面 → 街边专卖店。
 * 用总级数不用某一条:铺面是整体投入的结果,只升炉子不该让门面变成专卖店。
 *
 * 每一段自带锚点,因为四张图大小不一样:烟囱在哪、招牌在哪,
 * 只有这张表知道 —— 写死在画的地方,换一段图就得满文件找偏移。
 *   smoke  烟从哪儿冒(相对图左上角)
 *   sign   招牌灯箱的范围,夜里点亮用
 *   side   旁边还摆不摆零碎(前两段摆,后两段东西都进店里了)
 */
const STALL_STAGES = [
    { key: 'stall1', min: 0,  smoke: [17, 7],  sign: null,             side: true },
    { key: 'stall2', min: 10, smoke: [24, 15], sign: null,             side: true },
    { key: 'stall3', min: 20, smoke: [48, -1], sign: [14, 16, 36, 6],  side: false },
    { key: 'stall4', min: 32, smoke: [66, -1], sign: [8, 17, 68, 10],  side: false },
];

const STALL_X = 76;      // 摊子的水平中心。四段都按它居中,所以只有一个数

export function stallStage(up) {
    const total = up ? up.stove + up.sign + up.shelf + up.warmer : 0;
    let st = STALL_STAGES[0];
    for (const s of STALL_STAGES) if (total >= s.min) st = s;
    return st;
}

/**
 * 画摊子本体 + 长在它身上的升级件。
 *
 * 单条线的等级不再靠「旁边多一个箱子」表示,而是**长进这栋房子里**:
 * 炉子高 → 烟囱冒得更凶;招牌高 → 灯箱夜里亮起来、满级挂彩旗;
 * 货架高 → 橱窗里码得更满。信息一样多,但看着是一家店在变好,不是一堆杂物。
 */
function paintStall(ctx, deckY, phase, up) {
    const base = deckY - 13;
    const st = stallStage(up);
    const grid = SCENERY[st.key];
    const w = grid[0].length;
    const h = grid.length;

    shadow(ctx, STALL_X, base, w - 8);
    drawStanding(ctx, shadedSprite(st.key, grid, phase), STALL_X, base);

    const left = Math.round(STALL_X - w / 2);
    const top = base - h;

    // 招牌:等级够了夜里点亮。**只亮招牌那一块**,整栋楼一起亮就成灯笼了
    if (st.sign && up.sign >= 9 && phase !== 'day') {
        const [sx, sy, sw, sh] = st.sign;
        ctx.fillStyle = phase === 'night' ? 'rgba(255, 224, 138, 0.34)'
                                          : 'rgba(255, 230, 176, 0.22)';
        ctx.fillRect(left + sx, top + sy, sw, sh);
    }
    // 满级挂一串彩旗
    if (up.sign >= 12) {
        drawStanding(ctx, shadedSprite('flags', SCENERY.flags, phase), STALL_X, top + 2);
    }

    // 前两段摊子小,旁边还摆得下零碎;后两段东西都收进店里了,
    // 再往旁边堆就又回到叠叠乐
    if (st.side) {
        const sx = Math.round(STALL_X + w / 2) + 10;
        if (up.stove >= 3) {
            const hot = up.stove >= 6;
            shadow(ctx, sx, base, 14);
            drawStanding(ctx, shadedSprite(hot ? 'stove_hot' : 'stove_s',
                hot ? SCENERY.stove_hot : SCENERY.stove_s, phase,
                hot ? { X: '#ef7757', Y: '#ffd24a' } : {}), sx, base);
        }
        if (up.shelf >= 3) {
            shadow(ctx, sx + 18, base, 12);
            drawStanding(ctx, shadedSprite('crate', SCENERY.crate, phase), sx + 18, base);
            if (up.shelf >= 6) {
                drawStanding(ctx, shadedSprite('crate', SCENERY.crate, phase), sx + 18, base - 10);
            }
        }
        if (up.warmer >= 3) {
            shadow(ctx, sx + 34, base, 12);
            drawStanding(ctx, shadedSprite('warmbox', SCENERY.warmbox, phase), sx + 34, base);
        }
        // 招牌:前两段还没有铺面,只能挂一块牌子。三段起招牌就是店面的一部分了
        if (up.sign >= 3) {
            const k = up.sign >= 6 ? 'sign_b' : 'sign_s';
            drawStanding(ctx, shadedSprite(k, SCENERY[k], phase), STALL_X, top - 2);
        }
    }
    return { st, left, top };
}

/**
 * 刚买完升级的那一下。
 *
 * 静态的多一件东西是「结果」,这个是「事件」—— 玩家掏钱的那一瞬间,
 * 画面得回应他一次。**摊子页和大坝画面是同屏的**(画面在上、面板在下),
 * 所以在这儿冒一串星星,买的人一定看得见。
 *
 * @param {number} age 距离买下来过了多少毫秒;超过 1200 就不画了
 */
export function drawUpgradePop(ctx, deckY, age) {
    if (age < 0 || age > 1200) return;
    const p = age / 1200;
    for (let i = 0; i < 7; i++) {
        const t0 = i * 0.09;
        if (p < t0) continue;
        const q = Math.min(1, (p - t0) / (1 - t0));
        const x = Math.round(STALL_X + Math.sin(i * 2.1) * 26);
        const y = Math.round(deckY - 20 - q * 34);
        const a = (1 - q) * 0.95;
        ctx.fillStyle = `rgba(255, 224, 138, ${a.toFixed(2)})`;
        // 画个小十字,比方点更像「加了点什么」
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillRect(x, y - 2, 1, 5);
    }
}

/**
 * 灶上冒的蒸汽。**这是唯一会动的升级反馈** —— 别的都是静态的多一件东西,
 * 只有它在说「这摊子正在开火」。所以它不烤进静态图层,每帧现画。
 */
export function drawStallSteam(ctx, deckY, t, up) {
    if (!up || up.stove < 3) return;
    const st = stallStage(up);
    const grid = SCENERY[st.key];
    const left = Math.round(STALL_X - grid[0].length / 2);
    const top = deckY - 13 - grid.length;
    const [sx, sy] = st.smoke;
    const puffs = up.stove >= 9 ? 5 : up.stove >= 6 ? 4 : 2;
    for (let i = 0; i < puffs; i++) {
        const p = ((t * 0.00055) + i / puffs) % 1;
        const y = Math.round(top + sy - p * 26);
        const x = Math.round(left + sx + Math.sin(p * 5 + i * 2) * 5);
        const a = 0.55 * (1 - p);
        ctx.fillStyle = `rgba(255, 253, 244, ${a.toFixed(2)})`;
        const w = 2 + Math.round(p * 4);
        ctx.fillRect(x - (w >> 1), y, w, 2);
    }
}

/** 桥墩入水处的浪花,跟着湖浪一起动 */
export function drawPierFoam(ctx, weather, deckY, t, phase = 'day') {
    ctx.fillStyle = pal(weather, phase).foam;
    for (const x of [24, 92, 160, 228, 296, 364, 424]) {
        const w = 8 + Math.round(Math.sin(t * 0.004 + x) * 2 + 2);
        const y = deckY + 8 + Math.round(Math.sin(t * 0.005 + x * 0.3));
        ctx.fillRect(x - w / 2 | 0, y, w, 1);
        ctx.fillRect(x - w / 2 - 1 | 0, y + 1, w + 2, 1);
    }
}

/**
 * 大坝上的表演。哇鸥不出去觅食的时候就在这儿演,路人围着看、看完投喂 ——
 * 这是食材的被动来源(规则在 rules.js 的 perform()),不是纯装饰。
 *
 * 动作循环 4 秒:站着 → 张翅膀(带一跳) → 站着 → 鞠躬。
 * 用 16×16 那批图,不用飞行时的 32×32 —— 32 的站在摊子边上比摊子还高。
 *
 * @param {number} shows   解锁了几个节目,决定围观人数
 * @param {boolean} fedNow 这一帧是否刚好有人投喂,有就冒个食材出来
 * @param {object} wearing 戴着的装扮,state.wearing
 */
export function drawPerformance(ctx, x, baseY, t, shows = 1, fedNow = false,
                                wearing = null, phase = 'day') {
    const CYCLE = 4000;
    const p = t % CYCLE;

    let grid = ICON_GRIDS.waou, hop = 0;
    if (p < 1400)      { grid = ICON_GRIDS.waou;      hop = Math.sin(t * 0.0022) > 0 ? 0 : 1; }
    else if (p < 2200) { grid = SCENERY.waou_wing;    hop = p < 1800 ? -3 : -1; }
    else if (p < 2800) { grid = ICON_GRIDS.waou;      hop = 0; }
    else if (p < 3400) { grid = SCENERY.waou_bow;     hop = 0; }
    else               { grid = ICON_GRIDS.waou;      hop = 0; }

    // 围观的人。节目越多围的人越多。
    //
    // **每个人有自己的举手节奏**,而且真有人投喂的那一下(fedNow)会多一个人举手 ——
    // 动作和规则层的产出是同一件事,不是各演各的。一排人整齐地一起动是最假的。
    const crowd = Math.min(7, 2 + Math.floor(shows * 0.7));
    for (let i = 0; i < crowd; i++) {
        const side = i % 2 ? 1 : -1;
        // 最近的一对也要离哇鸥 28 格 —— 人是 24 格高、哇鸥只有 16 格,
        // 围太近的话主角直接淹没在一排人腿里
        const dx = side * (28 + Math.floor(i / 2) * 15);
        const who = ONLOOKERS[(i * 3 + 1) % ONLOOKERS.length];
        // 每人一个错开的周期,轮到自己那一小段就举手
        const cycle = 5200 + i * 900;
        const waving = (t + i * 1700) % cycle < 700 || (fedNow && i === (t / 97 | 0) % crowd);
        const key = waving ? who + '_wave' : who;
        const bob = Math.sin(t * 0.0016 + i * 1.7) > 0.6 ? 1 : 0;
        shadow(ctx, x + dx, baseY + bob, 12, 0.18);
        drawStanding(ctx, shadedSprite(key, SCENERY[key], phase), x + dx, baseY + bob);
    }

    shadow(ctx, x, baseY, 14, 0.2);
    const bowing = grid === SCENERY.waou_bow;
    // 哇鸥也跟天色走。**这是画的时候上的色,素材本身一格没动** ——
    // 不跟的话傍晚整个大坝都暗下来了,只有它一只还是白天那么亮,像贴上去的
    drawStanding(ctx, shadedSprite('perf:' + (grid === ICON_GRIDS.waou ? 'idle'
        : grid === SCENERY.waou_wing ? 'wing' : 'bow'), grid, phase), x, baseY + hop);
    // 装扮的锚点按 16×16 那张图的框算。鞠躬帧被裁短了 3 格、头也确实低了,
    // 所以框要跟着往下挪 —— 按精灵图底边对齐的话帽子会浮在脑袋上方。
    drawWear(ctx, wearing, 'small', x, baseY + hop - (bowing ? 13 : 16), phase);

    // 有人投喂:冒一个食材出来,飘一下
    if (fedNow) feedPops.push({ x, y: baseY - 20, t0: t, key: FEED_ICONS[(t / 97 | 0) % FEED_ICONS.length] });
    for (let i = feedPops.length - 1; i >= 0; i--) {
        const f = feedPops[i];
        const age = t - f.t0;
        if (age > 1200) { feedPops.splice(i, 1); continue; }
        drawSprite(ctx, sprite(f.key, ICON_GRIDS[f.key]), f.x, f.y - age * 0.014);
    }
}

/** 四个路人。素材在 tools/people.py。 */
const ONLOOKERS = ['onlooker_a', 'onlooker_b', 'onlooker_c', 'onlooker_d'];

const FEED_ICONS = ['erkuai', 'potato', 'rice', 'douhua', 'chili'];
const feedPops = [];

/**
 * 睡在大坝上的折耳根。**不上班的时候她就在这儿摊着。**
 *
 * 位置固定在草棚和摊子中间那一段空甲板上 —— 那块地方本来就空,
 * 而且路人和围观的都不站那儿,不会被挡住。
 *
 * 会呼吸(一格),偶尔抖一下耳朵。猫睡觉不是完全不动的,
 * 完全不动就成了摆件。
 */
export function drawCat(ctx, deckY, t, phase = 'day') {
    const cv = shadedSprite('cat_sleep', SCENERY.cat_sleep, phase);
    const breathe = Math.sin(t * 0.0011) > 0 ? 0 : 1;
    // 222:草棚(172)和路灯(259)中间那块空地。挨着路灯会和灯杆重在一起
    shadow(ctx, 222, deckY - 13, 26, 0.18);
    drawStanding(ctx, cv, 222, deckY - 13 + breathe);
    // 每隔一阵冒个 Z
    const p = (t * 0.00022) % 1;
    if (p < 0.5) {
        const a = 0.7 * (1 - p * 2);
        ctx.fillStyle = `rgba(255,253,244,${a.toFixed(2)})`;
        const zx = Math.round(240 + p * 14), zy = Math.round(deckY - 30 - p * 20);
        ctx.fillRect(zx, zy, 4, 1);
        ctx.fillRect(zx + 2, zy + 1, 2, 1);
        ctx.fillRect(zx, zy + 2, 4, 1);
    }
}

/**
 * 只是路过的人。和围观的人分开:围观是玩法的一部分(节目越多人越多),
 * 路过纯粹是「这地方有人气」—— 一个大坝上不可能所有人都在看一只鸟。
 *
 * 走路就两帧:站姿(腿并着)和迈步(腿前后错开),来回换就是走。
 * 三帧以上在这个尺寸上看不出区别,纯浪费素材。
 */
export function drawStrollers(ctx, deckY, t, phase = 'day') {
    const SPAN = VW + 60;
    for (let i = 0; i < 3; i++) {
        const speed = 0.010 + i * 0.005;
        let x = (t * speed + i * 240) % SPAN - 30;
        if (i % 2) x = VW - x;                       // 一半往左走
        const who = ONLOOKERS[(i * 2 + 2) % ONLOOKERS.length];
        const step = Math.floor(t / 260 + i) % 2;    // 两帧来回换
        const key = step ? who + '_walk' : who;
        shadow(ctx, x, deckY - 13, 12, 0.16);
        drawStanding(ctx, shadedSprite(key, SCENERY[key], phase), Math.round(x), deckY - 13);
    }
}

/** 远处漂着的小船,慢慢横穿画面。淡淡退一点,让它待在水面那层 */
export function drawBoat(ctx, y, t, weather = 'sunny') {
    const cv = farSprite('boat', SCENERY.boat, weather, 0.3);
    const span = VW + cv.width * 2;
    // 加个初相,不然刚进游戏那半分钟船还在画面外,海上空荡荡的
    const x = ((t * 0.006 + 170) % span) - cv.width;
    const bob = Math.sin(t * 0.0018) > 0 ? 0 : 1;
    ctx.drawImage(cv, Math.round(x), y + bob);
}

/* ---------- 天气 ---------- */

export function drawRain(ctx, t, h = VH) {
    ctx.fillStyle = '#c8dfe6';
    for (let i = 0; i < 90; i++) {
        const x = Math.round((i * 53 + t * 0.12) % (VW + 40)) - 20;
        const y = Math.round((i * 97 + t * 0.42) % (h + 20)) - 10;
        ctx.fillRect(x, y, 1, 4);
        ctx.fillRect(x - 1, y + 4, 1, 2);
    }
}

/** 雾:几条横着飘的淡色带,不用 alpha 渐变 */
export function drawFog(ctx, t, h = VH) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fffdf4';
    for (let i = 0; i < 5; i++) {
        const y = 40 + i * Math.round(h / 6);
        const dir = i % 2 ? 1 : -1;
        const x = ((t * 0.012 * dir) % (VW + 240) + VW + 240) % (VW + 240) - 120;
        ctx.fillRect(Math.round(x), y, 150, 5);
        ctx.fillRect(Math.round(x) - 40, y + 5, 90, 3);
    }
    ctx.globalAlpha = 1;
}

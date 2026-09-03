/**
 * 哇鸥的小屋:海埂大坝旁边堤岸上的一个草棚,紧挨着湖。
 *
 * 这是全游戏唯一的**近景**。别处都是远远看着它,只有这里能看清它的脸 ——
 * 所以草棚里除了必要的结构什么都不放,视线全给哇鸥。
 *
 * 从远到近:湖 → 棚外的堤岸 → 立柱和横梁 → 草顶(压在最上,像镜头凑到棚口)
 *          → 地上的草垫 → 哇鸥
 */

import { PixelScreen, sprite, drawStanding } from './pixmap.js';
import { SCENERY } from './pixels.js';
import { VW, VH } from './scene.js';
import { drawWear } from './wear.js';

/** 三个时段各自的光。中午亮、晚上暖、深夜冷。 */
const LIGHT = {
    noon: {
        sky: ['#8fd0e8', '#a9dcee', '#c4e8f2'], lake: ['#4fb0bf', '#3697ad', '#2b8299'],
        thatch: '#d9b46a', thatchDark: '#9d7c3c', post: '#a8763f', postDark: '#6f4a24',
        straw: '#e0c078', strawDark: '#a8873f', air: null,
    },
    evening: {
        sky: ['#8a5f74', '#c07a63', '#e8a35e'], lake: ['#6a5570', '#54455f', '#3d3348'],
        thatch: '#b28a4e', thatchDark: '#75542a', post: '#84552f', postDark: '#4e2f18',
        straw: '#bb9354', strawDark: '#7d5e2c', air: 'rgba(232,163,94,0.10)',
    },
    night: {
        sky: ['#1a2440', '#22304f', '#2b3a5c'], lake: ['#182338', '#131c2d', '#0e1523'],
        thatch: '#5e4d34', thatchDark: '#3a2f1f', post: '#4a3320', postDark: '#2c1d11',
        straw: '#5f4f30', strawDark: '#3c3020', air: 'rgba(60,90,150,0.14)',
    },
};

const OPEN_TOP = 84;        // 棚口上沿(草顶垂下来的位置)
const GROUND = 236;         // 地面线
const GULL_X = 246;         // 哇鸥待的地方

export class Hut {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {()=>object} getState
     * @param {()=>string} getSlot 当前时段:'noon' | 'evening' | 'night' | null
     */
    constructor(canvas, getState, getSlot) {
        this.screen = new PixelScreen(canvas, VW, VH);
        this.getState = getState;
        this.getSlot = getSlot;
        this.t = 0;
        this.rafId = null;
        this.baked = null;
        this.bakedFor = null;
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

    /** 棚子本身不动,时段一变才重烤 */
    _bake(slot) {
        if (this.bakedFor === slot) return;
        this.bakedFor = slot;
        this.baked = this.baked ?? this.screen.layer();
        const c = this.baked.ctx;
        const L = LIGHT[slot] ?? LIGHT.noon;
        c.clearRect(0, 0, VW, VH);
        paintOutside(c, L);
        paintShelter(c, L);
        paintBedding(c, L);
    }

    _loop(ts) {
        this.rafId = requestAnimationFrame(this._loop);
        const dt = this.last ? Math.min(ts - this.last, 50) : 16.7;
        this.last = ts;
        this.t += dt;

        const slot = this.getSlot() ?? 'noon';
        this._bake(slot);

        const { ctx } = this.screen;
        ctx.drawImage(this.baked.cv, 0, 0);
        drawWaou(ctx, slot, this.t, this.getState().wearing);
        const L = LIGHT[slot] ?? LIGHT.noon;
        if (L.air) { ctx.fillStyle = L.air; ctx.fillRect(0, 0, VW, VH); }
        this.screen.present();
    }
}

/* ---------- 棚外 ---------- */

function paintOutside(c, L) {
    // 天
    const h = OPEN_TOP + 30;
    for (let i = 0; i < L.sky.length; i++) {
        c.fillStyle = L.sky[i];
        c.fillRect(0, Math.round(i * h / L.sky.length), VW, Math.ceil(h / L.sky.length) + 1);
    }
    // 湖:草棚就搭在水边,棚口望出去是滇池
    const lakeTop = h;
    for (let i = 0; i < L.lake.length; i++) {
        c.fillStyle = L.lake[i];
        const y0 = lakeTop + Math.round(i * (GROUND - lakeTop) / L.lake.length);
        const y1 = lakeTop + Math.round((i + 1) * (GROUND - lakeTop) / L.lake.length);
        c.fillRect(0, y0, VW, y1 - y0);
    }
    // 水面几道横光
    c.fillStyle = L.sky[2];
    for (let i = 0; i < 16; i++) {
        const y = lakeTop + 6 + (i * 11) % (GROUND - lakeTop - 10);
        const x = (i * 67) % VW;
        c.fillRect(x, y, 6 + (i % 3) * 3, 1);
    }
    // 堤岸:棚子脚下这条,把水和地分开
    c.fillStyle = L.postDark;
    c.fillRect(0, GROUND - 8, VW, 8);
    c.fillStyle = L.post;
    c.fillRect(0, GROUND - 8, VW, 3);
}

/* ---------- 棚子本身 ---------- */

function paintShelter(c, L) {
    // 草顶:从画面上沿垂下来。一撮一撮画,下沿留成不齐的 ——
    // 齐的话就成了木板,草的意思全没了。
    c.fillStyle = L.thatchDark;
    c.fillRect(0, 0, VW, OPEN_TOP - 14);
    for (let x = 0; x < VW; x++) {
        const len = OPEN_TOP - 14 + Math.round(
            10 + Math.sin(x * 0.31) * 5 + Math.sin(x * 0.11) * 6 + (x % 7 === 0 ? 4 : 0));
        c.fillStyle = (x % 5 < 2) ? L.thatch : L.thatchDark;
        c.fillRect(x, 0, 1, len);
    }
    // 草秆的纹路
    c.fillStyle = L.thatch;
    for (let i = 0; i < 90; i++) {
        const x = (i * 29) % VW;
        const y = (i * 13) % (OPEN_TOP - 22);
        c.fillRect(x, y, 1, 4 + (i % 3) * 3);
    }

    // 立柱:两根,撑着横梁
    for (const px of [28, VW - 40]) {
        c.fillStyle = L.postDark;
        c.fillRect(px - 1, OPEN_TOP - 22, 13, GROUND - OPEN_TOP + 22);
        c.fillStyle = L.post;
        c.fillRect(px, OPEN_TOP - 22, 9, GROUND - OPEN_TOP + 22);
        c.fillStyle = L.thatch;
        c.fillRect(px, OPEN_TOP - 22, 3, GROUND - OPEN_TOP + 22);
        for (let y = OPEN_TOP; y < GROUND; y += 22) {   // 竹节
            c.fillStyle = L.postDark;
            c.fillRect(px, y, 9, 2);
        }
    }
    // 横梁
    c.fillStyle = L.postDark;
    c.fillRect(0, OPEN_TOP - 24, VW, 10);
    c.fillStyle = L.post;
    c.fillRect(0, OPEN_TOP - 22, VW, 5);
}

/** 地上垫的草 */
function paintBedding(c, L) {
    c.fillStyle = L.strawDark;
    c.fillRect(0, GROUND, VW, VH - GROUND);
    // 一根根草,横着铺
    for (let i = 0; i < 900; i++) {
        const x = (i * 53) % VW;
        const y = GROUND + 2 + (i * 31) % (VH - GROUND - 4);
        c.fillStyle = (i % 3 === 0) ? L.straw : L.strawDark;
        const w = 4 + (i % 4) * 3;
        c.fillRect(x, y, w, 1);
    }
    // 哇鸥窝的那一圈,草被压下去了
    c.fillStyle = L.strawDark;
    for (let x = -62; x <= 62; x++) {
        const d = Math.round(8 * Math.sqrt(Math.max(0, 1 - (x / 62) ** 2)));
        c.fillRect(GULL_X + x, GROUND + 14 - d, 1, d * 2);
    }
}

/* ---------- 哇鸥 ---------- */

/** 待机一帧多久。16 帧 × 83ms = 1.33 秒一轮,12fps */
const IDLE_MS = 83;
/** 待机那张图里眼睛在第几行(112 高)。装扮按这条线对齐,挤压时跟着缩 */
const IDLE_EYE_ROW = 28;

/**
 * 待机那一轮的挤压和起落:[横向倍率, 纵向倍率, 离地(以身高为 1)]。
 *
 * **这十六个数是从形象稿的 16 张关键帧里量出来的,不是我编的曲线。**
 * 逐帧取内容框的宽高和底边,再除以静止那一档(77×65、底边 113)——
 * 于是它不是「轻轻起伏」,是**一轮两次小跳**:蹲下去 1.14 宽 × 0.83 高,
 * 弹起来 0.82 宽 × 1.12 高,最高离地将近四成身高。
 *
 * **图和动作分开取。** 那 16 张是 128px 的 JPEG,缩下来眼睛糊成一团、
 * 当图用不了;但量出来的这条曲线是干净的。身子用原作者那张 2048 的像素稿,
 * 动作用这 16 帧的 —— 一批素材当图用不行,不代表当动作参考也不行。
 *
 * 缩放交给 drawImage 做:画布的插值是关掉的(见 pixmap.js),
 * 非整数倍在这儿不是糊,是「某几行重复、某几行丢掉」——
 * 那正是像素画里做挤压的老办法。
 */
const IDLE_POSE = [
    [1.00, 0.95, -0.39], [1.00, 1.00, 0.00], [1.14, 0.83, 0.02], [1.06, 0.91, 0.00],
    [0.82, 1.12, -0.03], [0.92, 1.06, -0.25], [1.09, 0.89, 0.02], [1.00, 1.00, -0.34],
    [1.00, 0.95, -0.25], [1.00, 0.97, -0.09], [1.09, 0.89, 0.02], [1.14, 0.85, 0.02],
    [1.00, 1.00, 0.00], [0.96, 1.00, -0.02], [0.99, 0.98, 0.00], [1.00, 1.00, 0.00],
];

/**
 * 白天窝在棚里的那只:一张原作者的像素身子 + 形象稿量出来的那轮弹跳。
 *
 * 原来这儿是「一张静图 + 每隔九秒站起来走两步」—— 走那一段的腿是代码画的
 * (`drawLegs`),身子是静图上下挪,是**没有动画素材的时候攒出来的一段动**。
 * 现在有真的待机了,那段自造的走路逻辑一起删掉。
 *
 * > **有了真的动画,就该把攒出来的那段动删干净。**
 * > 留着它等于同一个角色有两套动的逻辑,而其中一套是替补。
 *
 * 身子的表情改过(眼泪抹掉、张嘴换成红三角),细账在 tools/idleart.py;
 * 动作见上面的 `IDLE_POSE`。
 */
function drawWaou(ctx, slot, t, wearing = null) {
    if (slot === 'night') {
        // 夜里那张还是原来的近景图(99 高,装扮锚点从顶行算)
        const cv = sprite('hut_sleep', SCENERY.hut_sleep);
        const breathe = Math.sin(t * 0.0012) > 0 ? 0 : 1;
        drawStanding(ctx, cv, GULL_X, GROUND + 22 + breathe);
        drawWear(ctx, wearing, 'big', GULL_X, GROUND + 22 + breathe - 99);
        drawZzz(ctx, GULL_X + 72, GROUND - 62, t);
        return;
    }

    const cv = sprite('hut_idle', SCENERY.hut_idle);
    const [sx, sy, dy] = IDLE_POSE[Math.floor(t / IDLE_MS) % IDLE_POSE.length];
    const w = Math.round(cv.width * sx);
    const h = Math.round(cv.height * sy);
    // **底边落地。** 蹲下去的时候脚不动、身子往下压;跳起来才整只离地 ——
    // 反过来(按中心缩)会变成原地鼓气,那不是弹跳
    const base = GROUND + 22 + Math.round(dy * cv.height);
    ctx.drawImage(cv, Math.round(GULL_X - w / 2), base - h, w, h);
    // **装扮的锚点按「眼线」对齐,不按图的顶边。**
    //
    // `WEAR.bigY` 是照夜里那张(99 高、眼睛在第 46 行)标的,所以它其实是
    // 「离眼线多少」+ 46。换成这张新图(112 高、眼睛在第 28 行)之后,
    // 照顶边传就会把斗笠压到眼睛上、围巾掉到肚子上 ——
    // 两张图的「额头」不一样高,而帽子该落在头顶、围巾该落在下巴底下,
    // **这两处都是相对脸的,不是相对图框的。**
    //
    // 挤压的时候眼线跟着走(乘 sy),但帽子本身不压扁 ——
    // 一顶竹斗笠不该跟着鸟一起变形
    drawWear(ctx, wearing, 'big', GULL_X,
             base - h + Math.round(IDLE_EYE_ROW * sy) - 46);
}

/** 睡着的时候飘出来的 Z */
function drawZzz(ctx, x, y, t) {
    const Z = [
        '.KKK.',
        '...K.',
        '..K..',
        '.K...',
        '.KKK.',
    ];
    for (let i = 0; i < 3; i++) {
        const p = (t * 0.00035 + i * 0.33) % 1;
        const s = 1 + i;
        const zx = Math.round(x + p * 26 + i * 4);
        const zy = Math.round(y - p * 40 - i * 6);
        ctx.fillStyle = i === 0 ? '#fffdf4' : '#cdd8ea';
        for (let r = 0; r < 5; r++) {
            for (let cc = 0; cc < 5; cc++) {
                if (Z[r][cc] === 'K') ctx.fillRect(zx + cc * s, zy + r * s, s, s);
            }
        }
    }
}

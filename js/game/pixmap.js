/**
 * 像素画运行时。
 *
 * 两件事:
 *
 * 1. `PixelScreen` —— 低分辨率画布。所有绘制发生在 440×310 的离屏 canvas 上,
 *    最后整块按整数倍放大贴到 880×620 的显示 canvas。
 *    这是画面能不能像「像素游戏」的关键:直接在 880×620 上画,
 *    一条正弦浪、一个 arc() 出来的太阳都是带抗锯齿的软边,
 *    再怎么配色也和旁边硬边的像素 UI 对不上。先低分辨率再放大,
 *    每个像素点都是实打实的 2×2 方块,和 UI 的颗粒感一致。
 *
 * 2. `sprite()` —— 把 tools/ 里的字符网格烤成离屏 canvas,画的时候直接 drawImage。
 *    烤好缓存,同一张图只烤一次。
 */

import { PAL } from './pixels.js';

const cache = new Map();

/**
 * 字符网格 -> 离屏 canvas(1 字符 = 1 像素)。
 * @param {string} key    缓存键
 * @param {string[]} grid 字符网格
 * @param {object} [opt]
 * @param {Record<string,string>} [opt.remap] 换色:{原字符: css 颜色},用于做剪影/变体
 */
export function sprite(key, grid, opt = {}) {
    const k = opt.remap ? key + ':' + JSON.stringify(opt.remap) : key;
    const hit = cache.get(k);
    if (hit) return hit;

    const w = grid[0].length, h = grid.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
        const row = grid[y];
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            const color = opt.remap?.[ch] ?? PAL[ch];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    cache.set(k, cv);
    return cv;
}

/** 以 (x, y) 为中心画一张精灵图。坐标四舍五入到整像素,否则会糊。 */
export function drawSprite(ctx, cv, x, y) {
    ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(y - cv.height / 2));
}

/** 以 (x, 底边 y) 为锚点画,摆在地面/甲板上的东西用这个 */
export function drawStanding(ctx, cv, x, baseY) {
    ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(baseY - cv.height));
}

export class PixelScreen {
    /**
     * @param {HTMLCanvasElement} canvas 显示用画布
     * @param {number} vw 虚拟宽(画布宽必须是它的整数倍)
     * @param {number} vh 虚拟高
     */
    constructor(canvas, vw, vh) {
        this.canvas = canvas;
        this.out = canvas.getContext('2d');
        this.vw = vw;
        this.vh = vh;
        this.scale = Math.max(1, Math.floor(Math.min(canvas.width / vw, canvas.height / vh)));

        this.buf = document.createElement('canvas');
        this.buf.width = vw;
        this.buf.height = vh;
        this.ctx = this.buf.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.out.imageSmoothingEnabled = false;
    }

    /** 新建一张同尺寸的透明图层,用来缓存静态内容 */
    layer() {
        const cv = document.createElement('canvas');
        cv.width = this.vw; cv.height = this.vh;
        const c = cv.getContext('2d');
        c.imageSmoothingEnabled = false;
        return { cv, ctx: c };
    }

    /** 把低分辨率缓冲整块放大贴出去 */
    present() {
        const { out, buf, scale } = this;
        out.imageSmoothingEnabled = false;
        out.drawImage(buf, 0, 0, buf.width, buf.height,
                      0, 0, buf.width * scale, buf.height * scale);
    }
}

/* ---------- 低分辨率下常用的画法 ---------- */

/** 横向色带。stops = [[起始 y, 颜色], ...],最后一段画到 y1 */
export function bands(ctx, w, y0, y1, stops) {
    for (let i = 0; i < stops.length; i++) {
        const [sy, color] = stops[i];
        const ey = i + 1 < stops.length ? stops[i + 1][0] : y1;
        ctx.fillStyle = color;
        ctx.fillRect(0, y0 + sy, w, ey - sy);
    }
}

/**
 * 抖动过渡:在两条色带交界处撒一行棋盘格,比硬切自然,又不引入新颜色。
 * 像素画里这是渐变的标准替代品。
 */
export function dither(ctx, w, y, color, step = 2, offset = 0) {
    ctx.fillStyle = color;
    for (let x = offset % step; x < w; x += step) ctx.fillRect(x, y, 1, 1);
}

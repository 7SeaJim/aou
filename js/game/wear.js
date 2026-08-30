/**
 * 装扮的绘制。素材和锚点在 tools/wear.py 里,编成 pixels.js 的 WEAR。
 *
 * 每件东西有两套图,因为哇鸥在两个尺度上出现:小屋近景那只 124×99,
 * 大坝上那只 16×16。一套图缩放到另一个尺度不是糊就是一堆大方块。
 *
 * **锚点按「头顶那一行」对齐,不按精灵图底边。** 大坝上的三帧
 * (站着 / 张翅膀 / 鞠躬)高度不一样 —— 鞠躬那帧头低了 3 格,
 * 按底边对齐的话帽子会浮在脑袋上面。
 */

import { WEAR } from './pixels.js';
import { sprite } from './pixmap.js';
import { shadedSprite } from './tint.js';

/** 槽位的绘制顺序。脖子上的先画,帽子压在上面 —— 头巾的角要盖住绳结。 */
const ORDER = ['neck', 'hat'];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} wearing  state.wearing,形如 { hat: 'douli', neck: null }
 * @param {'big'|'small'} which  用哪一套图
 * @param {number} cx       精灵图的水平中心
 * @param {number} topY     精灵图**内容顶行**的 y(锚点从这里算起)
 * @param {string} [phase]  时段。装扮也得跟着天色走,不然傍晚整个画面暗下来,
 *                          只有它头上那顶帽子还是白天那么亮
 */
export function drawWear(ctx, wearing, which, cx, topY, phase = 'day') {
    if (!wearing) return;
    for (const slot of ORDER) {
        const id = wearing[slot];
        const w = id && WEAR[id];
        if (!w) continue;
        const grid = w[which];
        const dy = which === 'big' ? w.bigY : w.smallY;
        const cv = shadedSprite(`wear:${id}:${which}`, grid, phase);
        ctx.drawImage(cv, Math.round(cx - cv.width / 2), Math.round(topY + dy));
    }
}

/** 有没有戴东西。省掉调用方各写一遍判断。 */
export const isWearing = w => !!(w && (w.hat || w.neck));

/* ---------- 面板里的预览 ---------- */
/*
 * 装扮列表不用 16×16 图标,直接把素材原样放大画出来。
 * 理由:每件装扮再单画一张图标就是第三套图,而且图标画得再像,
 * 玩家真正想看的是「戴在它头上什么样」。
 */

/** 关掉插值。像素图被浏览器抹平就全毁了。 */
function crisp(cv) {
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    return ctx;
}

/** 整只哇鸥 + 现在这身。用大坝那套小图,和玩家在画面里看到的一致。 */
export function paintWearPreview(cv, wearing, iconGrids) {
    const ctx = crisp(cv);
    const s = Math.floor(cv.width / 24);          // 24 格的取景框,上下各留点空给帽子
    const box = (cv.width - 16 * s) / 2;
    const body = sprite('waou', iconGrids.waou);
    ctx.drawImage(body, box, box + 2 * s, 16 * s, 16 * s);
    for (const slot of ORDER) {
        const id = wearing?.[slot];
        const w = id && WEAR[id];
        if (!w) continue;
        const g = sprite(`wear:${id}:small`, w.small);
        ctx.drawImage(g, (cv.width - g.width * s) / 2, box + (2 + w.smallY) * s,
            g.width * s, g.height * s);
    }
}

/** 单独一件,列表里用 */
export function paintWearItem(cv, id) {
    const w = WEAR[id];
    if (!w) return;
    const ctx = crisp(cv);
    const g = sprite(`wear:${id}:small`, w.small);
    const s = Math.max(1, Math.floor(Math.min(cv.width / g.width, cv.height / g.height)));
    ctx.drawImage(g, Math.floor((cv.width - g.width * s) / 2),
        Math.floor((cv.height - g.height * s) / 2), g.width * s, g.height * s);
}

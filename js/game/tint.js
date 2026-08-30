/**
 * 时段调色。天亮天黑不是给每个时段各画一套素材,而是**给同一套素材上一层色**。
 *
 * 为什么不给每个 (天气 × 时段) 各写一张色板:3×3 = 9 张手调色板,加一档天气
 * 就要再加三张,而且很难保证九张之间的关系一致。偏色 + 压暗是一个函数,
 * 改一次全都跟着变。
 *
 * **这个模块单独拆出来,是因为 scene.js 和 wear.js 都要用它。**
 * scene.js 画大坝,wear.js 画哇鸥身上的装扮 —— 而 scene.js 本来就要 import
 * wear.js,反过来再 import 就成环了。调色是两边共用的底层,放这儿谁都能取。
 *
 * 注意:这是**画的时候上的色,素材本身一格没动**。
 */

import { PAL } from './pixels.js';
import { sprite } from './pixmap.js';

export const PHASE = {
    day:   null,
    dusk:  { to: '#e0834a', k: 0.32, dark: 0.12 },
    night: { to: '#1b2a48', k: 0.60, dark: 0.34 },
};

/** 两色按 t 混合。t=0 全是 a,t=1 全是 b */
export function mix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    return '#' + c(r1, r2) + c(g1, g2) + c(b1, b2);
}

/** 单个颜色按时段偏色 + 压暗 */
export function shade(hex, phase) {
    const p = PHASE[phase];
    if (!p) return hex;
    return mix(mix(hex, p.to, p.k), '#000000', p.dark);
}

/**
 * 把一张图整体按时段调色。
 * @param {object} override 夜里要点亮的地方(灯泡、炉火)在这儿单独指定,不跟着压暗
 */
export function shadedSprite(name, grid, phase, override = {}) {
    const remap = {};
    for (const ch of new Set(grid.join(''))) {
        if (ch === '.' || !PAL[ch]) continue;
        remap[ch] = override[ch] ?? shade(PAL[ch], phase);
    }
    // 缓存键必须带时段 —— 只用 name 的话,白天画过一次之后,
    // 夜里拿到的还是白天那张
    return sprite(name + ':' + phase, grid, { remap });
}

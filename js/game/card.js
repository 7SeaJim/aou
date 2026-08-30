/**
 * 今日运势卡片:把当天那一卦画成一张竖图,玩家可以存下来发出去。
 *
 * 为什么值得单做一个模块:
 *
 * 1. **占卜本来就是「每天一次、有结果、有文本」** —— 这个形状天生适合成图。
 *    游戏里其余的东西(数值、进度)截图出去别人看不懂,一张签文别人看得懂。
 * 2. 卡片是**给没玩过的人看的**,所以正文要能单独成立,不能写成
 *    「今天摊位收益 +10%」这种只有玩家读得懂的话。
 *
 * 尺寸 360×480(3:4),整数放大 3 倍 → 1080×1440。3:4 是小红书的竖图比例。
 * 沿用低分辨率作画那一套:先在 360×480 上画,再整块放大,不在大画布上直接画 ——
 * 否则文字和像素图会一个软一个硬。
 *
 * 文字只用 12 / 24 两个字号:字体本体是 12px 设计的,别的字号都在拉伸。
 */

import { pal } from './scene.js';
import { SCENERY } from './pixels.js';
import { sprite } from './pixmap.js';
import { FORTUNES, SHELL_MARKS, WEATHER } from '../data.js';

export const CW = 360;
export const CH = 480;
const SCALE = 3;

const FONT = '"Fusion Pixel 12px Proportional SC", monospace';
const INK = '#4a3628';
const PAPER = '#f7ecca';

/** 画面区和纸面区的分界 */
const SKY_H = 196;

/**
 * 画一张卡,返回 PNG 的 data URL。
 *
 * 同步的 —— 调用方要**先等 document.fonts.ready**,否则字体还没到,
 * canvas 会拿系统字体先画上去,而且画完就定死了(canvas 不会像 DOM 那样回流重排)。
 *
 * @param {object} o
 * @param {number} o.fortune 签的 id
 * @param {string} o.mark    贝壳花纹的名字
 * @param {string} o.weather
 * @param {Date}   o.date
 * @param {number} o.level
 */
export function renderCard({ fortune, mark, weather = 'sunny', date = new Date(), level = 1 }) {
    const f = FORTUNES[fortune];
    if (!f) return null;

    const cv = document.createElement('canvas');
    cv.width = CW * SCALE;
    cv.height = CH * SCALE;

    // 先在 360×480 的小画布上画完,再整块放大
    const s = document.createElement('canvas');
    s.width = CW; s.height = CH;
    const c = s.getContext('2d');
    c.imageSmoothingEnabled = false;

    const P = pal(weather, 'day');
    paintScene(c, P, weather);
    paintPaper(c, f, mark, weather, date, level);

    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, 0, 0, CW * SCALE, CH * SCALE);
    return cv.toDataURL('image/png');
}

/* ---------- 上半:湖景 + 哇鸥 ---------- */

function paintScene(c, P, weather) {
    // 天:七条色带,和游戏画面同一套颜色(pal 是从 scene.js 借的)
    const step = SKY_H * 0.62 / P.sky.length;
    P.sky.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, Math.round(i * step), CW, Math.ceil(step) + 1);
    });

    // 西山:一条折线,和大坝画面里那条同一个轮廓(睡美人)
    const hz = Math.round(SKY_H * 0.62);
    c.fillStyle = P.far;
    c.beginPath();
    c.moveTo(0, hz);
    const pts = [[0, 26], [46, 16], [78, 30], [104, 8], [128, 22], [170, 34],
                 [214, 20], [258, 32], [300, 26], [360, 34]];
    for (const [x, up] of pts) c.lineTo(x, hz - up);
    c.lineTo(CW, hz);
    c.closePath();
    c.fill();

    // 湖
    const seaStep = (SKY_H - hz) / P.sea.length;
    P.sea.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, Math.round(hz + i * seaStep), CW, Math.ceil(seaStep) + 1);
    });
    // 几道横光
    c.fillStyle = P.crest;
    for (let i = 0; i < 26; i++) {
        const y = hz + 6 + (i * 7) % (SKY_H - hz - 8);
        c.fillRect((i * 53) % CW, y, 5 + (i % 3) * 4, 1);
    }

    // 哇鸥。用小屋那张近景 —— 它是唯一一张正面、圆的、看得清脸的图
    const g = sprite('hut_waou', SCENERY.hut_waou);
    c.drawImage(g, Math.round((CW - g.width) / 2), SKY_H - g.height + 6);
}

/* ---------- 下半:纸面 ---------- */

function paintPaper(c, f, mark, weather, date, level) {
    c.fillStyle = PAPER;
    c.fillRect(0, SKY_H, CW, CH - SKY_H);
    c.fillStyle = INK;
    c.fillRect(0, SKY_H, CW, 3);

    let y = SKY_H + 34;

    // 签名。24px 是字体设计尺寸的整数倍,别的字号都在拉伸
    c.font = `24px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = INK;
    c.fillText(f.name, CW / 2, y);
    y += 30;

    // 贝壳 + 花纹。两个一起居中,不是各自居中 —— 各自居中的话
    // 壳会压到签名底下,而花纹又飘在右边,看着像两件不相干的东西。
    c.font = `12px ${FONT}`;
    const markW = c.measureText(mark).width;
    const pairX = (CW - (20 + 6 + markW)) / 2;
    paintShell(c, pairX, y, mark);
    c.textAlign = 'left';
    c.fillStyle = '#7a6250';
    c.fillText(mark, pairX + 26, y);
    c.textAlign = 'center';
    y += 28;

    // 宜 / 忌
    c.textAlign = 'left';
    const half = CW / 2;
    tag(c, 20, y, '宜', f.yi, '#4e8236');
    tag(c, half + 4, y, '忌', f.ji, '#c14e33');
    y += 34;

    // 正文
    c.fillStyle = INK;
    c.font = `12px ${FONT}`;
    y = wrap(c, f.long, 22, y, CW - 44, 20);
    y += 10;
    c.fillStyle = '#7a6250';
    y = wrap(c, `「${f.text}」`, 22, y, CW - 44, 20);

    // 落款。游戏名单独占一行居中 —— 这张图是要发出去给没玩过的人看的,
    // 名字缩在角落里和日期挤成一条,别人根本注意不到这是个游戏。
    const w = WEATHER[weather] ?? WEATHER.sunny;
    const d = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    c.font = `12px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = INK;
    c.fillText('哇鸥 · 去大坝整点饵块', CW / 2, CH - 44);
    c.fillStyle = '#7a6250';
    c.textAlign = 'left';
    c.fillText(`${d} · 滇池海埂 · ${w.name}`, 22, CH - 22);
    c.textAlign = 'right';
    c.fillText(`Lv.${level}`, CW - 22, CH - 22);
    c.textAlign = 'left';
    c.fillStyle = INK;
    c.fillRect(0, CH - 4, CW, 4);
}

/** 宜 / 忌 的小块 */
function tag(c, x, y, label, text, color) {
    c.fillStyle = color;
    c.fillRect(x, y - 11, 16, 15);
    c.fillStyle = '#fffdf4';
    c.font = `12px ${FONT}`;
    c.fillText(label, x + 2, y);
    c.fillStyle = INK;
    c.fillText(text, x + 22, y);
}

/**
 * 贝壳。八种花纹全是在同一个壳上加线加点画出来的,不做八张图 ——
 * 「一道纹 / 两道纹 / 三道纹」本来就只差几根线,画成八张精灵图纯属浪费。
 */
function paintShell(c, x, y, mark) {
    const i = Math.max(0, SHELL_MARKS.indexOf(mark));
    const cx = x + 10, cy = y - 3;

    // 壳身:一个扁扇形
    c.fillStyle = '#f2a0b5';
    for (let dy = -8; dy <= 5; dy++) {
        const w = Math.round(9 * Math.sqrt(Math.max(0, 1 - ((dy + 2) / 9) ** 2)));
        c.fillRect(cx - w, cy + dy, w * 2, 1);
    }
    c.fillStyle = '#d97f99';
    c.fillRect(cx - 8, cy + 4, 16, 2);
    c.fillStyle = INK;

    const line = n => {                       // n 道竖纹
        for (let k = 0; k < n; k++) {
            const dx = Math.round((k - (n - 1) / 2) * 4);
            c.fillRect(cx + dx, cy - 6, 1, 10);
        }
    };
    if (i === 0) line(1);
    else if (i === 1) line(2);
    else if (i === 2) line(3);
    else if (i === 3) {                       // 螺旋纹
        for (let k = 0; k < 3; k++) c.fillRect(cx - 6 + k * 2, cy - 4 + k * 3, 12 - k * 4, 1);
    } else if (i === 4) {                     // 星点纹
        for (const [dx, dy] of [[-5, -3], [0, -5], [5, -2], [-2, 1], [3, 2]]) {
            c.fillRect(cx + dx, cy + dy, 1, 1);
        }
    } else if (i === 5) {                     // 断口纹
        c.fillRect(cx - 1, cy - 6, 2, 4);
        c.fillRect(cx - 1, cy, 2, 4);
    } else if (i === 7) {                     // 缺角:右下角抠掉一块
        c.fillStyle = PAPER;
        c.fillRect(cx + 4, cy + 1, 6, 6);
    }
    // i === 6「光面」什么都不画,这就是它的样子
}

/** 不能出现在行首的字符(避头尾)。逗号句号顶在行首是中文排版里最扎眼的错。 */
const NO_START = '、。,,.!?!?」』】》):;;·';

/**
 * 手写折行。canvas 没有自动换行,而这段正文必须换。
 *
 * 顺带处理避头尾:该断的地方如果下一个字是标点,就让标点吊在行尾,
 * 宁可这一行略微出头 —— 一张要发出去的图上,行首一个逗号很显眼。
 */
function wrap(c, text, x, y, maxW, lh) {
    let line = '';
    for (const ch of text) {
        if (line && c.measureText(line + ch).width > maxW) {
            if (NO_START.includes(ch)) {
                c.fillText(line + ch, x, y);
                y += lh;
                line = '';
                continue;
            }
            c.fillText(line, x, y);
            y += lh;
            line = '';
        }
        line += ch;
    }
    if (line) { c.fillText(line, x, y); y += lh; }
    return y;
}

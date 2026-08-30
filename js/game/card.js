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
 *
 * ============================================================
 * 要改这张图,只有三张表要动(都在这个文件里,往下翻):
 *
 *   CARD_SCENES   背景。一个背景 = 一个 paint(c, P, h) 函数
 *   CARD_STYLES   版式。文字区从哪开始、什么底色、什么字色
 *   CARD_PHASES   天光。day / dusk / night,颜色由 scene.js 的 pal() 统一算
 *
 * 改完打开 /card-preview.html 看全部组合(dev 下 npm run dev 之后访问)。
 * 文案不在这里 —— 在 js/data.js 的 FORTUNES。
 * ============================================================
 */

import { pal } from './scene.js';
import { SCENERY } from './pixels.js';
import { sprite } from './pixmap.js';
import { FORTUNES, SHELL_MARKS, WEATHER, dayPhase } from '../data.js';

export const CW = 360;
export const CH = 480;
const SCALE = 3;

const FONT = '"Fusion Pixel 12px Proportional SC", monospace';
const INK = '#4a3628';
const PAPER = '#f7ecca';

/* ============================================================
   一、背景
   每个背景就是一个 paint(c, P, h):在 360×h 的范围里画完。
   P 是 scene.js 的 pal(weather, phase) —— 和游戏画面同一套颜色,
   所以这里**不要自己写死颜色**,写死了天气和时段就跟不上了。
   ============================================================ */

export const CARD_SCENES = {
    lake: { name: '滇池', paint: paintLake },
    dam:  { name: '海埂大坝', paint: paintDam },
    city: { name: '昆明城', paint: paintCity },
    hut:  { name: '草棚', paint: paintHut },
};

/* ============================================================
   二、版式
   ============================================================ */

export const CARD_STYLES = {
    paper: {
        name: '上图下纸',
        top: 196,                 // 文字区上沿
        bg: PAPER,                // 文字区底色
        scrim: null,              // 压在图上的半透明层(bg 为 null 时才用)
        ink: INK, sub: '#7a6250',
        rule: INK,                // 分隔线
    },
    full: {
        name: '满版压字',
        top: 212,
        bg: null,
        scrim: 'rgba(30, 22, 16, 0.74)',
        ink: '#fffdf4', sub: '#cfc3ad',
        rule: '#fffdf4',
    },
};

/* ============================================================
   三、天光
   ============================================================ */

export const CARD_PHASES = { day: '白天', dusk: '傍晚', night: '夜里' };

/* ============================================================
   画
   ============================================================ */

/**
 * 画一张卡,返回 PNG 的 data URL。
 *
 * 同步的 —— 调用方要**先等 document.fonts.ready**,否则字体还没到,
 * canvas 会拿系统字体先画上去,而且画完就定死了(canvas 不会像 DOM 那样回流重排)。
 *
 * @param {object} o
 * @param {number} o.fortune 签的 id
 * @param {string} o.mark    贝壳花纹的名字
 * @param {string} [o.weather]
 * @param {Date}   [o.date]
 * @param {number} [o.level]
 * @param {string} [o.scene] 背景,不传按当天挑
 * @param {string} [o.phase] 天光,不传按当前时段
 * @param {string} [o.style] 版式,不传按当天挑
 */
export function renderCard(o) {
    const f = FORTUNES[o.fortune];
    if (!f) return null;

    const date = o.date ?? new Date();
    const v = variantFor(o.fortune, date, o);
    const P = pal(o.weather ?? 'sunny', v.phase);
    const st = CARD_STYLES[v.style] ?? CARD_STYLES.paper;

    // 先在 360×480 的小画布上画完,再整块放大
    const s = document.createElement('canvas');
    s.width = CW; s.height = CH;
    const c = s.getContext('2d');
    c.imageSmoothingEnabled = false;

    // 满版版式下背景要画满整张,上下分栏的只画到文字区上沿
    (CARD_SCENES[v.scene] ?? CARD_SCENES.lake).paint(c, P, st.bg ? st.top : CH);

    // 哇鸥。用小屋那张近景 —— 它是唯一一张正面、圆的、看得清脸的图
    const g = sprite('hut_waou', SCENERY.hut_waou);
    c.drawImage(g, Math.round((CW - g.width) / 2), st.top - g.height + 6);

    paintText(c, st, f, o.mark, o.weather ?? 'sunny', date, o.level ?? 1);

    const cv = document.createElement('canvas');
    cv.width = CW * SCALE;
    cv.height = CH * SCALE;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, 0, 0, CW * SCALE, CH * SCALE);
    return cv.toDataURL('image/png');
}

/**
 * 这一卦今天用哪套组合。
 *
 * 按「日期 + 签的 id」挑,所以**同一天同一卦永远是同一张**(玩家反复打开
 * 不会看到图变来变去),换一天又不一样。天光跟真实时段走 ——
 * 晚上转的卦画成夜景,这比随机挑更说得通。
 *
 * 传了 scene / phase / style 就按传的来,预览页和 wa.card() 靠它。
 */
export function variantFor(fortune, date, override = {}) {
    const scenes = Object.keys(CARD_SCENES);
    const styles = Object.keys(CARD_STYLES);
    const seed = date.getDate() + fortune * 3;
    return {
        scene: override.scene ?? scenes[seed % scenes.length],
        style: override.style ?? styles[Math.floor(seed / scenes.length) % styles.length],
        phase: override.phase ?? dayPhase(date),
    };
}

/* ---------- 背景们 ---------- */

/** 天:七条色带,越靠近水面越亮。所有背景都从它起头 */
function sky(c, P, horizon) {
    const step = horizon / P.sky.length;
    P.sky.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, Math.round(i * step), CW, Math.ceil(step) + 1);
    });
}

/** 水:剩下那半,几道横光 */
function water(c, P, top, bottom) {
    const step = (bottom - top) / P.sea.length;
    P.sea.forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, Math.round(top + i * step), CW, Math.ceil(step) + 1);
    });
    c.fillStyle = P.crest;
    for (let i = 0; i < 30; i++) {
        const y = top + 6 + (i * 7) % Math.max(1, bottom - top - 8);
        c.fillRect((i * 53) % CW, y, 5 + (i % 3) * 4, 1);
    }
}

/** 西山。折线是照着大坝画面那条来的(睡美人躺着的轮廓) */
function xishan(c, P, hz) {
    c.fillStyle = P.far;
    c.beginPath();
    c.moveTo(0, hz);
    for (const [x, up] of [[0, 26], [46, 16], [78, 30], [104, 8], [128, 22],
                           [170, 34], [214, 20], [258, 32], [300, 26], [360, 34]]) {
        c.lineTo(x, hz - up);
    }
    c.lineTo(CW, hz);
    c.closePath();
    c.fill();
}

function paintLake(c, P, h) {
    const hz = Math.round(h * 0.56);
    sky(c, P, hz);
    xishan(c, P, hz);
    water(c, P, hz, h);
}

function paintDam(c, P, h) {
    const hz = Math.round(h * 0.44);
    sky(c, P, hz);
    xishan(c, P, hz);
    const deck = h - 46;
    water(c, P, hz, deck);
    // 栏杆:一段一段铺过去
    const rail = sprite('rail', SCENERY.rail);
    for (let x = -4; x < CW; x += rail.width) c.drawImage(rail, x, deck - rail.height);
    // 木板甲板
    c.fillStyle = P.wood.ink; c.fillRect(0, deck, CW, 4);
    c.fillStyle = P.wood.light; c.fillRect(0, deck + 4, CW, 5);
    c.fillStyle = P.wood.wood; c.fillRect(0, deck + 9, CW, h - deck - 9);
    c.fillStyle = P.wood.dark;
    for (let x = 0; x < CW; x += 26) c.fillRect(x, deck + 9, 2, h - deck - 9);
}

function paintCity(c, P, h) {
    const hz = Math.round(h * 0.62);
    sky(c, P, hz);
    // 城:一排高矮不一的方块,越远越淡
    c.fillStyle = P.far;
    for (let i = 0; i < 26; i++) {
        const w = 10 + (i * 7) % 16;
        const bh = 14 + (i * 23) % 40;
        c.fillRect((i * 15) % CW, hz - bh, w, bh);
    }
    // 万达双塔 —— 这一带唯一认得出的地标
    const w = sprite('wanda', SCENERY.wanda);
    c.drawImage(w, Math.round(CW * 0.62), hz - w.height);
    c.fillStyle = P.far;
    c.fillRect(0, hz - 2, CW, 2);
    water(c, P, hz, h);
}

function paintHut(c, P, h) {
    const open = Math.round(h * 0.26);
    sky(c, P, open + 26);
    water(c, P, open + 26, h - 52);
    // 草顶从画面上沿垂下来,下沿留成不齐的 —— 齐了就成木板了
    const th = P.wood.light, thd = P.wood.dark;
    for (let x = 0; x < CW; x++) {
        const len = open - 12 + Math.round(9 + Math.sin(x * 0.31) * 4 + Math.sin(x * 0.11) * 5);
        c.fillStyle = (x % 5 < 2) ? th : thd;
        c.fillRect(x, 0, 1, len);
    }
    // 立柱
    for (const px of [22, CW - 32]) {
        c.fillStyle = P.wood.ink; c.fillRect(px - 1, open - 16, 12, h - open);
        c.fillStyle = P.wood.wood; c.fillRect(px, open - 16, 9, h - open);
    }
    // 地上垫的草
    c.fillStyle = thd; c.fillRect(0, h - 52, CW, 52);
    for (let i = 0; i < 420; i++) {
        c.fillStyle = (i % 3 === 0) ? th : thd;
        c.fillRect((i * 53) % CW, h - 50 + (i * 31) % 48, 4 + (i % 4) * 3, 1);
    }
}

/* ---------- 文字 ---------- */

function paintText(c, st, f, mark, weather, date, level) {
    if (st.bg) {
        c.fillStyle = st.bg;
        c.fillRect(0, st.top, CW, CH - st.top);
    } else if (st.scrim) {
        c.fillStyle = st.scrim;
        c.fillRect(0, st.top, CW, CH - st.top);
    }
    c.fillStyle = st.rule;
    c.fillRect(0, st.top, CW, 3);

    let y = st.top + 34;

    // 签名。24px 是字体设计尺寸的整数倍,别的字号都在拉伸
    c.font = `24px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = st.ink;
    c.fillText(f.name, CW / 2, y);
    y += 30;

    // 贝壳 + 花纹。两个一起居中,不是各自居中 —— 各自居中的话
    // 壳会压到签名底下,而花纹又飘在右边,看着像两件不相干的东西。
    c.font = `12px ${FONT}`;
    const markW = c.measureText(mark).width;
    const pairX = (CW - (20 + 6 + markW)) / 2;
    paintShell(c, pairX, y, mark, st);
    c.textAlign = 'left';
    c.fillStyle = st.sub;
    c.fillText(mark, pairX + 26, y);
    c.textAlign = 'center';
    y += 28;

    // 宜 / 忌
    c.textAlign = 'left';
    tag(c, 20, y, '宜', f.yi, '#4e8236', st);
    tag(c, CW / 2 + 4, y, '忌', f.ji, '#c14e33', st);
    y += 34;

    // 正文
    c.fillStyle = st.ink;
    c.font = `12px ${FONT}`;
    y = wrap(c, f.long, 22, y, CW - 44, 20);
    y += 10;
    c.fillStyle = st.sub;
    y = wrap(c, `「${f.text}」`, 22, y, CW - 44, 20);

    // 落款。游戏名单独占一行居中 —— 这张图是要发出去给没玩过的人看的,
    // 名字缩在角落里和日期挤成一条,别人根本注意不到这是个游戏。
    const w = WEATHER[weather] ?? WEATHER.sunny;
    const d = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    c.font = `12px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = st.ink;
    c.fillText('哇鸥 · 去大坝整点饵块', CW / 2, CH - 44);
    c.fillStyle = st.sub;
    c.textAlign = 'left';
    c.fillText(`${d} · 滇池海埂 · ${w.name}`, 22, CH - 22);
    c.textAlign = 'right';
    c.fillText(`Lv.${level}`, CW - 22, CH - 22);
    c.textAlign = 'left';
    c.fillStyle = st.rule;
    c.fillRect(0, CH - 4, CW, 4);
}

/** 宜 / 忌 的小块 */
function tag(c, x, y, label, text, color, st) {
    c.fillStyle = color;
    c.fillRect(x, y - 11, 16, 15);
    c.fillStyle = '#fffdf4';
    c.font = `12px ${FONT}`;
    c.fillText(label, x + 2, y);
    c.fillStyle = st.ink;
    c.fillText(text, x + 22, y);
}

/**
 * 贝壳。八种花纹全是在同一个壳上加线加点画出来的,不做八张图 ——
 * 「一道纹 / 两道纹 / 三道纹」本来就只差几根线,画成八张精灵图纯属浪费。
 */
function paintShell(c, x, y, mark, st) {
    const i = Math.max(0, SHELL_MARKS.indexOf(mark));
    const cx = x + 10, cy = y - 3;

    c.fillStyle = '#f2a0b5';
    for (let dy = -8; dy <= 5; dy++) {
        const w = Math.round(9 * Math.sqrt(Math.max(0, 1 - ((dy + 2) / 9) ** 2)));
        c.fillRect(cx - w, cy + dy, w * 2, 1);
    }
    c.fillStyle = '#d97f99';
    c.fillRect(cx - 8, cy + 4, 16, 2);
    c.fillStyle = INK;

    const line = n => {
        for (let k = 0; k < n; k++) {
            c.fillRect(cx + Math.round((k - (n - 1) / 2) * 4), cy - 6, 1, 10);
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
        // 抠出来的那块要露出**当前版式的底色**,写死 PAPER 的话
        // 满版版式上会冒出一块浅色补丁
        c.fillStyle = st.bg ?? '#2a2018';
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

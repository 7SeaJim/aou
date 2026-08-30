/**
 * 音效。**全部现场合成,一个音频文件都不带。**
 *
 * 理由和像素画是同一条:这游戏的美术是几十 KB 的字符网格换来的,
 * 再挂上两百 KB 的 mp3 就本末倒置了。芯片音本来就该是振荡器出来的,
 * 采样反而不对味。
 *
 * 三件必须记住的事:
 *
 * 1. **AudioContext 只能在用户手势之后建。** 浏览器一律拦截自动播放,
 *    页面刚加载就 new 一个,拿到的是 suspended 状态,之后再怎么 play 都没声。
 *    所以这里是懒建的 —— 第一次真的要发声时才建,而那时必然已经有过点击。
 * 2. **要限流。** 摊位一次出十份餐、飞行里连吃五个食材,不限流就是一坨噪音,
 *    而且 Web Audio 的节点是真的会堆到卡。
 * 3. **静音开关存 localStorage,不进存档。** 它是这台设备上的偏好,
 *    不是玩家的进度 —— 存档码是要复制给别人 / 换设备用的,
 *    把「我这儿静音」一起带过去毫无道理。
 */

const KEY = 'waou.muted';

let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* 隐私模式,当没静音 */ }

/** 上一次发声的时刻,用来限流 */
let lastAt = 0;
const MIN_GAP = 45;         // 毫秒。比这更密的声音人耳分不出来,只会糊成一片

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;      // 整体压低:这类方波音很扎耳朵
    master.connect(ctx.destination);
    return ctx;
}

/**
 * 一个音。
 * @param {number} f0   起始频率
 * @param {number} f1   结束频率(滑音,等于 f0 就是平的)
 * @param {number} dur  时长(秒)
 * @param {string} type 波形。square 最「芯片」,triangle 软一点,sine 最柔
 * @param {number} vol  音量
 * @param {number} at   相对现在延后多久开始(秒)
 */
function tone(f0, f1, dur, type = 'square', vol = 0.25, at = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    // 起音留 5ms 斜坡,直接从 0 跳到 vol 会「啪」一声(直流突变)
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}

/** 一小撮白噪。石头落地、撞击这种「没有音高」的声音得靠它 */
function noise(dur, vol = 0.2, at = 0, hz = 1200) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = hz;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(lp).connect(g).connect(master);
    src.start(t);
}

/* ---------- 音色表 ----------
 * 音高按 C 大调排,几个音一叠就有调性,比随手写频率听着顺。
 * C5=523 D5=587 E5=659 G5=784 A5=880 C6=1047 E6=1319 G6=1568
 */
const SFX = {
    /** 按钮。所有 data-act 的点击都走它,所以要短、要轻,听多了不烦 */
    click:   () => tone(660, 880, 0.045, 'square', 0.16),
    /** 切页签。比 click 低一点,区分开 */
    tab:     () => tone(440, 520, 0.05, 'triangle', 0.16),
    /** 出餐:锅铲两下 */
    serve:   () => { tone(523, 523, 0.06, 'triangle', 0.22); tone(784, 784, 0.08, 'triangle', 0.2, 0.06); },
    /** 进账 */
    coin:    () => { tone(988, 988, 0.05, 'square', 0.2); tone(1319, 1319, 0.09, 'square', 0.18, 0.05); },
    /** 路人投喂,很轻 —— 挂机时它会一直响 */
    feed:    () => tone(880, 1047, 0.05, 'triangle', 0.12),
    /** 升级:上行琶音 */
    levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.11, 'square', 0.2, i * 0.075)),
    /** 成就:比升级更亮,尾巴长一点 */
    achieve: () => [784, 988, 1319, 1568].forEach((f, i) => tone(f, f, 0.16, 'square', 0.19, i * 0.08)),
    /** 明信片 / 掉落 */
    get:     () => { tone(1047, 1047, 0.06, 'triangle', 0.2); tone(1568, 1568, 0.12, 'triangle', 0.16, 0.06); },
    /** 落子。石头是闷的,低噪 + 一个短促的低音 */
    stone:   () => { noise(0.07, 0.22, 0, 700); tone(180, 120, 0.07, 'triangle', 0.16); },
    /** 转卦:一串下行,像贝壳滚过桌面 */
    fortune: () => [1319, 1047, 880, 784, 659].forEach((f, i) => tone(f, f, 0.1, 'sine', 0.16, i * 0.06)),
    /** 飞行:捡到东西 */
    pickup:  () => tone(880, 1319, 0.06, 'square', 0.18),
    /** 飞行:撞上了 */
    hit:     () => { noise(0.16, 0.3, 0, 500); tone(220, 90, 0.18, 'square', 0.22); },
    /** 大坝上撞见一件事 */
    event:   () => { tone(659, 659, 0.07, 'triangle', 0.18); tone(880, 880, 0.1, 'triangle', 0.16, 0.07); },
};

export const SFX_KEYS = Object.keys(SFX);

/**
 * 放一个音。名字不认识就静默忽略 —— 音效不该因为拼错一个字符串把玩法搞崩。
 * @param {keyof SFX} name
 */
export function play(name) {
    if (muted) return;
    const f = SFX[name];
    if (!f) return;
    const now = performance.now();
    if (now - lastAt < MIN_GAP) return;
    lastAt = now;
    // 有些浏览器在标签页切回来之后是 suspended 的,补一次 resume
    const c = ensure();
    if (c?.state === 'suspended') c.resume();
    try { f(); } catch { /* 音频挂了不该影响玩法 */ }
}

export const isMuted = () => muted;

/** @returns {boolean} 切换之后是不是静音 */
export function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* 忽略 */ }
    if (!muted) play('click');      // 开声音时给个反馈,不然不知道生效没
    return muted;
}

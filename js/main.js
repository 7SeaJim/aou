/**
 * 入口:把存档、规则、界面、玩法接起来。
 */

import { storage } from './storage/index.js';
import { migrate } from './state.js';
import * as rules from './game/rules.js';
import { Background } from './game/background.js';
import { Flight, W, H } from './game/flight.js';
import { SpriteBook } from './game/sprite.js';
import { TitleScreen } from './game/title.js';
import { Hut } from './game/hut.js';
import { Service } from './game/service.js';
import { hourSlot } from './data.js';
import { now } from './clock.js';
import { UI } from './ui.js';
import * as sfx from './audio.js';
import { FOODS } from './data.js';

/** PNG 图集清单(可选)。图不存在时 SpriteBook 静默失败,
    退回 tools/ 生成的内置像素图 —— 那才是默认素材,不是占位。 */
const SPRITES = {
    waou: {
        src: 'sprites/waou.png',
        cell: 32,
        anims: {
            idle: { row: 0, frames: 4, fps: 6 },
            fly:  { row: 1, frames: 6, fps: 12 },
            hurt: { row: 2, frames: 2, fps: 8, loop: false },
        },
    },
};

let state = null;
let ui = null;
/** 换画布上跑的那一场。boot() 里装上,出摊到点开关时也靠它 */
let syncScene = () => false;
let flight = null;
/** 开发用的播种随机源工厂。生产构建里始终是 null */
let devRng = null;
/** wa.god() 的开关。同上,生产构建里始终是 null */
let devGodOn = null;
/** 待机界面期间攒下的事件,进游戏后一起弹 */
let pendingEvents = [];

/** 改存档的唯一入口:跑完改动后自动存盘 + 重绘 */
function mutate(fn) {
    const result = fn(state);
    storage.save(state);
    ui?.render();
    return result;
}

async function boot() {
    storage.init();

    // 开发时的 ?scene=mid 之类要在读档处就接管,否则会被真实存档盖掉。
    // import.meta.env.DEV 在 build 时是常量 false,整块连同 dev.js 一起被摇掉。
    let dev = null;
    if (import.meta.env.DEV) {
        dev = await import('./dev.js');
        devRng = dev.devRng;
        devGodOn = dev.devGodOn;
    }

    state = dev?.devScene() ?? await storage.load();

    // 跨天重置 / 天气轮换。
    // **日期要从 clock.js 拿**,不能用 refreshDaily 默认的 new Date() ——
    // 全游戏别处判「今天」都走这口井(占卜、市场、每日饮品),
    // 这一处偷偷用真实时间的话,?day=1 打开会看到「次数没重置,
    // 但占卜和市场重开了」这种半截状态
    const rolled = rules.refreshDaily(state, now());
    let dirty = !!rolled;
    dirty = rules.refreshWeather(state) || dirty;

    // 离线结算要在天气刷新**之后**:摊位的客单价吃天气系数,
    // 先结算的话用的是上次离开时那档天气。
    const offlineEvents = rules.settleOffline(state);
    if (dirty || offlineEvents.length) storage.save(state);

    const sprites = await new SpriteBook().load(SPRITES);

    // 舞台上那块画面在两个场景之间切:大坝 / 小屋。
    // 同一张 canvas,谁在跑谁画 —— 两个都跑着的话会互相盖。
    const canvas = document.getElementById('bgCanvas');
    const bg = new Background(canvas, () => state);
    const hut = new Hut(canvas, () => state, () => hourSlot(now()));
    // 出摊也画在同一张画布上。它比别的场景多一件事:局面变了要通知面板重绘
    const service = new Service(canvas, () => state, mutate, () => ui?.render());
    bg.start();

    // 三个场景共用一张画布,谁在跑谁画 —— 两个都跑着会互相盖。
    // **不只在切页时算,每秒复查一次**:摊子到点会自己开、自己关,
    // 玩家坐在出摊那页不动的话,没有任何一次切页会来通知它。
    let scene = 'bg';
    syncScene = () => {
        const want = ui?.screen === 'hut' ? 'hut'
            : ui?.screen === 'service' && rules.serviceOpen() ? 'service'
            : 'bg';
        if (want === scene) return false;
        scene = want;
        hut.stop(); service.stop(); bg.stop();
        if (want === 'hut') hut.start();
        else if (want === 'service') { service.reset(); service.start(); }
        else bg.start();
        return true;
    };

    ui = new UI({
        getState: () => state,
        mutate,
        service,
        onFly: () => startFlight(sprites),
        // go() 紧接着就会 render,这里只管换画布上跑的那一场
        onScreen: () => syncScene(),
    });
    ui.mount();

    // 存储不可用时明确告诉玩家,别让人白玩一场
    if (storage.adapterName === 'MemoryAdapter') {
        ui.toast('这个环境无法保存进度,记得导出存档码', 'postcard');
    }

    startStallLoop();

    // 离线收益先攒着,等玩家点了「开始游戏」再弹 —— 否则它会在标题画面背后弹完。
    // 工钱那一条也一起排队:**扣了钱就必须说一声**,
    // 一觉醒来少了两千鸥币而屏幕上什么都没说,那和 bug 没区别
    pendingEvents = offlineEvents;
    if (rolled?.wage && (rolled.wage.cost || rolled.wage.unpaid.length)) {
        pendingEvents.push({ type: 'wage', ...rolled.wage });
    }

    // 点大坝画面上的草棚就进小屋。判定用同一份坐标(scene.js 的 SHACK_HIT),
    // 画一处、点一处地各写一份的话,挪个位置就会「看着在这儿、点不到」。
    //
    // **条件是「现在画布上跑的是大坝」,不是「现在不在小屋」。**
    // 三个场景共用一张画布,草棚的判定框是按大坝那一场的坐标算的;
    // 换成出摊那一场之后,那块地方是案上那摞盘子 —— 点盘子直接进小屋,
    // 因为原来的判断只排除了 hut,没排除别的场景。
    // 用 scene 来判断的话,以后再加场景也不用回来补一条。
    const onDam = () => !flight && scene === 'bg';
    canvas.addEventListener('click', e => {
        if (!onDam()) return;
        if (bg.hitShack(e.clientX, e.clientY)) ui.go('hut');
    });
    canvas.addEventListener('pointermove', e => {
        if (!onDam()) { canvas.style.cursor = ''; return; }
        canvas.style.cursor = bg.hitShack(e.clientX, e.clientY) ? 'pointer' : '';
    });

    // 两个飞行键。**pointerdown 不是 click** —— 平飞要的是「按住多久」,
    // click 到松手才发,那就永远只按得住 0 毫秒。
    // preventDefault 挡的是按下去之后按钮抢走焦点:抢走了,空格就落到按钮上
    // 变成「再点一次这个按钮」,键盘和屏幕两套操作会打架
    const flap = document.getElementById('flyFlap');
    const glide = document.getElementById('flyGlide');
    flap.addEventListener('pointerdown', e => { e.preventDefault(); flight?.flap(); });
    glide.addEventListener('pointerdown', e => { e.preventDefault(); flight?.setGlide(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        glide.addEventListener(ev, () => flight?.setGlide(false));
    }

    document.getElementById('flyQuit').addEventListener('click', () => flight?.quit());
    document.getElementById('flyPause').addEventListener('click', togglePause);
    document.getElementById('flyResume').addEventListener('click', togglePause);

    dev?.installDev({
        getState: () => state,
        mutate,
        storage,
        rules,
        ui,
        service,
        fly: () => startFlight(sprites),
        getFlight: () => flight,
    });

    if (import.meta.env.DEV && dev?.devTab()) ui.go(dev.devTab());
    showTitle(import.meta.env.DEV && dev?.devEnter());
    console.log(`存档已载入(${storage.adapterName})`);
}

/**
 * 待机界面。整页盖住,点「开始游戏」才进去。
 *
 * 游戏本体在它背后已经跑起来了(背景在画、摊位在结算)——
 * 这样点下去是立刻开始,而不是等一轮加载。离线结算的吐司也先记着,
 * 等玩家真的进来了再弹,不然它会寂寞地在标题画面后面自己弹完。
 */
/**
 * 请求全屏,顺带把方向锁成横的。
 *
 * **全都得容错。** requestFullscreen 在 iOS Safari 上对非 <video> 直接没有,
 * orientation.lock 只在全屏里有效、而且好几个浏览器压根没实现。
 * 一处失败不该把「开始游戏」这一下也带崩 —— 所以整段包在 try 里,
 * 拿不到就当没这回事,玩家最多是多看一条地址栏。
 */
export function goFullscreen() {
    try {
        const el = document.documentElement;
        const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
        const p = req?.call(el, { navigationUI: 'hide' });
        Promise.resolve(p)
            .then(() => screen.orientation?.lock?.('landscape'))
            .catch(() => { /* 不给就算了 */ });
    } catch { /* 同上 */ }
}

function showTitle(skip = false) {
    const el = document.getElementById('title');
    const title = new TitleScreen(document.getElementById('titleCanvas'));
    title.start();

    const enter = (gesture) => {
        // 第一次发声必须在用户手势之后,浏览器才不拦 —— 这个点击就是那个手势
        sfx.play('click');
        // **同一个手势顺手要一次全屏。**
        // 手机横过来,浏览器那条地址栏要吃掉三分之一的高度,而这是个横屏游戏 ——
        // 高度每省 1px,画面就能宽 2px。全屏只能在用户手势里请求,
        // 而「开始游戏」这一下正是唯一一个保证有的手势。
        // 不成功就算了(iOS Safari 不给非视频元素全屏),那条路留给「加到主屏幕」。
        if (gesture) goFullscreen();
        el.classList.add('is-gone');
        title.stop();
        if (pendingEvents.length) { ui.showEvents(pendingEvents); pendingEvents = []; }
    };
    document.getElementById('startBtn').addEventListener('click', () => enter(true), { once: true });
    if (skip) enter(false);      // ?enter —— 只在 dev 构建里传得进来
}

/**
 * 摊位的在线循环。
 *
 * 每秒推进一次,但**只在真出餐了才重绘**:每秒重绘整页会把存档页的
 * 文本框内容冲掉,也没必要。进度条另走 paintStallBars(),只改宽度不动 DOM。
 *
 * 切后台时浏览器会把 setInterval 压到几秒一次甚至停掉 —— 不要紧,
 * tickStalls 是按 lastSeen 的时间差算的,不是按调用次数,回来自然补上。
 */
function startStallLoop() {
    setInterval(() => {
        if (flight) return;                       // 飞行时先不结算,免得两头改背包
        const r = rules.tickStalls(state, Date.now());
        if (!r) return;

        // 时间差太大时 tickStalls 会转成离线结算,这时要像刚进游戏一样弹一条
        if (r.offline) {
            storage.save(state);
            ui.render();
            if (r.offline.length) ui.showEvents(r.offline);
            return;
        }
        // 事件可能给东西、也可能把摊位计时清零,不管出没出餐都得存盘 + 弹一下
        if (r.events?.length) {
            storage.save(state);
            ui.render();
            ui.showEvents(r.events);
            return;
        }
        if (r.served) {
            sfx.play(r.coins > 0 ? 'coin' : 'serve');
            storage.save(state);
            if (ui.screen === 'dock' || ui.screen === 'cook') ui.render();
        }
    }, 1000);
    setInterval(() => ui?.paintStallBars(), 250);

    // 出摊时段的开关。到点了要么把摊子支起来,要么换成打烊那块牌子 ——
    // 两种情况都得重画厨房那一层,所以只在真的切了场景时才 render
    setInterval(() => { if (syncScene() && ui?.screen === 'service') ui.render(); }, 1000);
}

function togglePause() {
    if (!flight) return;
    const next = !flight.paused;
    flight.setPaused(next);
    document.getElementById('pauseMask').classList.toggle('is-open', next);
    document.getElementById('flyPause').textContent = next ? '▶ 继续' : '⏸ 暂停';
}

function startFlight(sprites) {
    const overlay = document.getElementById('flyOverlay');
    const canvas = document.getElementById('flyCanvas');
    canvas.width = W; canvas.height = H;
    // HUD 那几个元素查一次存着 —— onTick 每帧都叫(距离是连续涨的),
    // 一秒六十次 getElementById 谈不上贵,但没必要
    const H_ = id => document.getElementById(id);
    const flyHud = {
        score: H_('flyScore'), lives: H_('flyLives'), combo: H_('flyCombo'),
        wave: H_('flyWave'), dist: H_('flyDist'), hungry: H_('flyHungry'),
        count: H_('flyCount'),
        yaya: H_('flyYaya'), yayaText: H_('flyYayaText'),
        buffs: H_('flyBuffs'), flapText: H_('flyFlapText'),
    };

    // 道具在开局扣除
    mutate(s => {
        for (const k of ['shield', 'magnet', 'double']) {
            if (s.items[k] > 0) s.items[k]--;
        }
        s.dailyTries--;
    });

    overlay.classList.add('is-open');
    document.getElementById('pauseMask').classList.remove('is-open');
    document.getElementById('flyPause').textContent = '⏸ 暂停';

    flight = new Flight({
        canvas,
        state,
        sprites,
        // 只有开发时设过 wa.seed(n) 才不是 undefined;Flight 默认用 Math.random
        rng: devRng?.(),
        onTick: hud => {
            flyHud.score.textContent = hud.score;
            flyHud.lives.textContent = hud.lives;
            flyHud.combo.textContent = hud.combo >= 5 ? `${hud.combo} 连击!` : '';
            flyHud.wave.textContent = hud.wave;
            flyHud.dist.textContent = hud.dist;
            // 肚子条画在画布上,这儿只负责把「饿了」这个词摆出来
            flyHud.hungry.hidden = !hud.hungry;
            // 丫丫:-1 是没招她,这条 chip 就一直不出现
            flyHud.yaya.hidden = hud.yaya < 0;
            if (hud.yaya >= 0) {
                flyHud.yayaText.textContent = hud.yaya === 0 ? '护着' : `${hud.yaya}s`;
                flyHud.yayaText.style.color = hud.yaya === 0 ? 'var(--leaf)' : '';
            }
            // 道具那一格。**只在文字真的变了的时候才重写** —— onTick 一秒六十次,
            // 而这行字一秒最多变一次(秒数);拿签名比一下就够,省掉 59 次 innerHTML
            const sig = `${hud.flip}|${hud.rush}|${hud.magnet}|${hud.shieldN}:${hud.shield}`;
            if (sig !== flyHud.sig) {
                flyHud.sig = sig;
                const bits = [];
                if (hud.flip) bits.push(`<i class="px-icon px-icon--flip"></i>${hud.flip}s 翻倍`);
                if (hud.rush) bits.push(`<i class="px-icon px-icon--double"></i>${hud.rush}s 无敌`);
                if (hud.magnet) bits.push(`<i class="px-icon px-icon--magnet"></i>${hud.magnet}s`);
                if (hud.shieldN) bits.push(`<i class="px-icon px-icon--shield"></i>×${hud.shieldN}`);
                flyHud.buffs.hidden = bits.length === 0;
                flyHud.buffs.innerHTML = bits.join('　');
                // 颠倒的时候左键是往下扎的。**键上的字得跟着改** ——
                // 键没换、意思换了,而玩家看的是键上写的那两个字
                const flip = hud.flip > 0;
                if (flyHud.flip !== flip) {
                    flyHud.flip = flip;
                    flyHud.flapText.textContent = flip ? '俯冲' : '跃起';
                }
            }
            // 开局那三秒的大数字。**用 DOM 不用画布** ——
            // 画布上没有像素字体,写上去就是一团糊
            flyHud.count.hidden = hud.count <= 0;
            if (hud.count > 0) flyHud.count.textContent = hud.count;
        },
        onEnd: result => {
            overlay.classList.remove('is-open');
            document.getElementById('pauseMask').classList.remove('is-open');
            flyHud.count.hidden = true;
            flight = null;
            finishFlight(result);
        },
    });
    flight.start();
    // 不死模式跨局有效:每开一局问一次 dev(见 wa.god())
    if (devGodOn?.()) flight.f.god = true;
}

function finishFlight(result) {
    const events = mutate(s => rules.settleFlight(s, result));
    storage.flush();                    // 一局结束立刻落盘,别留在防抖窗口里

    const picked = Object.entries(result.collected)
        .map(([k, n]) => `${FOODS[k].name}×${n}`).join('、') || '什么都没捡到';

    const far = `飞了 ${result.dist} 米`;
    if (result.reason === 'crash') {
        ui.toast(`掉湖里了…${far},这趟收获:${picked}`, 'rain');
    } else if (result.reason === 'hungry') {
        // 饿回去的不是摔了 —— 它是自己决定回巢的,收获照拿
        ui.toast(`飞饿了,回巢。${far},收获 ${picked}`, 'erkuai');
    } else {
        ui.toast(`${far},收获 ${picked},得分 ${result.score}`, 'erkuai');
    }
    ui.showEvents(events);
}

boot().catch(err => {
    console.error(err);
    document.getElementById('panel').innerHTML =
        `<div class="px-panel px-panel--sea"><p>启动失败:${err.message}</p></div>`;
});

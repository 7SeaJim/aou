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
let flight = null;
/** 开发用的播种随机源工厂。生产构建里始终是 null */
let devRng = null;
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
    }

    state = dev?.devScene() ?? await storage.load();

    // 跨天重置 / 天气轮换
    let dirty = rules.refreshDaily(state);
    dirty = rules.refreshWeather(state) || dirty;
    dirty = rules.refreshOrders(state) || dirty;

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
    bg.start();

    ui = new UI({
        getState: () => state,
        mutate,
        onFly: () => startFlight(sprites),
        onScreen: screen => {
            const wantHut = screen === 'hut';
            if (wantHut) { bg.stop(); hut.start(); }
            else { hut.stop(); bg.start(); }
        },
    });
    ui.mount();

    // 存储不可用时明确告诉玩家,别让人白玩一场
    if (storage.adapterName === 'MemoryAdapter') {
        ui.toast('这个环境无法保存进度,记得导出存档码', 'postcard');
    }

    startStallLoop();

    // 离线收益先攒着,等玩家点了「开始游戏」再弹 —— 否则它会在标题画面背后弹完
    pendingEvents = offlineEvents;

    // 点大坝画面上的草棚就进小屋。判定用同一份坐标(scene.js 的 SHACK_HIT),
    // 画一处、点一处地各写一份的话,挪个位置就会「看着在这儿、点不到」。
    canvas.addEventListener('click', e => {
        if (flight || ui.screen === 'hut') return;
        if (bg.hitShack(e.clientX, e.clientY)) ui.go('hut');
    });
    canvas.addEventListener('pointermove', e => {
        if (flight || ui.screen === 'hut') { canvas.style.cursor = ''; return; }
        canvas.style.cursor = bg.hitShack(e.clientX, e.clientY) ? 'pointer' : '';
    });

    document.getElementById('flyQuit').addEventListener('click', () => flight?.quit());
    document.getElementById('flyPause').addEventListener('click', togglePause);
    document.getElementById('flyResume').addEventListener('click', togglePause);

    dev?.installDev({
        getState: () => state,
        mutate,
        storage,
        rules,
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
function showTitle(skip = false) {
    const el = document.getElementById('title');
    const title = new TitleScreen(document.getElementById('titleCanvas'));
    title.start();

    const enter = () => {
        // 第一次发声必须在用户手势之后,浏览器才不拦 —— 这个点击就是那个手势
        sfx.play('click');
        el.classList.add('is-gone');
        title.stop();
        if (pendingEvents.length) { ui.showEvents(pendingEvents); pendingEvents = []; }
    };
    document.getElementById('startBtn').addEventListener('click', enter, { once: true });
    if (skip) enter();      // ?enter —— 只在 dev 构建里传得进来
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
            document.getElementById('flyScore').textContent = hud.score;
            document.getElementById('flyLives').textContent = hud.lives;
            document.getElementById('flyCombo').textContent =
                hud.combo >= 5 ? `${hud.combo} 连击!` : '';
        },
        onEnd: result => {
            overlay.classList.remove('is-open');
            document.getElementById('pauseMask').classList.remove('is-open');
            flight = null;
            finishFlight(result);
        },
    });
    flight.start();
}

function finishFlight(result) {
    const events = mutate(s => rules.settleFlight(s, result));
    storage.flush();                    // 一局结束立刻落盘,别留在防抖窗口里

    const picked = Object.entries(result.collected)
        .map(([k, n]) => `${FOODS[k].name}×${n}`).join('、') || '什么都没捡到';

    if (result.reason === 'crash') {
        ui.toast(`掉湖里了…这趟收获:${picked}`, 'rain');
    } else {
        ui.toast(`收获 ${picked},得分 ${result.score}`, 'erkuai');
    }
    ui.showEvents(events);
}

boot().catch(err => {
    console.error(err);
    document.getElementById('panel').innerHTML =
        `<div class="px-panel px-panel--sea"><p>启动失败:${err.message}</p></div>`;
});

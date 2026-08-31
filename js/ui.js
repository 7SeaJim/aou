/**
 * 界面层:渲染 + 事件。所有 DOM 操作都在这里,规则层不碰 DOM。
 *
 * 相比 template 的旧做法(一张整图 + 按固定像素坐标铺透明按钮),
 * 这里用真实 DOM:数据能直接显示,按钮不会因为窗口缩放而错位。
 */

import {
    FOODS, ITEMS, RECIPES, POSTCARDS, ACHIEVEMENTS, ACH_GROUPS, CAP_VALUE,
    EVENTS,
    TOTAL_CAPS, CHAT_NODES, WEATHER,
    UPGRADES, upgradeCost, SHOWS,
    DRINKS, FORTUNES, HOURS, hourSlot,
    CREW, FOOD_SOURCE, COSMETICS, SLOTS, dayPhase,
    TUTORIAL, TUTORIAL_GIFT, MARKET, MARKET_LEVEL,
    RECIPE_STEPS, SERVICE, TOOLS, QUALITY, KITCHEN, kitchenCost, PLATES,
} from './data.js';
import { paintWearPreview, paintWearItem } from './game/wear.js';
import { renderCard } from './game/card.js';
import { ICON_GRIDS } from './game/pixels.js';
import * as c4 from './game/connect4.js';
import { now } from './clock.js';
import { FOOD_KEYS, DAILY_TRIES, TUTORIAL_DONE } from './state.js';
import * as rules from './game/rules.js';
import * as sfx from './audio.js';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
};
/** 一条吐司在屏幕上待多久。showEvents 的排队间隔要按它来。 */
const TOAST_MS = 2600;

/** 抽屉顶上那行字。和按钮上的名字一致,不然点开会有一瞬间的「我点的是这个吗」 */
const DRAWER_TITLE = {
    dock: '海埂大坝', service: '出摊', cook: '摊子', hut: '小屋',
    bag: '背包', codex: '图鉴', postcard: '明信片', achievement: '成就',
    wear: '装扮', chat: '聊天', save: '存档',
};

/**
 * 走整页的场景。**它们本身就是一整个界面**,塞进右边 56% 的抽屉根本没法玩 ——
 * 小屋里要下棋、出摊要摆一厨房的家什。按下按钮直接进去,
 * 操作条压在画面底下,细节开成弹窗。
 */
const FULL_SCENES = new Set(['hut', 'service']);

const icon = (name, size = '') =>
    `<i class="px-icon px-icon--${name}${size ? ' px-icon--' + size : ''}"></i>`;

export class UI {
    /**
     * @param {object} deps
     * @param {()=>object} deps.getState
     * @param {(fn:(s:object)=>any)=>any} deps.mutate  改存档并触发保存+重绘
     * @param {()=>void} deps.onFly
     * @param {(screen:string)=>void} [deps.onScreen] 切页时通知,用来换舞台上的场景
     */
    constructor({ getState, mutate, onFly, onScreen, service }) {
        this.getState = getState;
        this.mutate = mutate;
        this.onFly = onFly;
        this.onScreen = onScreen;
        /** 出摊那一场。局面在它手里,面板只是它的一个视图 */
        this.service = service;
        /** 抽屉里现在开着哪一页。null = 没开,整块画面都看得见 */
        this.screen = null;
        this.toastTimer = null;
        /** 正在下的那局四子棋。不进存档 —— 一局棋没必要跨会话保留。 */
        this.board = null;
        this.c4turn = null;
    }

    mount() {
        this.$panel = $('#panel');
        this.$hud = $('#hud');
        this.$toast = $('#toast');
        this.$drawer = $('#drawer');
        this.$drawerTitle = $('#drawerTitle');
        this.$sceneBar = $('#sceneBar');
        this.$kitchen = $('#kitchen');
        this.$modal = $('#modal');
        this.$modalTitle = $('#modalTitle');
        this.$modalBody = $('#modalBody');
        this.$rails = ['#railLeft', '#railRight', '#railBottom'].map($);

        for (const rail of this.$rails) {
            rail.addEventListener('click', e => {
                const btn = e.target.closest('[data-screen]');
                if (btn) { sfx.play('tab'); this.go(btn.dataset.screen); return; }
                const act = e.target.closest('[data-act]');
                if (act) { sfx.play('click'); this.handle(act.dataset.act, act.dataset); }
            });
        }
        $('#drawerClose').addEventListener('click', () => { sfx.play('tab'); this.go(null); });
        $('#modalClose').addEventListener('click', () => { sfx.play('tab'); this.openModal(null); });
        this.bindKitchen();
        // 场景条和弹窗里的按钮走同一套委托
        for (const host of [this.$sceneBar, this.$modalBody]) {
            host.addEventListener('click', e => {
                const nav = e.target.closest('[data-screen]');
                if (nav) { sfx.play('tab'); return this.go(nav.dataset.screen || null); }
                const pop = e.target.closest('[data-modal]');
                if (pop) { sfx.play('tab'); return this.openModal(pop.dataset.modal); }
                const btn = e.target.closest('[data-act]');
                if (btn) { sfx.play('click'); this.handle(btn.dataset.act, btn.dataset); }
            });
        }
        // HUD 里目前只有静音一个按钮,但也走委托 —— renderHud 每秒可能重绘
        this.$hud.addEventListener('click', e => {
            const btn = e.target.closest('[data-act]');
            if (btn) this.handle(btn.dataset.act, btn.dataset);
        });
        // 面板内所有按钮走事件委托,重绘后不用重新绑定
        this.$panel.addEventListener('click', e => {
            const nav = e.target.closest('[data-screen]');
            if (nav) return this.go(nav.dataset.screen);
            const btn = e.target.closest('[data-act]');
            // 点击音统一在这儿发,不在每个 case 里各发各的 —— 那样迟早漏。
            // 有自己音色的动作(落子、转卦)在 case 里再补一个,限流会挡掉重复。
            if (btn) { sfx.play('click'); this.handle(btn.dataset.act, btn.dataset); }
        });
        this.render();
    }

    /**
     * 开 / 关抽屉。传 null 就是收起来。
     * 再点一次正开着的那一页也是收起来 —— 按钮和抽屉是同一个开关,
     * 不然玩家会去找关闭按钮。
     */
    go(screen) {
        const next = this.screen === screen ? null : screen;
        this.screen = next;
        this.modal = null;            // 换页就把弹窗收了
        this.onScreen?.(next);        // 舞台那块画面跟着切
        this.render();
    }

    /* ---------- 动作 ---------- */

    handle(act, data) {
        const s = this.getState();
        switch (act) {
            case 'fly':
                this.go(null);            // 抽屉压在飞行画面上面,先收起来
                if (s.dailyTries <= 0) return this.toast('今天的觅食次数用完了,明天再来', 'coin');
                this.onFly();
                break;

            case 'cook': {
                const r = this.mutate(st => rules.cook(st, data.id));
                if (!r.ok) return this.toast(this.explain(r), 'erkuai');
                this.toast(`做好了 ${RECIPES.find(x => x.id === data.id).name},+${data.reward} 鸥币`, 'coin');
                this.showEvents(r.events);
                break;
            }

            case 'chat': {
                this.mutate(st => { st.chatNode = Number(data.next); });
                break;
            }

            case 'stall': {
                // 空着 -> 第一道解锁的菜 -> 下一道 -> … -> 撤下,循环
                const slot = Number(data.slot);
                const open = RECIPES.filter(r => s.unlockedRecipes.includes(r.id));
                const cur = s.stalls[slot]?.recipe ?? null;
                const i = open.findIndex(r => r.id === cur);
                const next = i + 1 >= open.length ? null : open[i + 1].id;
                const r = this.mutate(st => rules.setStall(st, slot, next));
                if (!r.ok) return this.toast(r.reason, 'shop');
                break;
            }

            case 'upgrade': {
                const r = this.mutate(st => rules.buyUpgrade(st, data.key));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(`${UPGRADES[data.key].name} 升到 ${r.events[0].level} 级`, UPGRADES[data.key].icon);
                break;
            }

            case 'buywear': {
                const r = this.mutate(st => rules.buyCosmetic(st, data.id));
                if (!r.ok) return this.toast(r.reason, 'cap');
                this.toast(`${r.cosmetic.name} —— 戴上了`, 'cap');
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'wear': {
                const r = this.mutate(st => rules.wearCosmetic(st, data.id));
                if (!r.ok) return this.toast(r.reason, 'cap');
                break;
            }

            case 'hire': {
                const r = this.mutate(st => rules.hireCrew(st, data.id));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(`${r.crew.name} 来摊上帮忙了 —— ${r.crew.line}`, 'waou');
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'divine': {
                sfx.play('fortune');
                const r = this.mutate(st => rules.castFortune(st));
                if (!r.ok) return this.toast(r.reason, 'star');
                this.toast(`${r.mark} · ${r.fortune.name}`, 'star');
                break;
            }

            case 'drink': {
                const r = this.mutate(st => rules.giveDrink(st));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(r.events[0].text, r.drink.icon);
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'c4new':
                this.board = c4.newBoard();
                this.c4turn = 'w';
                this.c4done = false;
                this.render();
                break;

            case 'c4drop': {
                if (this.c4turn !== 'w' || c4.winner(this.board)) return;
                const next = c4.drop(this.board, Number(data.col), 'w');
                if (!next) return this.toast('这一列满了', 'shop');
                sfx.play('stone');
                this.board = next;
                this.c4turn = 'b';
                this.render();
                if (c4.winner(this.board)) this.c4Settle(); else this.c4Reply();
                break;
            }

            case 'savecard': {
                const img = document.querySelector('[data-card]');
                if (!img?.src) return this.toast('图还没画好,等一下', 'star');
                const a = document.createElement('a');
                a.href = img.src;
                a.download = `哇鸥今日签-${now().toDateString()}.png`;
                a.click();
                // 手机上 <a download> 常常被拦,所以这句话不是废话
                this.toast('存不下来的话,长按图片保存', 'postcard');
                break;
            }

            case 'skiptut':
                this.mutate(st => { st.tutorial = TUTORIAL_DONE; });
                this.toast('引导关了。想再看一遍就清档重开', 'star');
                break;

            case 'open': {
                const r = this.service?.open(data.id);
                if (!r?.ok) return this.toast(this.explain(r ?? { reason: '现在开不了张' }), 'shop');
                break;
            }

            case 'serve': {
                const r = this.service?.serve(Number(data.id));
                if (!r?.ok) return this.toast(r?.reason ?? '给不了', 'coin');
                this.toast(`${r.recipe.name} 卖出去了,+${r.coins} 鸥币`, 'coin');
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'kitchen': {
                const r = this.mutate(st => rules.buyKitchen(st, data.key));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(`${KITCHEN[data.key].name} 升到 ${r.level} 级`, 'coin');
                break;
            }

            case 'plate': {
                const r = this.mutate(st => rules.buyPlate(st, data.key));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(r.worn ? `换上${r.plate.name}` : `买下${r.plate.name}`, 'coin');
                break;
            }

            case 'buy': {
                const r = this.mutate(st => rules.buyFood(st, data.key, Number(data.n)));
                if (!r.ok) return this.toast(r.reason, 'coin');
                this.toast(`${FOODS[r.key].name} ×${r.n},花了 ${r.cost} 鸥币`, FOODS[r.key].icon);
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'mute':
                this.toast(sfx.toggleMute() ? '静音了' : '音效开着', 'star');
                this.renderHud();
                break;

            case 'export': this.exportCode(); break;
            case 'import': this.importCode(); break;
            case 'reset':  this.resetSave();  break;
        }
    }

    explain(r) {
        if (!r.missing?.length) return r.reason;
        const what = r.missing.map(m => `${FOODS[m.key]?.name ?? m.key}×${m.need}`).join('、');
        return `还差 ${what}`;
    }

    /** 回来时的离线结算,单独弹一条长的 —— 这是放置玩法最该被看见的一刻 */
    offlineToast(e) {
        const h = Math.floor(e.awayMs / 3600_000);
        const m = Math.round((e.awayMs % 3600_000) / 60_000);
        const away = h ? `${h} 小时${m ? m + ' 分' : ''}` : `${m} 分钟`;
        if (e.served === 0) {
            const fed = e.show?.fed
                ? `,不过表演收到了 ${Object.entries(e.show.got).map(([k, n]) => `${FOODS[k].name}×${n}`).join('、')}`
                : '';
            return this.toast(`你走了 ${away},摊子上没材料了${fed}`, 'shop');
        }
        const what = Object.entries(e.byRecipe)
            .map(([id, n]) => `${RECIPES.find(r => r.id === id)?.name ?? id}×${n}`).join('、');
        const capped = e.capped ? '(货架放不下更多了)' : '';
        const fed = e.show?.fed
            ? ` 表演收到 ${Object.entries(e.show.got).map(([k, n]) => `${FOODS[k].name}×${n}`).join('、')}。`
            : '';
        // 事件只报个数,细节在大坝页的日志里 —— 一条吐司塞六件事没人读得完
        const ev = e.events?.length ? ` 坝上还发生了 ${e.events.length} 件事。` : '';
        this.toast(`你走了 ${away},摊子卖出 ${what},赚了 ${e.coins} 鸥币${capped}。${fed}${ev}`, 'coin');
    }

    /**
     * 把规则层返回的事件依次弹出来。
     *
     * 间隔必须 >= 吐司自己的显示时长,否则后一条会在前一条还没看完时就盖上去 ——
     * 离线结算那条尤其容易被紧随其后的成就顶掉,而它恰恰是最该被看见的。
     */
    showEvents(events = []) {
        const off = events.find(e => e.type === 'offline');
        if (off) this.offlineToast(off);

        let queue = events.filter(e => e.type !== 'cook' && e.type !== 'order' && e.type !== 'offline');

        // 一次冒出一大串就并成一条。挂机久了、老档补判成就,能一口气来十几个 ——
        // 一条 2.6 秒排下去要刷半分钟,而且前面的还没看完就被顶掉了。
        const ach = queue.filter(e => e.type === 'achievement');
        if (ach.length > 3) {
            const f = ach.reduce((n, e) => n + e.caps, 0);
            queue = queue.filter(e => e.type !== 'achievement');
            queue.unshift({ type: 'many', text: `一口气达成 ${ach.length} 个成就 · 瓶盖 +${f}` });
        }

        const start = off ? TOAST_MS + 200 : 400;      // 离线那条先让它读完
        queue.forEach((e, i) => setTimeout(() => {
            if (e.type === 'levelup')     { sfx.play('levelup'); this.toast(`升级!你现在是 Lv.${e.level}`, 'star'); }
            if (e.type === 'recipe')      this.toast(`解锁新食谱:${e.recipe.name}`, e.recipe.icon);
            if (e.type === 'achievement') {
                sfx.play('achieve');
                this.toast(`达成成就:${e.achievement.name} · 瓶盖 +${e.caps}`, 'trophy');
            }
            if (e.type === 'postcard')    { sfx.play('get'); this.toast(`获得明信片「${POSTCARDS[e.id].name}」`, 'postcard'); }
            if (e.type === 'upgrade')     this.toast(`${UPGRADES[e.key].name} 升到 ${e.level} 级`, UPGRADES[e.key].icon);
            if (e.type === 'affinity')    this.toast(`好感度 +${e.by}`, 'waou');
            if (e.type === 'event')       { sfx.play('event'); this.toast(this.eventLine(e), 'map'); }
            if (e.type === 'crew')        this.toast(`${e.crew.name} 加入了摊子`, 'waou');
            if (e.type === 'many')        { sfx.play('achieve'); this.toast(e.text, 'trophy'); }
        }, start + i * (TOAST_MS + 200)));
    }

    /**
     * 篆新市场。**鸥币唯一的第二个去处**,也是稀有材料唯一的稳定来源。
     *
     * 每天限量,而且限量本身要显眼 —— 玩家得一眼看出「今天还能买几个」,
     * 否则会以为可以无限买,然后在这里把钱花光。
     */
    marketView() {
        const s = this.getState();
        if (!rules.marketOpen(s)) {
            return `<div class="px-panel px-panel--sea" style="margin-bottom:28px">
                <p>${icon('shop')} 篆新市场</p>
                <p class="px-muted">收摊的阿姨每天顺路来坝上摆一小摊,缺什么可以拿鸥币换。
                   <strong>Lv.${MARKET_LEVEL}</strong> 之后她才认得你。</p>
            </div>`;
        }
        const rows = Object.entries(MARKET).map(([k, m]) => {
            const left = rules.marketLeft(s, k);
            const can = left > 0 && s.coins >= m.price;
            return `
            <div class="px-ach">
                ${icon(FOODS[k].icon, 'lg')}
                <div style="flex:1">
                    <strong>${FOODS[k].name}</strong>
                    <p class="px-muted">${icon('coin')} ${m.price} / 个 ·
                        今天还剩 <strong>${left}</strong> / ${m.daily}</p>
                </div>
                <button class="px-btn px-btn--sm" data-act="buy" data-key="${k}" data-n="1"
                        ${can ? '' : 'disabled'}>买 1</button>
                <button class="px-btn px-btn--sm px-btn--sea" data-act="buy" data-key="${k}" data-n="99"
                        ${can ? '' : 'disabled'}>全要</button>
            </div>`;
        }).join('');
        return `
        <h3 style="margin-bottom:6px">篆新市场</h3>
        <p class="px-muted" style="margin-bottom:12px">
            收摊的阿姨顺路来坝上摆一小摊。<strong>每样每天就那么点</strong> ——
            她也只是顺路,不是给你开批发的。零点补货。</p>
        <div style="margin-bottom:28px">${rows}</div>`;
    }

    /**
     * 只更新摊位进度条的宽度,不动 innerHTML。
     * 整页重绘每秒一次会把存档页的文本框内容冲掉,也很浪费。
     */
    paintStallBars() {
        if (this.screen !== 'cook') return;
        const s = this.getState();
        const info = rules.stallInfo(s);
        for (const el of this.$panel.querySelectorAll('[data-bar]')) {
            const st = s.stalls[Number(el.dataset.bar)];
            if (!st) continue;
            el.style.width = Math.min(100, (st.ms / info.serveMs) * 100) + '%';
        }
    }

    /** 轮到哇鸥。停一会儿再落子 —— 秒回像机器,它得「想一下」。 */
    c4Reply() {
        setTimeout(() => {
            if (this.c4turn !== 'b' || !this.board) return;
            const col = c4.aiMove(this.board, 'b');
            if (col >= 0) this.board = c4.drop(this.board, col, 'b') ?? this.board;
            this.c4turn = 'w';
            this.render();
            this.c4Settle();
        }, 700 + Math.random() * 600);
    }

    /** 一局下完:记战绩、加好感度 */
    c4Settle() {
        const res = c4.winner(this.board);
        if (!res || this.c4done) return;
        this.c4done = true;
        const r = this.mutate(st => rules.recordC4(st, res.who));
        this.showEvents(r.events);
    }

    toast(text, ico = 'star') {
        this.$toast.innerHTML = `${icon(ico)} ${text}`;
        this.$toast.classList.remove('is-open', 'pop');
        void this.$toast.offsetWidth;
        this.$toast.classList.add('is-open', 'pop');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.$toast.classList.remove('is-open'), TOAST_MS);
    }

    /* ---------- 存档码 ---------- */

    async exportCode() {
        const { encodeSave } = await import('./storage/savecode.js');
        const { storage } = await import('./storage/index.js');
        await storage.flush();
        const code = await encodeSave(this.getState());
        const box = $('#codeBox');
        box.value = code;
        box.select();
        try {
            await navigator.clipboard.writeText(code);
            this.toast('存档码已复制,贴到备忘录就不会丢了', 'postcard');
        } catch {
            this.toast('存档码已生成,请手动复制下面这串', 'postcard');
        }
    }

    async importCode() {
        const code = $('#codeBox').value.trim();
        if (!code) return this.toast('先把存档码粘贴到框里', 'postcard');
        const { decodeSave } = await import('./storage/savecode.js');
        const { migrate } = await import('./state.js');
        const { storage } = await import('./storage/index.js');
        try {
            const parsed = await decodeSave(code);
            const next = migrate(parsed);
            if (!next) throw new Error('这个存档码来自不兼容的版本');
            await storage.replace(next);
            location.reload();
        } catch (err) {
            this.toast(err.message, 'postcard');
        }
    }

    async resetSave() {
        if (!confirm('确定清空存档重新开始?建议先导出存档码。')) return;
        const { storage } = await import('./storage/index.js');
        await storage.clear();
        location.reload();
    }

    /* ---------- 渲染 ---------- */

    /** 开 / 关场景里的弹窗。传 null 关掉 */
    openModal(kind) {
        this.modal = kind || null;
        this.render();
    }

    render() {
        this.advanceTutorial();
        this.renderHud();
        this.renderRails();

        // 整页场景不走抽屉:画面铺满,操作条压在底下
        const full = FULL_SCENES.has(this.screen);
        this.$sceneBar.hidden = !full;
        if (full) {
            this.$sceneBar.innerHTML = this.sceneBar();
            this.$drawer.hidden = true;
            this.$panel.innerHTML = '';
            this.renderKitchen();
            this.renderModal();
            this.paintCanvases();
            return;
        }
        this.$modal.hidden = true;
        this.$kitchen.hidden = true;

        const view = {
            dock: () => this.viewDock(),
            bag: () => this.viewBag(),
            codex: () => this.viewCodex(),
            cook: () => this.viewCook(),
            postcard: () => this.viewPostcards(),
            achievement: () => this.viewAchievements(),
            wear: () => this.viewWear(),
            chat: () => this.viewChat(),
            save: () => this.viewSave(),
        }[this.screen];

        this.$drawer.hidden = !view;
        if (!view) { this.$panel.innerHTML = ''; return; }
        this.$drawerTitle.textContent = DRAWER_TITLE[this.screen] ?? '';
        this.$panel.innerHTML = this.coachView() + view();
        this.paintCanvases();
    }

    renderHud() {
        const s = this.getState();
        const w = WEATHER[s.weather] ?? WEATHER.sunny;
        const pct = Math.min(100, Math.round(s.exp / s.expNext * 100));
        this.$hud.innerHTML = `
            <span class="px-chip">${icon('coin')} <strong>${s.coins}</strong> 鸥币</span>
            <span class="px-chip">${icon(w.icon)} ${w.name}</span>
            <span class="px-chip">${icon('star')} Lv.<strong>${s.level}</strong></span>
            <span class="px-chip">${icon('cap')} <strong>${s.caps}</strong> 瓶盖</span>
            <span class="px-chip">${icon('waou')} 觅食 <strong>${s.dailyTries}</strong>/${DAILY_TRIES}</span>
            <button class="px-chip px-chip--btn" data-act="mute" title="音效开关">
                ${icon('star')} 音效 <strong>${sfx.isMuted() ? '关' : '开'}</strong></button>
            <div class="px-bar px-bar--exp" style="flex:1;min-width:160px">
                <div class="px-bar__fill" style="width:${pct}%"></div>
                <div class="px-bar__label">经验 ${s.exp} / ${s.expNext}</div>
            </div>`;
    }

    /**
     * 引导推进。**每次重绘都跑一遍,靠读状态判定,不靠「玩家点了哪个按钮」** ——
     * 挂在按钮上的引导,一旦玩家用别的路径达成就会卡在原地等一个不会来的点击。
     *
     * 里面调了 mutate(),而 mutate 会再触发一次 render,所以要个闸门防递归。
     * 递归回来的那次 render 用的是新状态,外层接着往下走也是新状态,不会画错。
     */
    advanceTutorial() {
        const s = this.getState();
        if (this._tutBusy || s.tutorial >= TUTORIAL.length) return;
        if (!TUTORIAL[s.tutorial].done(s, this)) return;

        this._tutBusy = true;
        const last = s.tutorial + 1 >= TUTORIAL.length;
        this.mutate(st => {
            st.tutorial = last ? TUTORIAL_DONE : st.tutorial + 1;
            if (last) st.caps += TUTORIAL_GIFT;
        });
        this._tutBusy = false;

        sfx.play(last ? 'achieve' : 'get');
        if (last) {
            this.toast(`会玩了。送你 ${TUTORIAL_GIFT} 根瓶盖 —— 够去「装扮」买顶斗笠`, 'cap');
        }
    }

    /** 引导条。走完了就什么都不画。 */
    coachView() {
        const s = this.getState();
        if (s.tutorial >= TUTORIAL.length) return '';
        const step = TUTORIAL[s.tutorial];
        return `
        <div class="px-coach">
            <div class="px-coach__no">${s.tutorial + 1}/${TUTORIAL.length}</div>
            <div style="flex:1">
                <strong>${step.title}</strong>
                <p>${step.text}</p>
            </div>
            <button class="px-btn px-btn--sm" data-act="skiptut">不用了</button>
        </div>`;
    }

    /**
     * 三条按钮。左边是玩法、右边是收集与状态、下面是动作。
     * **不再有页签** —— 页签的语义是「切换整页」,而这儿画面从不切换,
     * 只是在它上面开一个抽屉。
     */
    renderRails() {
        const s = this.getState();
        const btn = ([id, name, ico]) =>
            `<button class="px-railbtn" data-screen="${id}"
                     aria-selected="${this.screen === id}">
                ${icon(ico, 'lg')}<span>${name}</span></button>`;

        this.$rails[0].innerHTML = [
            ['dock', '大坝', 'map'], ['service', '出摊', 'shao_erkuai'],
            ['cook', '摊子', 'shop'], ['hut', '小屋', 'waou'],
        ].map(btn).join('');

        this.$rails[1].innerHTML = [
            ['bag', '背包', 'backpack'], ['codex', '图鉴', 'erkuai'],
            ['postcard', '明信片', 'postcard'], ['achievement', '成就', 'trophy'],
        ].map(btn).join('');

        this.$rails[2].innerHTML =
            `<button class="px-railbtn px-railbtn--go" data-act="fly"
                     ${s.dailyTries <= 0 ? 'disabled' : ''}>
                ${icon('waou', 'lg')}<span>出发觅食 ${s.dailyTries}/${DAILY_TRIES}</span></button>`
            + [['wear', '装扮', 'cap'], ['chat', '聊天', 'heart'],
               ['save', '存档', 'coin']].map(btn).join('');
    }

    viewDock() {
        const s = this.getState();
        const w = WEATHER[s.weather] ?? WEATHER.sunny;
        return `
                <p class="px-muted" style="margin-bottom:20px">
            ${icon(w.icon)} ${w.name} · ${w.note} ·
            ${icon('waou')} ${rules.seasonNow().name}季 · ${rules.seasonNow().note}</p>
        ${this.hutHint()}
        ${this.showPanel()}
        ${this.eventLog()}
        ${this.stallSummary()}`;
    }

    /** 一条事件的一句话总结,吐司用。日志里显示的是事件本身的叙述。 */
    eventLine(e) {
        const g = e.got ?? {};
        const bits = [];
        for (const [k, n] of Object.entries(g.food ?? {})) bits.push(`${FOODS[k].name}×${n}`);
        if (g.coins)     bits.push(`${g.coins} 鸥币`);
        if (g.affinity)  bits.push(`好感度 +${g.affinity}`);
        if (g.caps)  bits.push(`瓶盖 +${g.caps}`);
        if (g.item)      bits.push(ITEMS[g.item].name);
        if (g.postcard !== null && g.postcard !== undefined) {
            bits.push(`明信片「${POSTCARDS.find(p => p.id === g.postcard)?.name}」`);
        }
        return bits.length ? `${e.ev.name} —— ${bits.join('、')}` : e.ev.name;
    }

    /**
     * 大坝上最近发生的事。
     *
     * 存的是事件当时的原话而不是 id:事件表以后会改,改完拿 id 反查
     * 会让老日志对不上号。日志是「发生过什么」的记录,不是索引。
     */
    eventLog() {
        const log = this.getState().log;
        if (!log.length) {
            return `<p class="px-muted" style="margin-bottom:24px">
                它在坝上待着的时候,时不时会撞上点事。回来就记在这儿。</p>`;
        }
        const rows = [...log].reverse().slice(0, 6).map(e =>
            `<li style="margin-bottom:6px">${e.text}</li>`).join('');
        return `
        <h3 style="margin-bottom:10px">坝上最近发生的事</h3>
        <ul class="px-muted" style="margin:0 0 24px;padding-left:20px;line-height:1.8">${rows}</ul>`;
    }

    /**
     * 伙计鸥。只有冬天能招 —— 鸥群不在昆明的时候没人可招,
     * 这条比任何「等级 ≥ N」都自然。
     */
    crewView() {
        const s = this.getState();
        const season = rules.seasonNow();
        const cards = CREW.map(c => {
            const hired = s.crew.includes(c.id);
            const okAff = s.affinity >= c.affinity;
            return `<div class="px-panel ${hired ? 'px-panel--gold' : ''}" style="padding:12px 14px">
                <p style="margin-bottom:4px">${icon('waou', 'lg')} <strong>${hired || okAff ? c.name : '???'}</strong>
                   ${hired ? '<span class="px-tag px-tag--leaf">在摊上</span>' : ''}</p>
                <p class="px-muted" style="font-size:12.5px;line-height:1.6;margin-bottom:8px">
                    ${hired || okAff ? c.desc : `好感度 ${c.affinity} 解锁`}
                    ${hired ? `<br>${c.line}` : ''}</p>
                ${hired ? '' : `<button class="px-btn px-btn--sm" data-act="hire" data-id="${c.id}"
                    ${season.canHire && okAff && s.coins >= c.cost ? '' : 'disabled'}>
                    ${icon('coin')} ${c.cost}</button>`}
            </div>`;
        }).join('');
        return `
        <h3 style="margin-bottom:6px">伙计鸥
            <span class="px-muted" style="font-size:13px">${s.crew.length} / ${CREW.length}</span></h3>
        <p class="px-muted" style="margin-bottom:12px;font-size:13px">
            ${season.canHire
                ? '鸥群这会儿在昆明,可以招人。'
                : `现在是${season.name}季,鸥群不在 —— <strong>冬天(11 月–次年 3 月)</strong>才招得到人。`}
            好感度越高,哇鸥肯介绍的亲戚越多。</p>
        <div class="px-grid" style="--min:210px;margin-bottom:28px">${cards}</div>`;
    }

    /* ---------- 小屋 ---------- */

    /**
     * 整页场景底下那条操作条。**画面铺满,操作压在底边** ——
     * 小屋里要下棋、要看卦,这些塞进右边 56% 的抽屉是玩不了的。
     */
    sceneBar() {
        const s = this.getState();
        if (this.screen === 'hut') {
            const slot = hourSlot(now());
            const back = `<button class="px-btn px-btn--sm px-btn--wood" data-screen="">回大坝</button>`;
            if (!slot) {
                return `<span class="px-chip px-chip--dark">${icon('waou')} 它这会儿在大坝上 ·
                        ${HOURS.noon.span} / ${HOURS.evening.span} 回来</span>
                        ${this.fortuneCard() ? `<button class="px-btn px-btn--sm" data-modal="fortune">今日签</button>` : ''}
                        ${back}`;
            }
            if (slot === 'night') {
                return `<span class="px-chip px-chip--dark">${icon('waou')} 睡着了,别吵它</span>
                        ${this.fortuneCard() ? `<button class="px-btn px-btn--sm" data-modal="fortune">今日签</button>` : ''}
                        ${back}`;
            }
            const drink = DRINKS[s.drink];
            return `
            <span class="px-chip px-chip--dark">${icon('heart')} 好感度 ${s.affinity}</span>
            <button class="px-btn px-btn--sm" data-modal="fortune">${icon('star')} 占卜</button>
            <button class="px-btn px-btn--sm" data-modal="c4">${icon('shop')} 下棋</button>
            <button class="px-btn px-btn--sm" data-modal="drink" ${drink ? '' : 'disabled'}>
                ${icon(drink ? drink.icon : 'coin')} ${drink ? '请它喝' : '今天给过了'}</button>
            ${back}`;
        }
        if (this.screen === 'service') {
            const back = `<button class="px-btn px-btn--sm px-btn--wood" data-screen="">收摊回大坝</button>`;
            const shop = `<button class="px-btn px-btn--sm" data-modal="kitchen">${icon('stove')} 后厨</button>`;
            // 打烊时留一句说明和两个出口。**后厨照样进得去** ——
            // 摊子没开正好是升厨具的时候,一起关掉等于罚玩家来早了。
            if (!rules.serviceOpen()) {
                return `<span class="px-chip px-chip--dark">${icon('stove')} 摊子这会儿没开
                        · ${SERVICE.span}</span>
                        ${shop}
                        <button class="px-btn px-btn--sm" data-screen="hut">${icon('waou')} 去小屋</button>
                        ${back}`;
            }
            const v = this.service?.snapshot();
            return `
            ${v ? `<span class="px-chip px-chip--dark">${icon('coin')} 卖出 ${v.sold}</span>
                   <span class="px-chip px-chip--dark">${icon('shop')} 出餐台 ${v.stockCount}</span>` : ''}
            ${shop}
            ${back}`;
        }
        return `<button class="px-btn px-btn--sm px-btn--wood" data-screen="">回大坝</button>`;
    }

    /**
     * 今日签的卡片。今天还没转就返回空串 —— 场景条拿它当「有没有签」的判据。
     *
     * 图是 canvas 画完转成 data URL 塞进 <img> 的,不是直接摆一块 canvas ——
     * **手机上长按 <img> 才有「保存图片」,长按 canvas 没有。**
     */
    fortuneCard() {
        const s = this.getState();
        if (s.fortune === null || s.fortuneDate !== now().toDateString()) return '';
        return `
        <div class="px-cardbox">
            <img class="px-card" data-card alt="哇鸥今日运势">
            <div>
                <p class="px-muted" style="font-size:13px;line-height:1.8">
                    一天一张,明天的签是另一张。<br>
                    手机上<strong>长按图片</strong>就能存;电脑上点下面这个。
                </p>
                <button class="px-btn px-btn--sm" data-act="savecard"
                        style="margin-top:10px">存成图片</button>
            </div>
        </div>`;
    }

    /* ---------- 出摊的厨房 ---------- */

    /**
     * 厨房。**布局照着老爹快餐店那一路压成一屏**:
     * 上是订单(画在 canvas 上)、中是砧板/煎盘/灶台、左下是烤箱、右是食谱。
     *
     * 烤箱单独摆左下角不和那三件挤一排:它慢,是「放着不管」的那一类,
     * 和需要盯着的三件混在一起,玩家的眼睛不知道该看哪儿。
     */
    renderKitchen() {
        if (this.screen !== 'service') { this.$kitchen.hidden = true; return; }

        // 打烊。**不能直接 hidden 了事** —— 那样整页只剩底下两个按钮,
        // 画面和大坝一模一样,玩家不知道自己到底点开了什么(这就是那个
        // 「点出摊只有收摊和后厨」的 bug:摊子关着,界面什么都不说)。
        if (!rules.serviceOpen()) {
            this.$kitchen.hidden = false;
            this.$kitchen.innerHTML = `
                <div class="px-kclosed">
                    <p class="px-kclosed__t">${icon('stove', 'lg')} 摊子这会儿没开</p>
                    <p>出摊时间 <strong>${SERVICE.span}</strong><br>
                       哇鸥回草棚歇脚的时候,摊子跟着收。</p>
                    <p class="px-muted">折耳根这会儿正在坝上睡觉。<br>
                       等不及的话,可以先去<strong>后厨</strong>把厨具升了。</p>
                </div>`;
            return;
        }
        const v = this.service?.snapshot();
        if (!v) { this.$kitchen.hidden = true; return; }
        this.$kitchen.hidden = false;
        const s = this.getState();

        const mid = ['board', 'pan', 'stove'].map(k => this.toolBox(k, v)).join('');
        const oven = this.toolBox('oven', v);

        // 右边:手上在做的(可拖)+ 能开的菜
        const doing = v.dishes.length ? v.dishes.map(d => `
            <div class="px-chip2 ${d.busy ? 'px-chip2--busy' : ''}"
                 ${d.busy ? '' : `data-drag="${d.id}" data-tool="${d.tool}"`}>
                ${icon(FOODS[d.ing].icon)}
                <div style="flex:1;min-width:0">
                    <div>${d.stepName}</div>
                    <small>拖到${TOOLS[d.tool].name} · ${d.step + 1}/${d.total}</small>
                </div>
            </div>`).join('') : '<small class="px-muted">还没开工</small>';

        const menu = RECIPES.filter(r => s.unlockedRecipes.includes(r.id) && RECIPE_STEPS[r.id])
            .map(r => {
                const ok = rules.canAfford(s, r.cost) && v.stockCount < SERVICE.stockMax;
                return `<button class="px-recipebtn" data-act="open" data-id="${r.id}"
                                ${ok ? '' : 'disabled'}>
                    ${icon(r.icon)} <span style="flex:1">${r.name}</span></button>`;
            }).join('');

        const stock = Object.entries(v.stock).filter(([, o]) => o.n > 0).map(([id, o]) => {
            const r = RECIPES.find(x => x.id === id);
            const g = o.q > 0.85 ? 'good' : o.q > 0.6 ? 'raw' : 'burnt';
            return `<span class="px-chip" style="border-left:4px solid ${QUALITY[g].color}">
                ${icon(r.icon)} ${o.n}</span>`;
        }).join('') || '<small class="px-muted">空的</small>';

        // 订单排在最上面那条 —— **画在天空那一带**,不压住柜台外站着的人。
        // 画布上那几个人是「谁在等」,这排卡片是「我现在能给谁」,两件事各占一处。
        const orders = v.guests.map(g => {
            const r = RECIPES.find(x => x.id === g.want);
            const col = g.left > 0.45 ? 'leaf' : g.left > 0.2 ? 'gold' : 'coral';
            return `
            <div class="px-korder ${g.ready ? 'px-korder--ready' : ''}">
                ${icon(r.icon, 'lg')}
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px">${r.name}</div>
                    <div class="px-bar" style="height:6px;margin-top:3px">
                        <div class="px-bar__fill px-bar__fill--${col}"
                             style="width:${Math.round(g.left * 100)}%"></div>
                    </div>
                </div>
                <button class="px-btn px-btn--sm" data-act="serve" data-id="${g.id}"
                        ${g.ready ? '' : 'disabled'}>给</button>
            </div>`;
        }).join('');

        this.$kitchen.innerHTML = `
            <div class="px-korders">${orders}</div>
            <div class="px-ktools">${mid}</div>
            <div class="px-koven">${oven}</div>
            <div class="px-kside">
                <h4>手上在做</h4>${doing}
                <h4>出餐台 ${v.stockCount}/${SERVICE.stockMax}</h4>
                <div style="display:flex;gap:4px;flex-wrap:wrap">${stock}</div>
                <h4>开一道</h4>${menu}
            </div>`;
    }

    /** 一件厨具:名字 + 几个格子。格子里有活就画火候条 */
    toolBox(key, v) {
        const t = TOOLS[key];
        const info = rules.toolInfo(this.getState(), key);
        const slots = (v.tools[key] ?? []).map((j, i) => {
            if (!j) return `<div class="px-slotbox px-slotbox--empty"></div>`;
            const p = Math.min(1, j.p / 1.6);
            const winL = ((1 - t.window) / 1.6) * 100;
            const winW = ((t.window * 1.6) / 1.6) * 100;
            return `
            <div class="px-slotbox ${j.grade === 'good' ? 'px-slotbox--hot' : ''}"
                 data-take="${key}" data-slot="${i}" title="${j.name}">
                ${icon(FOODS[j.ing].icon)}
                <div class="px-slotbox__bar">
                    <div class="px-slotbox__win" style="left:${winL}%;width:${winW}%"></div>
                    <div class="px-slotbox__fill"
                         style="width:${Math.round(p * 100)}%;background:${QUALITY[j.grade].color}"></div>
                </div>
            </div>`;
        }).join('');
        return `
        <div class="px-tool" data-drop="${key}">
            <div class="px-tool__name">${icon(t.icon)} ${t.name}
                <small class="px-muted">Lv.${info.lv}</small></div>
            <div class="px-tool__slots">${slots}</div>
        </div>`;
    }

    /**
     * 厨房的操作:点格子端菜、拖牌子放菜。
     *
     * **拖拽走 pointer 事件不走 HTML5 drag** —— 后者在移动端基本不能用,
     * 而这游戏一半以上的人在手机上。pointer 事件桌面和触屏是同一套代码。
     */
    bindKitchen() {
        const K = this.$kitchen;

        K.addEventListener('click', e => {
            const take = e.target.closest('[data-take]');
            if (take) {
                sfx.play('serve' in {} ? 'click' : 'click');
                const r = this.service?.take(take.dataset.take, Number(take.dataset.slot));
                if (r?.done) {
                    sfx.play(r.grade === 'good' ? 'coin' : 'click');
                    this.toast(`${RECIPES.find(x => x.id === r.recipe).name} 装盘 · ${QUALITY[r.grade].name}`,
                               'shop');
                }
                return;
            }
            const act = e.target.closest('[data-act]');
            if (act) { sfx.play('click'); this.handle(act.dataset.act, act.dataset); }
        });

        let drag = null;
        const ghost = document.createElement('div');
        ghost.className = 'px-ghost';
        ghost.hidden = true;
        document.body.appendChild(ghost);

        const dropUnder = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest('[data-drop]') ?? null;
        };

        K.addEventListener('pointerdown', e => {
            const chip = e.target.closest('[data-drag]');
            if (!chip) return;
            drag = { id: Number(chip.dataset.drag), tool: chip.dataset.tool };
            ghost.innerHTML = chip.innerHTML;
            ghost.hidden = false;
            ghost.style.left = `${e.clientX - 24}px`;
            ghost.style.top = `${e.clientY - 18}px`;
            chip.setPointerCapture?.(e.pointerId);
            e.preventDefault();
        });

        K.addEventListener('pointermove', e => {
            if (!drag) return;
            ghost.style.left = `${e.clientX - 24}px`;
            ghost.style.top = `${e.clientY - 18}px`;
            for (const t of K.querySelectorAll('[data-drop]')) t.classList.remove('px-tool--drop');
            const hit = dropUnder(e.clientX, e.clientY);
            if (hit && hit.dataset.drop === drag.tool) hit.classList.add('px-tool--drop');
        });

        const end = e => {
            if (!drag) return;
            ghost.hidden = true;
            for (const t of K.querySelectorAll('[data-drop]')) t.classList.remove('px-tool--drop');
            const hit = dropUnder(e.clientX, e.clientY);
            if (hit) {
                const r = this.service?.place(drag.id, hit.dataset.drop);
                if (r?.ok) sfx.play('click');
                else if (r?.reason) this.toast(r.reason, 'shop');
            }
            drag = null;
        };
        K.addEventListener('pointerup', end);
        K.addEventListener('pointercancel', () => { ghost.hidden = true; drag = null; });
    }

    /** 场景里的弹窗。开着哪个由 this.modal 决定 */
    renderModal() {
        const kind = this.modal;
        this.$modal.hidden = !kind;
        if (!kind) return;
        const s = this.getState();
        const map = {
            fortune: ['今日签', () => this.modalFortune()],
            c4: [`海鸥四子棋 · ${s.c4.win} 胜 ${s.c4.lose} 负 ${s.c4.draw} 平`, () => this.c4View()],
            drink: ['请它喝一杯', () => this.modalDrink()],
            kitchen: ['后厨 · 添置家什', () => this.kitchenShop()],
        }[kind];
        if (!map) { this.$modal.hidden = true; return; }
        this.$modalTitle.textContent = map[0];
        this.$modalBody.innerHTML = map[1]();
        this.paintCanvases();
    }

    modalFortune() {
        const s = this.getState();
        const today = s.fortuneDate === now().toDateString();
        const f = today && s.fortune !== null ? FORTUNES[s.fortune] : null;
        if (!f) {
            return `
            <p class="px-muted" style="margin-bottom:14px">
                海鸥一族的老法子:看今天的天,再看捡来那枚贝壳上的纹。一天一次。</p>
            <button class="px-btn" data-act="divine">${icon('star', 'lg')} 转一卦</button>`;
        }
        return `
        <p><strong>${f.name}</strong> <span class="px-muted">· ${s.fortuneMark}</span></p>
        <p class="px-muted" style="margin:6px 0 14px">${f.text}</p>
        ${this.fortuneCard()}`;
    }

    modalDrink() {
        const drink = DRINKS[this.getState().drink];
        if (!drink) return '<p class="px-muted">今天这杯已经给它了。明天上线会再拿到一杯。</p>';
        return `
        <p style="margin-bottom:12px">${icon(drink.icon, 'xl')}</p>
        <p style="margin-bottom:14px">你今天带了一杯<strong>${drink.name}</strong>。</p>
        <button class="px-btn" data-act="drink">递过去</button>`;
    }

    /** 四子棋的棋盘。没开局就显示一个开始按钮。 */
    c4View() {
        if (!this.board) {
            return `<div class="px-panel px-panel--sea">
                <p class="px-muted" style="margin-bottom:12px">
                    黑石头白石头,谁先连成四个谁赢。石头是从大坝底下捡的。</p>
                <button class="px-btn px-btn--sm" data-act="c4new">摆棋盘</button>
            </div>`;
        }
        const res = c4.winner(this.board);
        const win = res && res.who !== 'draw'
            ? new Set(res.line.map(([c, r]) => c + ',' + r)) : new Set();

        const cells = [];
        for (let r = c4.ROWS - 1; r >= 0; r--) {
            for (let col = 0; col < c4.COLS; col++) {
                const who = this.board[col][r];
                const hot = win.has(col + ',' + r);
                cells.push(`<button class="c4cell${hot ? ' c4cell--win' : ''}"
                    data-act="c4drop" data-col="${col}"
                    ${res || this.c4turn !== 'w' ? 'disabled' : ''}>
                    ${who ? `<i class="c4stone c4stone--${who}"></i>` : ''}</button>`);
            }
        }
        const msg = !res ? (this.c4turn === 'w' ? '该你了 —— 点一列放下去' : '哇鸥在想…')
                  : res.who === 'w' ? '你赢了。哇鸥把头埋进草里不说话。'
                  : res.who === 'b' ? '哇鸥赢了。它得意地拍了两下翅膀。'
                  : '平局。棋盘满了,谁都没连成四个。';
        return `
        <div class="px-panel px-panel--sea">
            <div class="c4board">${cells.join('')}</div>
            <p class="px-muted" style="margin-top:12px">${msg}</p>
            ${res ? `<button class="px-btn px-btn--sm" data-act="c4new" style="margin-top:8px">再来一局</button>` : ''}
        </div>`;
    }

    viewBag() {
        const s = this.getState();

        // 不写「这样能做什么」—— 那是食谱那一页的事,写两遍等于两处要同步维护,
        // 而且背包本来就该是「我有什么」,不是「我该干嘛」
        const foods = FOOD_KEYS.map(k => {
            const n = s.backpack[k] ?? 0;
            return `
            <div class="px-bagitem ${n ? '' : 'px-bagitem--empty'}">
                ${icon(FOODS[k].icon, 'lg')}
                <div style="flex:1;min-width:0">
                    <strong>${FOODS[k].name}</strong> <span class="px-tag">${n}</span>
                </div>
            </div>`;
        }).join('');

        const items = Object.entries(ITEMS).map(([k, it]) => {
            const n = s.items[k] ?? 0;
            return `
            <div class="px-bagitem ${n ? '' : 'px-bagitem--empty'}">
                ${icon(it.icon, 'lg')}
                <div style="flex:1;min-width:0">
                    <strong>${it.name}</strong> <span class="px-tag">${n}</span>
                    <p class="px-muted">${it.desc}</p>
                </div>
            </div>`;
        }).join('');

        return `
                <p class="px-muted" style="margin-bottom:10px">食材</p>
        <div class="px-grid" style="--min:150px;margin-bottom:24px">${foods}</div>
        <p class="px-muted" style="margin-bottom:10px">道具 · 下次觅食自动使用</p>
        <div class="px-grid" style="--min:190px">${items}</div>`;
    }

    /**
     * 出摊。**画布负责看,这块面板负责操作。**
     * 在 440×310 的画布上做点击判定,手机上每个工位不到一个指头宽 ——
     * 那不是操作,那是抽奖。
     */
    // 旧的 viewService 删了 —— 出摊现在是整页 + DOM 厨房,见 renderKitchen()
    /** 图鉴单独一页。它记的是「见过什么」,背包记的是「手上有什么」,两件事。 */
    viewCodex() {
        return this.codexView();
    }

    /** 哇鸥回屋了就在大坝页说一声,免得玩家以为表演坏了 */
    hutHint() {
        const slot = hourSlot(now());
        if (!slot) return '';
        const what = slot === 'night' ? '在草棚里睡着了' : '回草棚歇着';
        return `<div class="px-panel px-panel--sea" style="margin-bottom:24px">
            <p>${icon('waou')} 哇鸥${what},大坝上暂时没有表演。
               <a href="#" data-screen="hut">去小屋看看</a></p>
            <p class="px-muted">${HOURS[slot].span} · 摊子照常开着,只是没人投喂了。</p>
        </div>`;
    }

    /**
     * 表演区。摊位一直在吃食材,这里是食材的被动来源 ——
     * 所以它得摆在大坝页的显眼位置,而不是藏进某个二级页。
     */
    showPanel() {
        const s = this.getState();
        const info = rules.showInfo(s);
        const cond = need => {
            if (need.level) return `Lv.${need.level}`;
            if (need.achievement) return `成就「${ACHIEVEMENTS.find(a => a.id === need.achievement)?.name}」`;
            if (need.postcards) return `${need.postcards} 张明信片`;
            return '';
        };
        const list = SHOWS.map(sh => {
            const on = info.shows.includes(sh);
            return `<span class="px-tag ${on ? 'px-tag--leaf' : ''}"
                ${on ? '' : 'style="background:var(--ink-soft)"'}>${on ? sh.name : cond(sh.need)}</span>`;
        }).join(' ');

        if (hourSlot(now())) {
            return `<div class="px-panel" style="margin-bottom:24px">
                <p class="px-muted">${icon('waou')} 表演暂停 —— 它回屋了。
                   ${info.shows.length} 个节目还留着,等它回来接着演。</p>
            </div>`;
        }
        return `<div class="px-panel px-panel--gold" style="margin-bottom:24px">
            <p>${icon('waou')} 没出去的时候,哇鸥在大坝上表演,路人看得高兴了会喂它东西。</p>
            <p class="px-muted" style="margin:10px 0 6px">会的节目 · 节目越多,围的人越多</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${list}</div>
        </div>`;
    }

    /** 摊位一句话状态。大坝页用,让人一进来就知道摊子在不在转。 */
    stallSummary() {
        const s = this.getState();
        const info = rules.stallInfo(s);
        const live = s.stalls.slice(0, info.slots).filter(st => st.recipe);
        if (live.length === 0) {
            return `<div class="px-panel px-panel--sea" style="margin-bottom:24px">
                <p>摊子空着 —— 去<a href="#" data-screen="cook">摊子</a>那边摆道菜上去,不在的时候它也能卖。</p>
            </div>`;
        }
        const perMin = live.reduce((sum, st) => {
            const r = RECIPES.find(x => x.id === st.recipe);
            return sum + (r ? r.reward * info.priceMul * 60_000 / info.serveMs : 0);
        }, 0);
        const short = live.filter(st => {
            const r = RECIPES.find(x => x.id === st.recipe);
            return r && !rules.canAfford(s, r.cost);
        });
        return `<div class="px-panel px-panel--sea" style="margin-bottom:24px">
            <p>摊子在卖 ${live.map(st => RECIPES.find(x => x.id === st.recipe).name).join('、')}
               · 约 <strong>${Math.round(perMin)}</strong> 鸥币/分钟</p>
            ${short.length ? `<p class="px-muted">${icon('erkuai')} 材料不够了,出去觅食补一趟</p>`
                           : `<p class="px-muted">离线也在卖,最多攒 ${info.offlineCapMs / 3600_000} 小时</p>`}
        </div>`;
    }

    /**
     * 食材图鉴。记的是**累计见过多少**,花掉了不减 ——
     * 图鉴是见闻,不是库存,拿背包反推会越玩越少。
     */
    codexView() {
        const s = this.getState();
        const seen = FOOD_KEYS.filter(k => (s.codex[k] ?? 0) > 0).length;
        const rows = FOOD_KEYS.map(k => {
            const n = s.codex[k] ?? 0;
            const f = FOODS[k];
            return `<div class="px-panel" style="padding:10px 12px;${n ? '' : 'opacity:.55'}">
                <p style="margin-bottom:2px">${icon(f.icon, 'lg')}
                   ${n ? f.name : '???'}
                   ${n ? `<span class="px-muted" style="font-size:12px">累计 ${n}</span>` : ''}</p>
                <p class="px-muted" style="font-size:12px;line-height:1.6;margin:0">
                    ${n ? FOOD_SOURCE[k] : '还没见过'}</p>
            </div>`;
        }).join('');
        return `
        <h3 style="margin-bottom:6px">食材图鉴
            <span class="px-muted" style="font-size:13px">${seen} / ${FOOD_KEYS.length}</span></h3>
        <p class="px-muted" style="margin-bottom:12px;font-size:13px">
            记的是累计见过多少,用掉了也不会减。</p>
        <div class="px-grid" style="--min:190px">${rows}</div>`;
    }

    viewCook() {
        const s = this.getState();
        const info = rules.stallInfo(s);
        const open = RECIPES.filter(r => s.unlockedRecipes.includes(r.id));

        /* ---- 摊位格子 ---- */
        const slots = Array.from({ length: 3 }, (_, i) => {
            if (i >= info.slots) {
                const need = [1, 3, 6][i];
                return `<div class="px-slot px-slot--locked" style="width:auto;height:auto;padding:14px 18px;flex-direction:column;gap:6px">
                    <span class="px-muted">Lv.${need} 解锁</span></div>`;
            }
            const st = s.stalls[i] ?? { recipe: null, ms: 0 };
            const r = RECIPES.find(x => x.id === st.recipe);
            if (!r) {
                return `<button class="px-btn px-btn--wood" data-act="stall" data-slot="${i}"
                    style="flex-direction:column;gap:6px;padding:16px 20px">
                    ${icon('shop', 'lg')} <span style="font-size:13px">空着 · 点一下摆菜</span></button>`;
            }
            const enough = rules.canAfford(s, r.cost);
            const pct = Math.min(100, (st.ms / info.serveMs) * 100);
            return `<div class="px-panel px-panel--gold" style="padding:12px 14px">
                <button class="px-btn px-btn--sm px-btn--wood" data-act="stall" data-slot="${i}"
                    style="width:100%;justify-content:flex-start;margin-bottom:10px">
                    ${icon(r.icon, 'lg')} ${r.name}</button>
                <div class="px-bar px-bar--sea" style="height:16px;margin-bottom:8px">
                    <div class="px-bar__fill" data-bar="${i}" style="width:${pct}%"></div>
                </div>
                <p class="px-muted" style="font-size:12px;line-height:1.6">
                    ${Math.round(r.reward * info.priceMul)} 鸥币一份<br>
                    吃 ${Object.entries(r.cost).map(([k, v]) => `${FOODS[k].name}×${v}`).join(' ')}
                    ${enough ? '' : '<br><span style="color:var(--coral)">材料不够,停着</span>'}
                </p>
            </div>`;
        }).join('');

        /* ---- 升级 ---- */
        const ups = Object.entries(UPGRADES).map(([key, u]) => {
            const lv = s.upgrades[key] ?? 1;
            const cost = upgradeCost(key, lv);
            return `<div class="px-panel" style="padding:12px 14px">
                <p style="margin-bottom:4px">${icon(u.icon, 'lg')} ${u.name} <span class="px-muted">Lv.${lv}</span></p>
                <p class="px-muted" style="font-size:12px;margin-bottom:10px">${u.desc}</p>
                ${cost === null
                    ? '<span class="px-tag px-tag--leaf">已满级</span>'
                    : `<button class="px-btn px-btn--sm" data-act="upgrade" data-key="${key}"
                         ${s.coins < cost ? 'disabled' : ''}>${icon('coin')} ${cost}</button>`}
            </div>`;
        }).join('');

        return `
                <p class="px-muted" style="margin-bottom:18px">
            摆上去的菜自己会卖 —— 买主是坝上溜达的野猫、麻雀和别的海鸥,
            它们不挑,给什么吃什么,所以给的钱也少。你不在的时候也照卖,
            不过没人看着,卖得慢些,货架也堆不下太多。<br>
            <strong>想卖给真正的游客,白天去「出摊」亲手做。</strong></p>
        <div class="px-grid" style="--min:230px;margin-bottom:28px">${slots}</div>

        ${this.marketView()}

        <h3 style="margin-bottom:12px">升级</h3>
        <div class="px-grid" style="--min:190px;margin-bottom:28px">${ups}</div>

        ${this.kitchenShop()}

        ${this.crewView()}`;
    }

    /**
     * 厨具和餐盘。**和摊位那四条升级分开摆** ——
     * 摊位那四条改的是「你不在的时候赚多少」,这几条改的是「你在的时候能多快」。
     * 两笔钱都从一个钱包出,但玩家心里该分得清:一条躺着赚,一条站着赚。
     */
    kitchenShop() {
        const s = this.getState();
        const tools = Object.entries(KITCHEN).map(([key, k]) => {
            const info = rules.toolInfo(s, key);
            return `
            <div class="px-ach">
                ${icon(TOOLS[key].icon, 'lg')}
                <div style="flex:1;min-width:0">
                    <strong>${k.name}</strong> <span class="px-muted">Lv.${info.lv}</span>
                    <p class="px-muted">${k.desc}</p>
                </div>
                ${info.cost === null
                    ? '<span class="px-tag px-tag--leaf">到顶了</span>'
                    : `<button class="px-btn px-btn--sm" data-act="kitchen" data-key="${key}"
                         ${s.coins < info.cost ? 'disabled' : ''}>${icon('coin')} ${info.cost}</button>`}
            </div>`;
        }).join('');

        const plates = Object.entries(PLATES).map(([key, p]) => {
            const own = s.kitchen.plates.includes(key);
            const on = s.kitchen.plate === key;
            return `
            <div class="px-ach ${on ? 'px-ach--got' : ''}">
                <span style="width:22px;height:22px;flex:none;background:${p.tint};
                             box-shadow:inset 0 0 0 3px var(--ink)"></span>
                <div style="flex:1;min-width:0"><strong>${p.name}</strong></div>
                <button class="px-btn px-btn--sm ${on ? 'px-btn--wood' : ''}"
                        data-act="plate" data-key="${key}"
                        ${on || (!own && s.coins < p.cost) ? 'disabled' : ''}>
                    ${on ? '用着' : own ? '换上' : `${icon('coin')} ${p.cost}`}</button>
            </div>`;
        }).join('');

        return `
        <h3 style="margin-bottom:6px">后厨</h3>
        <p class="px-muted" style="margin-bottom:12px">
            这几件管的是**你在摊上的时候**能做多快。上面那四条管的是你不在的时候。</p>
        <div style="margin-bottom:16px">${tools}</div>
        <h4 style="margin-bottom:8px">餐盘</h4>
        <div style="margin-bottom:24px">${plates}</div>`;
    }

    viewPostcards() {
        const s = this.getState();
        const cards = POSTCARDS.map(p => {
            const got = s.postcards.includes(p.id);
            return `
            <div class="px-panel ${got ? 'px-panel--gold' : ''}" style="text-align:center;width:168px">
                ${got ? icon(p.icon, 'xl') : `<div style="height:48px;line-height:48px" class="px-muted">?</div>`}
                <p style="margin-top:8px">${got ? p.name : '未获得'}</p>
                ${got && p.note ? `<p class="px-muted" style="font-size:12px;line-height:1.6;margin-top:4px">${p.note}</p>` : ''}
            </div>`;
        }).join('');
        return `
        <h2 style="margin-bottom:8px">明信片图鉴</h2>
        <p class="px-muted" style="margin-bottom:18px">已收集 ${s.postcards.length} / ${POSTCARDS.length} · 觅食时有机会掉落</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap">${cards}</div>`;
    }

    /**
     * 成就。按玩法分组显示 —— 平铺一长条的时候玩家看不出「还有哪块没碰过」,
     * 分组之后空着的那一栏本身就是引导。
     */
    viewAchievements() {
        const s = this.getState();
        const groups = Object.entries(ACH_GROUPS).map(([g, label]) => {
            const list = ACHIEVEMENTS.filter(a => a.group === g);
            const got = list.filter(a => s.achievements.includes(a.id)).length;
            const rows = list.map(a => {
                const has = s.achievements.includes(a.id);
                const f = CAP_VALUE[a.tier];
                return `
                <div class="px-ach ${has ? 'px-ach--got' : ''}">
                    ${icon(has ? 'trophy' : 'star')}
                    <div style="flex:1">
                        <strong>${a.name}</strong>
                        <p class="px-muted">${a.desc}</p>
                    </div>
                    <span class="px-tag ${has ? 'px-tag--leaf' : ''}">${icon('cap')} ${f}</span>
                </div>`;
            }).join('');
            return `
            <section style="margin-bottom:22px">
                <h3 style="margin-bottom:10px">${label}
                    <span class="px-muted" style="font-weight:normal">${got} / ${list.length}</span></h3>
                ${rows}
            </section>`;
        }).join('');

        return `
        <h2 style="margin-bottom:6px">成就 ${s.achievements.length} / ${ACHIEVEMENTS.length}</h2>
        <p class="px-muted" style="margin-bottom:18px">
            每条成就给瓶盖,瓶盖在「装扮」里花掉。全部达成共 ${TOTAL_CAPS} 根,
            现有 ${s.caps} 根。
        </p>
        ${groups}`;
    }

    /**
     * 装扮。列表里不放 16×16 图标,直接把素材原样放大 —— 每件再单画一张图标
     * 就是第三套图,而且玩家真正想看的是「戴在它头上什么样」。
     * 画布在 render() 之后统一补画,见 paintCanvases()。
     */
    viewWear() {
        const s = this.getState();
        const rows = Object.entries(SLOTS).map(([slot, label]) => {
            const list = COSMETICS.filter(c => c.slot === slot);
            const items = list.map(c => {
                const owned = s.cosmetics.includes(c.id);
                const worn = s.wearing[slot] === c.id;
                const open = rules.cosmeticOpen(s, c);
                const btn = owned
                    ? `<button class="px-btn px-btn--sm ${worn ? 'px-btn--coral' : ''}"
                               data-act="wear" data-id="${c.id}">${worn ? '脱下来' : '戴上'}</button>`
                    : open
                    ? `<button class="px-btn px-btn--sm" data-act="buywear" data-id="${c.id}"
                               ${s.caps >= c.cost ? '' : 'disabled'}>
                           ${icon('cap')} ${c.cost}</button>`
                    : `<span class="px-tag">${this.wearNeed(c)}</span>`;
                return `
                <div class="px-ach ${worn ? 'px-ach--got' : ''}">
                    <canvas class="px-wear-item" width="72" height="48"
                            data-wear-item="${owned || open ? c.id : ''}"></canvas>
                    <div style="flex:1">
                        <strong>${c.name}</strong>
                        <p class="px-muted">${owned || open ? c.note : '还没解锁'}</p>
                    </div>
                    ${btn}
                </div>`;
            }).join('');
            return `<section style="margin-bottom:22px">
                <h3 style="margin-bottom:10px">${label}</h3>${items}</section>`;
        }).join('');

        return `
                <p class="px-muted" style="margin-bottom:18px">
            用瓶盖买,不花鸥币 —— 鸥币留着升摊子。瓶盖只从成就来,现有
            <strong>${s.caps}</strong> 根。戴上之后大坝和小屋里都看得见。</p>
        <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
            <canvas class="px-wear-preview" width="144" height="144" data-wear-preview></canvas>
            <div style="flex:1;min-width:280px">${rows}</div>
        </div>`;
    }

    /** 没解锁时显示的条件文案 */
    wearNeed(c) {
        const n = c.need ?? {};
        if (n.postcard !== undefined) {
            return `要先去过${POSTCARDS.find(p => p.id === n.postcard)?.name ?? '某处'}`;
        }
        if (n.achievement) {
            return `要成就「${ACHIEVEMENTS.find(a => a.id === n.achievement)?.name}」`;
        }
        if (n.affinity) return `要好感度 ${n.affinity}`;
        return '还没解锁';
    }

    /** innerHTML 铺完之后把画布补上。canvas 的内容不在 HTML 里,重绘一次就没了。 */
    paintCanvases() {
        // 抽屉、弹窗、场景条都可能装着画布,所以从整篇文档里找,不认哪个容器
        const prev = document.querySelector('[data-wear-preview]');
        if (prev) paintWearPreview(prev, this.getState().wearing, ICON_GRIDS);
        for (const cv of document.querySelectorAll('[data-wear-item]')) {
            if (cv.dataset.wearItem) paintWearItem(cv, cv.dataset.wearItem);
        }
        this.paintCard();
    }

    /**
     * 运势卡片。画一次缓存住 —— 一张 1080×1440 的 PNG 转 data URL 不便宜,
     * 而面板每秒可能重绘好几次。
     *
     * **必须等 document.fonts.ready。** canvas 画字是一次性的:字体还没到就画,
     * 会拿系统字体先落下去,而且不会像 DOM 那样等字体到了自己回流重排。
     */
    paintCard() {
        const img = document.querySelector('[data-card]');
        if (!img) return;
        const s = this.getState();
        // 天光跟真实时段走,所以时段也得进 key —— 不然傍晚转的卦到了夜里
        // 还是白天那张图
        const key = [s.fortune, s.fortuneMark, s.fortuneDate, s.weather, s.level,
                     dayPhase(now())].join('|');
        if (this._cardKey === key && this._cardUrl) { img.src = this._cardUrl; return; }

        document.fonts.ready.then(() => {
            // 等字体的这段时间里玩家可能已经翻到别的页去了
            const live = document.querySelector('[data-card]');
            if (!live) return;
            const url = renderCard({
                fortune: s.fortune, mark: s.fortuneMark,
                weather: s.weather, date: now(), level: s.level,
                // dev 里 wa.card() 钉住的组合;生产构建里这个字段永远是 undefined
                ...(this._cardForce ?? {}),
            });
            if (!url) return;
            this._cardKey = key;
            this._cardUrl = url;
            live.src = url;
        });
    }

    viewChat() {
        const node = CHAT_NODES[this.getState().chatNode] ?? CHAT_NODES[0];
        return `
                <div class="px-dialog">
            <span class="px-dialog__name">${icon('waou')} 哇鸥</span>
            <p class="px-dialog__text">${node.bot}</p>
            <div class="px-dialog__options">
                ${node.options.map(o =>
                    `<button class="px-btn px-btn--sm" data-act="chat" data-next="${o.next}">${o.text}</button>`
                ).join('')}
            </div>
        </div>`;
    }

    viewSave() {
        return `
                <p class="px-muted" style="margin-bottom:18px">
            进度存在这台设备的浏览器里。清缓存、换设备都会丢 ——
            导出一串存档码收好,在哪都能接着玩。
        </p>
        <textarea id="codeBox" rows="4" spellcheck="false"
            placeholder="点「导出」生成存档码,或把存档码粘贴到这里再点「导入」"
            style="width:100%;font-family:var(--font-pixel);font-size:13px;padding:12px;
                   background:var(--sand-2);border:3px solid var(--ink);resize:vertical"></textarea>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:18px">
            <button class="px-btn" data-act="export">${icon('postcard', 'lg')} 导出存档码</button>
            <button class="px-btn px-btn--sea" data-act="import">导入</button>
            <button class="px-btn px-btn--coral px-btn--sm" data-act="reset">清空存档</button>
        </div>`;
    }
}

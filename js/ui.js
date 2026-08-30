/**
 * 界面层:渲染 + 事件。所有 DOM 操作都在这里,规则层不碰 DOM。
 *
 * 相比 template 的旧做法(一张整图 + 按固定像素坐标铺透明按钮),
 * 这里用真实 DOM:数据能直接显示,按钮不会因为窗口缩放而错位。
 */

import {
    FOODS, ITEMS, RECIPES, POSTCARDS, ACHIEVEMENTS, ACH_GROUPS, FEATHER,
    EVENTS,
    TOTAL_FEATHERS, CHAT_NODES, WEATHER,
    UPGRADES, upgradeCost, SHOWS,
    DRINKS, FORTUNES, HOURS, hourSlot,
    CREW, FOOD_SOURCE, COSMETICS, SLOTS,
} from './data.js';
import { paintWearPreview, paintWearItem } from './game/wear.js';
import { ICON_GRIDS } from './game/pixels.js';
import * as c4 from './game/connect4.js';
import { now } from './clock.js';
import { FOOD_KEYS, DAILY_TRIES } from './state.js';
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
    constructor({ getState, mutate, onFly, onScreen }) {
        this.getState = getState;
        this.mutate = mutate;
        this.onFly = onFly;
        this.onScreen = onScreen;
        this.screen = 'dock';
        this.toastTimer = null;
        /** 正在下的那局四子棋。不进存档 —— 一局棋没必要跨会话保留。 */
        this.board = null;
        this.c4turn = null;
    }

    mount() {
        this.$panel = $('#panel');
        this.$tabs = $('#tabs');
        this.$hud = $('#hud');
        this.$toast = $('#toast');

        this.$tabs.addEventListener('click', e => {
            const btn = e.target.closest('[data-screen]');
            if (btn) { sfx.play('tab'); this.go(btn.dataset.screen); }
        });
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

    go(screen) {
        if (this.screen === screen) return;
        this.screen = screen;
        this.onScreen?.(screen);      // 舞台那块画面跟着切
        this.render();
    }

    /* ---------- 动作 ---------- */

    handle(act, data) {
        const s = this.getState();
        switch (act) {
            case 'fly':
                if (s.dailyTries <= 0) return this.toast('今天的觅食次数用完了,明天再来', 'coin');
                this.onFly();
                break;

            case 'cook': {
                const r = this.mutate(st => rules.cook(st, data.id));
                if (!r.ok) return this.toast(this.explain(r), 'erkuai');
                this.toast(`做好了 ${RECIPES.find(x => x.id === data.id).name},+${data.reward} 欧币`, 'coin');
                this.showEvents(r.events);
                break;
            }

            case 'deliver': {
                const r = this.mutate(st => rules.deliverOrder(st, Number(data.id)));
                if (!r.ok) return this.toast(this.explain(r), 'postcard');
                this.toast(`交付完成,+${r.events[0].order.reward} 欧币`, 'coin');
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
                if (!r.ok) return this.toast(r.reason, 'feather');
                this.toast(`${r.cosmetic.name} —— 戴上了`, 'feather');
                this.showEvents(r.events.slice(1));
                break;
            }

            case 'wear': {
                const r = this.mutate(st => rules.wearCosmetic(st, data.id));
                if (!r.ok) return this.toast(r.reason, 'feather');
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
        this.toast(`你走了 ${away},摊子卖出 ${what},赚了 ${e.coins} 欧币${capped}。${fed}${ev}`, 'coin');
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
            const f = ach.reduce((n, e) => n + e.feathers, 0);
            queue = queue.filter(e => e.type !== 'achievement');
            queue.unshift({ type: 'many', text: `一口气达成 ${ach.length} 个成就 · 羽毛 +${f}` });
        }

        const start = off ? TOAST_MS + 200 : 400;      // 离线那条先让它读完
        queue.forEach((e, i) => setTimeout(() => {
            if (e.type === 'levelup')     { sfx.play('levelup'); this.toast(`升级!你现在是 Lv.${e.level}`, 'star'); }
            if (e.type === 'recipe')      this.toast(`解锁新食谱:${e.recipe.name}`, e.recipe.icon);
            if (e.type === 'achievement') {
                sfx.play('achieve');
                this.toast(`达成成就:${e.achievement.name} · 羽毛 +${e.feathers}`, 'trophy');
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

    render() {
        this.renderHud();
        this.renderTabs();
        this.$panel.innerHTML = ({
            dock: () => this.viewDock(),
            hut: () => this.viewHut(),
            bag: () => this.viewBag(),
            cook: () => this.viewCook(),
            postcard: () => this.viewPostcards(),
            achievement: () => this.viewAchievements(),
            wear: () => this.viewWear(),
            chat: () => this.viewChat(),
            save: () => this.viewSave(),
        }[this.screen] ?? (() => ''))();
        this.paintCanvases();
    }

    renderHud() {
        const s = this.getState();
        const w = WEATHER[s.weather] ?? WEATHER.sunny;
        const pct = Math.min(100, Math.round(s.exp / s.expNext * 100));
        this.$hud.innerHTML = `
            <span class="px-chip">${icon('coin')} <strong>${s.coins}</strong> 欧币</span>
            <span class="px-chip">${icon(w.icon)} ${w.name}</span>
            <span class="px-chip">${icon('star')} Lv.<strong>${s.level}</strong></span>
            <span class="px-chip">${icon('feather')} <strong>${s.feathers}</strong> 羽毛</span>
            <span class="px-chip">${icon('waou')} 觅食 <strong>${s.dailyTries}</strong>/${DAILY_TRIES}</span>
            <button class="px-chip px-chip--btn" data-act="mute" title="音效开关">
                ${icon('star')} 音效 <strong>${sfx.isMuted() ? '关' : '开'}</strong></button>
            <div class="px-bar px-bar--exp" style="flex:1;min-width:160px">
                <div class="px-bar__fill" style="width:${pct}%"></div>
                <div class="px-bar__label">经验 ${s.exp} / ${s.expNext}</div>
            </div>`;
    }

    renderTabs() {
        const tabs = [
            ['dock', '大坝', 'map'], ['hut', '小屋', 'waou'],
            ['bag', '背包', 'backpack'], ['cook', '摊子', 'shop'],
            ['postcard', '明信片', 'postcard'], ['achievement', '成就', 'trophy'],
            ['wear', '装扮', 'feather'],
            ['chat', '聊天', 'waou'], ['save', '存档', 'coin'],
        ];
        this.$tabs.innerHTML = tabs.map(([id, name, ico]) =>
            `<button class="px-tab" data-screen="${id}" aria-selected="${this.screen === id}">
                ${icon(ico)} ${name}</button>`).join('');

        // 窄屏上页签是横着滑的一条,选中的那个可能在屏幕外。
        //
        // 自己算 scrollLeft,不用 scrollIntoView:后者会把**所有**祖先容器
        // 一起滚,在手机上表现为页面莫名其妙往下跳一截;而且它的 'nearest'
        // 只保证「露出来」,选中项会贴在屏幕边上,看着像被切掉了。
        //
        // 要等一帧 —— 刚塞完 innerHTML 时浏览器还没排版,这会儿问位置全是 0。
        requestAnimationFrame(() => {
            const box = this.$tabs;
            const sel = box.querySelector('[aria-selected="true"]');
            if (!sel || box.scrollWidth <= box.clientWidth) return;
            box.scrollLeft = sel.offsetLeft - (box.clientWidth - sel.offsetWidth) / 2;
        });
    }

    viewDock() {
        const s = this.getState();
        const w = WEATHER[s.weather] ?? WEATHER.sunny;
        const order = s.orders[0];
        return `
        <h2 style="margin-bottom:12px">海埂大坝</h2>
        <p class="px-muted" style="margin-bottom:20px">
            ${icon(w.icon)} ${w.name} · ${w.note} ·
            ${icon('waou')} ${rules.seasonNow().name}季 · ${rules.seasonNow().note}</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
            <button class="px-btn px-btn--lg" data-act="fly" ${s.dailyTries <= 0 ? 'disabled' : ''}>
                ${icon('waou', 'lg')} 出发觅食
            </button>
            <span class="px-chip">${icon('backpack')} 每次捡到 <strong>×${rules.haulPerPickup(s.level)}</strong></span>
            <button class="px-btn px-btn--sea" data-screen="cook">${icon('shop', 'lg')} 看摊子</button>
        </div>
        ${this.hutHint()}
        ${this.showPanel()}
        ${this.eventLog()}
        ${this.stallSummary()}
        ${order ? `
        <div class="px-panel px-panel--sea">
            <p>今日订单:<strong>${order.name}</strong></p>
            <p class="px-muted">需要 ${Object.entries(order.need)
                .map(([k, v]) => `${icon(FOODS[k].icon)} ${FOODS[k].name}×${v}`).join(' ')}</p>
            <div style="display:flex;gap:16px;align-items:center;margin-top:14px">
                <span class="px-tag px-tag--gold">奖励 ${order.reward} 欧币</span>
                <button class="px-btn px-btn--sm" data-act="deliver" data-id="${order.id}">交付</button>
            </div>
        </div>` : `<p class="px-muted">暂时没有订单。${s.level < 2 ? '到 2 级后游客会开始点单。' : '出去转一圈看看?'}</p>`}`;
    }

    /** 一条事件的一句话总结,吐司用。日志里显示的是事件本身的叙述。 */
    eventLine(e) {
        const g = e.got ?? {};
        const bits = [];
        for (const [k, n] of Object.entries(g.food ?? {})) bits.push(`${FOODS[k].name}×${n}`);
        if (g.coins)     bits.push(`${g.coins} 欧币`);
        if (g.affinity)  bits.push(`好感度 +${g.affinity}`);
        if (g.feathers)  bits.push(`羽毛 +${g.feathers}`);
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

    viewHut() {
        const s = this.getState();
        const slot = hourSlot(now());

        if (!slot) {
            return `
            <h2 style="margin-bottom:8px">哇鸥的小屋</h2>
            <p class="px-muted" style="margin-bottom:18px">堤岸边的一个草棚,里面垫着草。</p>
            <div class="px-panel px-panel--sea">
                <p>${icon('waou')} 草棚空着,草垫上还留着一个窝。</p>
                <p class="px-muted">它这个点在大坝上。
                   <strong>${HOURS.noon.span}</strong> 回来歇脚,
                   <strong>${HOURS.evening.span}</strong> 待在屋里,
                   之后就睡了。</p>
            </div>`;
        }
        if (slot === 'night') {
            return `
            <h2 style="margin-bottom:8px">哇鸥的小屋</h2>
            <p class="px-muted" style="margin-bottom:18px">
                ${HOURS.night.name} · ${HOURS.night.note} · ${HOURS.night.span}</p>
            <div class="px-panel px-panel--sea">
                <p>${icon('waou')} 哇鸥缩成一团睡着了,呼吸把肚皮一起一伏地顶着。</p>
                <p class="px-muted">别吵它。明天晌午再来吧。</p>
            </div>`;
        }

        const drink = DRINKS[s.drink];
        const fortuneToday = s.fortuneDate === now().toDateString();
        const f = fortuneToday && s.fortune !== null ? FORTUNES[s.fortune] : null;

        return `
        <h2 style="margin-bottom:8px">哇鸥的小屋</h2>
        <p class="px-muted" style="margin-bottom:18px">
            ${HOURS[slot].name} · ${HOURS[slot].note} · ${HOURS[slot].span} ·
            好感度 <strong>${s.affinity}</strong></p>

        <div class="px-grid" style="--min:250px;margin-bottom:24px">
            <div class="px-panel px-panel--gold" style="padding:14px 16px">
                <p style="margin-bottom:6px">${icon('shell' in FORTUNES ? 'star' : 'star', 'lg')} 占卜</p>
                <p class="px-muted" style="font-size:13px;margin-bottom:10px">
                    海鸥一族的老法子:看今天的天,再看捡来那枚贝壳上的纹。一天一次。</p>
                ${f ? `<p><strong>${f.name}</strong> <span class="px-muted">· ${s.fortuneMark}</span></p>
                       <p class="px-muted" style="font-size:13px">${f.text}</p>`
                    : `<button class="px-btn px-btn--sm" data-act="divine">转一卦</button>`}
            </div>

            <div class="px-panel px-panel--gold" style="padding:14px 16px">
                <p style="margin-bottom:6px">${icon(drink ? drink.icon : 'coin', 'lg')} 请它喝一杯</p>
                <p class="px-muted" style="font-size:13px;margin-bottom:10px">
                    ${drink ? `你今天带了一杯<strong>${drink.name}</strong>。`
                            : '今天这杯已经给它了。明天上线会再拿到一杯。'}</p>
                <button class="px-btn px-btn--sm" data-act="drink" ${drink ? '' : 'disabled'}>
                    ${drink ? '递过去' : '没有了'}</button>
            </div>
        </div>

        <h3 style="margin-bottom:10px">海鸥四子棋
            <span class="px-muted" style="font-size:13px">
                你执白,它执黑 · ${s.c4.win} 胜 ${s.c4.lose} 负 ${s.c4.draw} 平</span></h3>
        ${this.c4View()}`;
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
        const slots = FOOD_KEYS.map(k => `
            <div class="px-slot" title="${FOODS[k].name}">
                ${icon(FOODS[k].icon, 'xl')}
                <span class="px-slot__count">${s.backpack[k] ?? 0}</span>
            </div>`).join('');
        const items = Object.entries(ITEMS).map(([k, it]) => `
            <div class="px-slot ${(s.items[k] ?? 0) ? '' : 'px-slot--locked'}" title="${it.desc}">
                ${icon(it.icon, 'xl')}
                <span class="px-slot__count">${s.items[k] ?? 0}</span>
            </div>`).join('');
        return `
        <h2 style="margin-bottom:16px">背包</h2>
        <p class="px-muted" style="margin-bottom:10px">食材</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">${slots}</div>
        <p class="px-muted" style="margin-bottom:10px">道具 · 下次觅食自动使用</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px">${items}</div>
        ${this.codexView()}`;
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
            <p>${icon('waou')} 没出去的时候,哇鸥在大坝上表演 ——
               <strong>${info.shows.length}</strong> 个节目,
               每 <strong>${(info.interval / 1000).toFixed(0)}</strong> 秒有人投喂,
               一次给 <strong>${info.per}</strong> 个</p>
            <p class="px-muted" style="margin:10px 0 6px">节目单 · 等级、成就、去过的地方都会解锁新节目</p>
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
               · 约 <strong>${Math.round(perMin)}</strong> 欧币/分钟</p>
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
                    每 ${(info.serveMs / 1000).toFixed(1)} 秒一份 ·
                    ${Math.round(r.reward * info.priceMul)} 欧币<br>
                    吃 ${Object.entries(r.cost).map(([k, v]) => `${FOODS[k].name}×${v}`).join(' ')}
                    ${enough ? '' : '<br><span style="color:var(--coral)">材料不够,停着</span>'}
                </p>
            </div>`;
        }).join('');

        /* ---- 升级 ---- */
        const ups = Object.entries(UPGRADES).map(([key, u]) => {
            const lv = s.upgrades[key] ?? 1;
            const cost = upgradeCost(key, lv);
            const now = key === 'shelf' ? `${u.mul(lv)} 小时`
                      : key === 'warmer' ? `${Math.round(u.mul(lv) * 100)}%`
                      : `×${u.mul(lv).toFixed(2)}`;
            return `<div class="px-panel" style="padding:12px 14px">
                <p style="margin-bottom:4px">${icon(u.icon, 'lg')} ${u.name} <span class="px-muted">Lv.${lv}</span></p>
                <p class="px-muted" style="font-size:12px;margin-bottom:10px">${u.desc} · 当前 ${now}</p>
                ${cost === null
                    ? '<span class="px-tag px-tag--leaf">已满级</span>'
                    : `<button class="px-btn px-btn--sm" data-act="upgrade" data-key="${key}"
                         ${s.coins < cost ? 'disabled' : ''}>${icon('coin')} ${cost}</button>`}
            </div>`;
        }).join('');

        /* ---- 手工做菜(急用钱时手动来一份) ---- */
        const rows = RECIPES.map(r => {
            const unlocked = s.unlockedRecipes.includes(r.id);
            const ok = unlocked && rules.canAfford(s, r.cost);
            const cost = Object.entries(r.cost)
                .map(([k, v]) => `${icon(FOODS[k].icon)} ${v}`).join(' ');
            return `
            <div class="px-panel" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px">
                ${icon(r.icon, 'lg')}
                <strong style="min-width:5em">${unlocked ? r.name : '???'}</strong>
                <span class="px-muted" style="flex:1">
                    ${unlocked ? `${cost} → ${r.reward} 欧币` : `Lv.${r.levelReq} 解锁`}</span>
                <button class="px-btn px-btn--sm" data-act="cook" data-id="${r.id}"
                    data-reward="${r.reward}" ${ok ? '' : 'disabled'}>制作</button>
            </div>`;
        }).join('');

        return `
        <h2 style="margin-bottom:6px">哇鸥的小吃摊</h2>
        <p class="px-muted" style="margin-bottom:18px">
            摆上去的菜会自己卖,吃背包里的材料。你不在的时候也在卖,
            按 ${Math.round(info.offlineRate * 100)}% 折算,最多攒 ${info.offlineCapMs / 3600_000} 小时。</p>
        <div class="px-grid" style="--min:230px;margin-bottom:28px">${slots}</div>

        <h3 style="margin-bottom:12px">升级</h3>
        <div class="px-grid" style="--min:190px;margin-bottom:28px">${ups}</div>

        ${this.crewView()}

        <h3 style="margin-bottom:12px">手工做一份</h3>
        ${rows}`;
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
                const f = FEATHER[a.tier];
                return `
                <div class="px-ach ${has ? 'px-ach--got' : ''}">
                    ${icon(has ? 'trophy' : 'star')}
                    <div style="flex:1">
                        <strong>${a.name}</strong>
                        <p class="px-muted">${a.desc}</p>
                    </div>
                    <span class="px-tag ${has ? 'px-tag--leaf' : ''}">${icon('feather')} ${f}</span>
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
            每条成就给羽毛,羽毛在「装扮」里花掉。全部达成共 ${TOTAL_FEATHERS} 根,
            现有 ${s.feathers} 根。
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
                               ${s.feathers >= c.cost ? '' : 'disabled'}>
                           ${icon('feather')} ${c.cost}</button>`
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
        <h2 style="margin-bottom:6px">装扮</h2>
        <p class="px-muted" style="margin-bottom:18px">
            用羽毛买,不花欧币 —— 欧币留着升摊子。羽毛只从成就来,现有
            <strong>${s.feathers}</strong> 根。戴上之后大坝和小屋里都看得见。</p>
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
        const prev = this.$panel.querySelector('[data-wear-preview]');
        if (prev) paintWearPreview(prev, this.getState().wearing, ICON_GRIDS);
        for (const cv of this.$panel.querySelectorAll('[data-wear-item]')) {
            if (cv.dataset.wearItem) paintWearItem(cv, cv.dataset.wearItem);
        }
    }

    viewChat() {
        const node = CHAT_NODES[this.getState().chatNode] ?? CHAT_NODES[0];
        return `
        <h2 style="margin-bottom:20px">和阿欧聊天</h2>
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
        <h2 style="margin-bottom:8px">存档</h2>
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

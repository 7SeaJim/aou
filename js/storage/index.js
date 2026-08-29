/**
 * 存储门面。游戏逻辑只跟这个对象打交道,不关心底下是 localStorage、
 * 平台云存储还是自建后端。
 *
 * 写入是防抖的 —— 绝不能在游戏循环里每次捡到东西就同步落盘一次。
 * 换成网络存储后那就是每帧一个请求。
 */

import { pickAdapter } from './adapters.js';
import { migrate, createInitialState } from '../state.js';

const KEY = 'aou:save';
const DEBOUNCE_MS = 1500;

class Storage {
    #adapter = null;
    #timer = null;
    #pending = null;
    #lastError = null;

    /** @param {object} [adapter] 不传则自动挑一个当前环境可用的 */
    init(adapter) {
        this.#adapter = adapter ?? pickAdapter();
        // 切后台 / 关页面时必须强制落盘,否则防抖窗口里的进度会丢
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') this.flush();
            });
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', () => this.flush());
        }
        return this;
    }

    get adapterName() { return this.#adapter?.constructor.name ?? 'None'; }

    /** 上一次写入是否失败(配额满、存储被禁)。UI 可据此提示玩家导出存档码。 */
    get lastError() { return this.#lastError; }

    /** 读档。没有存档或存档无法识别时返回全新存档。 */
    async load() {
        const text = await this.#adapter.get(KEY);
        if (!text) return createInitialState();

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            return createInitialState();
        }
        return migrate(parsed) ?? createInitialState();
    }

    /** 标记有改动,延迟合并写入。频繁调用是安全的。 */
    save(state) {
        this.#pending = state;
        if (this.#timer !== null) return;
        this.#timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
    }

    /** 立刻落盘。退出关卡、切后台、导出存档码前调用。 */
    flush() {
        if (this.#timer !== null) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        const state = this.#pending;
        if (!state) return Promise.resolve(true);
        this.#pending = null;

        // 注意这里不 await:pagehide 里没有时间等异步完成,
        // localStorage 是同步的所以实际上已经写进去了。
        return Promise.resolve(this.#adapter.set(KEY, JSON.stringify(state)))
            .then(ok => {
                this.#lastError = ok ? null : new Error('存档写入失败');
                return ok;
            })
            .catch(err => {
                this.#lastError = err;
                return false;
            });
    }

    /** 用存档码或迁移后的存档整体覆盖当前档 */
    async replace(state) {
        this.#pending = state;
        return this.flush();
    }

    async clear() {
        if (this.#timer !== null) { clearTimeout(this.#timer); this.#timer = null; }
        this.#pending = null;
        await this.#adapter.remove(KEY);
    }
}

export const storage = new Storage();

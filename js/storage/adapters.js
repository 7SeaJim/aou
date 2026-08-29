/**
 * 存储适配器。全部是异步接口 —— 即使 localStorage 是同步的。
 *
 * 这样将来换成平台云存储或自建后端时,业务代码一行都不用改。
 * 反过来先写同步接口、以后再改异步,所有调用点都得动。
 */

/** localStorage。隐私模式 / 关闭站点数据时 setItem 会抛异常,所以每次都要兜。 */
export class LocalAdapter {
    static available() {
        try {
            const k = '__probe__';
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            return true;
        } catch {
            return false;
        }
    }

    async get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    async set(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch {
            return false;      // 配额满或被禁用。调用方据此提示玩家导出存档码
        }
    }

    async remove(key) {
        try {
            localStorage.removeItem(key);
        } catch { /* 忽略 */ }
    }
}

/** 兜底:内存存储。刷新即失效,只保证游戏本身不崩。 */
export class MemoryAdapter {
    #map = new Map();
    async get(key) { return this.#map.has(key) ? this.#map.get(key) : null; }
    async set(key, value) { this.#map.set(key, value); return true; }
    async remove(key) { this.#map.delete(key); }
}

/**
 * 自建后端。等真要做排行榜时再启用。
 * 注意:userId 必须来自服务端验签过的平台身份,不能由客户端随便传。
 */
export class ApiAdapter {
    constructor({ baseUrl, token }) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.token = token;
    }

    async #req(path, init) {
        const res = await fetch(this.baseUrl + path, {
            ...init,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}`,
                       ...(init?.headers) },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res;
    }

    async get(key) {
        try {
            const res = await this.#req(`/save/${encodeURIComponent(key)}`);
            const { value } = await res.json();
            return value ?? null;
        } catch {
            return null;
        }
    }

    async set(key, value) {
        try {
            await this.#req(`/save/${encodeURIComponent(key)}`,
                { method: 'PUT', body: JSON.stringify({ value }) });
            return true;
        } catch {
            return false;
        }
    }

    async remove(key) {
        try {
            await this.#req(`/save/${encodeURIComponent(key)}`, { method: 'DELETE' });
        } catch { /* 忽略 */ }
    }
}

/** 挑一个当前环境可用的适配器 */
export function pickAdapter() {
    if (LocalAdapter.available()) return new LocalAdapter();
    return new MemoryAdapter();
}

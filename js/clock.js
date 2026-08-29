/**
 * 游戏读「现在几点」的唯一入口。
 *
 * 存在的理由只有一个:小屋按时段开门,而调试的时候不可能真等到晚上八点。
 * 开发时 dev.js 会把 source 换掉(wa.hour(20) / ?hour=20),
 * 生产构建里 dev.js 整个被摇掉,这里永远是真实时间。
 */
let source = () => new Date();

export const now = () => source();

/** 传 null 恢复真实时间 */
export function setClock(fn) {
    source = typeof fn === 'function' ? fn : () => new Date();
}

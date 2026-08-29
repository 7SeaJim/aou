/**
 * 可播种的随机数。
 *
 * 调玩法的时候要的是**可重复**:同一个种子跑出同一串食材和障碍,
 * 才能判断「刚才那下是难度问题还是我运气差」。
 * Math.random 不能播种,所以自己带一个。
 *
 * mulberry32:32 位状态,分布够用,四行写完。不要用它做任何安全相关的事。
 */
export function seeded(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

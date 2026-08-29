/**
 * 海鸥四子棋。7 列 × 6 行,黑石头(哇鸥)对白石头(玩家)。
 *
 * 纯逻辑,不碰 DOM,也不碰存档 —— 一局下完只把结果交出去。
 * 棋盘用「每列一个数组」存,列底在下标 0:落子就是 push,
 * 比二维数组加重力判定省事得多。
 */

export const COLS = 7;
export const ROWS = 6;

export const newBoard = () => Array.from({ length: COLS }, () => []);

export const canDrop = (b, c) => c >= 0 && c < COLS && b[c].length < ROWS;

/** 落子。返回新棋盘,落不下去返回 null —— 不原地改,方便 AI 试算。 */
export function drop(b, c, who) {
    if (!canDrop(b, c)) return null;
    const next = b.map(col => col.slice());
    next[c].push(who);
    return next;
}

const at = (b, c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? b[c][r] : undefined);

/**
 * 谁赢了。返回 'w' / 'b' / 'draw' / null(还没完)。
 * 顺带把连成的四个位置也给出来,UI 好把它们高亮出来。
 */
export function winner(b) {
    const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            const who = at(b, c, r);
            if (!who) continue;
            for (const [dc, dr] of DIRS) {
                const line = [[c, r]];
                for (let k = 1; k < 4; k++) {
                    if (at(b, c + dc * k, r + dr * k) !== who) break;
                    line.push([c + dc * k, r + dr * k]);
                }
                if (line.length === 4) return { who, line };
            }
        }
    }
    return b.every(col => col.length === ROWS) ? { who: 'draw', line: [] } : null;
}

const other = who => (who === 'w' ? 'b' : 'w');

/** 这一手下完是不是立刻赢 */
const winsWith = (b, c, who) => {
    const n = drop(b, c, who);
    return n ? winner(n)?.who === who : false;
};

/**
 * 哇鸥的下法。够用就行,不做搜索树:
 *   1. 能赢就赢
 *   2. 对面下一步能赢就堵
 *   3. 别下完就把胜势送给对面
 *   4. 都不占就往中间下 —— 四子棋里中路的连线机会最多
 *
 * 故意留了余地:它会挡、会赢,但不会算得很深,输给玩家是常事。
 * 这是只海鸥,不是引擎。
 */
export function aiMove(b, me = 'b') {
    const you = other(me);
    const legal = [...Array(COLS).keys()].filter(c => canDrop(b, c));
    if (legal.length === 0) return -1;

    for (const c of legal) if (winsWith(b, c, me)) return c;
    for (const c of legal) if (winsWith(b, c, you)) return c;

    // 下完之后对面能马上赢的,除非没别的选,否则不下
    const safe = legal.filter(c => {
        const n = drop(b, c, me);
        return !legal.some(c2 => canDrop(n, c2) && winsWith(n, c2, you));
    });
    const pool = safe.length ? safe : legal;

    // 越靠中间越好,同分随机挑一个,免得每局一模一样
    const score = c => 3 - Math.abs(c - 3);
    const best = Math.max(...pool.map(score));
    const top = pool.filter(c => score(c) === best);
    return top[Math.floor(Math.random() * top.length)];
}

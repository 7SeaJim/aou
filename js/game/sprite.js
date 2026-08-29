/**
 * 精灵图运行时。
 *
 * 约定:一张 PNG 图集,按固定格子切分。每个动画是一行(或一行里的一段),
 * 由 manifest 描述,不写死在代码里 —— 调帧数和速度不该改代码。
 *
 * manifest 例:
 *   {
 *     src: 'sprites/waou.png',
 *     cell: 32,                       // 格子边长,必须是正方形且所有帧一致
 *     anims: {
 *       idle:  { row: 0, frames: 4, fps: 6 },
 *       fly:   { row: 1, frames: 6, fps: 12 },
 *       hurt:  { row: 2, frames: 2, fps: 8, loop: false },
 *     }
 *   }
 *
 * 画的时候尺寸必须是 cell 的整数倍,否则 pixelated 下像素会一大一小
 * —— 和图标那边是同一个坑。
 */

export class SpriteSheet {
    #img = null;
    #ready = false;

    constructor(manifest) {
        this.m = manifest;
    }

    get ready() { return this.#ready; }

    async load() {
        // 非浏览器环境(测试/SSR)直接判定不可用,让调用方走占位画法
        if (typeof Image === 'undefined') { this.#ready = false; return false; }
        this.#img = new Image();
        this.#img.src = this.m.src;
        try {
            await this.#img.decode();
            this.#ready = true;
        } catch {
            this.#ready = false;      // 图没到位就让调用方走占位画法,不要崩
        }
        return this.#ready;
    }

    /** 画单帧。col/row 是格子坐标。 */
    drawFrame(ctx, col, row, x, y, size) {
        if (!this.#ready) return false;
        const c = this.m.cell;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.#img, col * c, row * c, c, c,
                      Math.round(x - size / 2), Math.round(y - size / 2), size, size);
        return true;
    }

    /**
     * 按时间播放动画。
     * @param {number} elapsed 毫秒,从动画开始算起
     */
    drawAnim(ctx, animName, elapsed, x, y, size) {
        const a = this.m.anims?.[animName];
        if (!a || !this.#ready) return false;

        const i = Math.floor(elapsed / 1000 * a.fps);
        const frame = a.loop === false ? Math.min(i, a.frames - 1) : i % a.frames;
        return this.drawFrame(ctx, (a.col ?? 0) + frame, a.row, x, y, size);
    }
}

/**
 * 图集集合。所有精灵图统一从这里取,业务代码不用管加载时序。
 * 任何一张图没加载好,draw 都返回 false,调用方据此走占位画法。
 */
export class SpriteBook {
    #sheets = new Map();

    /** @param {Record<string, object>} manifests 名字 -> manifest */
    async load(manifests) {
        const entries = Object.entries(manifests);
        await Promise.all(entries.map(async ([name, m]) => {
            const s = new SpriteSheet(m);
            await s.load();
            this.#sheets.set(name, s);
        }));
        return this;
    }

    has(name) { return this.#sheets.get(name)?.ready ?? false; }

    /** 静态图:整张图集里的第 0 帧,或按名字查表 */
    draw(ctx, name, x, y, size) {
        const s = this.#sheets.get(name);
        if (!s?.ready) return false;
        return s.drawFrame(ctx, 0, 0, x, y, size);
    }

    drawAnim(ctx, sheetName, animName, elapsed, x, y, size) {
        const s = this.#sheets.get(sheetName);
        if (!s?.ready) return false;
        return s.drawAnim(ctx, animName, elapsed, x, y, size);
    }
}

/**
 * DOM 元素上播精灵动画(用于界面里的装饰,比如大坝上待机的哇鸥)。
 * 用 CSS steps() 而不是 JS 逐帧改 —— 交给合成器,不占主线程。
 *
 * 返回一段可以插进 <style> 的 CSS。
 */
export function animCss(className, manifest, animName) {
    const a = manifest.anims[animName];
    const c = manifest.cell;
    const kf = `${className}-kf`;
    return `
.${className} {
    width: ${c}px;
    height: ${c}px;
    background-image: url('${manifest.src}');
    background-repeat: no-repeat;
    background-position: ${-(a.col ?? 0) * c}px ${-a.row * c}px;
    image-rendering: pixelated;
    animation: ${kf} ${(a.frames / a.fps).toFixed(3)}s steps(${a.frames}) infinite;
}
@keyframes ${kf} {
    to { background-position: ${-((a.col ?? 0) + a.frames) * c}px ${-a.row * c}px; }
}`.trim();
}

/**
 * 两套产物,一份源码。
 *
 *   npm run build      → dist/          普通网页(Cloudflare Pages 那一份)
 *   npm run build:mini → dist-minitool/ 小红书小工具,再打成 zip
 *
 * 小工具跑在一个**受限容器**里(离线 H5,容器 CSP),规范见
 * `.claude/skills/minitool-zip-builder/`。它和普通网页有六处硬冲突,
 * 全部在这里用 `mode === 'minitool'` 分开,**源码里一处 if 都不写**
 * (除了几个被禁能力的开关,见 `__MINITOOL__`):
 *
 *   1. `base: './'`      容器把 zip 解到哪儿不确定,绝对路径 `/assets/...` 找不到
 *   2. IIFE 不是 ESM     容器禁 `type="module"`;离线 zip 没有目录服务,
 *                        module 的相对 import 解析不可靠 ——
 *                        典型症状是「页面渲染出来但 JS 完全不执行」
 *   3. `inlineDynamicImports`  同上:IIFE 不能分包,而源码里有 `await import()`
 *   4. `modulePreload: false`  预加载 polyfill 会往产物里塞一个 `fetch()`,
 *                        而容器禁一切网络请求 —— **它是被扫描到的那个 fetch**
 *   5. `target: 'es2017'` 基线是 Android 8.1 的 WebView 61。
 *                        源码里 `?.` / `??` 用得很多,那是 ES2020,必须转译下来
 *   6. index.html 后处理  viewport 补 `viewport-fit=cover`;去掉 manifest
 *                        (`.webmanifest` 不在允许的文件类型里)
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * 小工具的 index.html 后处理。
 *
 * 只改这三样,别的一个字不动 —— 规范说得很清楚,改写场景「仅替换被禁能力,
 * 未顺手改动其余业务逻辑与 UI」。
 */
function minitoolHtml() {
    return {
        name: 'minitool-html',
        enforce: 'post',
        transformIndexHtml(html) {
            return html
                // 真机的安全区(刘海、下巴)要靠它才铺得满
                .replace(
                    /(<meta name="viewport" content=")([^"]*)(")/,
                    (_, a, c, b) => a + 'width=device-width, initial-scale=1.0, '
                        + 'maximum-scale=1.0, user-scalable=no, viewport-fit=cover' + b)
                // .webmanifest 不在允许的文件类型里,而且外壳行为由容器管
                .replace(/\s*<link rel="manifest"[^>]*>/g, '')
                // 容器不需要它,留着只是多一个属性
                .replace(/ crossorigin(?==|>|\s)/g, '')
                // **最要紧的一条:去掉 type="module",同时补上 defer。**
                //
                // 容器只认经典脚本 —— 产物已经是 IIFE 了,可 vite 写 script 标签
                // 时不看 format,照旧挂 module。挂着的话典型症状是
                // 「页面渲染出来但 JS 完全不执行」,而这在模拟器里未必复现。
                //
                // **但只摘掉 module 会换来一个更隐蔽的毛病。** vite 把入口脚本
                // 提到 `<head>`;`type="module"` 本身是**隐式 defer** 的,
                // 所以原来它是 DOM 解析完才跑。摘掉之后它成了 head 里的
                // 经典脚本 —— **同步执行,早于 `<body>` 存在**,于是启动时
                // 所有 getElementById 都拿到 null。
                //
                // 这个坑是查「横屏了还卡在提示页」时顺出来的:那个「还是继续」
                // 按钮的监听根本没挂上,因为绑它的时候 body 还不存在。
                // 而游戏其余部分之所以没崩,是因为启动流程里某个 await 恰好
                // 让出了一个宏任务 —— **靠运气,不靠约定**。
                //
                // 补 defer 就干净了:仍然是经典脚本(规范只禁 module 和内联),
                // 但保证解析完再执行、且保持顺序。Chrome 61 早就支持。
                .replace(/<script type="module"/g, '<script defer');
        },
        // public/ 里的东西是照搬过来的,里面有普通网页要的 site.webmanifest ——
        // 而 .webmanifest 不在允许的文件类型里,外壳行为也归容器管
        closeBundle() {
            const f = path.resolve('dist-minitool/site.webmanifest');
            if (fs.existsSync(f)) fs.unlinkSync(f);
        },
    };
}

export default defineConfig(({ mode }) => {
    const mini = mode === 'minitool';
    return {
        base: mini ? './' : '/',
        // 源码里靠它把被禁能力整段摇掉(见 js/ui.js 的存图/复制/全屏三处)。
        // **用 define 而不是运行时判断**:define 是编译期常量,
        // 死代码会被 esbuild 整段删掉 —— 规范要的是「无调用/残留」,
        // 运行时 if 留在产物里照样会被扫描命中
        define: { __MINITOOL__: JSON.stringify(mini) },
        build: {
            outDir: mini ? 'dist-minitool' : 'dist',
            // 只在小工具那份钉基线。普通网页不写,用 vite 自己的默认值 ——
            // 这份 vite 底下是 rolldown,写 'modules' 它不认
            // cssCodeSplit:false 让样式出成一个独立的 .css 再 <link> 进去。
            // 不写的话 IIFE 那份会把整份 CSS 塞进 JS、运行时插 <style> ——
            // 规范允许(禁的是内联 script,不是内联 style),但那样 JS 要多背
            // 九十来 KB,而且样式要等 JS 跑完才生效,进场会闪一下白
            ...(mini ? { target: 'es2017', modulePreload: false, cssCodeSplit: false } : {}),
            sourcemap: false,           // *.map 不许进 zip
            rollupOptions: mini ? {
                output: {
                    format: 'iife',
                    inlineDynamicImports: true,
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash].[ext]',
                },
            } : {},
        },
        plugins: mini ? [minitoolHtml()] : [],
    };
});

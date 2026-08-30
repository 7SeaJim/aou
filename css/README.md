# 像素风格库 · 用法速查

星露谷式像素 UI × 滇池清新配色。三个文件按顺序引入,**顺序不能颠倒**:

```html
<link rel="stylesheet" href="css/pixel-tokens.css">  <!-- 色板/字体/边框素材 -->
<link rel="stylesheet" href="css/pixel-base.css">    <!-- 重置/背景/排版 -->
<link rel="stylesheet" href="css/pixel-icons.css">   <!-- 22 个像素图标 -->
<link rel="stylesheet" href="css/pixel-ui.css">      <!-- 组件 -->
```

改风格只动 `pixel-tokens.css` 里的变量,组件会整体跟着变。
效果样张见 `style-preview.html`(`npm run dev` 后访问 `/style-preview.html`);
根路径 `/` 是游戏本身。

## 组件清单

| class | 用途 |
|---|---|
| `.px-stage` > `.px-screen` | 游戏舞台木质机身 + 内嵌画面(定宽 916px,`.px-screen` 正好 880×620,canvas 放里面) |
| `.px-panel` | 浮木框面板;变体 `--sea` 浅青纸面、`--gold` 白色纸面、`--night` 深色 |
| `.px-panel__title` | 骑在面板上边框的木牌标题 |
| `.px-btn` | 厚底可按压按钮;变体 `--sea` `--coral` `--wood`,尺寸 `--lg` `--sm` |
| `.px-tabs` > `.px-tab` | 界面切换标签页,选中项加 `aria-selected="true"` |
| `.px-chip` | HUD 资源条(鸥币/天气/连击);压在画面上用 `--dark` |
| `.px-bar` > `.px-bar__fill` + `.px-bar__label` | 进度条;变体 `--hp` `--exp` `--sea` |
| `.px-slot` | 背包格子;状态 `--selected` `--locked`,角标用 `.px-slot__count` |
| `.px-dialog` | 对话框,配 `__name` `__text` `__next` `__options` |
| `.px-toast` | 成就/奖励提示,加 `.pop` 播放弹出动画 |
| `.px-tag` | 小标签;变体 `--leaf` `--gold` `--coral` |
| `.px-mask` | 暂停/弹窗遮罩(放在 `.px-screen` 内),开合切 `.is-open` |
| `.px-waves` | 像素浪花分隔条(签名元素),`--double` 为双层错速流动 |
| `.px-icon px-icon--<名字>` | 像素图标,尺寸 `--lg`(32px)/ `--xl`(48px) |
| `.px-container` `.px-shadow` `.pixelated` | 工具类 |

## 图标

24 个:食材 `erkuai potato rice douhua flower mushroom rusan chili sugar`、
数值 `coin heart star`、
导航 `backpack postcard shop trophy map`、
道具 `shield magnet double`、
天气 `sun rain fog`、角色 `waou`(主角哇鸥)。

```html
<i class="px-icon px-icon--fries"></i>          <!-- 16px,配正文/HUD -->
<i class="px-icon px-icon--fries px-icon--lg"></i>  <!-- 32px,配按钮 -->
<i class="px-icon px-icon--fries px-icon--xl"></i>  <!-- 48px,配背包格 -->
```

**尺寸只能用 16 的整数倍**,所以这三个类用 px 而不是 em。源图是 16×16,
`image-rendering: pixelated` 下非整数倍缩放会让像素一行 1px 一行 2px,
看着像糊了又没摆正 —— em 会随各处字号变成 18.75px / 40px 这种尺寸,正是这个坑。

**放进 flex 容器里用。** `.px-btn` `.px-chip` `.px-slot` `.px-tab` `.px-tag` `.px-toast`
都是 flex + `align-items: center`,图标由布局精确居中,`vertical-align` 自动失效。
行内混排(段落里夹一个图标)才走 `vertical-align`,只有 16px 那档调过,
大图标别直接扔进 `<p>`。

图标在 16×16 里必须**摆正**:`tools/emit.py` 会检查每张图的内容框是否居中,
偏了直接报错不生成 —— 同一行几个图标只要有一个偏一格,肉眼立刻看得出高低不齐。

改图标或加新图标见 `tools/README.md`——它们由可读的像素网格生成,不要手改 CSS 里的 SVG。

## 边框

`border-image` + 内联 SVG,28×28 网格、`slice 6`、`border-width 18px`、`repeat round`。
含 45° 斜接倒角(上/左受光、下/右背光)、转角铆钉、每 16px 一道木板接缝。
三种配色:`--frame-wood`(默认)、`--frame-gold`、`--frame-sea`。

## 三个坑

1. **`.px-stage` 的宽度别改成百分比。** 916px 是倒推出来的:
   916 − 内衬 14×2 − 描边 4×2 = 880,让 canvas 的像素和屏幕像素一比一。
   一旦画面被缩放成非整数倍,整块游戏画面的像素就一大一小。
2. **`.px-shadow` 别用在 border-image 面板上**(`.px-panel` / `.px-dialog` / `.px-toast`)——
   box-shadow 沿 border-box 矩形绘制,会在透明的阶梯角处露出方块。
3. **覆盖面板背景色请用 `background-color`,不要用 `background` 简写**——
   简写会连带重置 `background-clip: padding-box`,阶梯角会漏色。

## 字体

`pixel-tokens.css` 顶部从 jsDelivr CDN 引入 Fusion Pixel(缝合像素体,OFL 协议,含完整简体中文)。
需要离线开发时:

```bash
npm i @fontsource/fusion-pixel-12px-proportional-sc
```

然后把顶部那行 `@import url(...)` 换成 `@import '@fontsource/fusion-pixel-12px-proportional-sc';`

## 背景

`body` 的天空→海面渐变用了 `background-attachment: fixed`,是按**单屏游戏画面**调的。
长页面滚动时会看到固定的色带分界(样张页就是这样),游戏页单屏显示则正好铺满。

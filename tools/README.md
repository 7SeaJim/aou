# 像素素材生成器

UI 的图标边框、游戏画面里的海鸥和道具,都不是手写 SVG / 手写 canvas,
而是从**可读的像素网格**生成的。改素材改这里,别直接改 css 和 js。

```bash
python3 tools/emit.py     # 或 npm run icons
```

一条命令生成三样东西:

| 产物 | 内容 |
|---|---|
| `css/pixel-icons.css` | 22 个图标的内联 SVG + 尺寸类 |
| `css/pixel-tokens.css` 里的 `--frame-*` | 三种边框 |
| `js/game/pixels.js` | 图标 + 画面素材的字符网格,运行时由 `pixmap.js` 烤成离屏 canvas |

| 文件 | 内容 |
|---|---|
| `pal.py` | 调色板(字符 → 颜色)+ SVG 输出(同色合并成 path,体积小 5 倍) |
| `icons.py` | 22 个 16×16 图标,每个是 16 行 × 16 字符的网格 |
| `scenery.py` | 游戏画面用的图:海鸥四帧、乌云/气球/风筝、薯条摊、木桶、灯塔、小船 |
| `frames.py` | 28×28 边框,程序生成:45° 斜接倒角 + 转角铆钉 + 木板接缝 |
| `emit.py` | 把上面几个编译成 CSS 和 JS |

## 两条会直接报错的规矩

- **图标必须在 16×16 里摆正。** `emit.py` 会算每张图内容框的上下左右余量,
  偏出半格就报错不生成。内容宽高是奇数时不可能整好居中,所以允许半格。
  这条是花过代价的:偏一格肉眼未必看得出,但一行图标摆在一起就明显高低不齐。
- **图标必须是 16 行 × 16 字符。** 少一个点直接断言失败。
  `scenery.py` 里的图尺寸不固定,`_pad()` 会补齐右边并裁掉四周整行整列的空白 ——
  留着空行会让东西按底边摆放时凭空浮在半空。

## 加一个新图标

在 `icons.py` 里加一项,16 行 × 每行 16 字符,字符含义见 `pal.py` 的 `PAL`:

```python
ICONS['crab'] = [
"................",
"...K........K...",
...  # 共 16 行
]
```

跑 `python3 tools/emit.py`,然后就能用 `<i class="px-icon px-icon--crab"></i>`,
游戏画面里也能用 `sprite('crab', ICON_GRIDS.crab)` 直接画。
行数、列数、居中不对都会直接报错,不会生成坏图。

## 预览

改完想先看效果,不用起服务器:

```bash
python3 -c "
import sys; sys.path.insert(0,'tools')
from pal import PAL; from icons import ICONS
from PIL import Image, ImageDraw
S=8; COLS=6; PAD=6; CELL=16*S+PAD*2; LBL=14
rows=(len(ICONS)+COLS-1)//COLS
img=Image.new('RGB',(COLS*CELL, rows*(CELL+LBL)),'#cfeef2'); d=ImageDraw.Draw(img)
for i,(n,g) in enumerate(ICONS.items()):
    cx=(i%COLS)*CELL; cy=(i//COLS)*(CELL+LBL)
    d.rectangle([cx+2,cy+2,cx+CELL-3,cy+CELL-3],fill='#f7ecca',outline='#9c6b43')
    for y,row in enumerate(g):
        for x,ch in enumerate(row):
            if ch!='.': d.rectangle([cx+PAD+x*S,cy+PAD+y*S,cx+PAD+x*S+S-1,cy+PAD+y*S+S-1],fill=PAL[ch])
    d.text((cx+4,cy+CELL-2),n,fill='#4a3628')
img.save('/tmp/icons.png')"
```

需要 Pillow(`pip install pillow`),仅预览用,生成 CSS 不需要。

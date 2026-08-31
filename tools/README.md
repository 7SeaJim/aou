# 像素素材生成器

UI 的图标边框、游戏画面里的海鸥和道具,都不是手写 SVG / 手写 canvas,
而是从**可读的像素网格**生成的。改素材改这里,别直接改 css 和 js。

```bash
python3 tools/emit.py     # 或 npm run icons
```

一条命令生成三样东西:

| 产物 | 内容 |
|---|---|
| `css/pixel-icons.css` | 42 个图标的内联 SVG + 尺寸类 |
| `css/pixel-tokens.css` 里的 `--frame-*` | 三种边框 |
| `js/game/pixels.js` | 图标 + 画面素材的字符网格,运行时由 `pixmap.js` 烤成离屏 canvas |

| 文件 | 内容 |
|---|---|
| `pal.py` | 调色板(字符 → 颜色)+ SVG 输出(同色合并成 path,体积小 5 倍) |
| `icons.py` | 16×16 图标的**总表**。自己有一批,再把下面几个分表 update 进来 |
| `dishes.py` | 九道料理的图标 |
| `upgrades.py` | 摊位那四条升级线(炉子/招牌/货架/保温箱)+ 重画的辣椒 |
| `kitchen.py` | 厨房那四件家什(砧板/煎盘/灶台/烤箱) |
| `scenery.py` | 游戏画面用的图:海鸥四帧、乌云/气球/风筝、木桶、灯塔、小船 |
| `stall.py` `stallparts.py` | 小摊的四个阶段,和拼它的零件 |
| `people.py` | 大坝上的游客,四个人 × 三个姿势 |
| `cat.py` | 折耳根,上班的和睡着的两张 |
| `wear.py` | 装扮(哇鸥戴的东西)。每件两套图:小屋近景的大图 + 大坝上的小图 |
| `frames.py` | 28×28 边框,程序生成:45° 斜接倒角 + 转角铆钉 + 木板接缝 |
| `emit.py` | 把上面几个编译成 CSS 和 JS |
| `font.py` | 像素字体子集化(588KB → 50KB)。`--check` 挂在 `npm run build` 上 |
| `sim.mjs` | 数值模拟,`node tools/sim.mjs` |

分表的图最后都汇进 `icons.py` 的 `ICONS`,用法上没区别 ——
分开只是为了一个文件不要滚到一千行。**新图放哪个表看它属于哪一类**,
拿不准就放 `icons.py`。

## 画的时候记着的几条

**斜着接的地方不补拐角。** 像素画里 (1,1) 接 (2,2),就只点这两格,
中间的 (1,2) 不上色。所以描边、画线、画弧都不能「沿着路径铺一条宽带」——
那样每个拐角都会被补成直角,线看着就笨。
正确的做法是**逐格判断**:这一格底下(或旁边)是不是空的,是才点一笔。

**描边按「一个东西」描,不是按「一个图形」描。** 脑袋加耳朵是一个东西,
里头不该有线;脑袋和身子是两个东西,中间必须有线。
叠在同色形状上的部件必须自己带边 —— 整体描边只描最外一圈,
一块橙贴在橙上等于没画。

**判断一个图标行不行,要放在它真正会出现的底色上看。** 面板是沙色的,
一块沙色的饼画上去就只剩一圈描边。

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

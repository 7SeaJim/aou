import os, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'css', '')
from pal import PAL, to_svg, to_uri
from icons import ICONS
from scenery import SCENERY, waou_frames, HUT_IDLE
from wear import WEAR
import frames
from urllib.parse import quote

def frame_uri(name):
    from collections import defaultdict
    from pal import runs_to_svg
    g = frames.build(*frames.FRAMES[name])
    N = frames.N
    runs = defaultdict(list)
    for y in range(N):
        x = 0
        while x < N:
            c = g.get((x, y))
            if c is None:
                x += 1; continue
            x0 = x
            while x < N and g.get((x, y)) == c:
                x += 1
            runs[c].append((x0, y, x - x0))
    return "data:image/svg+xml," + quote(runs_to_svg(runs, N, N), safe="/:=,- ")

# ---------- 边框 ----------
out = []
for name in frames.FRAMES:
    out.append(f'    --frame-{name}: url("{frame_uri(name)}");')
FRAMES_OUT = "\n".join(out) + "\n"

# ---------- 居中体检 ----------
def bbox(grid):
    xs = [x for r in grid for x, c in enumerate(r) if c != '.']
    ys = [y for y, r in enumerate(grid) for c in r if c != '.']
    return min(xs), max(xs), min(ys), max(ys)

off = []
for name, grid in ICONS.items():
    x0, x1, y0, y1 = bbox(grid)
    dx = ((15 - x1) - x0) / 2
    dy = ((15 - y1) - y0) / 2
    # 内容宽/高是奇数时不可能整好居中,允许半格
    if abs(dx) > 0.5 or abs(dy) > 0.5:
        off.append(f'  {name}: 需要右移 {dx:+.1f}、下移 {dy:+.1f} 格')
assert not off, "以下图标在 16×16 里没摆正,会和同行的图标高低不齐:\n" + "\n".join(off)

# ---------- 图标 ----------
lines = ["""/* ============================================================
   pixel-icons.css — 16×16 手绘像素图标(由 tools/emit.py 生成,别手改)
   全部内联 SVG,无图片文件。颜色沿用 pixel-tokens.css 的色板。

   用法:<i class="px-icon px-icon--fries"></i>
        尺寸 16 / --lg 32 / --xl 48,固定 px,不跟字号走。
        源图是 16×16,只有整数倍缩放才不会像素一大一小。
   ============================================================ */

:root {"""]
for name, grid in ICONS.items():
    lines.append(f'    --icon-{name}: url("{to_uri(to_svg(grid))}");')
lines.append("}\n")
lines.append("""/* 图标本体。
   尺寸写死 px 且是 16 的整数倍:em 会随各处字号变成 18.75px / 40px 这种
   非整数倍,pixelated 下像素就一行 1px 一行 2px,看着像糊了又没摆正。
   vertical-align 同理只用整数 px —— 半像素基线偏移会让图标压到边框上。
   放在 flex 容器里(.px-btn/.px-chip/.px-slot)时 vertical-align 自动失效,
   由 align-items:center 精确居中,这是首选用法。 */
.px-icon {
    display: inline-block;
    width: 16px;
    height: 16px;
    vertical-align: -3px;
    background-repeat: no-repeat;
    background-position: center;
    background-size: 16px 16px;
    image-rendering: pixelated;
    flex: none;
}
.px-icon--lg {
    width: 32px; height: 32px;
    background-size: 32px 32px;
    vertical-align: -10px;
}
.px-icon--xl {
    width: 48px; height: 48px;
    background-size: 48px 48px;
    vertical-align: -18px;
}
""")
for name in ICONS:
    lines.append(f'.px-icon--{name} {{ background-image: var(--icon-{name}); }}')
open(OUT + 'pixel-icons.css', 'w').write("\n".join(lines) + "\n")

# 把新边框写回 pixel-tokens.css
tok_path = OUT + 'pixel-tokens.css'
tok = open(tok_path).read()
for line in FRAMES_OUT.strip().split("\n"):
    line = line.strip()
    name = re.match(r'--frame-(\w+):', line).group(1)
    pat = re.compile(r'    --frame-' + name + r': url\("[^"]*"\);')
    assert pat.search(tok), f'pixel-tokens.css 里找不到 --frame-{name}'
    tok = pat.sub('    ' + line, tok)
open(tok_path, 'w').write(tok)

print(f"边框 {len(frames.FRAMES)} 个 -> css/pixel-tokens.css")
print(f"图标 {len(ICONS)} 个 -> css/pixel-icons.css "
      f"({os.path.getsize(OUT + 'pixel-icons.css')/1024:.1f} KB)")

# ---------- 游戏画面用的像素图 -> js/game/pixels.js ----------
# 画面里的东西和 UI 图标出自同一批字符网格,不会出现「界面是像素、画面不是」
JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'game', 'pixels.js')

def js_grid(grid):
    return "[" + ",".join('"%s"' % r for r in grid) + "]"

js = ["""// 由 tools/emit.py 生成,别手改 —— 改素材去 tools/icons.py / tools/scenery.py / tools/wear.py。
// 字符网格 + 调色板,运行时由 pixmap.js 烤成离屏 canvas。
"""]
js.append("export const PAL = {")
for ch, color in PAL.items():
    if color:
        js.append("    '%s': '%s'," % (ch, color))
js.append("};")
js.append("")
js.append("/** 16×16 UI 图标。画面里的食材/道具直接用这批图,和背包里长得一模一样 */")
js.append("export const ICON_GRIDS = {")
for name, grid in ICONS.items():
    js.append("    %s: %s," % (name, js_grid(grid)))
js.append("};")
js.append("")
js.append("/** 画面道具:障碍、码头陈设 */")
js.append("export const SCENERY = {")
for name, grid in SCENERY.items():
    js.append("    %s: %s," % (name, js_grid(grid)))
js.append("};")
js.append("")
js.append("""/** 装扮。每件两套图:big 给小屋近景,small 给大坝上那只小的。
 *  bigY / smallY 是网格顶行落在精灵图坐标系里的 y,水平方向按中心对齐。
 *  为什么要两套见 tools/wear.py —— 一套图缩放到另一个尺度会糊掉。 */""")
js.append("export const WEAR = {")
for name, v in WEAR.items():
    js.append("    %s: { big: %s, bigY: %d, small: %s, smallY: %d }," % (
        name, js_grid(v['big']), v['big_y'], js_grid(v['small']), v['small_y']))
js.append("};")
js.append("")
js.append("""/** 小屋里的待机四帧(原作者给的像素稿,表情改过 —— 见 tools/idleart.py)。
 *  **四帧共用一个并集框**,所以它们不走 SCENERY 那条路(那条会各自裁空白,
 *  裁完播起来身子会跳)。 */""")
js.append("export const HUT_IDLE = [")
for g in HUT_IDLE:
    js.append("    %s," % js_grid(g))
js.append("];")
js.append("")
js.append("/** 哇鸥飞行四帧:身体不动只换翅膀,重心恒定,播起来不抖 */")
js.append("export const WAOU = [")
for g in waou_frames():
    js.append("    %s," % js_grid(g))
js.append("];")

open(JS, 'w').write("\n".join(js) + "\n")
print("画面素材 -> js/game/pixels.js (%.1f KB)" % (os.path.getsize(JS) / 1024))

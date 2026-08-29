---
name: lean-loop
description: 在这个像素游戏仓库里做长会话迭代时的低耗读写方式。改素材、调画面、反复截图验证时用。它讲的是「怎么在不烧光上下文的前提下改东西」——包括为什么不要用 python heredoc 改文件、截图怎么合并、验证脚本怎么写。任何预计要改十次以上的任务开始前先读它。
---

# 低耗迭代

这个仓库的活儿有个特点:**改一次要看一次**。像素画调一版就得截图，
数值改一次就得跑一遍。一个下午几十轮下来，上下文很容易烧穿。

下面这些不是通用建议，是**在这个仓库里真实烧掉过几十万 token 换来的**。

---

## 一、别用 python heredoc 改文件

这是本仓库里最大的一个坑，**占掉过整个会话约四分之一的上下文**。

```bash
# ✗ 每改一次，harness 会把整个文件回显进上下文
python3 - <<'EOF'
p='js/ui.js'; s=open(p).read()
s = s.replace(old, new)
open(p,'w').write(s)
EOF
```

`js/ui.js` 六百多行、`design.html` 七百多行、`tools/scenery.py` 一千行 ——
每写一次就是一次全文回显。改十次就是一万行。

**改用 Edit / Write 工具。** harness 知道是你写的，不回显。

heredoc 只在这两种情况下才值得用：

1. **一次要做五处以上的机械替换**（省下五次 Edit 的往返）
2. **需要跑逻辑才能生成内容**（比如从 `tools/` 导出网格再拼进源文件）

即便如此，也**必须每处替换都带断言**：

```python
def sub(old, new, why=''):
    global s
    assert old in s, f'找不到: {why or old[:50]}'
    s = s.replace(old, new, 1)
```

`str.replace` 找不到目标时**静默什么都不做**。本会话被这个咬过两次：
一次 `paintMoon` 没插进去导致夜景整块空白，一次整批改动因为最后一处
断言失败而全部没写入。**没有断言的批量替换等于没做。**

---

## 二、看文件用切片，不用 cat

```bash
# ✗ 把四百行灌进上下文
cat css/pixel-ui.css

# ✓ 只要需要的那段
sed -n '120,160p' css/pixel-ui.css
grep -n "px-tabs" css/pixel-ui.css
```

本仓库里超过 200 行、不该整读的文件：

| 文件 | 行数量级 | 要看就 grep |
|---|---|---|
| `tools/scenery.py` | 1000+ | 素材网格，只 grep 名字确认存在 |
| `js/game/pixels.js` | 生成物 | **永远不要读**，看 `tools/` 的源 |
| `js/ui.js` `js/game/scene.js` | 300–600 | `sed -n` 或 `grep -n` |
| `design.html` | 700+ | 只 grep 要改的那段锚点 |
| `package-lock.json` | — | 永远不读 |

**Read 工具带 offset/limit**，比 `cat` 好；但对已知结构的文件，
`grep -n` 找到行号再 `sed -n` 取一小段更省。

---

## 三、截图:合并、裁紧、别重复看

像素画必须看，但可以看得便宜。

```bash
# ✓ 三个状态拼成一张，一次 Read 看完
python3 -c "
from PIL import Image
ims=[Image.open(f'/tmp/x_{t}.png').crop((40,140,960,820)) for t in ('day','dusk','night')]
W,H=ims[0].size
out=Image.new('RGB',(W,H*3)); [out.paste(im,(0,i*H)) for i,im in enumerate(ims)]
out.resize((W*3//4,H*3*3//4)).save('/tmp/all.png')"
```

三条规则：

1. **裁到只剩要看的部分。** 要看标签页就裁标签页那 120px，别截整页。
2. **多状态合成一张。** 三种天气、三个时段、四帧动画 —— 一张图看完。
3. **改完确认用 NEAREST 放大局部**，别整图放大。

素材本身（图标、精灵图）用 `tools/` 里的 Pillow 预览脚本渲染成一张长条图，
比在浏览器里截图快也便宜。

---

## 四、验证脚本要打印结论，不是打印数据

```bash
# ✗ 把整个存档对象倒出来
node -e "console.log(JSON.stringify(migrate(save)))"

# ✓ 只打印判断结果
node --input-type=module -e "
import { migrate } from './js/state.js';
const a = migrate(v1);
console.log('饵块应为 5 ->', a.backpack.erkuai, '| 订单清空', a.orders.length);
"
```

本仓库里能一行验完的事：

```bash
# 素材居中体检 + 生成
python3 tools/emit.py | tail -1

# 构建
npx vite build 2>&1 | grep -E "✓ built|error"

# 生产包里该有/不该有的
grep -c "扑棱翅膀" dist/assets/index-*.js      # 功能文案应 ≥1
grep -o "wa.help" dist/assets/index-*.js | wc -l   # dev 工具应为 0

# 存档迁移全链路
node --input-type=module -e "
import { migrate } from './js/state.js';
for (const [n,s] of Object.entries(SAVES)) {
  const a = migrate(s); console.log(n+'→v'+a.version, a.coins);
}"
```

---

## 五、dev server 用后台任务起

`(npx vite ... &)` 起的进程会在后续某次 `pkill` 或 shell 退出时莫名死掉，
然后你会对着一堆 `This site can't be reached` 的截图调半天 —— 本会话浪费过
三四轮在这上面。

```
Bash(command="npx vite --port 5199 --host 127.0.0.1", run_in_background=true)
```

后台任务跨轮次存活。**起完先 `curl -o /dev/null -w "%{http_code}"` 确认 200**，
再开始截图。截出空白图先怀疑服务器，不要先怀疑代码。

---

## 六、浏览器里验交互:把结论写进 document.title

headless chromium 抓 console 很不稳。把要验的东西写进标题，
`--dump-dom | grep -o "<title>...` 一定拿得到。

```html
<script type="module">
const out=[];
for (let i=0;i<80 && !window.wa;i++) await new Promise(r=>setTimeout(r,50));
const t=(n,f)=>{try{f(); out.push(n+'=OK');}catch(e){out.push(n+'=FAIL('+e.message+')');}};
t('占卜', ()=>{ /* ... */ });
document.title = 'RESULT ' + out.join(' | ');
</script>
```

把它 append 到 `index.html` 的副本上（`cp index.html _t.html`），
**测完立刻 `rm`** —— 本会话有两次临时文件漏删，进了 git status。

---

## 七、不要做的事

- **改完不要再读一遍确认。** Edit/Write 失败会报错，成功就是成功了。
- **不要读生成物**（`js/game/pixels.js`、`css/pixel-icons.css`、`dist/`）。
  要确认素材，读 `tools/` 里的源，或跑 Pillow 预览。
- **不要 `git diff` 大文件**，用 `git status --short` + `git show --stat`。
- **同一张截图不要看两次。** 要对比就在 Python 里拼成一张。

---

## 八、上下文快满时

到 90% 左右主动收口，别等自动压缩把关键决策丢掉：

1. 把**尚未写进文档的决策**补进 `DESIGN.md`——它是跨会话的记忆载体，
   比对话历史可靠
2. 把**改动提交掉**，commit message 写清楚做了什么、为什么
3. 确认工作区干净、临时文件删干净
4. 然后再压缩

`DESIGN.md` 和 `README.md` 里那些「为什么这么定」「踩过什么坑」的段落
不是文档洁癖 —— 它们是压缩之后新会话唯一能读到的上下文。

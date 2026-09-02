"""把像素字体裁到游戏真正用得上的那些字。

Fusion Pixel 完整包是 31345 个码位、602 KB(woff2)。游戏里出现的汉字
一千出头 —— 剩下三万个字形是纯粹的过路费,而且这笔费用是**首屏**付的。

用法:
    python3 tools/font.py           重新生成 css/fonts/waou-pixel.woff2
    python3 tools/font.py --check   只检查:源码里有没有字不在现有子集里

**改了界面文案就要重跑一次。** 漏掉的字不会报错,只会无声无息掉回系统字体 ——
一句话里几个字忽然变了样,比整段用错字体还难看。所以有 --check,
它挂在 `npm run build` 上。

`--check` **不依赖 fontTools**:生成的时候顺手把「子集里有哪些字」写进
`waou-pixel.chars.txt`,检查只要读这个清单。
这样 CI 上不装 fontTools 也跑得动 —— 而在线部署的构建机就是不装的,
第一次推上去就是在这儿挂的。
**一个检查如果只能在作者的机器上跑,它就不是检查,是习惯。**

注意它连**注释**里的字一起收。分不清哪句话会渲染、哪句只是注释,与其
写个半吊子的注释剥离器(剥错了就是静默漏字),不如多收几 KB 换一个
「只会误报、不会漏报」的检查。代价是改注释也可能要求重跑一次。
"""

import os, sys, glob, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FONT = os.path.join(
    ROOT, 'node_modules', '@fontsource', 'fusion-pixel-12px-proportional-sc',
    'files', 'fusion-pixel-12px-proportional-sc-latin-400-normal.woff2')
OUT_DIR = os.path.join(ROOT, 'css', 'fonts')
OUT = os.path.join(OUT_DIR, 'waou-pixel.woff2')
# 子集里到底有哪些字。**给 --check 用的**,免得它为了读一遍 cmap 就得装 fontTools。
# 里面存两份:真的进了子集的,和源字体本来就没有、怎么重跑也补不上的。
MANIFEST = os.path.join(OUT_DIR, 'waou-pixel.chars.json')

# 会渲染到页面上的东西。design.html 用的是 Google Fonts,不在这里。
# tools/ 和 template/ 不进浏览器;dist/ 是产物。
SOURCES = ['index.html', 'style-preview.html',
           'js/**/*.js', 'css/**/*.css']

# 兜底字符集。源码里未必出现,但运行时会冒出来:
#   数字和 ASCII —— 存档码是 base64,分数、价格全是数字
#   全角标点 —— 文案里在用
#   几个可能被浏览器/系统塞进来的符号
EXTRA = (
    ''.join(chr(c) for c in range(0x20, 0x7f))
    + '　、。〈〉《》「」『』【】〔〕・ー–—―…‰′″‹›※¥°±×÷≈≠≤≥→←↑↓○●◆◇■□▲△☆★'
    + '①②③④⑤⑥⑦⑧⑨⑩'
)


def used_chars():
    chars = set(EXTRA)
    files = []
    for pat in SOURCES:
        files += glob.glob(os.path.join(ROOT, pat), recursive=True)
    for f in sorted(set(files)):
        with open(f, encoding='utf-8') as fh:
            chars |= set(fh.read())
    # 控制字符不占字形
    return {c for c in chars if ord(c) >= 0x20 or c in '\t'} - set('\t\n\r')


def cmap_of(path):
    from fontTools.ttLib import TTFont
    return set(TTFont(path).getBestCmap().keys())


def check(chars):
    """只看清单,不碰字体文件 —— 所以不需要 fontTools,也不需要 node_modules。"""
    if not os.path.exists(MANIFEST):
        # 清单还没生成过(老仓库)。退回去用 fontTools;它也没有就只警告不拦 ——
        # **一个跑不了的检查不该把构建拦死**,那只会逼着人去掉这一步
        if not os.path.exists(OUT):
            sys.exit('还没生成过子集,先跑一次 python3 tools/font.py')
        try:
            have, absent = cmap_of(OUT), set()
        except ImportError:
            print('字体检查跳过:没有 fontTools,也没有字符清单 —— '
                  '在本机跑一次 python3 tools/font.py 生成清单')
            return
    else:
        with open(MANIFEST, encoding='utf-8') as fh:
            m = json.load(fh)
        have = {ord(c) for c in m['in']}
        absent = {ord(c) for c in m['absent']}

    missing = [c for c in sorted(chars) if ord(c) not in have and ord(c) not in absent]
    if missing:
        sys.exit('这些字在源码里出现了,但不在字体子集里 —— 会掉回系统字体:\n  '
                 + ''.join(missing) + '\n重跑 python3 tools/font.py')
    print(f'字体子集 OK:{len(chars)} 个字符都在')


def main():
    chars = used_chars()

    if '--check' in sys.argv:
        check(chars)
        return

    if not os.path.exists(SRC_FONT):
        sys.exit(f'找不到源字体,先 npm i:\n  {SRC_FONT}')

    os.makedirs(OUT_DIR, exist_ok=True)
    from fontTools import subset
    args = [
        SRC_FONT,
        '--output-file=' + OUT,
        '--flavor=woff2',
        '--text=' + ''.join(sorted(chars)),
        '--layout-features=*',
        '--no-hinting',
        '--desubroutinize',
    ]
    subset.main(args)

    # 把「子集里有哪些字」记下来,给 --check 用。
    # absent 是「要了但源字体没有」的那些 —— 记下来,不然每次检查都会把它们
    # 当成漏字报出来,而重跑一百遍也补不上
    have = cmap_of(OUT)
    full = cmap_of(SRC_FONT)
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump({
            'in': ''.join(sorted(c for c in chars if ord(c) in have)),
            'absent': ''.join(sorted(c for c in chars if ord(c) not in full)),
        }, fh, ensure_ascii=False)

    a = os.path.getsize(SRC_FONT) / 1024
    b = os.path.getsize(OUT) / 1024
    print(f'字体子集 -> css/fonts/waou-pixel.woff2')
    print(f'  {len(chars)} 个字符 · {a:.0f} KB -> {b:.0f} KB(省了 {a - b:.0f} KB,{(1 - b / a) * 100:.0f}%)')


if __name__ == '__main__':
    main()

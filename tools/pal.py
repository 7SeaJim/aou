# 共享调色板:与 pixel-tokens.css 的色板一致
PAL = {
    '.': None,
    'K': '#4a3628',  # ink 描边
    'w': '#fffdf4',  # foam
    'Y': '#f5b83d',  # gold
    'y': '#ffe08a',  # gold light
    'o': '#c98a1e',  # gold dark
    'X': '#e8384f',  # 哇鸥红(嘴、脚)——红嘴鸥的招牌
    'V': '#dfe4e8',  # 肚皮灰
    'R': '#ef7757',  # coral
    'r': '#c14e33',  # coral dark
    'G': '#77b255',  # leaf
    'g': '#4e8236',  # leaf dark
    'B': '#62c4cc',  # sea
    'b': '#2e8ca3',  # sea deep
    'N': '#1d5f76',  # sea ink
    'L': '#e0b077',  # wood light
    'D': '#cf9862',  # wood
    'd': '#9c6b43',  # wood dark
    'S': '#f7ecca',  # sand
    's': '#dfc98e',  # sand3
    'A': '#b8b0a0',  # gray
    'H': '#8a99a3',  # 暴风灰
    'h': '#5f6d78',  # 暴风灰·暗
    'a': '#7d7668',  # gray dark
    'M': '#8b5a2b',  # meat
    'C': '#ffd24a',  # cheese
    'F': '#4a9fd8',  # fish
    'f': '#2c6fa0',  # fish dark
    'E': '#fff3d6',  # egg
    'e': '#e8d5a8',  # egg shadow
    'p': '#f2a0b5',  # shell pink
    'q': '#d97f99',  # shell pink dark
    'T': '#c8894e',  # bread crust
    't': '#8a5c34',  # bread dark
}

def to_svg(grid, w=None, h=None):
    """把字符网格转成合并同色横条的紧凑 SVG"""
    h = h or len(grid)
    w = w or len(grid[0])
    for i, row in enumerate(grid):
        assert len(row) == w, f"第 {i} 行宽度 {len(row)} != {w}: {row!r}"
    assert len(grid) == h, f"行数 {len(grid)} != {h}"
    return runs_to_svg(scan(grid, w), w, h)


def scan(grid, w):
    """逐行扫描出同色横条 -> {颜色: [(x, y, 宽), ...]}"""
    from collections import defaultdict
    runs = defaultdict(list)
    for y, row in enumerate(grid):
        x = 0
        while x < w:
            c = row[x]
            if c == '.':
                x += 1; continue
            x0 = x
            while x < w and row[x] == c:
                x += 1
            runs[PAL[c]].append((x0, y, x - x0))
    return runs


def runs_to_svg(runs, w, h):
    """同色横条合并成竖向矩形,再按颜色合成单条 path(比逐个 rect 小得多)"""
    parts = []
    for color, rs in runs.items():
        # 上下行完全相同的横条并成一个矩形
        by_key = {}
        for x, y, ww in rs:
            by_key.setdefault((x, ww), []).append(y)
        boxes = []
        for (x, ww), ys in by_key.items():
            ys.sort()
            start = prev = ys[0]
            for y in ys[1:]:
                if y == prev + 1:
                    prev = y; continue
                boxes.append((x, start, ww, prev - start + 1))
                start = prev = y
            boxes.append((x, start, ww, prev - start + 1))
        d = "".join(f"M{x} {y}h{ww}v{hh}h-{ww}z" for x, y, ww, hh in sorted(boxes))
        parts.append(f'<path fill="{color}" d="{d}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{"".join(parts)}</svg>')

def to_uri(svg):
    from urllib.parse import quote
    return "data:image/svg+xml," + quote(svg, safe="/:=,- ")

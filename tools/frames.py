"""28x28 边框图,slice 6。相比同心环写法多了:
   - 45° 斜接倒角(上/左受光,下/右背光),而不是四面同色
   - 转角铆钉
   - 边上每 16px 一道木板接缝(配合 border-image-repeat: round 循环)
"""
N = 28
SLICE = 6

def build(outline, light, mid, dark, seam=True, rivet=True):
    # 每个面从外到内的 6 层色阶
    face = {
        'top':    [outline, light, light, mid,  mid,  outline],
        'left':   [outline, light, light, mid,  mid,  outline],
        'bottom': [outline, dark,  dark,  mid,  mid,  outline],
        'right':  [outline, dark,  dark,  mid,  mid,  outline],
    }
    g = {}
    for y in range(N):
        for x in range(N):
            dt, db, dl, dr = y, N-1-y, x, N-1-x
            d = min(dt, db, dl, dr)
            if d >= SLICE:
                continue                      # 中心区,border-image 不取
            # 距离最近的那个面决定颜色;相等时归给纵向面,自然形成 45° 斜接
            if d == dt:   f = 'top'
            elif d == db: f = 'bottom'
            elif d == dl: f = 'left'
            else:         f = 'right'
            g[(x, y)] = face[f][d]

    # 阶梯像素角:切掉最外层的角,描边沿台阶走
    for (cx, cy) in [(0,0), (N-1,0), (0,N-1), (N-1,N-1)]:
        sx = 1 if cx == 0 else -1
        sy = 1 if cy == 0 else -1
        for dx, dy in [(0,0), (1,0), (0,1)]:
            g.pop((cx + sx*dx, cy + sy*dy), None)
        g[(cx+sx*1, cy+sy*1)] = outline
        g[(cx+sx*2, cy+sy*1)] = outline
        g[(cx+sx*1, cy+sy*2)] = outline

    # 转角铆钉:2x2 暗点,压在倒角上
    if rivet:
        for (cx, cy) in [(0,0), (N-1,0), (0,N-1), (N-1,N-1)]:
            sx = 1 if cx == 0 else -1
            sy = 1 if cy == 0 else -1
            for dx, dy in [(3,3), (4,3), (3,4), (4,4)]:
                g[(cx + sx*dx, cy + sy*dy)] = dark
            g[(cx + sx*3, cy + sy*3)] = outline   # 铆钉受光的一角压暗描边

    # 木板接缝:每段边中央一道暗线。只切中间两层、用暗色而非描边黑,
    # 否则边框会被切成一节节的锁链状
    if seam:
        for i in range(SLICE, N - SLICE):
            if (i - SLICE) % 16 != 7:
                continue
            for d in (2, 3):
                g[(i, d)] = dark               # 上边
                g[(i, N-1-d)] = dark           # 下边
                g[(d, i)] = dark               # 左边
                g[(N-1-d, i)] = dark           # 右边

    return g

def to_grid(g, inv):
    """稀疏字典 -> 字符网格,inv 是 颜色->字符 的映射"""
    return [''.join(inv.get(g.get((x, y)), '.') for x in range(N)) for y in range(N)]

FRAMES = {
    #  name        outline    light      mid        dark
    'wood': ('#4a3628', '#e0b077', '#cf9862', '#9c6b43'),
    'gold': ('#4a3628', '#ffe08a', '#f5b83d', '#c98a1e'),
    'sea':  ('#4a3628', '#a5e3e0', '#62c4cc', '#2e8ca3'),
}

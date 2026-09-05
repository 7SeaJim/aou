"""把 dist-minitool/ 打成小红书小工具的 zip,并按规范自检。

规范在 `.claude/skills/minitool-zip-builder/references/zip-artifact-spec.md`。
这个脚本只管**打包和结构门禁**那几条:能力扫描、兼容性那些是改源码的事,
不是打包能补的。

为什么不直接 `zip -r`:

  · **压缩的是目录里的东西,不是目录本身。** `zip -r tool.zip dist` 解出来是
    `dist/index.html`,而容器要的是根目录就有 `index.html` —— 这是规范里
    专门拎出来讲的那个坑,而两条命令长得几乎一样。用 zipfile 按相对路径写,
    这个错犯不出来。
  · 顺手把「只许这些后缀」「不许有 node_modules / *.map / 构建配置」
    这两条门禁做掉:打包这一步是最后一道关,漏过去就上传了。
  · 固定时间戳,同样的产物打出同样的 zip —— 便于比对两次构建是不是真的一样。

用法:
    python3 tools/packmini.py [源目录] [输出 zip]
"""
import sys
import zipfile
from pathlib import Path

ALLOWED = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif',
           '.webp', '.svg', '.woff', '.woff2', '.json'}
BANNED_NAMES = {'node_modules', '.git', '.DS_Store', 'Thumbs.db'}
BANNED_SUFFIX = {'.map', '.webmanifest', '.ts', '.md'}
# 固定时间戳:zip 里存的时间不影响内容,但会让两次打包的字节不一样
STAMP = (2026, 1, 1, 0, 0, 0)


def collect(root: Path):
    """把要打包的文件按 zip 内相对路径列出来,顺带报出违规的"""
    files, bad = [], []
    for p in sorted(root.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if set(rel.parts) & BANNED_NAMES or rel.name in BANNED_NAMES:
            bad.append(f'{rel}: 开发垃圾文件,不该进 zip')
            continue
        suf = p.suffix.lower()
        if suf in BANNED_SUFFIX:
            bad.append(f'{rel}: {suf} 不该进 zip')
            continue
        if suf not in ALLOWED:
            bad.append(f'{rel}: {suf or "(无后缀)"} 不在允许的文件类型里')
            continue
        files.append((rel.as_posix(), p))
    return files, bad


def slim_font(root: Path) -> str:
    """把产物里那份 woff2 按**这个 bundle 真正用到的字**重裁一遍。

    为什么值得单做一步:量下来字体占最终 zip 的 **35%,而且它不可压** ——
    woff2 本身已经是压缩格式,deflate 再压一遍等于原样搬进去。
    zip 里其他东西压缩比都在 4~6 倍,只有它是 1:1。**要动就得动它本身。**

    省的是哪一部分:`tools/font.py` 平时扫的是**源码**,而源码里
    **37% 的汉字只出现在注释里**(量出来 1762 → 1117)。注释不进 bundle,
    那些字形却进了字体 —— 玩家下载了六百多个永远不会渲染的字。

    为什么这么裁是安全的,而不是"猜哪些是注释":

        bundle 里的字 = 会渲染的字的超集(注释已被 esbuild 剥干净)
        没进 bundle 的字,运行时无论如何也渲染不出来

    **不是剥得准,是根本不用剥。** 校验过:产物的字集是源码字集的严格子集,
    一个多出来的都没有。

    只动 `dist-minitool/` 里那一份,`css/fonts/` 下的源文件保持宽的 ——
    那份要给网页版用,而网页版的 `--check` 是照源码检的,窄了会满屏假阳性。
    """
    import subprocess
    fonts = list(root.rglob('*.woff2'))
    if not fonts:
        return '没有 woff2,跳过'
    before = sum(f.stat().st_size for f in fonts)
    try:
        from fontTools import subset          # noqa: F401
    except ImportError:
        return f'{before / 1024:.1f}K(没装 fontTools,未重裁)'

    sys.path.insert(0, str(Path(__file__).parent))
    import font as fontmod
    chars = fontmod.used_chars(root.name)
    for f in fonts:
        subprocess.run([sys.executable, '-m', 'fontTools.subset', str(f),
                        '--output-file=' + str(f), '--flavor=woff2',
                        '--text=' + ''.join(sorted(chars)),
                        '--layout-features=*', '--no-hinting',
                        '--desubroutinize'], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    after = sum(f.stat().st_size for f in fonts)
    return (f'{before / 1024:.1f}K -> {after / 1024:.1f}K '
            f'(省 {(before - after) / 1024:.1f}K,{len(chars)} 字)')


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist-minitool').resolve()
    out = Path(sys.argv[2] if len(sys.argv) > 2 else 'dist/waou-minitool.zip').resolve()
    if not root.is_dir():
        print(f'ERROR: 源目录不存在: {root}')
        return 2

    print('字体重裁: ' + slim_font(root))
    files, bad = collect(root)
    if not (root / 'index.html').is_file():
        bad.append('index.html 不在源目录根上 —— 容器只认根目录的 index.html')

    for m in bad:
        print(f'ERROR: {m}')
    if bad:
        print(f'FAILED: {len(bad)} 处结构问题,没有打包')
        return 1

    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, path in files:
            info = zipfile.ZipInfo(name, date_time=STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, path.read_bytes())

    size = out.stat().st_size
    print(f'打包 {len(files)} 个文件 -> {out}')
    print(f'  zip {size / 1048576:.2f} MiB'
          f'(上限 10 MiB,建议 2 MiB 以内)')
    with zipfile.ZipFile(out) as z:
        top = {n.split("/")[0] for n in z.namelist()}
        print(f'  解压后顶层: {", ".join(sorted(top))}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

/**
 * 存档码:把存档编成一串可复制的文本,玩家可以贴到别的设备恢复。
 *
 * 这是「无后端 + 无平台身份」环境下的解法 —— 同时解决清缓存丢档、
 * 跨设备、以及在社交平台上顺手晒进度三件事。
 *
 * 格式: AOU1.<C|R>.<base64url 负载>.<校验和>
 *   C = deflate 压缩过, R = 未压缩(环境不支持 CompressionStream 时)
 *   校验和是对负载算的,用来在解码前拦住复制漏字符的情况
 *
 * 安全性:存档码对玩家完全可读可改,等于把作弊入口摆在明面上。
 * 单机收集无所谓;将来要做排行榜,榜单数据不能信任存档码。
 */

const PREFIX = 'AOU1';
const HAS_CS = typeof CompressionStream !== 'undefined'
            && typeof DecompressionStream !== 'undefined';

export async function encodeSave(state) {
    const json = JSON.stringify(state);
    const raw = new TextEncoder().encode(json);

    let body = raw, mode = 'R';
    if (HAS_CS) {
        try {
            body = await pipe(raw, new CompressionStream('deflate-raw'));
            mode = 'C';
        } catch {
            body = raw; mode = 'R';
        }
    }
    const payload = b64urlEncode(body);
    return [PREFIX, mode, payload, checksum(payload)].join('.');
}

/**
 * 解码。失败时抛 Error,消息是可以直接给玩家看的中文。
 * 注意返回的对象还没过迁移/校验,调用方要再走 state.migrate()。
 */
export async function decodeSave(code) {
    const text = String(code ?? '').trim().replace(/\s+/g, '');
    if (!text) throw new Error('存档码是空的');

    const parts = text.split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX) {
        throw new Error('这不是一个有效的存档码');
    }
    const [, mode, payload, sum] = parts;
    if (checksum(payload) !== sum) {
        throw new Error('存档码不完整,可能复制时漏了字符');
    }

    let bytes;
    try {
        bytes = b64urlDecode(payload);
    } catch {
        throw new Error('存档码含有无法识别的字符');
    }

    if (mode === 'C') {
        if (!HAS_CS) throw new Error('当前环境无法解压这个存档码,请换个浏览器再试');
        try {
            bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
        } catch {
            throw new Error('存档码已损坏');
        }
    } else if (mode !== 'R') {
        throw new Error('存档码版本不支持');
    }

    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('存档码已损坏');
    }
}

/* ---------- 内部工具 ---------- */

async function pipe(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function b64urlEncode(bytes) {
    let bin = '';
    // 分块避免超长数组把 apply 的参数栈撑爆
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
                   .padEnd(Math.ceil(str.length / 4) * 4, '=');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** FNV-1a 32 位,取 base36。不是防篡改用的,只用来发现复制残缺。 */
function checksum(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).padStart(7, '0');
}

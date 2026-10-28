import { LIMITS, safePath, encoder, decoder, packageError } from './limits.ts';
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++)
        c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
} return (c ^ 0xffffffff) >>> 0; }
function bytesView(a: Uint8Array) { return new DataView(a.buffer, a.byteOffset, a.byteLength); }
export async function readZip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
    if (bytes.length > LIMITS.package || bytes.length < 22)
        packageError('패키지는 최대 20MB입니다.');
    const v = bytesView(bytes);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
        if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) {
            end = i;
            break;
        }
    if (end < 0)
        packageError('올바른 ZIP 패키지가 아닙니다.');
    const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), offset = v.getUint32(end + 16, true);
    if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || v.getUint16(end + 8, true) !== count || count > LIMITS.files || offset + size !== end)
        packageError('지원하지 않는 ZIP 구조입니다.');
    const files: Record<string, Uint8Array> = Object.create(null);
    const names = new Set<string>();
    let cursor = offset, total = 0;
    const spans: [
        number,
        number
    ][] = [];
    for (let n = 0; n < count; n++) {
        if (cursor + 46 > end || v.getUint32(cursor, true) !== 0x02014b50)
            packageError('손상된 ZIP 목록입니다.');
        const flags = v.getUint16(cursor + 8, true), method = v.getUint16(cursor + 10, true), crc = v.getUint32(cursor + 16, true), compressed = v.getUint32(cursor + 20, true), uncompressed = v.getUint32(cursor + 24, true), nameLen = v.getUint16(cursor + 28, true), extra = v.getUint16(cursor + 30, true), comment = v.getUint16(cursor + 32, true), local = v.getUint32(cursor + 42, true);
        if (flags & ~0x808 || ![0, 8].includes(method) || cursor + 46 + nameLen + extra + comment > end || v.getUint16(cursor + 34, true))
            packageError('암호화, ZIP64 및 분할 ZIP은 지원하지 않습니다.');
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
        cursor += 46 + nameLen + extra + comment;
        if (name.endsWith('/')) {
            safePath(name.slice(0, -1));
            if (uncompressed)
                packageError('잘못된 ZIP 폴더입니다.');
            continue;
        }
        safePath(name);
        const canonical = name.toLowerCase();
        if (names.has(canonical))
            packageError('중복된 ZIP 경로입니다.');
        names.add(canonical);
        total += uncompressed;
        if (total > LIMITS.package || uncompressed > LIMITS.image)
            packageError('압축 해제 크기 제한을 초과했습니다.');
        if (local + 30 > offset || v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 6, true) !== flags || v.getUint16(local + 8, true) !== method)
            packageError('손상된 ZIP 파일 헤더입니다.');
        if (!(flags & 8) && (v.getUint32(local + 14, true) !== crc || v.getUint32(local + 18, true) !== compressed || v.getUint32(local + 22, true) !== uncompressed))
            packageError('ZIP 헤더와 목록이 일치하지 않습니다.');
        const ln = v.getUint16(local + 26, true), le = v.getUint16(local + 28, true), start = local + 30 + ln + le, finish = start + compressed;
        if (finish > offset || decoder.decode(bytes.subarray(local + 30, local + 30 + ln)) !== name || spans.some(([a, b]) => local < b && finish > a))
            packageError('잘못된 ZIP 파일 범위입니다.');
        spans.push([local, finish]);
        const packed = bytes.slice(start, finish);
        let result: Uint8Array;
        if (method === 0) {
            if (compressed !== uncompressed)
                packageError('손상된 ZIP 크기입니다.');
            result = packed;
        }
        else {
            const reader = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done)
                        break;
                    length += part.value.length;
                    if (length > uncompressed || length > LIMITS.image) {
                        await reader.cancel();
                        packageError('ZIP 압축 폭탄이 차단되었습니다.');
                    }
                    chunks.push(part.value);
                }
            }
            finally {
                reader.releaseLock();
            }
            result = new Uint8Array(length);
            let at = 0;
            for (const c of chunks) {
                result.set(c, at);
                at += c.length;
            }
        }
        if (result.length !== uncompressed || crc32(result) !== crc)
            packageError('ZIP 파일 무결성 검사에 실패했습니다.');
        files[name] = result;
    }
    if (cursor !== end)
        packageError('손상된 ZIP 목록입니다.');
    return files;
}
export function writeZip(files: Record<string, Uint8Array>): Uint8Array {
    const entries = Object.entries(files);
    if (entries.length > LIMITS.files)
        packageError('파일 수 제한을 초과했습니다.');
    let length = 22;
    for (const [p, b] of entries) {
        safePath(p);
        length += 76 + 2 * encoder.encode(p).length + b.length;
    }
    if (length > LIMITS.package)
        packageError('패키지는 최대 20MB입니다.');
    const out = new Uint8Array(length), v = bytesView(out);
    let cursor = 0;
    const central: {
        name: Uint8Array;
        bytes: Uint8Array;
        offset: number;
        crc: number;
    }[] = [];
    for (const [p, b] of entries) {
        const name = encoder.encode(p), crc = crc32(b), offset = cursor;
        central.push({ name, bytes: b, offset, crc });
        v.setUint32(cursor, 0x04034b50, true);
        v.setUint16(cursor + 4, 20, true);
        v.setUint16(cursor + 6, 0x800, true);
        v.setUint32(cursor + 14, crc, true);
        v.setUint32(cursor + 18, b.length, true);
        v.setUint32(cursor + 22, b.length, true);
        v.setUint16(cursor + 26, name.length, true);
        out.set(name, cursor + 30);
        out.set(b, cursor + 30 + name.length);
        cursor += 30 + name.length + b.length;
    }
    const offset = cursor;
    for (const e of central) {
        v.setUint32(cursor, 0x02014b50, true);
        v.setUint16(cursor + 4, 20, true);
        v.setUint16(cursor + 6, 20, true);
        v.setUint16(cursor + 8, 0x800, true);
        v.setUint32(cursor + 16, e.crc, true);
        v.setUint32(cursor + 20, e.bytes.length, true);
        v.setUint32(cursor + 24, e.bytes.length, true);
        v.setUint16(cursor + 28, e.name.length, true);
        v.setUint32(cursor + 42, e.offset, true);
        out.set(e.name, cursor + 46);
        cursor += 46 + e.name.length;
    }
    v.setUint32(cursor, 0x06054b50, true);
    v.setUint16(cursor + 8, central.length, true);
    v.setUint16(cursor + 10, central.length, true);
    v.setUint32(cursor + 12, cursor - offset, true);
    v.setUint32(cursor + 16, offset, true);
    return out;
}

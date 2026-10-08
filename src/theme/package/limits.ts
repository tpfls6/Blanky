export const LIMITS = { package: 20 * 1024 * 1024, image: 5 * 1024 * 1024, icon: 500 * 1024, css: 100 * 1024, json: 256 * 1024, font: 2 * 1024 * 1024, files: 128 };
export function packageError(message: string): never { throw new Error(message); }
export function safePath(value: string): string {
    if (!value || value.length > 200 || !/^[a-zA-Z0-9_./-]+$/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..'))
        packageError('안전하지 않은 패키지 경로입니다: ' + value);
    return value;
}
export const encoder = new TextEncoder();
export const decoder = new TextDecoder('utf-8', { fatal: true });
export function toBase64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
export function fromBase64(s: string): Uint8Array { if (s.length > LIMITS.package * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
    packageError('손상된 파일 데이터입니다.'); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

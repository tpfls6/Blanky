import type { ThemePackage } from '../../../packages/types/src/themePackage.ts';
const memory = new Map<string, ThemePackage>();
const key = (user: string, id: string) => user + ':' + id;
async function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open('blanky-theme-packages', 1); request.onupgradeneeded = () => request.result.createObjectStore('packages'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function operation<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const database = await db(); try {
    return await new Promise((resolve, reject) => { const transaction = database.transaction('packages', mode); const request = fn(transaction.objectStore('packages')); transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
}
finally {
    database.close();
} }
export async function getLocalPackage(user: string, id: string): Promise<ThemePackage | undefined> { if (typeof indexedDB === 'undefined')
    return memory.get(key(user, id)); return operation('readonly', s => s.get(key(user, id))); }
export async function putLocalPackage(user: string, id: string, pkg: ThemePackage) { if (typeof indexedDB === 'undefined') {
    memory.set(key(user, id), pkg);
    return;
} await operation('readwrite', s => s.put(pkg, key(user, id))); }
export async function deleteLocalPackage(user: string, id: string) { if (typeof indexedDB === 'undefined') {
    memory.delete(key(user, id));
    return;
} await operation('readwrite', s => s.delete(key(user, id))); }

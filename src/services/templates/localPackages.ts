import type { InstalledTemplatePackage } from '../../template/package/schema.ts'
import { validatePackage } from '../../template/package/TemplateValidator.ts'

type Stored = InstalledTemplatePackage & { userId: string }

const memory = new Map<string, Stored>()
const keyOf = (user: string, id: string) => user + ':' + id

async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('blanky-template-packages', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('packages')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function operation<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('packages', mode)
      const request = fn(transaction.objectStore('packages'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

function readRow(value: unknown): Stored | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Stored
  if (typeof row.userId !== 'string' || typeof row.installedId !== 'string' || typeof row.installedAt !== 'string') return null
  try {
    const pkg = validatePackage(row)
    return { ...pkg, userId: row.userId, installedId: row.installedId, installedAt: row.installedAt }
  } catch {
    return null
  }
}

function publicOf(row: Stored): InstalledTemplatePackage {
  const { userId: _, ...pkg } = row
  return pkg
}

export async function listTemplatePackages(user: string): Promise<InstalledTemplatePackage[]> {
  if (typeof indexedDB === 'undefined') {
    return [...memory.values()].filter((item) => item.userId === user).map(publicOf)
  }
  const rows = await operation('readonly', (store) => store.getAll())
  return (Array.isArray(rows) ? rows : []).flatMap((item) => {
    const next = readRow(item)
    return next && next.userId === user ? [publicOf(next)] : []
  })
}

export async function putTemplatePackage(user: string, pkg: InstalledTemplatePackage) {
  const safe: Stored = { ...validatePackage(pkg), userId: user, installedId: pkg.installedId, installedAt: pkg.installedAt }
  if (typeof indexedDB === 'undefined') {
    memory.set(keyOf(user, safe.installedId), safe)
    return
  }
  await operation('readwrite', (store) => store.put(safe, keyOf(user, safe.installedId)))
}

export async function deleteTemplatePackage(user: string, installedId: string) {
  if (typeof indexedDB === 'undefined') {
    memory.delete(keyOf(user, installedId))
    return
  }
  await operation('readwrite', (store) => store.delete(keyOf(user, installedId)))
}

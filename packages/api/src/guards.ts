export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : null
}

export function readClock(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}:${match[2]}` : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

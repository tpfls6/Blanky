import type { Json } from './database.generated.ts'

export function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json
}

export function asRecord(value: Json | unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/** Accent ids persisted on Settings. A later account API can store the same id. */

export const ACCENT_IDS = ['purple', 'blue', 'green', 'orange', 'pink', 'red'] as const

export type AccentId = (typeof ACCENT_IDS)[number]

type Tone = {
  color: string
  hover: string
  light: string
  text: string
}

export type Accent = {
  id: AccentId
  label: string
  light: Tone
  dark: Tone
}

export const ACCENTS: readonly Accent[] = [
  {
    id: 'purple',
    label: 'Purple',
    light: { color: '#6B5BD0', hover: '#5A4BBD', light: '#F3F1FB', text: '#5346B8' },
    dark: { color: '#6B5BD0', hover: '#7D6FDB', light: '#241F3A', text: '#C4BBF2' },
  },
  {
    id: 'blue',
    label: 'Blue',
    light: { color: '#3A62B0', hover: '#315596', light: '#F1F4FB', text: '#2E528F' },
    dark: { color: '#3A62B0', hover: '#4E74BE', light: '#1A2436', text: '#B7CDF2' },
  },
  {
    id: 'green',
    label: 'Green',
    light: { color: '#3C8664', hover: '#317256', light: '#F0F6F3', text: '#2C684C' },
    dark: { color: '#3C8664', hover: '#4C9674', light: '#17261F', text: '#B5D9C6' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: { color: '#C27832', hover: '#A86628', light: '#FBF5EE', text: '#9A5E22' },
    dark: { color: '#C27832', hover: '#D08A48', light: '#2A2118', text: '#F0CBA6' },
  },
  {
    id: 'pink',
    label: 'Pink',
    light: { color: '#C15E80', hover: '#A84E6E', light: '#FBF2F6', text: '#A24C6A' },
    dark: { color: '#C15E80', hover: '#D07294', light: '#2A1C22', text: '#F3C2D2' },
  },
  {
    id: 'red',
    label: 'Red',
    light: { color: '#C25A54', hover: '#A84A44', light: '#FBF2F1', text: '#A24640' },
    dark: { color: '#C25A54', hover: '#D06E68', light: '#2A1C1B', text: '#F3C2BE' },
  },
]

export const DEFAULT_ACCENT: AccentId = 'blue'

const HEX = /^#[0-9a-fA-F]{6}$/

export function accentById(id: string | undefined): Accent {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[1]
}

/** Preset id or `#rrggbb`. Anything else falls back to blue. */
export function normalizeAccent(value: string | undefined): string {
  if (!value) return DEFAULT_ACCENT
  if (ACCENTS.some((accent) => accent.id === value)) return value
  if (HEX.test(value)) return value.toLowerCase()
  return DEFAULT_ACCENT
}

export function accentHex(value: string | undefined): string {
  if (value && HEX.test(value)) return value.toLowerCase()
  return accentById(value).light.color
}

export function normalizeSaved(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const colors = value
    .filter((item): item is string => typeof item === 'string' && HEX.test(item))
    .map((item) => item.toLowerCase())
  return [...new Set(colors)].slice(0, 8)
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function hexToRgb(hex: string): [number, number, number] {
  const bits = Number.parseInt(hex.slice(1), 16)
  return [(bits >> 16) & 255, (bits >> 8) & 255, bits & 255]
}

function rgbToHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => clampByte(value).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

function mix(from: string, to: string, amount: number): string {
  const start = hexToRgb(from)
  const end = hexToRgb(to)
  return rgbToHex(
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  )
}

function luminance(hex: string): number {
  const channels = hexToRgb(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function toneFromHex(hex: string, dark: boolean): Tone & { on: string } {
  const color = hex.toLowerCase()
  return {
    color,
    hover: mix(color, dark ? '#ffffff' : '#000000', dark ? 0.14 : 0.12),
    light: mix(color, dark ? '#141414' : '#ffffff', dark ? 0.82 : 0.88),
    text: mix(color, dark ? '#ffffff' : '#000000', dark ? 0.42 : 0.18),
    on: luminance(color) > 0.45 ? '#171717' : '#ffffff',
  }
}

function selfCheckAccent() {
  if (!import.meta.env.DEV) return
  if (normalizeAccent('nope') !== 'blue') throw new Error('accent fallback')
  if (normalizeAccent('#AABBCC') !== '#aabbcc') throw new Error('accent hex')
  if (toneFromHex('#f5e27a', false).on !== '#171717') throw new Error('pale accent text')
  if (toneFromHex('#1a2744', false).on !== '#ffffff') throw new Error('dark accent text')
  if (normalizeSaved(['#AABBCC', 'blue', '#aabbcc']).join() !== '#aabbcc') throw new Error('saved accents')
}

selfCheckAccent()

export function applyAccent(value: string | undefined, dark: boolean) {
  const preset = ACCENTS.find((accent) => accent.id === value)
  const tone = preset ? { ...(dark ? preset.dark : preset.light), on: '#ffffff' } : toneFromHex(accentHex(value), dark)
  const root = document.documentElement
  root.dataset.accent = preset?.id ?? 'custom'
  root.style.setProperty('--accent-color', tone.color)
  root.style.setProperty('--accent-primary', tone.color)
  root.style.setProperty('--accent-hover', tone.hover)
  root.style.setProperty('--accent-light', tone.light)
  root.style.setProperty('--accent-text', tone.text)
  root.style.setProperty('--accent-on', tone.on)
}

export function clearAccent() {
  const root = document.documentElement
  delete root.dataset.accent
  root.style.removeProperty('--accent-color')
  root.style.removeProperty('--accent-primary')
  root.style.removeProperty('--accent-hover')
  root.style.removeProperty('--accent-light')
  root.style.removeProperty('--accent-text')
  root.style.removeProperty('--accent-on')
}

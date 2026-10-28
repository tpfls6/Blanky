const GOOGLE_EVENT_COLORS = [
  { id: '1', hex: '#a4bdfc' },
  { id: '2', hex: '#7ae7bf' },
  { id: '3', hex: '#dbadff' },
  { id: '4', hex: '#ff887c' },
  { id: '5', hex: '#fbd75b' },
  { id: '6', hex: '#ffb878' },
  { id: '7', hex: '#46d6db' },
  { id: '8', hex: '#e1e1e1' },
  { id: '9', hex: '#5484ed' },
  { id: '10', hex: '#51b749' },
  { id: '11', hex: '#dc2127' },
] as const

const SWATCH_COLOR_ID: Record<string, string> = {
  '#3A62B0': '9',
  '#3C8664': '10',
  '#C27832': '6',
  '#C15E80': '4',
  '#6B5BD0': '3',
  '#C25A54': '11',
  '#737373': '8',
}

function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '').toUpperCase()
  if (/^[0-9A-F]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  if (/^[0-9A-F]{6}$/.test(hex)) return `#${hex}`
  return null
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function distance(left: string, right: string): number {
  const a = rgb(left)
  const b = rgb(right)
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

export function googleColorIdFromHex(value: string | null | undefined): string | null {
  const hex = value ? normalizeHex(value) : null
  if (!hex) return null
  const swatch = SWATCH_COLOR_ID[hex]
  if (swatch) return swatch
  let best = GOOGLE_EVENT_COLORS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const color of GOOGLE_EVENT_COLORS) {
    const next = distance(hex, color.hex)
    if (next < bestDistance) {
      best = color
      bestDistance = next
    }
  }
  return best.id
}

/** Record and category colors. Separate from the app accent. */
export const SWATCHES = [
  { name: 'Blue', hex: '#3A62B0' },
  { name: 'Green', hex: '#3C8664' },
  { name: 'Orange', hex: '#C27832' },
  { name: 'Pink', hex: '#C15E80' },
  { name: 'Purple', hex: '#6B5BD0' },
  { name: 'Red', hex: '#C25A54' },
  { name: 'Gray', hex: '#737373' },
] as const

export const DEFAULT_SWATCH = SWATCHES[0].hex

/** Pretendard for the public pages only. The app keeps its own (theme-controlled) font. */
const PRETENDARD = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'

export function loadBrandFont() {
  if (typeof document === 'undefined' || document.querySelector('link[data-brand-font]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = PRETENDARD
  link.crossOrigin = 'anonymous'
  link.dataset.brandFont = ''
  document.head.append(link)
}

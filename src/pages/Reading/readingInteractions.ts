import type { LibraryBook } from '@blanky/types'
export const UNCLASSIFIED = '__unclassified__'
export function bookCategories(book: LibraryBook): string[] { return book.book.categories?.filter(Boolean) ?? [] }
export function matchesCategory(book: LibraryBook, category: string): boolean { const categories = bookCategories(book); return category === 'all' || (category === UNCLASSIFIED ? !categories.length : categories.includes(category)) }
export function moveShelf<T extends {id: string}>(shelves: readonly T[], source: string, target: string): T[] {
 const from=shelves.findIndex(s=>s.id===source), to=shelves.findIndex(s=>s.id===target)
 if(from<0 || to<0 || from===to)return [...shelves]
 const next=[...shelves], [shelf]=next.splice(from,1);next.splice(to,0,shelf);return next
}

/** A Google Books category in the app's language (`reading.category.*`); one with no entry shows as it is. */
export function categoryLabel(category:string,t:(key:string)=>string):string{return category.includes('.')?category:t('reading.category.'+category)}

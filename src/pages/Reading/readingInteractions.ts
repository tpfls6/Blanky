import type { LibraryBook } from '@blanky/types'
export const UNCLASSIFIED = '__unclassified__'
export function bookCategories(book: LibraryBook): string[] { return book.book.categories?.filter(Boolean) ?? [] }
export function matchesCategory(book: LibraryBook, category: string): boolean { const categories = bookCategories(book); return category === 'all' || (category === UNCLASSIFIED ? !categories.length : categories.includes(category)) }
export function moveShelf<T extends {id: string}>(shelves: readonly T[], source: string, target: string): T[] {
 const from=shelves.findIndex(s=>s.id===source), to=shelves.findIndex(s=>s.id===target)
 if(from<0 || to<0 || from===to)return [...shelves]
 const next=[...shelves], [shelf]=next.splice(from,1);next.splice(to,0,shelf);return next
}

const CATEGORY_LABELS:Record<string,string>={'Fiction':'소설','Literary Fiction':'문학 소설','Nonfiction':'비문학','Biography & Autobiography':'인물 · 자서전','Business & Economics':'경제 · 경영','Computers':'컴퓨터 · 개발','Education':'교육','History':'역사','Philosophy':'철학','Psychology':'심리','Religion':'종교','Science':'과학','Self-Help':'자기계발','Social Science':'사회과학','Poetry':'시','Art':'예술','Music':'음악','Cooking':'요리','Health & Fitness':'건강','Travel':'여행','Juvenile Fiction':'어린이 소설','Comics & Graphic Novels':'만화'}
export function categoryLabel(category:string):string{return CATEGORY_LABELS[category]??category}

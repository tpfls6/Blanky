import { icons } from 'lucide-react'
import { ICONS } from '../../constants/icons.ts'
const seen=new Set<unknown>()
export const iconCatalog=Object.entries(icons).filter(([,icon])=>{if(seen.has(icon))return false;seen.add(icon);return true}).map(([name,icon])=>({name,icon,keywords:ICONS.find(i=>i.name===name)?.alias ?? ''}))
export function findReadingIcon(name:string) { return icons[name as keyof typeof icons] }

import { createElement, useEffect, useRef, useState } from 'react'
import { Grid2X2, Smile, Hand, Leaf, Plane, Shapes, Flag, Search, type LucideIcon } from 'lucide-react'
import { SWATCHES } from '../../constants/swatches.ts'
import { EMOJIS } from './readingEmoji.ts'

const emojiCategories = [
 { name: '전체', icon: Grid2X2 },
 { name: '표정', icon: Smile },
 { name: '사람', icon: Hand },
 { name: '자연 · 음식', icon: Leaf },
 { name: '여행', icon: Plane },
 { name: '사물 · 기호', icon: Shapes },
 { name: '국기', icon: Flag },
]
type Catalog=typeof import('./readingIconCatalog.ts')
let catalogPromise:Promise<Catalog>|undefined
const loadCatalog=()=>catalogPromise??=import('./readingIconCatalog.ts')
export function ReadingIcon({value}:{value:string}) {
 const [loaded,setLoaded]=useState<{value:string;icon:LucideIcon|undefined}|null>(null)
 useEffect(()=>{if(!value.startsWith('lucide:'))return;let alive=true;loadCatalog().then(c=>{if(alive)setLoaded({value,icon:c.findReadingIcon(value.slice(7))})}).catch(()=>{});return()=>{alive=false}},[value])
 return <span className="reading-shelf-icon" aria-hidden="true">{value.startsWith('lucide:')?(loaded?.value===value&&loaded.icon?createElement(loaded.icon,{size:18,strokeWidth:1.7}):'◇'):value}</span>
}
export function ReadingIconPicker({value,onChange,color,onColor}:{value:string;onChange:(value:string)=>void;color:string;onColor:(color:string)=>void}) {
 const [open,setOpen]=useState(false),[tab,setTab]=useState('이모지'),[query,setQuery]=useState(''),[group,setGroup]=useState('전체'),[limit,setLimit]=useState(120),[catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState('')
 const triggerRef=useRef<HTMLButtonElement>(null), panelRef=useRef<HTMLDivElement>(null), resultsRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  if(!open)return
  const panel=panelRef.current,trigger=triggerRef.current
  if(!panel||!trigger)return
  const position=()=>{
   const rect=trigger.getBoundingClientRect(),width=Math.min(400,window.innerWidth-24),height=Math.min(480,window.innerHeight-24)
   panel.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px'
   panel.style.top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-height-12))+'px'
  }
  position();panel.showPopover();panel.querySelector<HTMLInputElement>('input')?.focus()
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true)
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);trigger.focus()}
 },[open])
 useEffect(()=>{resultsRef.current?.scrollTo({top:0})},[group,query,tab])
 const showIcons=()=>{setTab('아이콘');setQuery('');setLimit(120);loadCatalog().then(setCatalog).catch(()=>setError('아이콘을 불러오지 못했습니다. 다시 열어 주세요.'))}
 const pick=(next:string)=>{onChange(next)}
 const text=query.trim().toLowerCase()
 const emojis=EMOJIS.filter(e=>(group==='전체'||group===e.group)&&(!text||(e.value+' '+e.keywords+' '+e.group).toLowerCase().includes(text)))
 const icons=catalog?.iconCatalog.filter(i=>!text||(i.name+' '+i.keywords).toLowerCase().includes(text))??[]
 return <div className="reading-icon-picker"><button type="button" ref={triggerRef} className="btn btn-line" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(!open)}><span style={{color:color.startsWith("#")?color:undefined}}><ReadingIcon value={value}/></span> 아이콘 선택</button>{open?<div ref={panelRef} popover="auto" role="dialog" aria-label="아이콘 선택" className="reading-icon-panel" onToggle={e=>{if(e.newState==='closed')setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}}}><div className="reading-icon-tabs"><button type="button" className={tab==='이모지'?'selected':''} onClick={()=>{setTab('이모지');setQuery('');setLimit(120)}}>이모지</button><button type="button" className={tab==='아이콘'?'selected':''} onClick={showIcons}>아이콘</button><button type="button" onClick={()=>setOpen(false)} aria-label="아이콘 선택기 닫기">×</button></div><div className="reading-icon-search"><Search size={18} aria-hidden="true"/><input className="field" aria-label="이모지·아이콘 검색" placeholder={tab==='이모지'?'이모지, 책, 사랑, 국기…':'아이콘 검색 · book, heart, calendar…'} value={query} onChange={e=>{setQuery(e.target.value);setGroup(emojiCategories[0].name);setLimit(120)}}/></div><p className="reading-muted">{tab==='이모지'?emojis.length:icons.length}개{tab==='아이콘'&&!catalog?' · 불러오는 중…':''}</p>{error?<p role="alert">{error}</p>:null}<div ref={resultsRef} className="reading-icon-results"><div className="reading-icon-grid">{tab==='이모지'?emojis.slice(0,limit).map(e=><button type="button" key={e.value} className="reading-icon-option" aria-label={e.keywords||e.value} title={e.keywords||e.value} aria-pressed={value===e.value} onClick={()=>pick(e.value)}>{e.value}</button>):icons.slice(0,limit).map(i=><button type="button" key={i.name} className="reading-icon-option" style={{color:color.startsWith("#")?color:undefined}} aria-label={i.name} title={i.name} aria-pressed={value==='lucide:'+i.name} onClick={()=>pick('lucide:'+i.name)}>{createElement(i.icon,{size:20,strokeWidth:1.5})}</button>)}</div>{limit<(tab==='이모지'?emojis.length:icons.length)?<button type="button" className="btn btn-ghost" onClick={()=>setLimit(limit+120)}>더 보기</button>:null}</div>{tab==='이모지'?<nav className="reading-emoji-categories" aria-label={'이모지 종류'}>{emojiCategories.map(category=><button type="button" key={category.name} title={category.name} aria-label={category.name} aria-pressed={group===category.name} onClick={()=>{setGroup(category.name);setQuery('');setLimit(120)}}>{createElement(category.icon,{size:22,strokeWidth:1.6})}</button>)}</nav>:null}<div className="reading-icon-colors" role="group" aria-label="아이콘 색상">{SWATCHES.map(swatch=><button type="button" key={swatch.hex} aria-label={swatch.name} aria-pressed={color.toLowerCase()===swatch.hex.toLowerCase()} title={swatch.name} style={{backgroundColor:swatch.hex}} onClick={()=>onColor(swatch.hex)}/>)}<label title="직접 색상 선택"><input type="color" aria-label="직접 아이콘 색상 선택" value={/^#[0-9a-f]{6}$/i.test(color)?color:"#3A62B0"} onChange={e=>onColor(e.target.value)}/></label></div></div>:null}</div>
}

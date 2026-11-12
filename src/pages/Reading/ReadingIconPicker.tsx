import { createElement, useEffect, useRef, useState } from 'react'
import { Grid2X2, Smile, Hand, Leaf, Plane, Shapes, Flag, Search, type LucideIcon } from 'lucide-react'
import { SWATCHES } from '../../constants/swatches.ts'
import { EMOJIS } from './readingEmoji.ts'
import { useI18n } from '../../i18n/useI18n.ts'

// `name` is the group readingEmoji files each emoji under (also searchable); `key` names it on screen.
const emojiCategories = [
 { name: '전체', key: 'all', icon: Grid2X2 },
 { name: '표정', key: 'smileys', icon: Smile },
 { name: '사람', key: 'people', icon: Hand },
 { name: '자연 · 음식', key: 'nature', icon: Leaf },
 { name: '여행', key: 'travel', icon: Plane },
 { name: '사물 · 기호', key: 'objects', icon: Shapes },
 { name: '국기', key: 'flags', icon: Flag },
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
 const {t,locale}=useI18n()
 const [open,setOpen]=useState(false),[tab,setTab]=useState<'emoji'|'icon'>('emoji'),[query,setQuery]=useState(''),[group,setGroup]=useState(emojiCategories[0].name),[limit,setLimit]=useState(120),[catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState('')
 const triggerRef=useRef<HTMLButtonElement>(null), panelRef=useRef<HTMLDivElement>(null), resultsRef=useRef<HTMLDivElement>(null)
 // The open popover light-dismisses on the trigger's own press before its click runs; the click then closes instead of reopening.
 const openOnPress=useRef<boolean|null>(null)
 useEffect(()=>{
  if(!open)return
  const panel=panelRef.current,trigger=triggerRef.current
  if(!panel||!trigger)return
  // Below or above the trigger when either side has room, so the trigger stays tappable to close it; otherwise it overlaps.
  const position=()=>{
   const rect=trigger.getBoundingClientRect(),width=Math.min(400,window.innerWidth-24),full=Math.min(480,window.innerHeight-24)
   const below=window.innerHeight-rect.bottom-20,above=rect.top-20,min=Math.min(320,full)
   const height=below>=min?Math.min(full,below):above>=min?Math.min(full,above):full
   panel.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px'
   panel.style.height=height+'px'
   panel.style.top=(below>=min?rect.bottom+8:above>=min?rect.top-8-height:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-height-12)))+'px'
  }
  position();panel.showPopover();panel.querySelector<HTMLInputElement>('input')?.focus()
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true)
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);trigger.focus()}
 },[open])
 useEffect(()=>{resultsRef.current?.scrollTo({top:0})},[group,query,tab])
 const showIcons=()=>{setTab('icon');setQuery('');setLimit(120);loadCatalog().then(setCatalog).catch(()=>setError(t('reading.iconsFailed')))}
 const pick=(next:string)=>{onChange(next)}
 const text=query.trim().toLowerCase()
 const emojis=EMOJIS.filter(e=>(group===emojiCategories[0].name||group===e.group)&&(!text||(e.value+' '+e.keywords+' '+e.group).toLowerCase().includes(text)))
 const icons=catalog?.iconCatalog.filter(i=>!text||(i.name+' '+i.keywords).toLowerCase().includes(text))??[]
 return <div className="reading-icon-picker"><button type="button" ref={triggerRef} className="btn btn-line" aria-haspopup="dialog" aria-expanded={open} onPointerDown={()=>{openOnPress.current=open}} onClick={()=>{const wasOpen=openOnPress.current??open;openOnPress.current=null;setOpen(!wasOpen)}}><span style={{color:color.startsWith("#")?color:undefined}}><ReadingIcon value={value}/></span> {t('reading.chooseIcon')}</button>{open?<div ref={panelRef} popover="auto" role="dialog" aria-label={t('reading.chooseIcon')} className="reading-icon-panel" onToggle={e=>{if(e.newState==='closed')setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}}}><div className="reading-icon-tabs"><button type="button" className={tab==='emoji'?'selected':''} onClick={()=>{setTab('emoji');setQuery('');setLimit(120)}}>{t('reading.emojiTab')}</button><button type="button" className={tab==='icon'?'selected':''} onClick={showIcons}>{t('reading.iconTab')}</button><button type="button" onClick={()=>setOpen(false)} aria-label={t('reading.closePicker')}>×</button></div><div className="reading-icon-search"><Search size={18} aria-hidden="true"/><input className="field" aria-label={t('reading.searchIcons')} placeholder={t(tab==='emoji'?'reading.emojiPlaceholder':'reading.iconPlaceholder')} value={query} onChange={e=>{setQuery(e.target.value);setGroup(emojiCategories[0].name);setLimit(120)}}/></div><p className="reading-muted">{t('reading.resultCount',{count:tab==='emoji'?emojis.length:icons.length})}{tab==='icon'&&!catalog?' · '+t('reading.loadingShort'):''}</p>{error?<p role="alert">{error}</p>:null}<div ref={resultsRef} className="reading-icon-results"><div className="reading-icon-grid">{tab==='emoji'?emojis.slice(0,limit).map(e=><button type="button" key={e.value} className="reading-icon-option" aria-label={e.names?.[locale]??e.value} title={e.names?.[locale]??e.value} aria-pressed={value===e.value} onClick={()=>pick(e.value)}>{e.value}</button>):icons.slice(0,limit).map(i=><button type="button" key={i.name} className="reading-icon-option" style={{color:color.startsWith("#")?color:undefined}} aria-label={i.name} title={i.name} aria-pressed={value==='lucide:'+i.name} onClick={()=>pick('lucide:'+i.name)}>{createElement(i.icon,{size:20,strokeWidth:1.5})}</button>)}</div>{limit<(tab==='emoji'?emojis.length:icons.length)?<button type="button" className="btn btn-ghost" onClick={()=>setLimit(limit+120)}>{t('reading.showMore')}</button>:null}</div>{tab==='emoji'?<nav className="reading-emoji-categories" aria-label={t('reading.emojiCategories')}>{emojiCategories.map(category=><button type="button" key={category.name} title={t('reading.emojiGroup.'+category.key)} aria-label={t('reading.emojiGroup.'+category.key)} aria-pressed={group===category.name} onClick={()=>{setGroup(category.name);setQuery('');setLimit(120)}}>{createElement(category.icon,{size:22,strokeWidth:1.6})}</button>)}</nav>:null}<div className="reading-icon-colors" role="group" aria-label={t('reading.iconColor')}>{SWATCHES.map(swatch=><button type="button" key={swatch.hex} aria-label={swatch.name} aria-pressed={color.toLowerCase()===swatch.hex.toLowerCase()} title={swatch.name} style={{backgroundColor:swatch.hex}} onClick={()=>onColor(swatch.hex)}/>)}<label title={t('reading.customColor')}><input type="color" aria-label={t('reading.customIconColor')} value={/^#[0-9a-f]{6}$/i.test(color)?color:"#3A62B0"} onChange={e=>onColor(e.target.value)}/></label></div></div>:null}</div>
}

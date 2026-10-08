import { Star } from 'lucide-react'
import { useState } from 'react'

export function StarRating({value,onChange,disabled=false}:{value:number|null;onChange?:(value:number|null)=>void;disabled?:boolean}) {
 const [hover,setHover]=useState<number|null>(null)
 const rating=hover??value??0
 return <div className="reading-rating" role={onChange?'group':undefined} aria-label="별점"><div className="reading-rating-stars" onMouseLeave={()=>setHover(null)}>{[1,2,3,4,5].map(n=><span className="reading-rating-item" key={n}><span className="reading-rating-star" aria-hidden="true"><Star size={22}/><span className="reading-rating-fill" style={{width:Math.min(1,Math.max(0,rating-n+1))*100+'%'}}><Star size={22}/></span></span>{onChange?[n-.5,n].map((score,index)=><button type="button" key={score} className={'reading-rating-half '+(index===0?'reading-rating-half-left':'reading-rating-half-right')} disabled={disabled} aria-label={score+'점 선택'} aria-pressed={value===score} onMouseEnter={()=>setHover(score)} onFocus={()=>setHover(score)} onBlur={()=>setHover(null)} onClick={()=>onChange(score)}/>):null}</span>)}</div><span className="reading-muted">{value?value+'점':'별점 없음'}</span>{onChange&&value?<button type="button" disabled={disabled} className="btn btn-ghost" onClick={()=>onChange(null)}>지우기</button>:null}</div>
}

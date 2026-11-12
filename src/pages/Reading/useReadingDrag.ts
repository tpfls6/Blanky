import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react'
export type ReadingDrag={kind:'book'|'shelf';id:string;label:string}
export function useReadingDrag(onDrop:(drag:ReadingDrag,target:string)=>void,disabled:boolean) {
 const [active,setActive]=useState<(ReadingDrag&{x:number;y:number})|null>(null),[target,setTarget]=useState<string|null>(null)
 const pending=useRef<(ReadingDrag&{sx:number;sy:number;dragging:boolean;pointerId:number;element:HTMLElement;x:number;y:number})|null>(null),drop=useRef(onDrop),blocked=useRef(disabled),suppressUntil=useRef(0)
 useEffect(()=>{drop.current=onDrop;blocked.current=disabled},[onDrop,disabled])
 useEffect(()=>{
 const destination=(x:number,y:number)=>document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-reading-shelf-id]')?.dataset.readingShelfId??null
 const move=(event:PointerEvent)=>{const p=pending.current;if(!p||event.pointerId!==p.pointerId)return;if(blocked.current)return;if(!p.dragging&&Math.hypot(event.clientX-p.sx,event.clientY-p.sy)<7)return;if(!p.dragging){p.dragging=true;p.element.setPointerCapture(p.pointerId);if(!frame)frame=requestAnimationFrame(scroll)}p.x=event.clientX;p.y=event.clientY;event.preventDefault();setActive({...p,x:event.clientX,y:event.clientY});const id=destination(event.clientX,event.clientY);setTarget(id===p.id&&p.kind==='shelf'?null:id)}
 const end=(event:PointerEvent)=>{const p=pending.current;if(!p||event.pointerId!==p.pointerId)return;pending.current=null;setActive(null);setTarget(null);if(p.dragging){suppressUntil.current=performance.now()+400;const id=destination(event.clientX,event.clientY);if(id&&!blocked.current&&!(p.kind==='shelf'&&id===p.id))drop.current(p,id)}}
 const cancel=()=>{if(pending.current?.dragging)suppressUntil.current=performance.now()+400;pending.current=null;setActive(null);setTarget(null)}
 const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel()}
 let frame=0;
 // The page scrolls inside the app's <main>, not the window, and the phone nav covers the bottom edge.
 const scroll=()=>{const p=pending.current;if(p?.dragging){const box=scrollBox(p.element),dy=edgeSpeed(p.y,box.top,box.bottom);if(dy){const before=box.element.scrollTop;box.element.scrollBy(0,dy);if(box.element.scrollTop!==before){const id=destination(p.x,p.y);setTarget(id===p.id&&p.kind==='shelf'?null:id)}}}frame=p?.dragging?requestAnimationFrame(scroll):0};
 window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape)
 return()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape)}
 },[])
 const start=(event:ReactPointerEvent<HTMLElement>,drag:ReadingDrag)=>{if(disabled||event.button!==0||!event.isPrimary)return;pending.current={...drag,sx:event.clientX,sy:event.clientY,dragging:false,pointerId:event.pointerId,element:event.currentTarget,x:event.clientX,y:event.clientY}}
 const click=(event:MouseEvent)=>{if(performance.now()<suppressUntil.current){event.preventDefault();event.stopPropagation()}}
 return {active,target,start,click}
}
const EDGE=72,MAX_SPEED=18
/** Faster the deeper the pointer sits inside the top or bottom edge zone. */
export function edgeSpeed(y:number,top:number,bottom:number):number{
 if(y<top+EDGE)return -Math.ceil(Math.min(1,(top+EDGE-y)/EDGE)*MAX_SPEED)
 if(y>bottom-EDGE)return Math.ceil(Math.min(1,(y-(bottom-EDGE))/EDGE)*MAX_SPEED)
 return 0
}
function scrollBox(element:HTMLElement):{element:Element;top:number;bottom:number}{
 let node=element.parentElement
 while(node&&node!==document.body){const style=getComputedStyle(node);if(/(auto|scroll)/.test(style.overflowY)&&node.scrollHeight>node.clientHeight)break;node=node.parentElement}
 const scroller=node&&node!==document.body?node:document.scrollingElement??document.documentElement
 const rect=scroller===document.scrollingElement?{top:0,bottom:window.innerHeight}:scroller.getBoundingClientRect()
 let bottom=Math.min(rect.bottom,window.innerHeight)
 const nav=document.querySelector<HTMLElement>('.mobile-nav')
 const navBox=nav?.getBoundingClientRect()
 if(navBox&&navBox.height>0&&navBox.top>0)bottom=Math.min(bottom,navBox.top)
 return {element:scroller,top:Math.max(rect.top,0),bottom}
}

import { Component,type ReactNode } from 'react'
/** Keep providers and persisted drafts alive when a lazily loaded screen fails. */
export class RouteLoadBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<div role="alert" className="mx-auto p-6 text-sm text-neutral-500"><p>화면을 불러오지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.</p><button type="button" className="btn btn-primary mt-3" onClick={()=>window.location.reload()}>화면 다시 불러오기</button></div>:this.props.children}
}

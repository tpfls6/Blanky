import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Film, MapPin, Plus, Search, Star, Trash2, Wallet, X } from 'lucide-react'
import { CustomRecordRenderer } from '../records/Renderer.tsx'
import { flatten, hydrateValues, titleFrom, type CustomRecordType, type FieldValue } from '../records/schema.ts'
import type { CustomRecord } from '../../types/records.ts'
import { todayISO } from '../../utils/date.ts'
import { shiftMonth } from './views.ts'
import { NOTEBOOKS, minutesText, notebookDefaults, notebookError, notebookSummary, roleNumber, roleText, won, type NotebookKind } from './notebookModel.ts'
import './notebooks.css'

type RecordInput = { title: string; values: Record<string, FieldValue> }
const ICONS = { movie: Film, finance: Wallet, travel: MapPin, study: BookOpen }
const prettyDate = (value: string) => value ? value.replace(/-/g, '.') : '날짜 미정'

export function NotebookCollection({ kind, type, rows, readOnly = false, onAdd, onUpdate, onRemove }: {
  kind: NotebookKind; type: CustomRecordType; rows: CustomRecord[]; readOnly?: boolean
  onAdd: (input: RecordInput) => void | Promise<void>; onUpdate: (id: string, input: RecordInput) => void | Promise<void>; onRemove: (id: string) => void | Promise<void>
}) {
  const config = NOTEBOOKS[kind], Icon = ICONS[kind]
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('전체')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [sort, setSort] = useState('newest')
  const [editing, setEditing] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const baseline = useRef('')
  const fields = flatten(type.blocks).filter(field => !!field.fieldKey)
  const text = (row: Pick<CustomRecord, 'values'>, role: string) => roleText(type, row, role)
  const num = (row: Pick<CustomRecord, 'values'>, role: string) => roleNumber(type, row, role)
  const monthly = kind === 'finance' || kind === 'study'
  const summary = notebookSummary(type, kind, rows, month)
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return rows.filter(row => {
      if (monthly && !roleText(type, row, 'date').startsWith(month)) return false
      if (filter !== '전체' && roleText(type, row, kind === 'finance' ? 'kind' : 'status') !== filter) return false
      return !search || `${row.title} ${flatten(type.blocks).map(field => field.props.role ? roleText(type, row, field.props.role) : Object.values(row.values).join(' ')).join(' ')}`.toLowerCase().includes(search)
    }).sort((a, b) => {
      if (sort === 'rating') return roleNumber(type, b, 'rating') - roleNumber(type, a, 'rating')
      const role = kind === 'travel' ? 'startDate' : 'date'
      const left = roleText(type, a, role) || a.createdAt, right = roleText(type, b, role) || b.createdAt
      return (sort === 'oldest' ? 1 : -1) * (left.localeCompare(right) || a.createdAt.localeCompare(b.createdAt))
    })
  }, [rows, type, query, filter, sort, month, monthly, kind]) // fields are derived from type

  useEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal()
  }, [editing])
  const open = (row?: CustomRecord) => {
    if (readOnly) return
    const next = row ? hydrateValues(type.blocks, row.values, row.title) : notebookDefaults(type, kind, todayISO())
    baseline.current = JSON.stringify(next)
    setValues(next); setError(''); setEditing(row?.id ?? 'new')
  }
  const close = (force = false) => {
    if (locked.current && !force) return
    if (!force && JSON.stringify(values) !== baseline.current && !window.confirm('작성 중인 내용을 저장하지 않고 닫을까요?')) return
    dialog.current?.close(); setEditing(null); setError('')
  }
  const save = async () => {
    if (locked.current) return
    const problem = notebookError(type, kind, values)
    if (problem) { setError(problem); return }
    const input = { title: titleFrom(type.blocks, values, type.name), values }
    locked.current = true; setBusy(true)
    try {
      if (editing === 'new') await onAdd(input)
      else if (editing) await onUpdate(editing, input)
      setNotice('기록을 저장했어요.'); close(true)
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.') }
    finally { locked.current = false; setBusy(false) }
  }
  const remove = async () => {
    if (!editing || locked.current || !window.confirm('이 기록을 삭제할까요?')) return
    locked.current = true; setBusy(true)
    try { await onRemove(editing); setNotice('기록을 삭제했어요.'); close(true) }
    catch (error) { setError(error instanceof Error ? error.message : '삭제하지 못했어요.') }
    finally { locked.current = false; setBusy(false) }
  }
  const expenseRows = kind === 'finance' ? rows.filter(row => text(row, 'date').startsWith(month) && text(row, 'kind') === '지출') : []
  const expenses = [...expenseRows.reduce((map, row) => {
    const category = text(row, 'category') || '기타'
    map.set(category, (map.get(category) ?? 0) + num(row, 'amount')); return map
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const totalExpense = expenses.reduce((sum, [, amount]) => sum + amount, 0)

  return <section className={`notebook notebook-${kind}`} data-notebook={kind} aria-label={config.title}>
    <header className="notebook-header">
      <div><p className="notebook-eyebrow"><Icon size={15} strokeWidth={1.5}/>{config.eyebrow}</p><h2>{config.title}</h2><p className="notebook-tagline">{config.tagline}</p></div>
      <button type="button" className="btn btn-primary notebook-add" data-theme-slot="button-primary" disabled={readOnly} onClick={() => open()}><Plus size={15}/>{config.add}</button>
    </header>
    <div className="notebook-summary" aria-label="기록 요약">{summary.map(item => <div key={item.label}><span>{item.label}</span><strong data-tone={'tone' in item ? item.tone : undefined}>{item.value}</strong></div>)}</div>
    <div className="notebook-toolbar">
      <div className="notebook-tabs" role="tablist" aria-label="기록 분류">{config.filters.map(label => <button type="button" key={label} role="tab" aria-selected={filter === label} className={filter === label ? 'notebook-tab-on' : ''} onClick={() => setFilter(label)}>{label}</button>)}</div>
      <div className="notebook-tools">
        {monthly && <div className="notebook-month"><button className="icon-btn" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></button><input aria-label="조회 월" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }}/><button className="icon-btn" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></button></div>}
        <label className="notebook-search"><Search size={15}/><input aria-label={`${config.title} 검색`} placeholder="기록 검색" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <select className="field notebook-sort" aria-label="기록 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">최신순</option><option value="oldest">오래된순</option>{kind === 'movie' && <option value="rating">별점순</option>}</select>
      </div>
    </div>
    <div className="notebook-result-count">{monthly ? `${Number(month.slice(5))}월의 기록` : '나의 기록'} <span>{visible.length}</span>{readOnly && <small>미리보기 · 예제 기록</small>}</div>
    <div className={kind === 'finance' ? 'notebook-finance-layout' : ''}>
      {!visible.length ? <div className="notebook-empty"><span className="notebook-empty-icon"><Icon size={30} strokeWidth={1.25}/></span><h3>{query || filter !== '전체' ? '조건에 맞는 기록이 없어요.' : config.empty}</h3><p>{query || filter !== '전체' ? '검색어나 선택한 분류를 바꿔보세요.' : config.hint}</p>{!readOnly && <button className="btn btn-line" onClick={() => open()}><Plus size={14}/>{config.add}</button>}</div> : <ul className={`notebook-records notebook-records-${kind}`}>
        {visible.map(row => <li key={row.id}>
          <button type="button" className="notebook-record" aria-label={`${row.title} 기록 열기`} disabled={readOnly} onClick={() => open(row)}>
            {kind === 'movie' && <><div className="notebook-poster" data-palette={row.id.charCodeAt(0) % 4}>{text(row, 'image') ? <img src={text(row, 'image')} alt={`${row.title} 포스터`} loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }}/>: <><Film size={34} strokeWidth={1}/><span>{row.title}</span></>}<span className="notebook-card-badge">{text(row, 'status') || '보고 싶어요'}</span></div><div className="notebook-card-body"><h3>{row.title}</h3><p className="notebook-meta">{text(row, 'director') || '나의 영화 기록'}{text(row, 'date') ? ' · ' + prettyDate(text(row, 'date')) : ''}</p><div className="notebook-stars" aria-label={`별점 ${num(row, 'rating') || '미정'}`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={13} fill={index < num(row, 'rating') ? 'currentColor' : 'none'}/>)}<span>{num(row, 'rating') ? num(row, 'rating').toFixed(1) : '아직 별점 없음'}</span></div><p className="notebook-excerpt">{text(row, 'note') || '기억하고 싶은 장면과 감상을 남겨보세요.'}</p>{text(row, 'genre') && <span className="notebook-meta">{text(row, 'genre')}</span>}</div></>}
            {kind === 'finance' && <><span className={`notebook-transaction-icon ${text(row, 'kind') === '수입' ? 'is-income' : ''}`}><Wallet size={18}/></span><div className="notebook-transaction-info"><h3>{row.title}</h3><p className="notebook-meta">{prettyDate(text(row, 'date')).slice(5)} · {text(row, 'category') || '기타'} · {text(row, 'payment') || '결제 수단 미정'}</p></div><strong className={text(row, 'kind') === '수입' ? 'notebook-income' : 'notebook-expense'}>{text(row, 'kind') === '수입' ? '+' : '−'}{won(num(row, 'amount'))}</strong></>}
            {kind === 'travel' && <><div className="notebook-travel-cover" data-palette={row.id.charCodeAt(0) % 4}>{text(row, 'image') ? <img src={text(row, 'image')} alt={`${row.title} 여행 사진`} loading="lazy"/> : <MapPin size={38} strokeWidth={1}/>}<span className="notebook-card-badge">{text(row, 'status') || '계획 중'}</span><span className="notebook-destination">{text(row, 'destination')}</span></div><div className="notebook-card-body"><h3>{row.title}</h3><p className="notebook-meta">{prettyDate(text(row, 'startDate'))}{text(row, 'endDate') && ' — '+prettyDate(text(row, 'endDate'))}</p><p className="notebook-excerpt">{text(row, 'note') || text(row, 'itinerary') || '여행에서 남기고 싶은 이야기를 적어보세요.'}</p><div className="notebook-card-footer"><span>{text(row, 'companion') || '나만의 여행'}</span><span>{num(row, 'budget') ? '예산 '+won(num(row, 'budget')) : '예산 미정'}</span></div></div></>}
            {kind === 'study' && <><div className="notebook-study-heading"><span className="notebook-subject">{text(row, 'subject') || '자유 학습'}</span><span className="notebook-meta">{prettyDate(text(row, 'date'))}</span></div><h3>{row.title}</h3><p className="notebook-excerpt">{text(row, 'note') || '오늘 배운 내용을 내 말로 정리해 보세요.'}</p>{text(row, 'review') && <p className="notebook-review">복습 노트 · {text(row, 'review')}</p>}<div className="notebook-card-footer"><span>{minutesText(num(row, 'minutes'))}</span><span className="notebook-status" data-status={text(row, 'status')}>{text(row, 'status') || '학습 중'}</span></div></>}
          </button>
        </li>)}
      </ul>}
      {kind === 'finance' && <aside className="notebook-breakdown"><h3>어디에 썼을까요?</h3><p className="notebook-meta">이번 달 카테고리별 지출</p>{expenses.length ? <ul>{expenses.map(([category, amount]) => <li key={category}><div><span>{category}</span><strong>{won(amount)}</strong></div><div className="notebook-bar"><span style={{ width: `${totalExpense ? amount / totalExpense * 100 : 0}%` }}/></div><small>{totalExpense ? Math.round(amount / totalExpense * 100) : 0}%</small></li>)}</ul> : <p className="notebook-breakdown-empty">지출을 남기면 소비의 흐름을 모아 보여드려요.</p>}</aside>}
    </div>
    {notice && <p className="notebook-notice" role="status">{notice}</p>}
    {editing && <dialog ref={dialog} className="notebook-dialog" aria-label={`${config.title} 편집`} onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }}>
      <form onSubmit={e => { e.preventDefault(); void save() }}><fieldset disabled={busy}>
        <header><div><p className="notebook-eyebrow"><Icon size={14}/>{config.eyebrow}</p><h2>{editing === 'new' ? `${config.title} 추가` : '기록 수정'}</h2></div><button type="button" className="icon-btn" aria-label="닫기" onClick={() => close()}><X size={18}/></button></header>
        <div className="notebook-editor-grid">{fields.map(field => <div key={field.id} className={`notebook-field ${['title', 'longText', 'url', 'image', 'multiSelect'].includes(field.type) ? 'notebook-field-full' : ''}`} data-record-role={field.props.role}><CustomRecordRenderer blocks={[field]} mode="fill-record" values={values} onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))}/></div>)}</div>
        {error && <p role="alert" className="notebook-error">{error}</p>}
        <footer>{editing !== 'new' && <button type="button" className="btn btn-ghost notebook-delete" onClick={() => void remove()}><Trash2 size={14}/>삭제</button>}<div><button type="button" className="btn btn-ghost" onClick={() => close()}>취소</button><button className="btn btn-primary" data-theme-slot="button-primary" type="submit">{busy ? '저장 중…' : '기록 저장'}</button></div></footer>
      </fieldset></form>
    </dialog>}
  </section>
}

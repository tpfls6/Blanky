export function DeadlineFields({ date, time, onChange }: { date: string; time: string; onChange: (date: string, time: string) => void }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <label className="text-xs text-neutral-500">마감일<input data-theme-slot="input" className="field mt-1 w-full" type="date" value={date} onChange={e => onChange(e.target.value, e.target.value ? time : '')}/></label>
    <label className="text-xs text-neutral-500">마감 시각 (선택)<input data-theme-slot="input" className="field mt-1 w-full" type="time" disabled={!date} value={time} onChange={e => onChange(date, e.target.value)}/></label>
    {date && <button data-theme-slot="button" className="chip justify-self-start" type="button" onClick={() => onChange('', '')}>마감 해제</button>}
  </div>
}

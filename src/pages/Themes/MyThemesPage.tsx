import { Link, useNavigate } from 'react-router-dom'
import { BUILTIN_THEMES, type BlankyTheme } from '@blanky/types'
import { ROUTES } from '../../constants/routes.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useSession } from '../../state/useSession.ts'
import { useTheme } from '../../theme/context.ts'
import { removeTheme, saveTheme, setActiveTheme } from '../../services/themes/index.ts'
import { ThemeImport, ThemeExportButton } from './PackageControls.tsx'
import { useAction } from './useThemeAction.ts'

function ThemeLibraryCard({ theme, busy, onApply, onPreview, onCopy, onRemove, owned, active }: {
  theme: BlankyTheme
  busy: boolean
  owned: boolean
  active: boolean
  onApply: () => void
  onPreview: () => void
  onCopy: () => void
  onRemove: () => void
}) {
  return (
    <article className="theme-store-card flex min-w-0 flex-col rounded-md border border-line bg-surface p-4">
      <Link to={ROUTES.themeDetail(theme.id)} aria-label={theme.name}>
        <div className="theme-swatch" style={{ background: theme.config.colors.background, color: theme.config.colors.textPrimary }}>
          {theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt={theme.name} className="h-full w-full object-contain" /> : <>
            <div style={{ background: theme.config.sidebar.selectedBackground }} />
            <div><span style={{ background: theme.config.colors.primary }} /><span style={{ background: theme.config.schedule.background }} /><span style={{ background: theme.config.colors.surface }} /></div>
          </>}
        </div>
      </Link>
      <div className="my-4 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-medium"><Link to={ROUTES.themeDetail(theme.id)}>{theme.name}</Link></h3>
          <Link className="break-words text-xs text-neutral-400" to={ROUTES.creator(theme.creatorId ?? 'blanky')}>{theme.creatorName}</Link>
        </div>
        {active && <span className="chip chip-on shrink-0 text-xs">사용 중</span>}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <button type="button" disabled={busy} className="btn btn-line" onClick={onApply}>적용</button>
        <button type="button" className="btn btn-ghost" onClick={onPreview}>미리보기</button>
        {owned && <>
          <Link className="btn btn-ghost" to={ROUTES.themeEditor + '?id=' + theme.id}>수정</Link>
          <Link className="btn btn-ghost" to={ROUTES.themeEditor + '?id=' + theme.id + '&publish=1'}>스토어 등록</Link>
          <ThemeExportButton theme={theme} />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCopy}>복제</button>
        </>}
        {theme.creatorId && <button type="button" disabled={busy} className="btn btn-ghost" onClick={onRemove}>삭제</button>}
      </div>
    </article>
  )
}

export function MyThemesPage() {
  const confirm = useConfirm()
  const ctx = useTheme()
  const { user } = useSession()
  const action = useAction()
  const navigate = useNavigate()
  const groups = [
    { label: '사용 중인 테마', list: ctx.themes.filter(theme => theme.id === ctx.active), empty: '기존 Appearance 설정을 사용 중입니다.' },
    { label: '설치한 테마', list: ctx.themes.filter(theme => !theme.creatorId || ctx.installed.includes(theme.id)), empty: '설치한 테마가 없습니다. 테마를 가져오거나 스토어에서 찾아보세요.' },
    { label: '내가 만든 테마', list: ctx.themes.filter(theme => theme.creatorId === user?.id), empty: '아직 만든 테마가 없습니다. 새 테마를 만들어 보세요.' },
  ]

  return (
    <section data-theme-protected className="customization-themes">
      <ThemeImport renderTrigger={trigger => <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-medium tracking-tight">내 테마</h1>
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
          {trigger}
          <Link className="btn btn-primary" to={ROUTES.themeEditor}>새 테마 만들기</Link>
        </div>
      </header>} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="btn btn-line" to={ROUTES.store}>스토어</Link>
        <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={() => void action.run(async () => {
          if (!user) return
          await setActiveTheme(user.id, null)
          await ctx.refresh()
          ctx.endPreview()
        })}>기존 Appearance 설정 사용</button>
      </div>
      {ctx.error && <p role="alert" className="mt-3 text-sm">{ctx.error}</p>}
      <p role="status" className="text-sm">{action.message}</p>
      {ctx.loading ? <p role="status" className="mt-8 text-sm text-neutral-400">테마를 불러오는 중…</p> : groups.map(({ label, list, empty }) => (
        <section key={label} className="mt-8">
          <h2 className="mb-4 font-medium">{label}</h2>
          {list.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(theme => <ThemeLibraryCard
              key={theme.id} theme={theme} busy={action.busy} owned={theme.creatorId === user?.id} active={ctx.active === theme.id}
              onApply={() => void action.run(() => ctx.apply(theme))}
              onPreview={() => { ctx.startPreview(theme); navigate(ROUTES.schedule) }}
              onCopy={() => void action.run(async () => {
                if (!user) return
                await saveTheme(user.id, { ...structuredClone(theme), id: crypto.randomUUID(), name: theme.name.slice(0, 94) + ' 복사본', visibility: 'private' })
                await ctx.refresh()
              })}
              onRemove={() => void (async () => {
                if (await confirm(theme.name + ' 테마를 삭제할까요?')) void action.run(async () => {
                  if (!user) return
                  if (ctx.active === theme.id) await ctx.apply(BUILTIN_THEMES[0])
                  await removeTheme(user.id, theme)
                  await ctx.refresh()
                })
              })()}
            />)}
          </div> : <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-neutral-400">{empty}</div>}
        </section>
      ))}
    </section>
  )
}

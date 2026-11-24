import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Check, ChevronRight, Copy, Eye, MoreHorizontal, Palette, PenLine, Share, Store, Trash2, Undo2, Upload } from 'lucide-react'
import { BUILTIN_THEMES, THEME_PACKAGE_IMPORT_EXTS, type BlankyTheme } from '@blanky/types'
import { ROUTES } from '../../constants/routes.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useSession } from '../../state/useSession.ts'
import { useTheme } from '../../theme/context.ts'
import { removeTheme, saveTheme, setActiveTheme } from '../../services/themes/index.ts'
import { ThemeImport, ThemeExportButton } from './PackageControls.tsx'
import { useAction } from './useThemeAction.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { CustomizationAdd, CustomizationSheet } from '../Custom/CustomizationSheet.tsx'
import '../More/more.css'

function ThemeSwatch({ theme }: { theme: BlankyTheme }) {
  return <div className="theme-swatch" style={{ background: theme.config.colors.background, color: theme.config.colors.textPrimary }}>
    {theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt={theme.name} className="h-full w-full object-contain" /> : <>
      <div style={{ background: theme.config.sidebar.selectedBackground }} />
      <div><span style={{ background: theme.config.colors.primary }} /><span style={{ background: theme.config.schedule.background }} /><span style={{ background: theme.config.colors.surface }} /></div>
    </>}
  </div>
}

// The 44px row thumbnail: the same sidebar / surface / accent colors as the swatch, shrunk.
function ThemeThumb({ theme }: { theme: BlankyTheme }) {
  return <span aria-hidden="true" className="theme-thumb" style={{ background: theme.config.colors.background }}>
    {theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt="" /> : <>
      <i style={{ background: theme.config.sidebar.selectedBackground }} />
      <span style={{ background: theme.config.colors.surface }}><em style={{ background: theme.config.colors.primary }} /><em style={{ background: theme.config.schedule.background }} /></span>
    </>}
  </span>
}

function ThemeLibraryCard({ theme, busy, onApply, onMore }: {
  theme: BlankyTheme
  busy: boolean
  onApply: () => void
  onMore: () => void
}) {
  const { t } = useI18n()
  return (
    <article className="theme-store-card flex min-w-0 flex-col rounded-md border border-line bg-surface p-4">
      <Link to={ROUTES.themeDetail(theme.id)} aria-label={theme.name}><ThemeSwatch theme={theme} /></Link>
      <div className="my-4 min-w-0">
        <h3 className="break-words font-medium"><Link to={ROUTES.themeDetail(theme.id)}>{theme.name}</Link></h3>
        <Link className="break-words text-xs text-neutral-400" to={ROUTES.creator(theme.creatorId ?? 'blanky')}>{theme.creatorName}</Link>
      </div>
      <div className="mt-auto flex items-center gap-1">
        <button type="button" disabled={busy} className="btn btn-line" onClick={onApply}>{t('themes.apply')}</button>
        <button type="button" className="theme-more ml-auto" aria-label={t('themes.moreActions', { name: theme.name })} aria-haspopup="dialog" onClick={onMore}>
          <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.7} />
        </button>
      </div>
    </article>
  )
}

export function MyThemesPage({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const ctx = useTheme()
  const { user } = useSession()
  const action = useAction()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<'add' | 'import' | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const owned = (theme: BlankyTheme) => theme.creatorId === user?.id
  const current = ctx.themes.find(theme => theme.id === ctx.active)
  const menuTheme = ctx.themes.find(theme => theme.id === menuId)
  // The theme in use sits in the hero card, so the groups below leave it out.
  const groups = [
    { label: t('themes.mine'), list: ctx.themes.filter(theme => owned(theme) && theme.id !== ctx.active), empty: t('themes.emptyMine'), store: false },
    { label: t('themes.installed'), list: ctx.themes.filter(theme => (!theme.creatorId || ctx.installed.includes(theme.id)) && theme.id !== ctx.active), empty: t('themes.emptyInstalled'), store: true },
  ]
  const subtitle = (theme: BlankyTheme) => owned(theme) ? t('themes.mineSub', { visibility: t(theme.visibility === 'public' ? 'themes.public' : 'themes.private') }) : theme.creatorName

  const apply = (theme: BlankyTheme) => void action.run(() => ctx.apply(theme))
  const preview = (theme: BlankyTheme) => { ctx.startPreview(theme); navigate(ROUTES.schedule) }
  const copy = (theme: BlankyTheme) => void action.run(async () => {
    if (!user) return
    await saveTheme(user.id, { ...structuredClone(theme), id: crypto.randomUUID(), name: theme.name.slice(0, 94) + ' 복사본', visibility: 'private' })
    await ctx.refresh()
  })
  const remove = (theme: BlankyTheme) => void (async () => {
    if (await confirm(theme.name + ' 테마를 삭제할까요?')) void action.run(async () => {
      if (!user) return
      if (ctx.active === theme.id) await ctx.apply(BUILTIN_THEMES[0])
      await removeTheme(user.id, theme)
      await ctx.refresh()
    })
  })()
  const turnOff = () => void action.run(async () => {
    if (!user) return
    await setActiveTheme(user.id, null)
    await ctx.refresh()
    ctx.endPreview()
  })
  const closeMenu = () => setMenuId(null)

  return (
    <section data-theme-protected className={'customization-themes' + (compact ? ' customization-themes-phone' : '')}>
      {compact ? <>
        <h1 className="sr-only">{t('nav.themes')}</h1>
        <CustomizationAdd label={t('custom.addTheme')} onClick={() => setSheet('add')} tour="add-theme" />
        {sheet ? <CustomizationSheet title={t(sheet === 'add' ? 'custom.addTheme' : 'custom.importTheme')} onClose={() => setSheet(null)}>
          {sheet === 'add' ? <div className="more-card">
            <Link className="more-row" to={ROUTES.themeEditor}>
              <span className="more-ri more-ri-accent"><Palette aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
              <span className="more-rt">{t('themes.newTheme')}<small>{t('themes.newThemeHint')}</small></span>
              <ChevronRight aria-hidden="true" className="more-chev size-4.5" />
            </Link>
            <button type="button" className="more-row" onClick={() => setSheet('import')}>
              <span className="more-ri"><Upload aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
              <span className="more-rt">{t('custom.importTheme')}<small>{THEME_PACKAGE_IMPORT_EXTS.join(' · ')}</small></span>
              <ChevronRight aria-hidden="true" className="more-chev size-4.5" />
            </button>
            <Link className="more-row" to={ROUTES.store}>
              <span className="more-ri"><Store aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
              <span className="more-rt">{t('themes.findInStore')}<small>{t('themes.findInStoreHint')}</small></span>
              <ChevronRight aria-hidden="true" className="more-chev size-4.5" />
            </Link>
          </div> : <ThemeImport variant="dropzone" showFormats />}
        </CustomizationSheet> : null}
      </> : <ThemeImport renderTrigger={trigger => <header data-tour="add-theme" className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-medium tracking-tight">내 테마</h1>
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
          {trigger}
          <Link className="btn btn-primary" to={ROUTES.themeEditor}>새 테마 만들기</Link>
        </div>
      </header>} />}
      {ctx.error && <p role="alert" className="mt-3 text-sm">{ctx.error}</p>}
      <p role="status" className="text-sm">{action.message}</p>
      {ctx.loading ? <p role="status" className="mt-8 text-sm text-neutral-400">테마를 불러오는 중…</p> : <>
        <h2 className="more-label">{t('themes.active')}</h2>
        {current ? <div className="theme-hero more-card md:max-w-md">
          <Link to={ROUTES.themeDetail(current.id)} aria-label={current.name}><ThemeSwatch theme={current} /></Link>
          <div className="theme-hero-info">
            <span className="more-rt"><Link to={ROUTES.themeDetail(current.id)}>{current.name}</Link><small>{subtitle(current)}</small></span>
            <span className="theme-badge"><Check aria-hidden="true" className="size-3" strokeWidth={2.4} />{t('themes.applied')}</span>
            <button type="button" className="theme-more" aria-label={t('themes.moreActions', { name: current.name })} aria-haspopup="dialog" onClick={() => setMenuId(current.id)}>
              <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.7} />
            </button>
          </div>
          <div className="theme-hero-actions">
            <button type="button" className="btn btn-line" onClick={() => preview(current)}><Eye aria-hidden="true" className="size-4" strokeWidth={1.8} />{t('themes.preview')}</button>
            {owned(current) && <Link className="btn btn-line" to={ROUTES.themeEditor + '?id=' + current.id}><PenLine aria-hidden="true" className="size-4" strokeWidth={1.8} />{t('themes.edit')}</Link>}
          </div>
        </div> : <div className="more-card md:max-w-md">
          <div className="more-row">
            <span className="more-ri"><Palette aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.offTitle')}<small>{t('themes.offHint')}</small></span>
          </div>
        </div>}
        {groups.map(({ label, list, empty, store }) => (
          <section key={label}>
            <h2 className="more-label">{label}{store && <Link className="theme-store-link inline-flex items-center font-normal text-accent-text" to={ROUTES.store}>{t('themes.backStore')}<ChevronRight aria-hidden="true" className="size-3.5" /></Link>}</h2>
            {!list.length ? <div className="theme-empty">{empty}</div> : compact ? <div className="more-card">
              {list.map(theme => <div key={theme.id} className="more-row theme-row">
                <Link className="theme-row-link" to={ROUTES.themeDetail(theme.id)}>
                  <ThemeThumb theme={theme} />
                  <span className="more-rt">{theme.name}<small>{subtitle(theme)}</small></span>
                </Link>
                <button type="button" className="theme-pill" disabled={action.busy} onClick={() => apply(theme)}>{t('themes.apply')}</button>
                <button type="button" className="theme-more" aria-label={t('themes.moreActions', { name: theme.name })} aria-haspopup="dialog" onClick={() => setMenuId(theme.id)}>
                  <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.7} />
                </button>
              </div>)}
            </div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(theme => <ThemeLibraryCard key={theme.id} theme={theme} busy={action.busy} onApply={() => apply(theme)} onMore={() => setMenuId(theme.id)} />)}
            </div>}
          </section>
        ))}
        {current && <div className="more-card mt-[22px] md:max-w-md">
          <button type="button" className="more-row" disabled={action.busy} onClick={turnOff}>
            <span className="more-ri"><Undo2 aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.turnOff')}<small>{t('themes.turnOffHint')}</small></span>
          </button>
        </div>}
      </>}
      {menuTheme ? <CustomizationSheet title={menuTheme.name} subtitle={subtitle(menuTheme)} media={<ThemeThumb theme={menuTheme} />} onClose={closeMenu}>
        <div className="more-card">
          {/* Opened from the hero card the theme is already applied, so the apply row steps aside. */}
          {menuTheme.id !== ctx.active && <button type="button" className="more-row" disabled={action.busy} onClick={() => { closeMenu(); apply(menuTheme) }}>
            <span className="more-ri more-ri-accent"><Check aria-hidden="true" className="size-4.5" strokeWidth={2} /></span>
            <span className="more-rt">{t('themes.applyNow')}</span>
          </button>}
          <button type="button" className="more-row" onClick={() => { closeMenu(); preview(menuTheme) }}>
            <span className="more-ri"><Eye aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.preview')}<small>{t('themes.previewHint')}</small></span>
          </button>
          {owned(menuTheme) && <Link className="more-row" to={ROUTES.themeEditor + '?id=' + menuTheme.id}>
            <span className="more-ri"><PenLine aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.edit')}</span>
            <ChevronRight aria-hidden="true" className="more-chev size-4.5" />
          </Link>}
        </div>
        {owned(menuTheme) && <div className="more-card">
          <Link className="more-row" to={ROUTES.themeEditor + '?id=' + menuTheme.id + '&publish=1'}>
            <span className="more-ri"><Store aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.publish')}</span>
            <ChevronRight aria-hidden="true" className="more-chev size-4.5" />
          </Link>
          <ThemeExportButton theme={menuTheme} className="more-row">
            <span className="more-ri"><Share aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.exportFile')}</span>
          </ThemeExportButton>
          <button type="button" className="more-row" disabled={action.busy} onClick={() => { closeMenu(); copy(menuTheme) }}>
            <span className="more-ri"><Copy aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.duplicate')}</span>
          </button>
        </div>}
        {menuTheme.creatorId && <div className="more-card">
          <button type="button" className="more-row more-row-danger" disabled={action.busy} onClick={() => { closeMenu(); remove(menuTheme) }}>
            <span className="more-ri"><Trash2 aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
            <span className="more-rt">{t('themes.delete')}</span>
          </button>
        </div>}
      </CustomizationSheet> : null}
    </section>
  )
}

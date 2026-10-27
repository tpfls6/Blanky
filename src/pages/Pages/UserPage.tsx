import { useMemo, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { BUILTIN_TEMPLATES, blocksFromTemplate } from '../../features/builder/catalog.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { TemplateGuide } from '../../features/workspace/TemplateGuide.tsx'
import { builtinTemplates } from '../../features/workspace/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function UserPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { t } = useI18n()
  const { customPages, pageTemplates, updateUserPage, duplicateUserPage, removeUserPage, savePageTemplate, addPageFromTemplate, addUserPage, settings, updateSettings } = useLibrary()
  const [editing, setEditing] = useState(true)
  const [guide, setGuide] = useState(false)
  const [find, setFind] = useState('')
  const page = customPages.find((item) => item.id === pageId)
  const [tpl, setTpl] = useState(() => !page || (page.blocks.length <= 1 && !(page.blocks[0]?.props.text)))
  const starters = useMemo(() => builtinTemplates(), [])
  const extras = BUILTIN_TEMPLATES.filter((item) => item.id === 'dashboard' || item.id === 'reading' || item.id === 'weekly')
  if (!page) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-neutral-500">{t('builder.missing')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <IconPicker value={page.icon} onChange={(icon) => updateUserPage(page.id, { icon })} />
        <div className="min-w-0 flex-1">
          <input
            value={page.name}
            onChange={(event) => updateUserPage(page.id, { name: event.target.value })}
            className="w-full bg-transparent text-xl font-medium outline-none"
          />
          <input
            value={page.description}
            onChange={(event) => updateUserPage(page.id, { description: event.target.value })}
            placeholder={t('builder.description')}
            className="mt-1 w-full bg-transparent text-sm text-neutral-500 outline-none placeholder:text-neutral-300"
          />
        </div>
        <button type="button" className={editing ? 'chip chip-on' : 'chip'} onClick={() => setEditing((value) => !value)}>
          {editing ? t('edit') : t('builder.view')}
        </button>
        <p className="text-xs text-neutral-400" data-save-state>{t('builder.saved')}</p>
        <label className="sr-only" htmlFor="page-find">{t('builder.find')}</label>
        <input id="page-find" value={find} onChange={(event) => setFind(event.target.value)} placeholder={t('builder.find')} className="field w-36 text-sm" />
        <button type="button" className="chip" onClick={() => { const id = duplicateUserPage(page.id); if (id) navigate(ROUTES.page(id)) }}>{t('builder.duplicatePage')}</button>
        <button type="button" className="chip" data-tour="save-template" onClick={() => { savePageTemplate(page.id); setTpl(false) }}>{t('builder.saveTemplate')}</button>
        <button type="button" className="chip" onClick={() => setGuide(true)}>
          <HelpCircle className="size-3.5" strokeWidth={1.5} />
          {t('custom.guide')}
        </button>
        <button type="button" className="chip" onClick={() => setTpl((value) => !value)}>{t('builder.fromTemplate')}</button>
        <button
          type="button"
          className="chip"
          onClick={async () => {
            if (await confirm(t('builder.deleteAsk', { name: page.name }))) {
              removeUserPage(page.id)
              navigate(ROUTES.home)
            }
          }}
        >
          {t('delete')}
        </button>
      </div>
      {tpl ? (
        <div className="mb-4 rounded-md border border-line p-3">
          <p className="mb-2 text-xs text-neutral-400">{t('builder.templates')}</p>
          <div className="flex flex-wrap gap-2">
            {starters.map((item) => (
              <button key={item.id} type="button" className="chip" onClick={() => { const id = addPageFromTemplate({ name: item.name, icon: item.icon, blocks: item.blocks, collections: item.collections }); navigate(ROUTES.page(id)); setTpl(false) }}>
                {t(`builder.template.${item.id.replace('tpl-', '')}`)}
              </button>
            ))}
            {extras.map((item) => (
              <button key={item.id} type="button" className="chip" onClick={() => { const id = addPageFromTemplate({ name: item.name, icon: item.icon, blocks: blocksFromTemplate(item) }); navigate(ROUTES.page(id)); setTpl(false) }}>
                {t(`builder.template.${item.id}`)}
              </button>
            ))}
            {pageTemplates.map((item) => (
              <button key={item.id} type="button" className="chip" onClick={() => { const id = addPageFromTemplate(item); navigate(ROUTES.page(id)); setTpl(false) }}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <PageBuilder blocks={page.blocks} editing={editing} find={find} onChange={(blocks) => updateUserPage(page.id, { blocks })} />
      {guide ? (
        <TemplateGuide
          onClose={() => {
            setGuide(false)
            if (!settings.customTemplatesGuideSeen) updateSettings({ customTemplatesGuideSeen: true })
          }}
          onCreate={() => {
            setGuide(false)
            if (!settings.customTemplatesGuideSeen) updateSettings({ customTemplatesGuideSeen: true })
            navigate(ROUTES.page(addUserPage({ name: t('builder.newPage') })))
          }}
          onTemplate={() => {
            setGuide(false)
            if (!settings.customTemplatesGuideSeen) updateSettings({ customTemplatesGuideSeen: true })
            setTpl(true)
          }}
        />
      ) : null}
    </div>
  )
}

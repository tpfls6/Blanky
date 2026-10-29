import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { APP_LOCALES, type AppLocale } from '../../i18n/locale.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { ACCENTS, accentHex } from '../../theme/accent.ts'
import { Choice, Group, Section } from './bits.tsx'
import { NavSection } from './NavSection.tsx'

function CustomAccent({
  accent,
  saved,
  onPick,
  onSave,
}: {
  accent: string
  saved: string[]
  onPick: (accent: string) => void
  onSave: (saved: string[]) => void
}) {
  const { t } = useI18n()
  const hex = accentHex(accent).toLowerCase()
  const kept = saved.includes(hex)
  const full = saved.length >= 8

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex h-7 cursor-pointer items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2 text-xs text-neutral-500">
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          {t('settings.appearance.customColor')}
          <input
            type="color"
            aria-label={t('settings.appearance.pickCustomColor')}
            value={hex}
            onInput={(event) => onPick(event.currentTarget.value)}
            onChange={(event) => onPick(event.currentTarget.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
          <span aria-hidden="true" className="size-4 rounded-full border border-line" style={{ backgroundColor: hex }} />
          {hex.toUpperCase()}
        </span>
        <button type="button" className="btn btn-line" disabled={kept || full} onClick={() => onSave([hex, ...saved])}>
          {kept ? t('settings.appearance.colorSaved') : t('settings.appearance.saveColor')}
        </button>
      </div>
      <p className="text-xs text-neutral-400" role="status">
        {full && !kept ? t('settings.appearance.colorLimit') : t('settings.appearance.colorHint')}
      </p>
      {saved.length > 0 ? <p className="text-xs text-neutral-400">{t('settings.appearance.savedColors')} · {saved.length}/8</p> : null}
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label={t('settings.appearance.savedCustomColors')}>
        {saved.map((color) => (
          <span key={color} className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={t('settings.appearance.applyColor', { color: color.toUpperCase() })}
              title={color.toUpperCase()}
              aria-pressed={hex === color}
              onClick={() => onPick(color)}
              className="size-6 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: hex === color ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)' : undefined,
              }}
            />
            <button type="button" aria-label={t('settings.appearance.deleteColor', { color })} onClick={() => onSave(saved.filter((item) => item !== color))} className="text-xs text-neutral-400">
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function GeneralSection() {
  const { t, locale, setLocale } = useI18n()
  const { settings, updateSettings } = useLibrary()
  const patch = (next: Partial<typeof settings>) => updateSettings(next)

  return (
    <Section>
      <Group id="language" title={t('settings.general.languageSection')} description={t('settings.general.languageSectionHint')}>
        <div>
          <p className="text-sm">{t('settings.general.language')}</p>
          <p className="mt-1 text-xs text-neutral-400">{t('settings.general.languageHint')}</p>
          <label className="mt-3 block text-sm">
            <span className="sr-only">{t('settings.general.language')}</span>
            <select
              className="field select mt-1 block w-52 max-w-full"
              value={locale}
              onChange={(event) => setLocale(event.target.value as AppLocale)}
            >
              {APP_LOCALES.map((value) => (
                <option key={value} value={value}>{t(value === 'ko' ? 'settings.general.korean' : 'settings.general.english')}</option>
              ))}
            </select>
          </label>
        </div>
      </Group>
      <Group id="appearance" title={t('settings.general.appearanceSection')} description={t('settings.general.appearanceSectionHint')}>
        <p className="text-sm text-neutral-500">
          {t('settings.appearance.themeNote')} <Link className="text-accent-text" to="/settings/themes">{t('settings.appearance.manageThemes')}</Link>{t('settings.appearance.themeNoteAfter')}
        </p>
        <div>
          <p className="text-sm">{t('settings.appearance.theme')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.appearance.theme')}>
            <Choice value="light" current={settings.theme} label={t('settings.appearance.light')} onPick={(theme) => patch({ theme })} />
            <Choice value="dark" current={settings.theme} label={t('settings.appearance.dark')} onPick={(theme) => patch({ theme })} />
            <Choice value="system" current={settings.theme} label={t('settings.appearance.system')} onPick={(theme) => patch({ theme })} />
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.appearance.accent')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label={t('settings.appearance.accent')}>
            {ACCENTS.map((accent) => {
              const selected = settings.accent === accent.id
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={accent.label}
                  onClick={() => patch({ accent: accent.id })}
                  className="size-6 rounded-full"
                  style={{
                    backgroundColor: accent.light.color,
                    boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)' : undefined,
                  }}
                />
              )
            })}
          </div>
          <CustomAccent
            accent={settings.accent}
            saved={settings.savedAccents}
            onPick={(accent) => patch({ accent })}
            onSave={(savedAccents) => patch({ savedAccents })}
          />
        </div>
      </Group>
      <Group id="navigation" title={t('settings.general.navigationSection')} description={t('settings.general.navigationSectionHint')}>
        <NavSection />
      </Group>
    </Section>
  )
}

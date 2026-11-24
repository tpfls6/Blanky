import { useState } from 'react'
import { SETTINGS_COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { HomeInputDefault } from '../../types/records.ts'
import { Choice, Group, Section, SwitchRow } from './bits.tsx'
import { MCard, MLabel, MRow, MSheet, MSwitch } from './mobileRows.tsx'

const HOME_INPUTS = ['auto', 'schedule', 'task', 'diary', 'memo', 'reading', 'last'] as const satisfies readonly HomeInputDefault[]

export function InputSection() {
  const { t } = useI18n()
  const { settings, updateSettings } = useLibrary()
  const patch = (next: Partial<typeof settings>) => updateSettings(next)
  const compact = useMediaQuery(SETTINGS_COMPACT_QUERY)
  const [picking, setPicking] = useState(false)
  const inputLabel = (value: HomeInputDefault) => (value === 'last' ? t('settings.input.lastUsed') : t(`type.${value}`))

  if (compact) {
    return (
      <div>
        <MLabel>{t('settings.ai.inputTab')}</MLabel>
        <MCard>
          <MRow label={t('settings.input.homeDefault')} value={inputLabel(settings.homeDefaultInput)} onPress={() => setPicking(true)} data-settings-row="home-default" />
          <MSwitch label={t('settings.input.autoClassify')} hint={t('settings.input.autoClassifyHint')} checked={settings.autoClassify} onChange={() => patch({ autoClassify: !settings.autoClassify })} />
          <MSwitch label={t('settings.input.autoSave')} hint={t('settings.input.autoSaveHint')} checked={settings.autoSaveAfterClassify} onChange={() => patch({ autoSaveAfterClassify: !settings.autoSaveAfterClassify })} />
        </MCard>
        {picking ? (
          <MSheet title={t('settings.input.homeDefault')} onClose={() => setPicking(false)}>
            <div className="more-options" role="radiogroup" aria-label={t('settings.input.homeDefault')}>
              {HOME_INPUTS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={settings.homeDefaultInput === value} onClick={() => { patch({ homeDefaultInput: value }); setPicking(false) }}>{inputLabel(value)}</button>
              ))}
            </div>
          </MSheet>
        ) : null}
      </div>
    )
  }

  return (
    <Section>
      <Group title={t('settings.ai.inputTitle')} description={t('settings.ai.inputHint')}>
        <div>
          <p className="text-sm">{t('settings.input.homeDefault')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.input.homeDefault')}>
            {HOME_INPUTS.map((value) => (
              <Choice
                key={value}
                value={value}
                current={settings.homeDefaultInput}
                label={value === 'last' ? t('settings.input.lastUsed') : t(`type.${value}`)}
                onPick={(homeDefaultInput) => patch({ homeDefaultInput })}
              />
            ))}
          </div>
        </div>
      </Group>
      <Group title={t('settings.ai.behaviorTitle')} description={t('settings.ai.behaviorHint')}>
        <SwitchRow
          label={t('settings.input.autoClassify')}
          hint={t('settings.input.autoClassifyHint')}
          checked={settings.autoClassify}
          onChange={() => patch({ autoClassify: !settings.autoClassify })}
        />
        <SwitchRow
          label={t('settings.input.autoSave')}
          hint={t('settings.input.autoSaveHint')}
          checked={settings.autoSaveAfterClassify}
          onChange={() => patch({ autoSaveAfterClassify: !settings.autoSaveAfterClassify })}
        />
      </Group>
    </Section>
  )
}

import { ColorDots } from '../records/properties.tsx'
import { createBlock as createField } from '../records/registry.ts'
import { insertBlock as insertField, moveBlock as moveField, patchBlock as patchField, removeBlock as removeField, type BlockType } from '../records/schema.ts'
import type { CustomRecordType } from '../../types/records.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useTemplatePreview } from '../marketplace/preview.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { CollectionView } from './CollectionView.tsx'
import type { DataView } from './model.ts'
import { createBlock, patchBlock, type BuilderBlock } from '../builder/schema.ts'

const FIELD_TYPES: { type: BlockType; key: string }[] = [
  { type: 'textField', key: 'builder.field.text' },
  { type: 'number', key: 'builder.field.number' },
  { type: 'date', key: 'builder.field.date' },
  { type: 'checkbox', key: 'builder.field.checkbox' },
  { type: 'select', key: 'builder.field.select' },
  { type: 'multiSelect', key: 'builder.field.multi' },
  { type: 'url', key: 'builder.field.url' },
  { type: 'image', key: 'builder.field.image' },
  { type: 'rating', key: 'builder.field.rating' },
  { type: 'progress', key: 'builder.field.progress' },
  { type: 'tags', key: 'builder.field.tags' },
  { type: 'longText', key: 'builder.field.long' },
]

export function insertCollectionBlock(name: string): BuilderBlock {
  return createBlock('collection', { collectionId: '', view: 'table', span: 3, text: name })
}

export function CollectionBlock({ root, block, write }: { root: BuilderBlock[]; block: BuilderBlock; write: (blocks: BuilderBlock[], record?: boolean) => void }) {
  const { t } = useI18n()
  const preview = useTemplatePreview()
  const { recordTypes, records, addRecord, updateRecord, removeRecord, addRecordType } = useLibrary()
  const type = preview?.collections.find((item) => item.id === block.props.collectionId) ?? recordTypes.find((item) => item.id === block.props.collectionId)
  if (!type) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-neutral-400">{t('builder.missingCollection')}</p>
        {recordTypes.length > 0 ? (
          <label className="block text-xs text-neutral-500">
            {t('builder.pickCollection')}
            <select
              className="field mt-1 w-full"
              value=""
              onChange={(event) => {
                if (event.target.value) write(patchBlock(root, block.id, { collectionId: event.target.value }))
              }}
            >
              <option value="">{t('builder.pickCollection')}</option>
              {recordTypes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="chip"
          onClick={() => write(patchBlock(root, block.id, { collectionId: createCollectionType(t('builder.newCollection'), addRecordType) }))}
        >
          {t('builder.newCollection')}
        </button>
      </div>
    )
  }
  return (
    <CollectionView
      type={type}
      rows={(preview?.records ?? records).filter((item) => item.typeId === type.id)}
      view={block.props.view ?? 'table'}
      onView={(view) => { if (!preview) write(patchBlock(root, block.id, { view })) }}
      onAdd={(input) => { if (!preview) addRecord(type.id, input) }}
      onUpdate={(id, input) => { if (!preview) updateRecord(id, input) }}
      onRemove={(id) => { if (!preview) removeRecord(id) }}
    />
  )
}

export function BlockSettings({
  block,
  onPatch,
  onClose,
}: {
  block: BuilderBlock
  onPatch: (patch: BuilderBlock['props']) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { recordTypes, updateRecordType } = useLibrary()
  return (
    <aside className="mt-4 border-t border-line pt-3" data-tour="block-settings">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('builder.settings')}</h2>
        <button type="button" className="text-xs text-neutral-400" onClick={onClose}>{t('builder.close')}</button>
      </div>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-neutral-400">{t('builder.background')}</p>
        <ColorDots value={block.props.background || '#3A62B0'} onChange={(background) => onPatch({ background })} />
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input type="checkbox" checked={block.props.border === true} onChange={(event) => onPatch({ border: event.target.checked })} />
          {t('builder.border')}
        </label>
        <p className="text-xs text-neutral-400">{t('builder.textColor')}</p>
        <ColorDots value={block.props.color || '#1A1A1A'} onChange={(color) => onPatch({ color })} />
        <div className="flex flex-wrap gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button key={align} type="button" className={block.props.align === align ? 'chip chip-on' : 'chip'} onClick={() => onPatch({ align })}>{t(`builder.align.${align}`)}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['sm', 'md', 'lg'] as const).map((padding) => (
            <button key={padding} type="button" className={block.props.padding === padding ? 'chip chip-on' : 'chip'} onClick={() => onPatch({ padding })}>{t(`builder.pad.${padding}`)}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input type="checkbox" checked={block.props.hideContent === true} onChange={(event) => onPatch({ hideContent: event.target.checked })} />
          {t('builder.hideContent')}
        </label>
      </div>
      {block.type === 'collection' ? (
        <CollectionFields
          type={recordTypes.find((item) => item.id === block.props.collectionId) ?? null}
          view={block.props.view ?? 'table'}
          onView={(view) => onPatch({ view })}
          onType={updateRecordType}
        />
      ) : null}
    </aside>
  )
}

function CollectionFields({
  type,
  view,
  onView,
  onType,
}: {
  type: CustomRecordType | null
  view: DataView
  onView: (view: DataView) => void
  onType: (id: string, patch: Partial<Pick<CustomRecordType, 'name' | 'color' | 'blocks'>>) => void
}) {
  const { t } = useI18n()
  if (!type) return <p className="mt-4 text-sm text-neutral-400">{t('builder.missingCollection')}</p>
  const fields = type.blocks.filter((item) => item.type !== 'title')
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-xs text-neutral-500">
        {t('builder.collectionName')}
        <input value={type.name} onChange={(event) => onType(type.id, { name: event.target.value })} className="field mt-1 w-full" />
      </label>
      <ColorDots value={type.color} onChange={(color) => onType(type.id, { color })} />
      <div className="flex flex-wrap gap-1">
        {(['table', 'card', 'gallery', 'calendar', 'kanban', 'chart'] as DataView[]).map((item) => (
          <button key={item} type="button" className={view === item ? 'chip chip-on' : 'chip'} onClick={() => onView(item)}>{item}</button>
        ))}
      </div>
      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={field.id} className="space-y-1">
            <div className="flex items-center gap-1">
              <input value={field.props.label ?? ''} onChange={(event) => onType(type.id, { blocks: patchField(type.blocks, field.id, { label: event.target.value }) })} className="field min-w-0 flex-1 text-xs" />
              <button type="button" className={field.props.required ? 'chip chip-on' : 'chip'} onClick={() => onType(type.id, { blocks: patchField(type.blocks, field.id, { required: !field.props.required }) })}>*</button>
              <button type="button" className="text-xs text-neutral-400" disabled={index === 0} onClick={() => onType(type.id, { blocks: moveField(type.blocks, field.id, null, index - 1) })}>↑</button>
              <button type="button" className="text-xs text-neutral-400" onClick={() => onType(type.id, { blocks: moveField(type.blocks, field.id, null, index + 2) })}>↓</button>
              <button type="button" className="text-xs text-neutral-400" onClick={() => onType(type.id, { blocks: removeField(type.blocks, field.id) })}>{t('delete')}</button>
            </div>
            {field.type === 'textField' || field.type === 'longText' || field.type === 'number' ? (
              <input
                value={field.props.defaultValue === undefined || field.props.defaultValue === null ? '' : String(field.props.defaultValue)}
                placeholder={t('builder.defaultValue')}
                onChange={(event) => {
                  const raw = event.target.value
                  const parsed = Number(raw)
                  const defaultValue = field.type === 'number' ? (raw === '' || !Number.isFinite(parsed) ? undefined : parsed) : raw
                  onType(type.id, { blocks: patchField(type.blocks, field.id, { defaultValue }) })
                }}
                className="field w-full text-xs"
              />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1">
        {FIELD_TYPES.map((item) => (
          <button key={item.type} type="button" className="chip" onClick={() => onType(type.id, { blocks: insertField(type.blocks, createField(item.type), null, type.blocks.length) })}>+ {t(item.key)}</button>
        ))}
      </div>
    </div>
  )
}

export function createCollectionType(name: string, addRecordType: (input: Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>) => string | null | void) {
  return addRecordType({
    name,
    icon: 'StickyNote',
    color: '#3A62B0',
    description: '',
    blocks: [createField('title', { label: name })],
  }) ?? ''
}

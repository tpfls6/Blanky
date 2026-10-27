import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCustomWorkspace, ROUTES } from '../src/constants/routes.ts'
import { translate } from '../src/i18n/translate.ts'
import { builtinTemplates, remapCollections } from '../src/features/workspace/templates.ts'
import { cloneBlocks } from '../src/features/builder/schema.ts'
import { DEFAULT_SETTINGS } from '../src/types/records.ts'

test('custom workspace routes stay on /custom and /pages', () => {
  assert.equal(ROUTES.templateDetail('abc'), '/store/templates/abc')
  assert.equal(ROUTES.storeTemplates, '/store?tab=templates')
  assert.equal(ROUTES.custom, '/custom')
  assert.equal(isCustomWorkspace('/custom'), true)
  assert.equal(isCustomWorkspace('/pages/abc'), true)
  assert.equal(isCustomWorkspace('/'), false)
  assert.equal(isCustomWorkspace('/schedule'), false)
  assert.equal(isCustomWorkspace('/customize/theme'), false)
})

test('guide flag is off by default and is not page data', () => {
  assert.equal(DEFAULT_SETTINGS.customTemplatesGuideSeen, false)
  assert.equal('customPages' in DEFAULT_SETTINGS, false)
})

test('nav label follows locale without changing the route', () => {
  assert.equal(translate('ko', 'nav.custom'), '커스텀 템플릿')
  assert.equal(translate('en', 'nav.custom'), 'Custom Templates')
  assert.equal(translate('ko', 'custom.title'), '커스텀 템플릿')
  assert.equal(translate('en', 'custom.title'), 'Custom Templates')
  assert.equal(translate('ko', 'builder.pickCollection'), '기존 컬렉션 연결')
  assert.equal(translate('en', 'builder.pickCollection'), 'Link an existing collection')
  assert.equal(translate('ko', 'builder.saved'), '저장됨')
  assert.equal(translate('en', 'builder.find'), 'Find in page')
})

test('starter collections remap without sharing ids', () => {
  const starter = builtinTemplates().find((item) => item.id === 'tpl-workout')
  assert.ok(starter)
  const first = crypto.randomUUID()
  const blocks = remapCollections(cloneBlocks(starter.blocks), new Map([[starter.collections[0]?.id ?? '', first]]))
  assert.equal(blocks.find((block) => block.type === 'collection')?.props.collectionId, first)
  assert.notEqual(first, starter.collections[0]?.id)
})

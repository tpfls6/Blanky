import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BLOCK_TYPES } from '../src/features/records/schema.ts'
import { encoder, LIMITS, toBase64 } from '../src/theme/package/limits.ts'
import { readZip, writeZip } from '../src/theme/package/zip.ts'
import {
  TEMPLATE_PACKAGE_KIND,
  compareSemver,
  isTemplatePackageFile,
  snapshotHasContent,
} from '../src/template/package/schema.ts'
import {
  exportTemplatePackage,
  importTemplatePackage,
  importTemplatePackages,
  packageFromRecordType,
} from '../src/template/package/TemplateLoader.ts'
import {
  packagesFromUnknown,
  snapshotFromUnknown,
  validateManifest,
  validatePackage,
} from '../src/template/package/TemplateValidator.ts'
import { deleteTemplatePackage, listTemplatePackages, putTemplatePackage } from '../src/services/templates/localPackages.ts'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#3c8664"/></svg>'

function collection() {
  return {
    id: 'col-workout',
    name: '운동',
    icon: 'Dumbbell',
    color: '#3C8664',
    description: '운동 기록',
    blocks: [
      { id: 'title', type: 'title', fieldKey: 'title', props: { label: '운동명', required: true } },
      { id: 'minutes', type: 'number', fieldKey: 'minutes', props: { label: '시간', unit: '분' } },
    ],
  }
}

function fixture(overrides: Record<string, unknown> = {}) {
  const col = collection()
  return {
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id: 'workout-file',
    name: '파일 운동',
    description: '가져온 운동 기록',
    author: 'tester',
    version: '1.0.0',
    pageType: 'record',
    icon: 'Dumbbell',
    snapshot: {
      version: 1,
      title: '파일 운동',
      icon: 'Dumbbell',
      description: '가져온 운동 기록',
      blocks: [
        { id: 'h', type: 'heading', props: { level: 1, text: '파일 운동', span: 3 } },
        { id: 'c', type: 'collection', props: { collectionId: col.id, view: 'table', text: '운동', span: 3 } },
      ],
      collections: [col],
      samples: [{ collectionId: col.id, title: '스쿼트', values: { title: '스쿼트', minutes: 40 } }],
      guide: '',
    },
    ...overrides,
  }
}

test('examples/workout-record.blankytpl passes the package validator with visible fields', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../examples/workout-record.blankytpl'), 'utf8')
  const pkg = validatePackage(JSON.parse(source))
  assert.equal(pkg.manifest.id, 'workout-record')
  assert.equal(pkg.manifest.pageType, 'record')
  assert.equal(pkg.snapshot?.blocks.length, 3)
  assert.equal(pkg.snapshot?.blocks.some((block) => block.type === 'heading' && block.props.text === '운동 기록'), true)
  assert.equal(pkg.snapshot?.blocks.some((block) => block.type === 'collection' && block.props.collectionId === 'col-workout'), true)
  const fields = pkg.snapshot?.collections[0]?.blocks ?? []
  const labels = fields.map((block) => block.props.label)
  assert.equal(fields.some((block) => block.type === 'title' && block.fieldKey === 'exercise'), true)
  assert.deepEqual(
    ['운동 종목', '날짜', '세트', '횟수', '중량', '메모'].every((label) => labels.includes(label)),
    true,
  )
  assert.equal(fields.find((block) => block.fieldKey === 'sets')?.type, 'number')
  assert.equal(fields.find((block) => block.fieldKey === 'reps')?.props.unit, '회')
  assert.equal(fields.find((block) => block.fieldKey === 'weight')?.props.unit, 'kg')
  assert.equal(fields.find((block) => block.fieldKey === 'memo')?.type, 'longText')
  assert.ok((pkg.snapshot?.blocks.length ?? 0) > 0)
})

test('empty blocks and collections still import but have no visible content', () => {
  const pkg = validatePackage({
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id: 'empty-record',
    name: '빈 기록',
    author: 'tester',
    version: '1.0.0',
    pageType: 'record',
    icon: 'Dumbbell',
    snapshot: { title: '빈 기록', blocks: [], collections: [] },
  })
  assert.equal(pkg.manifest.id, 'empty-record')
  assert.equal(pkg.snapshot?.blocks.length, 0)
  assert.equal(pkg.snapshot?.collections.length, 0)
  assert.equal(snapshotHasContent(pkg.snapshot), false)
  assert.equal(snapshotHasContent(validatePackage(fixture()).snapshot), true)
})

test('template filenames include .blankytpl and json', () => {
  assert.equal(isTemplatePackageFile('Workout.blankytpl'), true)
  assert.equal(isTemplatePackageFile('Workout.json'), true)
  assert.equal(isTemplatePackageFile('Workout.blankytheme'), false)
  assert.equal(isTemplatePackageFile('Workout.exe'), false)
})

test('JSON package roundtrip keeps fields, order and options', async () => {
  const pkg = validatePackage(fixture())
  const imported = await importTemplatePackage(await exportTemplatePackage(pkg))
  assert.equal(imported.manifest.id, 'workout-file')
  assert.equal(imported.manifest.pageType, 'record')
  assert.equal(imported.snapshot?.collections[0]?.blocks[1]?.props.unit, '분')
  assert.equal(imported.snapshot?.blocks[1]?.props.collectionId, 'col-workout')
})

test('legacy record template JSON still installs as a record package', async () => {
  const packages = await importTemplatePackages(new Blob([JSON.stringify({
    kind: 'blanky.custom-record-template',
    schemaVersion: 1,
    name: '습관',
    icon: 'Leaf',
    color: '#C27832',
    description: '매일',
    blocks: [
      { id: 'title', type: 'title', fieldKey: 'title', props: { label: '습관' } },
      { id: 'done', type: 'checkbox', fieldKey: 'done', props: { label: '완료' } },
    ],
  })]))
  assert.equal(packages.length, 1)
  assert.equal(packages[0]?.manifest.pageType, 'record')
  assert.ok(packages[0]?.snapshot?.collections[0]?.blocks.some((block) => block.type === 'checkbox'))
})

test('diary packages can omit a snapshot and keep field labels', () => {
  const pkg = validatePackage({
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id: 'my-diary',
    name: '나의 일기',
    description: '',
    author: 'serin',
    version: '1.0.0',
    pageType: 'diary',
    icon: 'BookOpen',
    fieldLabels: { mood: '오늘의 컨디션', body: '오늘' },
  })
  assert.equal(pkg.snapshot, null)
  assert.equal(pkg.manifest.fieldLabels?.mood, '오늘의 컨디션')
})

test('unknown block types, scripts and event handlers are dropped or rejected', () => {
  const snapshot = snapshotFromUnknown({
    title: '위험',
    icon: 'StickyNote',
    blocks: [{ id: 'x', type: 'script', props: { text: 'alert(1)' } }, { id: 'h', type: 'heading', props: { level: 2, text: '안녕' } }],
    collections: [{
      id: 'c1',
      name: '기록',
      icon: 'StickyNote',
      color: '#3A62B0',
      blocks: [
        { id: 'title', type: 'title', fieldKey: 'title', props: { label: '제목' } },
        { id: 'evil', type: 'javascript', fieldKey: 'x', props: { onClick: 'alert(1)', label: '악' } },
      ],
    }],
  })
  assert.ok(snapshot)
  assert.equal(snapshot.blocks.some((block) => block.type === 'heading'), true)
  assert.equal(snapshot.blocks.some((block) => (block.type as string) === 'script'), false)
  assert.equal(snapshot.collections[0]?.blocks.some((block) => (block.type as string) === 'javascript'), false)
  for (const type of BLOCK_TYPES) assert.equal(typeof type, 'string')
})

test('ZIP assets are kept and javascript files are blocked', async () => {
  const pkg = validatePackage({
    ...fixture(),
    preview: 'preview/cover.svg',
    files: { 'preview/cover.svg': { mime: 'image/svg+xml', data: toBase64(encoder.encode(svg)) } },
  })
  const blob = await exportTemplatePackage(pkg)
  const imported = await importTemplatePackage(blob)
  assert.equal(imported.files['preview/cover.svg']?.mime, 'image/svg+xml')
  const files = await readZip(new Uint8Array(await blob.arrayBuffer()))
  files['assets/hack.js'] = encoder.encode('alert(1)')
  await assert.rejects(() => importTemplatePackage(new Blob([writeZip(files)])))
})

test('HTML, huge files and path traversal are rejected', async () => {
  await assert.rejects(() => importTemplatePackage(new Blob(['<script>alert(1)</script>'])))
  await assert.rejects(() => importTemplatePackage(new Blob([new Uint8Array(LIMITS.package + 1)])))
  assert.throws(() => validateManifest({ ...fixture(), version: 'nope' }))
  assert.throws(() => validateManifest({ ...fixture(), id: '../x' }))
  assert.throws(() => writeZip({ '../../x.svg': encoder.encode(svg) }))
})

test('semver compare supports replace-or-copy decisions', () => {
  assert.ok(compareSemver('1.1.0', '1.0.0') > 0)
  assert.ok(compareSemver('1.0.0', '1.2.0') < 0)
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
})

test('deleting an installed package does not touch live record ids', async () => {
  const pkg = validatePackage(fixture())
  const installed = { ...pkg, installedId: 'inst-1', installedAt: '2026-10-28T00:00:00.000Z' }
  await putTemplatePackage('user-a', installed)
  const liveTypeId = 'live-record-type'
  assert.equal((await listTemplatePackages('user-a')).length, 1)
  await deleteTemplatePackage('user-a', 'inst-1')
  assert.equal((await listTemplatePackages('user-a')).length, 0)
  assert.equal(liveTypeId, 'live-record-type')
})

test('record types export into the file format used by import', async () => {
  const type = packageFromRecordType({
    id: 'habit',
    name: '습관',
    icon: 'Leaf',
    color: '#C27832',
    description: '매일',
    schemaVersion: 1,
    version: 1,
    blocks: [
      { id: 'title', type: 'title', fieldKey: 'title', props: { label: '습관', required: true, locked: true } },
    ],
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
  })
  const imported = await importTemplatePackage(await exportTemplatePackage(type))
  assert.equal(imported.manifest.pageType, 'record')
  assert.equal(imported.snapshot?.collections[0]?.name, '습관')
})

test('javascript image defaults are stripped', () => {
  const snapshot = snapshotFromUnknown({
    title: '링크',
    icon: 'Tag',
    blocks: [{ id: 'h', type: 'heading', props: { text: '링크' } }],
    collections: [{
      id: 'c1',
      name: '링크',
      icon: 'Tag',
      color: '#3A62B0',
      blocks: [
        { id: 'title', type: 'title', fieldKey: 'title', props: { label: '이름' } },
        { id: 'img', type: 'image', fieldKey: 'img', props: { label: '이미지', defaultValue: 'javascript:alert(1)' } },
      ],
    }],
  })
  assert.equal(snapshot?.collections[0]?.blocks.find((block) => block.type === 'image')?.props.defaultValue, undefined)
})

test('array export of legacy templates becomes one package per item', () => {
  const packages = packagesFromUnknown([
    { kind: 'blanky.custom-record-template', schemaVersion: 1, name: 'A', icon: 'Star', color: '#3A62B0', description: '', blocks: [{ id: 't', type: 'title', fieldKey: 't', props: { label: 'A' } }] },
    { kind: 'blanky.custom-record-template', schemaVersion: 1, name: 'B', icon: 'Star', color: '#3A62B0', description: '', blocks: [{ id: 't', type: 'title', fieldKey: 't', props: { label: 'B' } }] },
  ])
  assert.equal(packages.length, 2)
  assert.notEqual(packages[0]?.manifest.id, packages[1]?.manifest.id)
})

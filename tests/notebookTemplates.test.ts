import test from 'node:test'
import assert from 'node:assert/strict'
import { officialListings } from '../src/features/marketplace/official.ts'
import { coerceSnapshot } from '../src/features/marketplace/sanitize.ts'
import { forkSnapshot } from '../src/features/marketplace/install.ts'
import { coercePage } from '../src/features/builder/schema.ts'
import { notebookDefaults, notebookError, notebookSummary, roleField, roleText, type NotebookKind } from '../src/features/workspace/notebookModel.ts'
import type { CustomRecord } from '../src/types/records.ts'

const notebooks = officialListings().filter(listing => listing.snapshot.blocks.some(block => block.props.recordLayout))
test('all four notebooks survive package validation with their field roles and example dates intact', () => {
  assert.equal(notebooks.length, 4)
  for (const listing of notebooks) {
    const snapshot = coerceSnapshot(JSON.parse(JSON.stringify(listing.snapshot)))
    assert.ok(snapshot, listing.name)
    assert.ok(snapshot.blocks[0].props.recordLayout)
    assert.ok(snapshot.collections[0].blocks.every(field => field.props.role), listing.name)
    assert.equal(snapshot.samples.length, listing.snapshot.samples.length)
    const installed = forkSnapshot(snapshot)
    const roundtrip = coercePage(installed.page)
    assert.equal(roundtrip?.blocks[0].props.recordLayout, snapshot.blocks[0].props.recordLayout)
    assert.equal(roundtrip?.collections?.[0].blocks[0].props.role, 'title')
  }
})

test('separate notebook installations never share fields, collections, rows or mutable values', () => {
  for (const listing of notebooks) {
    const a = forkSnapshot(listing.snapshot), b = forkSnapshot(listing.snapshot)
    assert.notEqual(a.page.id, b.page.id)
    assert.notEqual(a.collections[0].id, b.collections[0].id)
    assert.notEqual(a.collections[0].blocks[0].fieldKey, b.collections[0].blocks[0].fieldKey)
    assert.ok(a.records.every(row => row.typeId === a.collections[0].id))
    assert.ok(b.records.every(row => row.typeId === b.collections[0].id))
    assert.ok(a.records.every(row => !b.records.some(other => row.id === other.id)))
  }
})

function fixture(kind: NotebookKind) {
  const listing = notebooks.find(row => row.snapshot.blocks[0].props.recordLayout === kind)!
  const installed = forkSnapshot(listing.snapshot)
  return { type: installed.collections[0], rows: installed.records }
}
test('finance summary counts only this month, preserves income signs and recalculates after deletion', () => {
  const { type, rows } = fixture('finance')
  const summary = notebookSummary(type, 'finance', rows, '2026-10')
  assert.deepEqual(summary.map(item => item.value), ['2,800,000원', '98,600원', '2,701,400원'])
  assert.deepEqual(notebookSummary(type, 'finance', rows, '2026-11').map(item => item.value), ['0원', '0원', '0원'])
  const amount = roleField(type, 'amount')!, kind = roleField(type, 'kind')!
  // Labels can change without breaking semantic roles or using option UUIDs as display text.
  amount.props.label = '결제 금액'; kind.props.label = '입출금'
  assert.deepEqual(notebookSummary(type, 'finance', rows, '2026-10').map(item => item.value), summary.map(item => item.value))
  assert.equal(roleText(type, rows[0], 'kind'), '수입')
  assert.equal(notebookSummary(type, 'finance', rows.filter(row => row.title !== '카페에서 읽는 시간'), '2026-10')[1].value, '93,100원')
})

test('movie watchlist is excluded from average scores; study time and review counts are accurate', () => {
  const movie = fixture('movie'), study = fixture('study')
  assert.deepEqual(notebookSummary(movie.type, 'movie', movie.rows, '2026-10').map(item => item.value), ['2편', '1편', '4.5'])
  assert.deepEqual(notebookSummary(study.type, 'study', study.rows, '2026-10').map(item => item.value), ['2시간 45분', '3개', '1개'])
})

test('new records require meaningful values and reject reversed dates, invalid dates, negative amounts and infinity', () => {
  for (const kind of ['movie', 'finance', 'travel', 'study'] as const) {
    const { type } = fixture(kind)
    const values = notebookDefaults(type, kind, '2026-10-29')
    assert.ok(notebookError(type, kind, values), `${kind}: title is required`)
  }
  const finance = fixture('finance'), values = { ...finance.rows[0].values }
  values[roleField(finance.type, 'amount')!.fieldKey!] = -1
  assert.ok(notebookError(finance.type, 'finance', values))
  values[roleField(finance.type, 'amount')!.fieldKey!] = Infinity
  assert.ok(notebookError(finance.type, 'finance', values))
  values[roleField(finance.type, 'amount')!.fieldKey!] = 100
  values[roleField(finance.type, 'date')!.fieldKey!] = '2026-99-99'
  assert.ok(notebookError(finance.type, 'finance', values))
  const travel = fixture('travel'), reversed = { ...travel.rows[0].values }
  reversed[roleField(travel.type, 'endDate')!.fieldKey!] = '2026-01-01'
  assert.match(notebookError(travel.type, 'travel', reversed)!, /출발일/)
  const blank: CustomRecord = { ...travel.rows[0], values: notebookDefaults(travel.type, 'travel', '2026-10-29') }
  assert.equal(roleText(travel.type, blank, 'status'), '계획 중')
})

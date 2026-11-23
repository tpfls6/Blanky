import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileTabs } from '../src/constants/navigation.ts'

const ids = (list: { id: string }[]) => list.map((item) => item.id)
const menus = (...names: string[]) => names.map((id) => ({ id }))

test('the phone bar keeps schedule, memo, reading and diary; the rest go to more', () => {
  const { bar, rest } = mobileTabs(menus('schedule', 'activity', 'diary', 'reading', 'memo', 'custom', 'store', 'trash', 'settings'))
  assert.deepEqual(ids(bar), ['schedule', 'memo', 'reading', 'diary'])
  assert.deepEqual(ids(rest), ['activity', 'custom', 'store', 'trash', 'settings'])
})

test('a hidden core menu is replaced by the next menu in order', () => {
  const { bar, rest } = mobileTabs(menus('activity', 'diary', 'reading', 'custom', 'settings'))
  assert.deepEqual(ids(bar), ['reading', 'diary', 'activity', 'custom'])
  assert.deepEqual(ids(rest), ['settings'])
})

test('four menus or fewer all fit the bar', () => {
  const { bar, rest } = mobileTabs(menus('schedule', 'custom', 'settings'))
  assert.deepEqual(ids(bar), ['schedule', 'custom', 'settings'])
  assert.deepEqual(rest, [])
})

test('custom mobile tabs follow the saved order, leaving other menus in More', () => {
  const { bar, rest } = mobileTabs(menus('schedule', 'diary', 'memo', 'reading', 'settings'), ['diary', 'schedule'])
  assert.deepEqual(ids(bar), ['diary', 'schedule'])
  assert.deepEqual(ids(rest), ['memo', 'reading', 'settings'])
})

test('mobile tabs ignore duplicates and removed pages and fall back when all pins disappear', () => {
  const items = menus('schedule', 'diary', 'memo', 'reading', 'settings')
  assert.deepEqual(ids(mobileTabs(items, ['deleted', 'diary', 'diary', 'schedule']).bar), ['diary', 'schedule'])
  assert.deepEqual(ids(mobileTabs(items, ['deleted']).bar), ['schedule', 'memo', 'reading', 'diary'])
})

test('a saved home tab (removed menu) drops out of the bar', () => {
  const items = menus('schedule', 'diary', 'memo', 'reading', 'settings')
  assert.deepEqual(ids(mobileTabs(items, ['home', 'schedule', 'memo']).bar), ['schedule', 'memo'])
})

test('the bar holds at most five pinned tabs', () => {
  const items = menus('schedule', 'diary', 'memo', 'reading', 'settings', 'custom')
  assert.deepEqual(ids(mobileTabs(items, ['settings', 'custom', 'schedule', 'diary', 'memo', 'reading']).bar), ['settings', 'custom', 'schedule', 'diary', 'memo'])
})

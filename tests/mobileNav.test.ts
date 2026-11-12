import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileTabs } from '../src/constants/navigation.ts'

const ids = (list: { id: string }[]) => list.map((item) => item.id)
const menus = (...names: string[]) => names.map((id) => ({ id }))

test('the phone bar keeps home, schedule, memo, reading and diary; the rest go to more', () => {
  const { bar, rest } = mobileTabs(menus('home', 'schedule', 'activity', 'diary', 'reading', 'memo', 'custom', 'store', 'trash', 'settings'))
  assert.deepEqual(ids(bar), ['home', 'schedule', 'memo', 'reading', 'diary'])
  assert.deepEqual(ids(rest), ['activity', 'custom', 'store', 'trash', 'settings'])
})

test('a hidden core menu is replaced by the next menu in order', () => {
  const { bar, rest } = mobileTabs(menus('home', 'activity', 'diary', 'reading', 'custom', 'settings'))
  assert.deepEqual(ids(bar), ['home', 'reading', 'diary', 'activity', 'custom'])
  assert.deepEqual(ids(rest), ['settings'])
})

test('five menus or fewer all fit the bar', () => {
  const { bar, rest } = mobileTabs(menus('home', 'schedule', 'custom', 'settings'))
  assert.deepEqual(ids(bar), ['home', 'schedule', 'custom', 'settings'])
  assert.deepEqual(rest, [])
})

test('custom mobile tabs follow the saved order, leaving other menus in More', () => {
  const { bar, rest } = mobileTabs(menus('home', 'schedule', 'diary', 'memo', 'reading', 'settings'), ['diary', 'schedule'])
  assert.deepEqual(ids(bar), ['diary', 'schedule'])
  assert.deepEqual(ids(rest), ['home', 'memo', 'reading', 'settings'])
})

test('mobile tabs ignore duplicates and removed pages and fall back when all pins disappear', () => {
  const items = menus('home', 'schedule', 'diary', 'memo', 'reading', 'settings')
  assert.deepEqual(ids(mobileTabs(items, ['deleted', 'diary', 'diary', 'schedule']).bar), ['diary', 'schedule'])
  assert.deepEqual(ids(mobileTabs(items, ['deleted']).bar), ['home', 'schedule', 'memo', 'reading', 'diary'])
})

test('the bar holds at most five pinned tabs', () => {
  const items = menus('home', 'schedule', 'diary', 'memo', 'reading', 'settings')
  assert.deepEqual(ids(mobileTabs(items, ['settings', 'home', 'schedule', 'diary', 'memo', 'reading']).bar), ['settings', 'home', 'schedule', 'diary', 'memo'])
})

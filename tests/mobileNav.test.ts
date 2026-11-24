import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileTabs } from '../src/constants/navigation.ts'
import { canHide, defaultZonesPatch, menuZones, moveMenu, zonesPatch, zonesProblem } from '../src/pages/More/menuZones.ts'

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

// More › Menu layout: three zones over the existing settings (mobileBarIds + settings.nav visibility).
const nav = (...hidden: string[]) => ['schedule', 'activity', 'diary', 'reading', 'memo'].map((id) => ({ id, visible: !hidden.includes(id) }))
const pages = [{ id: 'p1', name: 'Workout', icon: 'Dumbbell' }]

test('menu zones split the bar, More and hidden menus from saved settings', () => {
  const { zones } = menuZones(nav('activity'), pages, ['memo', 'schedule'])
  assert.deepEqual(zones.bar, ['memo', 'schedule'])
  assert.deepEqual(zones.more, ['diary', 'reading', 'p1', 'custom', 'store', 'trash', 'settings'])
  assert.deepEqual(zones.hidden, ['activity'])
})

test('moving menus across zones saves the bar order and visibility, keeping the sidebar order', () => {
  const start = menuZones(nav('activity'), pages, ['memo', 'schedule']).zones
  const next = moveMenu(moveMenu(start, 'activity', 'bar', 0), 'diary', 'hidden', 0)
  assert.equal(zonesProblem(next), null)
  const patch = zonesPatch(nav('activity'), next)
  assert.deepEqual(patch.mobileBarIds, ['activity', 'memo', 'schedule'])
  assert.deepEqual(patch.nav.map((pref) => pref.id), ['schedule', 'activity', 'diary', 'reading', 'memo'])
  assert.deepEqual(patch.nav.filter((pref) => !pref.visible).map((pref) => pref.id), ['diary'])
  assert.deepEqual(menuZones(patch.nav, pages, patch.mobileBarIds).zones.hidden, ['diary'])
})

test('menu layout refuses a sixth bar tab, an empty bar and hiding pages or settings', () => {
  const zones = { bar: ['schedule', 'memo', 'reading', 'diary', 'activity'], more: ['p1', 'settings'], hidden: [] }
  assert.equal(zonesProblem(moveMenu(zones, 'p1', 'bar', 2)), 'full')
  assert.equal(zonesProblem({ bar: [], more: ['schedule'], hidden: [] }), 'empty')
  assert.equal(zonesProblem(moveMenu(zones, 'settings', 'hidden', 0)), 'locked')
  assert.equal(zonesProblem(moveMenu(zones, 'p1', 'hidden', 0)), 'locked')
  assert.equal(canHide('activity'), true)
})

test('restoring the menu layout shows every shared menu and resets the bar', () => {
  const patch = defaultZonesPatch([{ id: 'memo', visible: false }, { id: 'schedule', visible: true }, { id: 'rt1', visible: false }])
  assert.equal(patch.mobileBarIds, undefined)
  assert.deepEqual(patch.nav, [{ id: 'memo', visible: true }, { id: 'schedule', visible: true }, { id: 'rt1', visible: false }])
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveSettingsRoute, SETTINGS_MENUS, settingsPath } from './settingsNav.ts'

test('settings menus stay in the product order', () => {
  assert.deepEqual(SETTINGS_MENUS, ['general', 'account', 'ai', 'calendar', 'categories'])
})

test('legacy settings routes keep their destination without a redirect', () => {
  assert.deepEqual(resolveSettingsRoute('appearance'), { menu: 'general' })
  assert.deepEqual(resolveSettingsRoute('navigation'), { menu: 'general' })
  assert.deepEqual(resolveSettingsRoute('planning'), { menu: 'ai', tab: 'planner' })
  assert.deepEqual(resolveSettingsRoute('input'), { menu: 'ai', tab: 'input' })
  assert.deepEqual(resolveSettingsRoute('schedule'), { menu: 'calendar', tab: 'schedule' })
  assert.deepEqual(resolveSettingsRoute('google-calendar'), { menu: 'calendar', tab: 'google' })
})

test('canonical menus default inner tabs and ignore unknown tabs', () => {
  assert.deepEqual(resolveSettingsRoute('ai'), { menu: 'ai', tab: 'planner' })
  assert.deepEqual(resolveSettingsRoute('ai', 'input'), { menu: 'ai', tab: 'input' })
  assert.deepEqual(resolveSettingsRoute('ai', 'unknown'), { menu: 'ai', tab: 'planner' })
  assert.deepEqual(resolveSettingsRoute('calendar'), { menu: 'calendar', tab: 'schedule' })
  assert.deepEqual(resolveSettingsRoute('calendar', 'google'), { menu: 'calendar', tab: 'google' })
  assert.equal(resolveSettingsRoute('account').menu, 'account')
  assert.equal(resolveSettingsRoute('categories').menu, 'categories')
})

test('missing or unknown sections fall back to general', () => {
  assert.equal(resolveSettingsRoute(undefined).redirect, '/settings/general')
  assert.equal(resolveSettingsRoute('not-a-menu').redirect, '/settings/general')
  assert.equal(resolveSettingsRoute('custom-records').redirect, '/custom?panel=records')
})

test('settingsPath keeps default tabs on the canonical menu url', () => {
  assert.equal(settingsPath('ai'), '/settings/ai')
  assert.equal(settingsPath('ai', 'planner'), '/settings/ai')
  assert.equal(settingsPath('ai', 'input'), '/settings/ai?tab=input')
  assert.equal(settingsPath('calendar', 'schedule'), '/settings/calendar')
  assert.equal(settingsPath('calendar', 'google'), '/settings/calendar?tab=google')
})

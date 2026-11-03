import test from 'node:test'
import assert from 'node:assert/strict'
import { freshLibrary } from '../src/data/freshLibrary.ts'
import { DEFAULT_SETTINGS } from '../src/types/records.ts'
import { deviceTourKey, finishTour, isTourDone, PAGE_TOURS, replayHref } from '../src/features/onboarding/tourState.ts'

test('a new account starts without sample data', () => {
  const library = freshLibrary()
  for (const key of ['categories', 'items', 'captures', 'diaries', 'memos', 'books', 'logs', 'recordTypes', 'records', 'trash', 'customPages', 'pageTemplates'] as const) {
    assert.deepEqual(library[key], [], key)
  }
  assert.equal(library.settings.onboardingDone, false)
  assert.deepEqual(library.settings.onboardingPages, [])
  assert.deepEqual(library.settings.nav, DEFAULT_SETTINGS.nav)
  assert.notEqual(library.settings.nav, DEFAULT_SETTINGS.nav, 'defaults are copied, not shared')
})

test('each page guide is tracked on its own', () => {
  const fresh = { onboardingDone: false, onboardingPages: [] as string[] }
  for (const page of PAGE_TOURS) assert.equal(isTourDone(fresh, page), false, page)
  const diary = { ...fresh, ...finishTour(fresh, 'diary') }
  assert.equal(isTourDone(diary, 'diary'), true)
  assert.equal(isTourDone(diary, 'memo'), false)
  assert.equal(isTourDone(diary, 'home'), false)
  assert.equal(finishTour(diary, 'diary'), null, 'finishing twice changes nothing')
})

test('the home guide keeps the legacy flag', () => {
  assert.equal(isTourDone({ onboardingDone: true, onboardingPages: [] }, 'home'), true)
  assert.equal(isTourDone({ onboardingDone: true, onboardingPages: [] }, 'diary'), false)
  assert.deepEqual(finishTour({ onboardingDone: false, onboardingPages: [] }, 'home'), { onboardingPages: ['home'], onboardingDone: true })
  assert.deepEqual(finishTour({ onboardingDone: true, onboardingPages: [] }, 'home'), { onboardingPages: ['home'] })
  assert.equal(deviceTourKey('blanky.onboarding.u1', 'home'), 'blanky.onboarding.u1')
  assert.equal(deviceTourKey('blanky.onboarding.u1', 'store'), 'blanky.onboarding.u1.store')
})

test('replay links open the guide on its page', () => {
  assert.equal(replayHref('home'), '/?tour=1')
  assert.equal(replayHref('settings'), '/settings/general?tour=1')
  assert.equal(replayHref('reading'), '/reading?tour=1')
})

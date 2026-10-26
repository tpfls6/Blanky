import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isGoogleOriginWork } from './origin.ts'

test('Google origin is calendar_sync or an external calendar', () => {
  assert.equal(isGoogleOriginWork({ changeSource: 'calendar_sync' }), true)
  assert.equal(isGoogleOriginWork({ calendarType: 'external' }), true)
  assert.equal(isGoogleOriginWork({ changeSource: 'manual', calendarType: 'personal' }), false)
  assert.equal(isGoogleOriginWork({}), false)
})

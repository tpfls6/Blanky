import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asDateStr, asScheduleId, asTimeStr } from '../../../types/src/calendarSync.ts'
import { googleBodyFromWrite } from './googleApi.ts'
import { googleColorIdFromHex } from './googleColor.ts'

test('Blanky project swatches map to Google event colors', () => {
  assert.equal(googleColorIdFromHex('#3A62B0'), '9')
  assert.equal(googleColorIdFromHex('#3C8664'), '10')
  assert.equal(googleColorIdFromHex('#C27832'), '6')
  assert.equal(googleColorIdFromHex('#C15E80'), '4')
  assert.equal(googleColorIdFromHex('#6B5BD0'), '3')
  assert.equal(googleColorIdFromHex('#C25A54'), '11')
  assert.equal(googleColorIdFromHex('#737373'), '8')
  assert.equal(googleColorIdFromHex('3a62b0'), '9')
  assert.equal(googleColorIdFromHex(null), null)
})

test('Google write body includes colorId', () => {
  const body = googleBodyFromWrite({
    summary: '회의',
    description: '',
    when: { allDay: false, date: asDateStr('2026-10-26'), startTime: asTimeStr('10:00'), endTime: asTimeStr('11:00') },
    recurrence: { freq: 'none' },
    blankyScheduleId: asScheduleId('s-1'),
    colorId: '9',
  }, 'Asia/Seoul')
  assert.equal(body.colorId, '9')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coerceLocale, detectBrowserLocale, parseLocale } from '../src/i18n/locale.ts'
import { translate } from '../src/i18n/translate.ts'
import { formatDisplayDate, relativeDayLabel } from '../src/i18n/format.ts'

test('parseLocale accepts only ko and en', () => {
  assert.equal(parseLocale('ko'), 'ko')
  assert.equal(parseLocale('en'), 'en')
  assert.equal(parseLocale('fr'), null)
  assert.equal(parseLocale('en-US'), null)
  assert.equal(coerceLocale('fr'), 'ko')
})

test('detectBrowserLocale uses English only for en tags', () => {
  assert.equal(detectBrowserLocale('en'), 'en')
  assert.equal(detectBrowserLocale('en-US'), 'en')
  assert.equal(detectBrowserLocale('ko-KR'), 'ko')
  assert.equal(detectBrowserLocale('ja'), 'ko')
})

test('translate falls back to Korean then the last key segment', () => {
  assert.equal(translate('ko', 'nav.home'), '홈')
  assert.equal(translate('en', 'nav.home'), 'Home')
  assert.equal(translate('en', 'nav.activity'), 'Activity History')
  assert.equal(translate('ko', 'missing.totally.unknownKey'), 'unknownKey')
})

test('display dates follow the locale without changing the ISO value', () => {
  assert.equal(formatDisplayDate('ko', '2026-10-27'), '2026년 10월 27일')
  assert.equal(formatDisplayDate('en', '2026-10-27'), 'October 27, 2026')
  assert.equal(relativeDayLabel('ko', '2026-10-27', '2026-10-27'), '오늘')
  assert.equal(relativeDayLabel('en', '2026-10-28', '2026-10-27'), 'Tomorrow')
})

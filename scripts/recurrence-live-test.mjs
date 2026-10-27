import assert from 'node:assert/strict'
import { withPlannerTestUser } from './planner-test-user.mjs'
import { createScheduleRepository, mapScheduleRow } from '../packages/api/src/scheduleRepository.ts'
import { getBusyIntervals } from '../packages/scheduling/src/engine.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
await withPlannerTestUser(async ({ client, userId }) => {
  const repository = createScheduleRepository(client)
  const row = await repository.create(userId, { title: 'TEST weekday recurrence', kind: 'event', date: '2026-10-15', startTime: '09:00', endTime: '18:00', duration: 540, repeat: 'weekly', repeatDays: [1,4,7] })
  assert.deepEqual(row.repeatDays, [1,4,7])
  assert.deepEqual((await repository.listRange('2026-10-01','2026-10-31')).find(item => item.id === row.id).repeatDays,[1,4,7])
  const snapshot = await client.rpc('planner_snapshot', {})
  assert.equal(snapshot.error, null)
  const raw = snapshot.data.rows.find(item => item.id === row.id)
  assert.deepEqual(mapScheduleRow(raw).repeatDays,[1,4,7])
  const intervals = getBusyIntervals([{...row, kind: 'event', timezone: 'Asia/Seoul'}], schedulingSettings({ startDate:'2026-10-15',endDate:'2026-10-21', now:'2026-10-15T00:00:00Z' })).intervals
  for (const day of ['2026-10-15','2026-10-18','2026-10-19']) assert.ok(intervals.some(interval => interval.start === Date.parse(day+'T09:00:00+09:00')))
  const invalid = await client.from('schedules').update({repeat_days:[8]}).eq('id',row.id)
  assert.equal(invalid.error?.code,'23514')
  await withPlannerTestUser(async ({ client: foreign }) => {
    const read = await foreign.from('schedules').select('id').eq('id',row.id)
    assert.equal(read.error,null); assert.equal(read.data.length,0)
    const write = await foreign.from('schedules').update({repeat_days:[2]}).eq('id',row.id).select('id')
    assert.equal(write.error,null); assert.equal(write.data.length,0)
  })
  const changed = await repository.update(row.id,{...row,repeatDays:[2,5]})
  assert.deepEqual(changed.repeatDays,[2,5])
  const history = await repository.listChanges(row.id)
  assert.ok(history.some(change => change.afterData?.repeatDays?.join(',') === '2,5'))
  console.log(JSON.stringify({testOnly:true, authenticatedRecurrencePersistence:'passed',latestSnapshot:'passed',weeklyBusyIntervals:'passed',history:'passed',invalidWeekdaysRejected:true,foreignUserReadWriteDenied:true}))
})

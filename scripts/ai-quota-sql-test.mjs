#!/usr/bin/env node
/**
 * npm run test:ai-quota-sql
 * Applies supabase/migrations/20261109120000_ai_usage_quota.sql to a throwaway local Postgres container
 * (Supabase image, its own port, removed at the end) and checks atomicity, concurrency and privileges.
 * Never touches a linked or production project. Needs Docker running.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const IMAGE = process.env.QUOTA_TEST_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.167'
const NAME = `blanky-quota-sqltest-${process.pid}`
const MIGRATION = process.env.QUOTA_TEST_MIGRATION ?? 'supabase/migrations/20261109120000_ai_usage_quota.sql'
const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

const docker = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 1 << 24 })
  return { code: result.status, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}
const psql = (sql, { as = 'postgres', allowError = false } = {}) => {
  const result = docker(['exec', '-i', NAME, 'psql', '-U', as, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q'], sql)
  if (result.code !== 0 && !allowError) throw new Error(`psql failed: ${result.err}`)
  return result
}
const one = sql => psql(sql).out.split('\n').filter(Boolean).at(-1)
const pgbench = (script, clients, transactions) => {
  docker(['exec', '-i', NAME, 'sh', '-c', 'cat > /tmp/bench.sql'], script)
  const result = docker(['exec', NAME, 'pgbench', '-U', 'postgres', '-n', '-c', String(clients), '-j', String(Math.min(clients, 8)), '-t', String(transactions), '-f', '/tmp/bench.sql', 'postgres'])
  if (result.code !== 0) throw new Error(`pgbench failed: ${result.err || result.out}`)
  const failed = /number of failed transactions: (\d+)/.exec(result.out)?.[1]
  const processed = /number of transactions actually processed: (\d+)/.exec(result.out)?.[1]
  return { failed: Number(failed ?? 0), processed: Number(processed ?? 0) }
}

const results = []
const check = (name, run) => {
  try { run(); results.push([name, true]); console.log(`ok   ${name}`) } catch (error) { results.push([name, false]); console.log(`FAIL ${name}\n     ${error.message}`) }
}

if (docker(['info', '--format', '{{.ServerVersion}}']).code !== 0) {
  console.error('Docker is not running; SQL quota tests skipped.')
  process.exit(2)
}

try {
  execFileSync('docker', ['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=postgres', IMAGE], { stdio: 'ignore' })
  // The entrypoint runs init scripts on a temporary server, stops it, then execs the real one as PID 1.
  // Only that final server counts as ready.
  const sleep = ms => execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`])
  let ready = false
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    const logs = docker(['logs', NAME])
    ready = /PostgreSQL init process complete/.test(logs.out + logs.err) &&
      docker(['exec', NAME, 'pg_isready', '-q']).code === 0 &&
      psql("select 1 from pg_roles where rolname = 'service_role'", { allowError: true }).out === '1' &&
      psql("select 1 from pg_namespace where nspname = 'auth'", { allowError: true }).out === '1'
    if (!ready) sleep(1000)
  }
  assert.ok(ready, 'container did not become ready')
  psql(readFileSync(MIGRATION, 'utf8'))
  // Applying twice must not fail (create if not exists / or replace / drop policy if exists).
  psql(readFileSync(MIGRATION, 'utf8'))
  psql(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');`)

  const consume = (user, day, calls, tokens) => `select allowed, calls, tokens from public.consume_ai_call('${user}', '${day}', ${calls}, ${tokens});`

  check('sequential: allows exactly the call limit, then denies', () => {
    const rows = []
    for (let i = 0; i < 5; i++) rows.push(one(consume(USER_A, '2026-11-01', 3, 0)))
    assert.deepEqual(rows, ['t|1|0', 't|2|0', 't|3|0', 'f|3|0', 'f|3|0'])
  })

  check('concurrency: 32 clients x 10 calls on a fresh row never overshoot the limit of 25', () => {
    const bench = pgbench(`select * from public.consume_ai_call('${USER_A}', '2026-11-02', 25, 0);`, 32, 10)
    assert.equal(bench.failed, 0)
    assert.equal(bench.processed, 320)
    assert.equal(one(`select calls from public.ai_usage_daily where user_id = '${USER_A}' and usage_date = '2026-11-02';`), '25')
    assert.equal(one(`select count(*) from public.ai_usage_daily where user_id = '${USER_A}' and usage_date = '2026-11-02';`), '1')
  })

  check('concurrency: allowed answers equal the stored count (no phantom grants)', () => {
    psql('create table if not exists public.quota_probe (allowed boolean);')
    pgbench(`insert into public.quota_probe select allowed from public.consume_ai_call('${USER_B}', '2026-11-03', 17, 0);`, 24, 5)
    assert.equal(one('select count(*) from public.quota_probe where allowed;'), '17')
    assert.equal(one(`select calls from public.ai_usage_daily where user_id = '${USER_B}' and usage_date = '2026-11-03';`), '17')
    psql('drop table public.quota_probe;')
  })

  check('concurrency: record_ai_usage loses no updates', () => {
    one(consume(USER_A, '2026-11-04', 1, 0))
    pgbench(`select public.record_ai_usage('${USER_A}', '2026-11-04', 7, 3, 11);`, 20, 25)
    assert.equal(one(`select input_tokens || '|' || output_tokens || '|' || cost_micro_usd from public.ai_usage_daily where user_id = '${USER_A}' and usage_date = '2026-11-04';`), '3500|1500|5500')
  })

  check('token limit: denies once recorded tokens reach the limit; negatives are ignored', () => {
    assert.equal(one(consume(USER_A, '2026-11-05', 100, 1000)), 't|1|0')
    psql(`select public.record_ai_usage('${USER_A}', '2026-11-05', 600, 400, 1);`)
    psql(`select public.record_ai_usage('${USER_A}', '2026-11-05', -5000, -5000, -5000);`)
    assert.equal(one(consume(USER_A, '2026-11-05', 100, 1000)), 'f|1|1000')
  })

  check('days and users are counted apart', () => {
    assert.equal(one(consume(USER_B, '2026-11-01', 3, 0)), 't|1|0')
    assert.equal(one(consume(USER_A, '2026-11-06', 3, 0)), 't|1|0')
  })

  check('invalid arguments raise', () => {
    for (const args of [`null, '2026-11-01', 1, 0`, `'${USER_A}', null, 1, 0`, `'${USER_A}', '2026-11-01', -1, 0`, `'${USER_A}', '2026-11-01', 1, -1`]) {
      const result = psql(`select * from public.consume_ai_call(${args});`, { allowError: true })
      assert.notEqual(result.code, 0, args)
      assert.match(result.err, /invalid quota arguments/)
    }
  })

  check('privileges: anon and authenticated cannot call the RPCs or write the table', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const sql of [consume(USER_A, '2026-11-07', 99, 0), `select public.record_ai_usage('${USER_A}', '2026-11-07', 1, 1, 1);`,
        `insert into public.ai_usage_daily (user_id, usage_date) values ('${USER_A}', '2026-11-08');`,
        `update public.ai_usage_daily set calls = 0;`, `delete from public.ai_usage_daily;`]) {
        const result = psql(`set role ${role}; ${sql}`, { allowError: true })
        assert.notEqual(result.code, 0, `${role}: ${sql}`)
        assert.match(result.err, /permission denied/, `${role}: ${sql}`)
      }
    }
    assert.equal(one(`set role service_role; ${consume(USER_A, '2026-11-07', 1, 0)}`), 't|1|0')
  })

  check('RLS: an authenticated user reads only their own rows', () => {
    const as = user => `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', false); select set_config('request.jwt.claim.sub', '${user}', false);`
    const total = Number(one('select count(*) from public.ai_usage_daily;'))
    const own = Number(one(`select count(*) from public.ai_usage_daily where user_id = '${USER_B}';`))
    assert.ok(total > own && own > 0)
    assert.equal(one(`${as(USER_B)} select count(*) from public.ai_usage_daily;`), String(own))
    assert.equal(one(`${as(USER_B)} select count(*) from public.ai_usage_daily where user_id = '${USER_A}';`), '0')
    // anon has no table privilege at all.
    assert.match(psql('set role anon; select count(*) from public.ai_usage_daily;', { allowError: true }).err, /permission denied/)
  })

  check('deleting the auth user removes their usage rows', () => {
    psql(`delete from auth.users where id = '${USER_B}';`)
    assert.equal(one(`select count(*) from public.ai_usage_daily where user_id = '${USER_B}';`), '0')
  })
} catch (error) {
  results.push(['setup', false])
  console.error(`setup failed: ${error.message}`)
} finally {
  docker(['rm', '-f', NAME])
}

const failed = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { createThemeRepository } from './themeRepository.ts'
import { BUILTIN_THEMES, DEFAULT_THEME_CONFIG, normalizeThemeConfig } from '../../types/src/theme.ts'
test('theme configuration rejects CSS injection, unknown fonts and invalid enum values',()=>{
 const result=normalizeThemeConfig({colors:{background:'url(https://bad.test)',primary:'#abcdef'},typography:{bodyFont:'evil-font',headingFont:'#ffffff'},schedule:{opacity:20,borderRadius:-5,shadow:'url(https://bad.test)'},task:{checkboxStyle:'bad'}})
 assert.equal(result.colors.background,DEFAULT_THEME_CONFIG.colors.background);assert.equal(result.colors.primary,'#abcdef');assert.equal(result.typography.headingFont,'system-ui');assert.equal(result.typography.bodyFont,'system-ui');assert.equal(result.schedule.opacity,1);assert.equal(result.schedule.borderRadius,0);assert.equal(result.schedule.shadow,'none');assert.equal(result.task.checkboxStyle,'square');assert.deepEqual(normalizeThemeConfig(null),DEFAULT_THEME_CONFIG)
})
test('builtin themes have stable distinct IDs and isolated configurations',()=>{assert.equal(new Set(BUILTIN_THEMES.map(t=>t.id)).size,4);assert.ok(BUILTIN_THEMES.every(t=>t.creatorId===null&&t.pricingType==='free'));const copy=normalizeThemeConfig(BUILTIN_THEMES[0].config);copy.colors.background='#000000';assert.equal(BUILTIN_THEMES[0].config.colors.background,'#ffffff');assert.equal(BUILTIN_THEMES[3].config.colors.background,'#141414')})
test('theme save excludes privileged counters and routes install through guarded RPC',async()=>{
 let payload:Record<string,unknown>={};const calls:unknown[]=[];const row={id:BUILTIN_THEMES[0].id,creator_id:'owner',creator_name:'Creator',name:'Test',description:'',thumbnail_url:'',category:'',tags:[],visibility:'private',pricing_type:'free',price:0,theme_config:DEFAULT_THEME_CONFIG,download_count:0,rating_average:0,rating_count:0,created_at:'2026-10-07',updated_at:'2026-10-07'}
 const client={from:(table:string)=>{calls.push(table);return {upsert:(v:Record<string,unknown>)=>{payload=v;return {select:()=>({single:async()=>({data:row,error:null})})}}}},rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {error:null}}} as unknown as SupabaseClient<Database>
 const repo=createThemeRepository(client);const saved=await repo.saveTheme({...BUILTIN_THEMES[0],creatorId:'owner',downloadCount:999,ratingCount:200,price:99});assert.equal(saved.creatorId,'owner');assert.equal(payload.price,0);assert.equal('download_count' in payload,false);assert.equal('rating_count' in payload,false);assert.equal('rating_average' in payload,false);await repo.installTheme('theme-id');assert.deepEqual(calls.at(-1),['install_theme',{p_theme_id:'theme-id'}])
})

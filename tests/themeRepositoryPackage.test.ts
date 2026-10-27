import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../packages/api/src/database.generated.ts';
import { createThemeRepository } from '../packages/api/src/themeRepository.ts';
import { BUILTIN_THEMES } from '../packages/types/src/theme.ts';
import { packageFromTheme } from '../src/theme/package/ThemeLoader.ts';
test('store API preserves package manifest, config, CSS, asset descriptors and version; install uses existing RPC',async()=>{
 const p=packageFromTheme(BUILTIN_THEMES[1]);p.manifest.version='1.2.0';p.customCss='[data-theme-slot="schedule-card"] { border-radius: 20px; }';
 let payload:Record<string,unknown>={};const calls:unknown[]=[];
 const client={from:(table:string)=>({upsert:(value:Record<string,unknown>)=>{calls.push([table,value]);if(table==='user_theme_settings')return {error:null};payload=value;return {select:()=>({single:async()=>({data:{...value,download_count:0,rating_average:0,rating_count:0,created_at:'2026-10-08',updated_at:'2026-10-08'},error:null})})};}}),rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {error:null};}} as unknown as SupabaseClient<Database>;
 const r=createThemeRepository(client);const saved=await r.saveTheme({...BUILTIN_THEMES[1],creatorId:'owner',themeType:'package',package:p,packageUrl:'owner/theme/1.2.0-revision/theme.blankytheme'});
 assert.equal(payload.theme_type,'package');assert.equal(payload.format_version,1);assert.equal(payload.package_version,'1.2.0');assert.deepEqual(payload.manifest,p.manifest);assert.deepEqual(payload.theme_package,p);assert.equal(payload.custom_css,p.customCss);assert.equal(saved.package?.manifest.version,'1.2.0');assert.deepEqual(saved.config,p.config);
 await r.installTheme(saved.id);assert.deepEqual(calls.at(-1),['install_theme',{p_theme_id:saved.id}]);await r.setActiveTheme('installer',saved.id);assert.equal((calls.at(-1) as [string,Record<string,unknown>])[1].active_theme_id,saved.id);
 const reset=await r.saveTheme({...saved,themeType:'basic',package:undefined});assert.equal(payload.theme_type,'basic');assert.equal(payload.theme_package,null);assert.equal(payload.manifest,null);assert.equal(payload.custom_css,'');assert.deepEqual(payload.preview_images,[]);assert.equal(reset.package,undefined);assert.equal(reset.themeType,'basic');
});

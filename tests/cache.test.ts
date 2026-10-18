import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('live BEA cache bounds concurrency, persists, reuses fresh data and survives refresh errors',async()=>{
 const cwd=process.cwd();const temp=await mkdtemp(path.join(tmpdir(),'metrolens-cache-'));const originalFetch=globalThis.fetch;const old={key:process.env.BEA_API_KEY,mode:process.env.DATA_MODE,ttl:process.env.CACHE_TTL_HOURS};
 process.chdir(temp);process.env.BEA_API_KEY='test-placeholder';process.env.DATA_MODE='live';let calls=0,active=0,maximum=0;
 globalThis.fetch=(async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(JSON.stringify({BEAAPI:{Results:{Data:[{GeoFips:'01234',GeoName:'Example Metro',TimePeriod:'2023',DataValue:'99.5'}]}}}));}) as typeof fetch;
 try{
 const {getData}=await import('../server/bea.js');const [a,b]=await Promise.all([getData(),getData()]);assert.equal(a.mode,'live');assert.equal(a.rows.length,5);assert.deepEqual(a,b);assert.equal(calls,5);assert.ok(maximum<=2);
 const persisted=JSON.parse(await readFile(path.join(temp,'.cache/bea.json'),'utf8'));assert.equal(persisted.rows.length,5);await getData();assert.equal(calls,5,'Fresh cache avoids repeat upstream fetch');
 process.env.CACHE_TTL_HOURS='0';globalThis.fetch=(async()=>new Response('{}',{status:503})) as typeof fetch;
 const stale=await getData();assert.equal(stale.stale,true);assert.equal(stale.rows.length,5);assert.equal(stale.warnings.length,5);assert.equal(stale.fetchedAt,a.fetchedAt);
 assert.equal(JSON.parse(await readFile(path.join(temp,'.cache/bea.json'),'utf8')).stale,false,'Partial results do not overwrite the successful disk cache');
 }finally{globalThis.fetch=originalFetch;process.chdir(cwd);for(const [key,v] of Object.entries({BEA_API_KEY:old.key,DATA_MODE:old.mode,CACHE_TTL_HOURS:old.ttl})){if(v===undefined)delete process.env[key];else process.env[key]=v;}await rm(temp,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numeric,percent,ranking} from '../shared/data.js';
import {demo,fetchCategory,parseBEA} from '../server/bea.js';
import {createApp,safeCell} from '../server/app.js';
import type {AddressInfo} from 'node:net';
test('BEA parses comma-separated numbers and preserves geographic identifiers',()=>{
 const rows=parseBEA({BEAAPI:{Results:{Statistic:'RPP',UnitOfMeasure:'Index',Data:[{GeoFips:'01234',GeoName:'Example (Metropolitan statistical area)',TimePeriod:'2023',DataValue:'1,012.5'},{GeoFips:'01234',GeoName:'Example',TimePeriod:'2022',DataValue:'(D)'}]}}},'overall');
 assert.equal(rows[0].id,'01234');assert.equal(rows[0].value,1012.5);assert.equal(rows[0].name,'Example');assert.equal(rows[1].value,null);
});
test('suppressed, empty, nonfinite and malformed numeric values remain missing',()=>{for(const v of ['',null,undefined,'(NA)','(D)','--','10abc','Infinity','0','-10'])assert.equal(numeric(v),null);assert.equal(numeric(' 99.2 '),99.2);});
test('BEA error objects and invalid/empty payloads fail even on HTTP 200',()=>{for(const body of [{BEAAPI:{Error:{}}},{BEAAPI:{Results:{Error:{}}}},{BEAAPI:{Results:{Data:[]}}},{}])assert.throws(()=>parseBEA(body,'rent'));});
test('percentage comparisons use division by baseline and handle missing values',()=>{assert.ok(Math.abs(percent(80,100)!-25)<.0001);assert.ok(Math.abs(percent(100,80)!+20)<.0001);assert.equal(percent(null,100),null);assert.equal(percent(0,100),null);assert.equal(percent(100,undefined),null);});
test('rankings use same year and category, skip missing observations and sort ascending',()=>{const d=demo();const rows=ranking([...d.rows,{id:'00000',name:'Missing',year:2024,category:'rent',value:null}],2024,'rent');assert.equal(rows.length,12);assert.ok(rows.every(r=>r.year===2024&&r.category==='rent'));assert.ok(rows.every((r,i)=>i===0||r.value>=rows[i-1].value));});
test('fetch uses allowlisted BEA parameters and detects HTTP-200 API errors',async()=>{let count=0;const fake=async(input:any)=>{count++;const url=new URL(input);assert.equal(url.searchParams.get('LineCode'),'3');assert.equal(url.searchParams.get('GeoFips'),'MSA');assert.equal(url.searchParams.get('Year'),'LAST5');return new Response(JSON.stringify({BEAAPI:{Results:{Error:{APIErrorDescription:'Invalid key'}}}}));};await assert.rejects(()=>fetchCategory('rent','test-placeholder',fake as typeof fetch),/Unable to retrieve/);assert.equal(count,3);});
test('spreadsheet cells neutralize formula prefixes',()=>{for(const s of ['=IMPORTXML("x")',' +1','-1','@SUM(A1)','\tformula'])assert.ok(safeCell(s).startsWith("'"));assert.equal(safeCell('Useful feedback'),'Useful feedback');});
test('API serves demo, rejects invalid inputs, handles unavailable services and provider failure',async()=>{
 const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 const app=createApp(async()=>demo());const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{const r=await fetch(base+'/api/data');assert.equal(r.status,200);assert.equal((await r.json()).mode,'demo');
 let response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({areas:['12345'],year:2024,category:'injected',message:'Hi'})});assert.equal(response.status,400);
 response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({areas:['12345'],year:2024,category:'rent',message:'Hi'})});assert.equal(response.status,503);
 response=await fetch(base+'/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feedback:'',consent:false})});assert.equal(response.status,400);
 response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(response.status,400);
 }finally{server.close();if(old)process.env.OPENAI_API_KEY=old;}
 const failed=createApp(async()=>{throw Error('secret internal error');}).listen(0,'127.0.0.1');await new Promise<void>(r=>failed.once('listening',r));try{const r=await fetch(`http://127.0.0.1:${(failed.address() as AddressInfo).port}/api/data`);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret'));}finally{failed.close();}
});

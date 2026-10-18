import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {categories,numeric,type Category,type Dataset,type Row} from '../shared/data.js';
const codes:Record<Category,string>={overall:'1',goods:'2',rent:'3',utilities:'4',other:'5'};
export function parseBEA(body:any,category:Category):Row[]{
 const results=body?.BEAAPI?.Results;
 if(body?.BEAAPI?.Error||results?.Error||!Array.isArray(results?.Data))throw new Error('BEA returned an error or invalid data');
 const rows:Row[]=results.Data.flatMap((r:any)=>{
 const year=Number(r.TimePeriod);if(typeof r.GeoFips!=='string'||typeof r.GeoName!=='string'||!Number.isInteger(year)||year<1900||year>2200)return [];
 return [{id:r.GeoFips,name:r.GeoName.replace(/\s*\(Metropolitan statistical area\)$/i,''),year,category,value:numeric(r.DataValue)}];});
 if(!rows.length)throw new Error('BEA returned no usable records');return rows;
}
export async function fetchCategory(category:Category,key:string,fetcher:typeof fetch=fetch):Promise<Row[]>{
 const url=new URL('https://apps.bea.gov/api/data/');url.search=new URLSearchParams({UserID:key,method:'GetData',datasetname:'Regional',TableName:'MARPP',LineCode:codes[category],GeoFips:'MSA',Year:'LAST5',ResultFormat:'JSON'}).toString();
 for(let attempt=0;attempt<3;attempt++){
 try{const res=await fetcher(url,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error('BEA HTTP failure');return parseBEA(await res.json(),category);}catch{if(attempt===2)throw new Error(`Unable to retrieve BEA ${categories[category]}`);await new Promise(r=>setTimeout(r,500*2**attempt));}}
 throw new Error('BEA unavailable');
}
export function demo():Dataset{
 const metros:[string,string,number[]][]=[['35620','New York-Newark-Jersey City, NY-NJ-PA',[112.5,105.8,151.2,108.4,108.1]],['41860','San Francisco-Oakland-Berkeley, CA',[118.2,109.2,180.5,121.2,111.4]],['16980','Chicago-Naperville-Elgin, IL-IN-WI',[102.6,101.4,106.8,96.3,103.1]],['12420','Austin-Round Rock-Georgetown, TX',[98.4,97.5,111.2,90.3,94.2]],['19100','Dallas-Fort Worth-Arlington, TX',[99.1,98.4,104.8,94.2,97.3]],['19740','Denver-Aurora-Lakewood, CO',[105.6,101.2,125.8,91.4,102.3]],['31080','Los Angeles-Long Beach-Anaheim, CA',[115.3,106.3,156.7,117.2,108.4]],['12060','Atlanta-Sandy Springs-Alpharetta, GA',[98.2,99.3,99.1,94.6,97.8]],['13820','Birmingham-Hoover, AL',[90.4,96.7,75.2,98.1,89.2]],['32820','Memphis, TN-MS-AR',[89.8,95.3,76.1,89.4,91.2]],['47900','Washington-Arlington-Alexandria, DC-VA-MD-WV',[109.4,103.2,138.4,101.2,105.3]],['42660','Seattle-Tacoma-Bellevue, WA',[112.1,106.8,145.2,92.3,108.4]]];
 const rows:Row[]=[];for(const [id,name,values] of metros)for(const year of [2020,2021,2022,2023,2024])Object.keys(categories).forEach((c,i)=>rows.push({id,name,year,category:c as Category,value:Math.round((values[i]+(year-2024)*(i===2?1.4:0.3))*10)/10}));
 return {rows,mode:'demo',fetchedAt:new Date().toISOString(),stale:false,warnings:['Illustrative synthetic data. These values are not BEA observations and must not guide relocation decisions.']};
}
let memory:Dataset|undefined;let pending:Promise<Dataset>|undefined;
const file=path.resolve('.cache/bea.json');
async function load():Promise<Dataset>{
 if(process.env.DATA_MODE==='demo'||(!process.env.BEA_API_KEY&&process.env.DATA_MODE!=='live'))return demo();
 if(!process.env.BEA_API_KEY)throw new Error('BEA_API_KEY is required for live mode');
 if(!memory){try{const cached=JSON.parse(await readFile(file,'utf8'));if(cached.mode==='live'&&Array.isArray(cached.rows)&&cached.rows.length&&Number.isFinite(Date.parse(cached.fetchedAt)))memory=cached;}catch{}}
 const ttl=Number(process.env.CACHE_TTL_HOURS||24)*3600000;
 if(memory&&Date.now()-Date.parse(memory.fetchedAt)<ttl)return memory;
 const rows:Row[]=[];const warnings:string[]=[];const keys=Object.keys(categories) as Category[];
 // At most two outbound requests at a time. Keep successful categories on partial failures.
 for(let i=0;i<keys.length;i+=2){const batch=keys.slice(i,i+2);const results=await Promise.allSettled(batch.map(c=>fetchCategory(c,process.env.BEA_API_KEY!)));results.forEach((r,j)=>{if(r.status==='fulfilled')rows.push(...r.value);else{warnings.push(`${categories[batch[j]]} could not be refreshed.`);rows.push(...(memory?.rows.filter(v=>v.category===batch[j])||[]));}});}
 if(!rows.length)throw new Error('BEA is unavailable and no cache exists. Try later or explicitly enable demo mode.');
 const result:Dataset={rows,mode:'live',fetchedAt:warnings.length?(memory?.fetchedAt||new Date().toISOString()):new Date().toISOString(),stale:warnings.length>0,warnings};
 if(!warnings.length){await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(result));await rename(file+'.tmp',file);memory=result;}
 return result;
}
export function getData(){if(!pending)pending=load().finally(()=>{pending=undefined;});return pending;}

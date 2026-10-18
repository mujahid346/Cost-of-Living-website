export const categories = {overall:'All items',goods:'Goods',rent:'Rent',utilities:'Utilities',other:'Other services'} as const;
export type Category = keyof typeof categories;
export type Row = {id:string;name:string;year:number;category:Category;value:number|null};
export type Dataset = {rows:Row[];mode:'live'|'demo';fetchedAt:string;stale:boolean;warnings:string[]};
export function numeric(value:unknown):number|null {if(typeof value !== 'string' && typeof value !== 'number') return null;const s=String(value).trim().replaceAll(',','');if(!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s);return Number.isFinite(n)&&n>0?n:null;}
export function percent(a:number|null|undefined,b:number|null|undefined):number|null{return a!=null&&b!=null&&a>0?(b/a-1)*100:null;}
export function ranking(rows:Row[],year:number,category:Category){return rows.filter((r):r is Row & {value:number}=>r.year===year&&r.category===category&&r.value!==null).sort((a,b)=>a.value-b.value||a.name.localeCompare(b.name));}
export const fmt=(v:number|null|undefined)=>v==null?'—':v.toFixed(1);

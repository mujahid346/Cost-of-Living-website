import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.cache',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [label,width,height] of [['desktop',1440,1080],['mobile',390,844]] as const){
 const page=await browser.newPage({viewport:{width,height}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3001');await page.getByRole('heading',{name:'Find your place. Know the cost.'}).waitFor();
 await page.getByText('DEMO DATA · ILLUSTRATIVE ONLY').waitFor();await page.locator('.recharts-bar-rectangle').first().waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
 await page.screenshot({path:`.cache/${label}-explore.png`,fullPage:true});
 const search=page.getByRole('textbox',{name:'Search metro areas'});await search.fill('zzzz');await page.getByText('No matching areas').waitFor();await search.fill('');
 const memphis=page.getByRole('button').filter({hasText:'Memphis, TN-MS-AR'});await memphis.click();assert.equal(await memphis.getAttribute('aria-pressed'),'true');
 await page.getByRole('button').filter({hasText:'Birmingham-Hoover, AL'}).click();await page.getByText('Compare up to three areas.',{exact:false}).waitFor();assert.equal(await page.locator('.chip').count(),3);await page.getByRole('button',{name:'Dismiss notification'}).click();await memphis.click();
 await page.getByLabel('PRICE CATEGORY').selectOption('rent');await page.getByLabel('DATA YEAR').selectOption('2023');assert.ok(page.url().includes('category=rent'));assert.ok(page.url().includes('year=2023'));
 await page.getByLabel('PRICE CATEGORY').selectOption('overall');await page.getByLabel('DATA YEAR').selectOption('2024');
 await page.getByRole('button',{name:/^Compare 2$/}).click();await page.getByRole('heading',{name:'Every category, side by side'}).waitFor();
 await page.locator('table tbody tr').first().waitFor();assert.equal(await page.locator('table tbody tr').count(),5);assert.ok(page.url().includes('view=compare'));
 await page.reload();await page.getByRole('heading',{name:'Every category, side by side'}).waitFor();
 await page.screenshot({path:`.cache/${label}-compare.png`,fullPage:true});
 await page.getByRole('button',{name:'Ask MetroLens'}).click();await page.getByText('AI chat is not configured.',{exact:false}).waitFor();assert.ok(await page.getByRole('textbox',{name:'Ask about the selected data'}).isDisabled());
 await page.getByRole('button',{name:'Close assistant',exact:true}).click();await page.getByRole('button',{name:'Share feedback'}).click();await page.getByRole('dialog').waitFor();assert.ok(await page.getByRole('button',{name:'Submit feedback'}).isDisabled());await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log(`${label}: charts, search, comparison, URL restoration, assistant and feedback states passed`);await page.close();
 }}finally{await browser.close();}

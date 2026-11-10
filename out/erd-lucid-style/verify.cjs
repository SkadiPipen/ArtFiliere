const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/manga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///'+path.join(__dirname,'ArtFiliere ERD.html').replace(/\\/g,'/'));
 if(await page.locator('svg .node').count()!==74)throw Error('Missing tables in complete view');
 if(await page.locator('svg .edge').count()!==171)throw Error('Missing relationships');
 await page.screenshot({path:path.join(__dirname,'complete-preview.png')});
 await page.locator('#search').fill('payment');await page.locator('#find').click();
 if(await page.locator('#selected').innerText()!=='payment')throw Error('Table finder failed');
 await page.screenshot({path:path.join(__dirname,'payment-preview.png')});
 for(const value of await page.locator('#view option').evaluateAll(opts=>opts.map(o=>o.value))){
  await page.locator('#view').selectOption(value);
  if(await page.locator('svg .node').count()===0)throw Error('Empty view '+value);
 }
 await page.locator('#view').selectOption('cart');await page.locator('#fit').click();
 await page.screenshot({path:path.join(__dirname,'cart-preview.png')});
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('Mobile page overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Passed: 74 tables, 171 relationships, 14 working views, table finder and mobile layout.');
 await browser.close();
})();

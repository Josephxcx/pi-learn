import fs from 'node:fs';
import path from 'node:path';

export interface VisualVerification {
  status:'passed'|'failed'|'unavailable'|'skipped';
  screenshots:string[];
  errors:string[];
  checks:string[];
}
export async function verifyCompanion(htmlPath:string, previewDir:string, options:{executablePath?:string} = {}):Promise<VisualVerification> {
  const result:VisualVerification = {status:'passed',screenshots:[],errors:[],checks:[]};
  let browser;
  try {
    const {chromium}=await import('playwright');
    const executablePath = options.executablePath || process.env.PI_LEARN_BROWSER_PATH || ['/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
    browser=await chromium.launch({executablePath,headless:true,timeout:15000});
  } catch(error) {
    return {...result,status:'unavailable',errors:[`Browser checks unavailable: ${error instanceof Error?error.message:String(error)}. Install Playwright/Chromium or set PI_LEARN_BROWSER_PATH.`]};
  }
  try {
    fs.mkdirSync(previewDir,{recursive:true});
    const html=fs.readFileSync(htmlPath,'utf8');
    const context=await browser.newContext({offline:true,serviceWorkers:'block'});
    await context.route('**/*', async route=>{
      const url=route.request().url();
      if(/^(data:|blob:)/i.test(url)) return route.continue();
      result.errors.push(`External resource requested: ${url.slice(0,180)}`);
      await route.abort();
    });
    for(const width of [1200,400]) {
      const page=await context.newPage();
      await page.setViewportSize({width,height:900});
      page.setDefaultTimeout(2500);
      page.on('pageerror',error=>{result.errors.push(`${width}px script error: ${error.message}`);});
      // Fulfil a virtual document locally: relative resources now resolve to real
      // URLs and hit the blocking route, without running a server or network.
      const virtualURL = 'https://pi-learn.invalid/companion.html';
      await page.route(virtualURL, route => route.fulfill({status:200,contentType:'text/html',body:html}));
      await page.goto(virtualURL,{waitUntil:'load',timeout:10000});
      await page.evaluate(()=>document.fonts.ready);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      if(overflow) result.errors.push(`${width}px page overflow; use a responsive layout or an internal scroll region.`);
      result.checks.push(`${width}px layout checked`);
      // Capture the initial teaching state before exercising standard controls.
      const screenshot=path.join(previewDir,`${path.basename(htmlPath,'.html')}-${width}.png`);
      await page.screenshot({path:screenshot,fullPage:true,timeout:10000});
      result.screenshots.push(screenshot);
      for(const group of await page.locator('[data-pi-steps]').all()) {
        const next=group.locator('[data-pi-next]');
        if(await next.count() && await next.isEnabled()) {
          const before=await group.locator('[data-pi-step-status]').textContent();
          await next.click();
          if(before===await group.locator('[data-pi-step-status]').textContent()) result.errors.push('Step control did not update status.');
          const prev=group.locator('[data-pi-prev]');if(await prev.count() && await prev.isEnabled()) await prev.click();
        }
        result.checks.push(`${width}px step controls exercised`);
      }
      for(const group of await page.locator('[data-pi-fraction]').all()) {
        const slider=group.locator('input[type="range"]');
        if(await slider.count()) {
          await slider.fill('0');await slider.dispatchEvent('input');
          const output=group.locator('[data-pi-fraction-value]');
          if(await output.count() && !(await output.innerText()).startsWith('0/')) result.errors.push('Fraction slider did not update output.');
          result.checks.push(`${width}px fraction slider exercised`);
        }
      }
      for(const form of await page.locator('form[data-pi-quiz]').all()) {
        const input=form.locator('input[data-pi-answer]').first();
        if(await input.count()) {
          await input.check();await form.locator('button[type="submit"]').click();
          const feedback=form.locator('[data-pi-feedback]');
          if(!await feedback.isVisible() || !(await feedback.innerText()).trim()) result.errors.push('Quiz did not provide feedback on submission.');
          const hint=form.locator('[data-pi-show-hint]');
          if(await hint.count()) {await hint.click();if(!await form.locator('[data-pi-hint]').isVisible()) result.errors.push('Quiz hint did not appear.');}
          const retry=form.locator('[data-pi-retry]');
          if(await retry.count()) {await retry.click();if(await form.locator('input:checked').count()) result.errors.push('Quiz retry did not reset choices.');}
          result.checks.push(`${width}px practice quiz exercised`);
        }
      }
      await page.close();
    }
    await context.close();
  } catch(error) {
    result.errors.push(`Verification failed: ${error instanceof Error?error.message:String(error)}`);
  } finally {await browser.close();}
  result.errors=[...new Set(result.errors)];
  result.status=result.errors.length?'failed':'passed';
  return result;
}

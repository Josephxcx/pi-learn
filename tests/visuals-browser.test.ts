import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {saveCompanion} from '../extensions/visuals/companions.ts';
const executablePath = process.env.PI_LEARN_BROWSER_PATH || '/usr/bin/chromium';
const wrap = (body:string) => `<!doctype html><html><head></head><body><main>${body}</main></body></html>`;
const quiz = `<form data-pi-quiz><fieldset><legend>Select both even numbers</legend>
<label class="pi-option"><input type="checkbox" name="q" data-pi-answer="true" data-pi-explanation="Two is divisible by two.">2</label>
<label class="pi-option"><input type="checkbox" name="q" data-pi-answer="false" data-pi-explanation="Three is odd.">3</label>
<label class="pi-option"><input type="checkbox" name="q" data-pi-answer="true" data-pi-explanation="Four is divisible by two.">4</label>
<button type="submit">Check answer</button><button type="button" data-pi-retry>Retry</button><button type="button" data-pi-show-hint>Hint</button>
<p data-pi-feedback role="status" hidden></p><p data-pi-hint hidden>Divisible by two.</p></fieldset></form>`;

test('HTML practice and step controls behave offline at narrow widths', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'practice.html',title:'Practice',htmlContent:wrap(quiz + `<section data-pi-steps><div data-pi-step>First</div><div data-pi-step>Second</div><button data-pi-prev>Back</button><button data-pi-next>Next</button><p data-pi-step-status role="status"></p></section>`)});
    const page=await browser.newPage({viewport:{width:400,height:900}});
    await page.setContent(fs.readFileSync(htmlPath,'utf8'));
    await page.getByRole('checkbox',{name:'2',exact:true}).check();
    assert.equal(await page.locator('[data-pi-feedback]').isVisible(),false);
    await page.getByRole('button',{name:'Check answer'}).click();
    assert.match(await page.locator('[data-pi-feedback]').innerText(),/^Not quite/);
    await page.getByRole('checkbox',{name:'4',exact:true}).check();
    await page.getByRole('button',{name:'Check answer'}).click();
    assert.match(await page.locator('[data-pi-feedback]').innerText(),/^Correct/);
    await page.getByRole('button',{name:'Hint',exact:true}).click();
    assert.equal(await page.locator('[data-pi-hint]').isVisible(),true);
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    assert.equal(await page.locator('input:checked').count(),0);
    assert.equal(await page.locator('[data-pi-feedback]').isVisible(),false);
    await page.getByRole('button',{name:'Next',exact:true}).click();
    assert.equal(await page.locator('[data-pi-step]').nth(1).isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  } finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('verifier is available and distinguishes unavailable browser from success',async()=>{
  const mod = await import('../extensions/visuals/verify.ts').catch(()=>null);
  assert.ok(mod,'Browser verification is not implemented');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'test.html',title:'Test',htmlContent:wrap('Hello')});
    const r=await mod.verifyCompanion(htmlPath,dir,{executablePath:'/nonexistent/pi-browser'});
    assert.equal(r.status,'unavailable');assert.ok(r.errors.length);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('verification catches script failures, external resources, and overflowing layouts',async()=>{
  const {verifyCompanion}=await import('../extensions/visuals/verify.ts');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'bad.html',title:'Bad',htmlContent:wrap('<img src="https://example.com/a.png"><div style="width:1800px">Wide</div><script>throw new Error("broken control")</script>')});
    const r=await verifyCompanion(htmlPath,dir,{executablePath});
    assert.equal(r.status,'failed');
    assert.ok(r.errors.some((e:string)=>e.includes('broken control')));
    assert.ok(r.errors.some((e:string)=>e.includes('External resource')));
    assert.ok(r.errors.some((e:string)=>e.includes('overflow')));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('verification produces two screenshots for an offline companion with equations',async()=>{
  const {verifyCompanion}=await import('../extensions/visuals/verify.ts');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'math.html',title:'Math',includeMath:true,htmlContent:wrap('<div data-pi-math="display">\\frac{3}{4}</div>')});
    const r=await verifyCompanion(htmlPath,dir,{executablePath});
    assert.equal(r.status,'passed',JSON.stringify(r));
    assert.equal(r.screenshots.length,2);assert.ok(r.screenshots.every((f:string)=>fs.existsSync(f)));
    assert.deepEqual(r.screenshots.map((f:string)=>fs.readFileSync(f).readUInt32BE(16)),[1200,400]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('single-answer practice requires submission and the fraction slider updates the diagram',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const body=`<form data-pi-quiz><fieldset><legend>Which is even?</legend><label><input type="radio" name="single" data-pi-answer="false">Three</label><label><input type="radio" name="single" data-pi-answer="true" data-pi-explanation="Two is even.">Two</label><button type="submit">Check</button><p hidden data-pi-feedback role="status"></p></fieldset></form><section data-pi-fraction><svg viewBox="0 0 200 100"><rect data-pi-part width="100" height="100"/><rect data-pi-part x="100" width="100" height="100"/></svg><label>Parts<input type="range" value="1"></label><output data-pi-fraction-value></output></section>`;
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'single.html',title:'Practice',htmlContent:wrap(body)});
    const page=await browser.newPage({viewport:{width:400,height:900}});
    await page.setContent(fs.readFileSync(htmlPath,'utf8'));
    await page.getByRole('button',{name:'Check',exact:true}).click();
    assert.match(await page.locator('[data-pi-feedback]').innerText(),/Choose an answer/);
    await page.getByRole('radio',{name:'Three',exact:true}).check();
    await page.getByRole('button',{name:'Check',exact:true}).click();
    assert.match(await page.locator('[data-pi-feedback]').innerText(),/^Not quite/);
    await page.getByRole('radio',{name:'Two',exact:true}).check();
    assert.equal(await page.locator('[data-pi-feedback]').isVisible(),false);
    await page.getByRole('button',{name:'Check',exact:true}).click();
    assert.match(await page.locator('[data-pi-feedback]').innerText(),/^Correct/);
    await page.getByRole('slider').fill('2');await page.getByRole('slider').dispatchEvent('input');
    assert.equal(await page.locator('[data-pi-fraction-value]').innerText(),'2/2 = 100%');
    assert.equal(await page.locator('[data-pi-part]').nth(1).getAttribute('fill'),'var(--pi-cobalt)');
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('verification rejects relative image, script, and CSS dependencies',async()=>{
  const {verifyCompanion}=await import('../extensions/visuals/verify.ts');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-browser-test-'));
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'relative.html',title:'Relative',htmlContent:wrap('<img src="missing-diagram.png"><script src="missing-control.js"></script><div style="height:100px;background-image:url(./missing.png)">Background</div>')});
    const r=await verifyCompanion(htmlPath,dir,{executablePath});
    assert.equal(r.status,'failed');
    for(const name of ['missing-diagram.png','missing-control.js','missing.png']) assert.ok(r.errors.some((e:string)=>e.includes(name)),name);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('text accents and captions remain readable on dark insight panels',async()=>{
  const browser=await chromium.launch({executablePath,headless:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-contrast-test-'));
  try {
    const {htmlPath}=saveCompanion({assetsDir:dir,filename:'contrast.html',title:'Contrast',htmlContent:wrap('<aside class="pi-insight"><span class="pi-accent">Key term</span><p class="pi-equation">3/4</p><p class="pi-caption">Supporting explanation</p><a href="#">Explore</a></aside>')});
    const page=await browser.newPage();
    await page.setContent(fs.readFileSync(htmlPath,'utf8'));
    const ratios=await page.evaluate(()=>{
      const luminance=(rgb:string)=>{
        const channels=rgb.match(/[\d.]+/g)!.slice(0,3).map(v=>Number(v)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
        return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
      };
      const panel=document.querySelector('.pi-insight')!;
      const background=luminance(getComputedStyle(panel).backgroundColor);
      return [...panel.querySelectorAll('.pi-accent,.pi-equation,.pi-caption,a')].map(el=>{
        const foreground=luminance(getComputedStyle(el).color);
        return {selector:el.className||el.tagName,ratio:(Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05)};
      });
    });
    for(const item of ratios) assert.ok(item.ratio>=4.5,`${item.selector} contrast is ${item.ratio.toFixed(2)}:1`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(250, 247, 239)');
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('botanical companion highlights the selected tissue and explains its relevance',async()=>{
  const browser=await chromium.launch({executablePath,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:400,height:900}});
    await page.setContent(fs.readFileSync(new URL('../examples/visuals/plant-deficiencies.html',import.meta.url),'utf8'));
    const older=page.getByRole('button',{name:'Older leaves',exact:true});
    assert.equal(await older.count(),1,'The plant companion needs tissue selection controls');
    await older.click();
    assert.equal(await older.getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('[data-plant-explanation]').innerText(),/mobile nutrients/i);
    assert.equal(await page.locator('[data-tissue="older"]').getAttribute('data-active'),'true');
    const tip=page.getByRole('button',{name:'Growing tip',exact:true});
    await tip.click();
    assert.equal(await tip.getAttribute('aria-pressed'),'true');
    assert.equal(await older.getAttribute('aria-pressed'),'false');
    assert.match(await page.locator('[data-plant-explanation]').innerText(),/calcium/i);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await browser.close();}
});

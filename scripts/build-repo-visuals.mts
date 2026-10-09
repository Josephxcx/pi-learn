import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'docs/images');
await fs.mkdir(output,{recursive:true});
const plant=await fs.readFile(path.join(root,'examples/source/plant-nutrient-mobility.svg'),'utf8');
const illustration=plant.replace('<svg ', '<svg x="685" y="8" width="480" height="548" ');
await fs.writeFile(path.join(output,'pi-learn-cover.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560" viewBox="0 0 1200 560" role="img" aria-labelledby="title desc">
<title id="title">Pi-learn. Make it click.</title><desc id="desc">A personal tutor for Pi. Understand one idea, practise it, and return to what you have learned. A botanical illustration shows the growing tip, young leaves, older leaves and roots of a plant.</desc>
<rect width="1200" height="560" rx="20" fill="#eaf3f5"/>
<path d="M20 0H670Q625 140 665 280T640 560H20Q0 560 0 540V20Q0 0 20 0" fill="#123b58"/>
<g fill="#fff" font-family="Arial, Helvetica, sans-serif">
<text x="54" y="70" font-size="27" font-weight="700">π / pi-learn</text>
<text x="54" y="194" font-family="Georgia, serif" font-size="84">Make it</text>
<text x="54" y="282" font-family="Georgia, serif" font-size="84">click.</text>
<text x="57" y="338" font-size="23" fill="#d6e9f1">A personal tutor for curious minds.</text>
<text x="57" y="372" font-size="23" fill="#d6e9f1">Visual explanations. Practice. Recall.</text>
<path d="M57 422H563" stroke="#7295aa" stroke-width="1"/>
<g font-size="18"><text x="57" y="461">Understand</text><text x="266" y="461">Practise</text><text x="458" y="461">Revisit</text></g>
<path d="M181 454H235m-7-5 7 5-7 5M356 454H428m-7-5 7 5-7 5" fill="none" stroke="#a9d788" stroke-width="2"/>
<text x="57" y="514" font-size="16" fill="#bcd5e3">Built for Pi · Saved in your own notes</text>
</g>${illustration}</svg>`);
const executablePath=process.env.PI_LEARN_BROWSER_PATH || (await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined));
const browser=await chromium.launch({executablePath,headless:true});
try {
  for(const [name,selector] of [['plant-deficiencies','.plant-plate'],['fractions','.pi-hero']] as const) {
    const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1});
    await page.setContent(await fs.readFile(path.join(root,'examples/visuals',`${name}.html`),'utf8'));
    await page.evaluate(()=>document.fonts.ready);
    await page.locator(selector).screenshot({path:path.join(output,`${name}.jpg`),type:'jpeg',quality:82});
    await page.close();
  }
} finally {await browser.close();}
console.log('Updated repository cover and real lesson previews in docs/images.');

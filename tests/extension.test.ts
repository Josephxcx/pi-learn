import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'pi-extension-test-'));
const oldHome=process.env.HOME;process.env.HOME=home;
const tools=new Map<string,any>();
const commands=new Map<string,any>();
const {default:register}=await import('../extensions/md-log.ts');
register({registerTool:(tool:any)=>tools.set(tool.name,tool),registerCommand:(name:string,command:any)=>commands.set(name,command)} as any);
const ctx={hasUI:false};
const run=async(name:string,args:any)=>{
  assert.ok(tools.has(name),`${name} is not registered`);
  return tools.get(name).execute('test',args,undefined,undefined,ctx);
};
const payload=(r:any)=>JSON.parse(r.content[0].text);

test('HTML tools integrate with nested lesson notes and existing SVG logging',async()=>{
  try {
    const init=payload(await run('init_learning_session',{topic:'Fractions',goal:'Understand equal parts',customPath:'Exam/Unit/fractions.md'}));
    const design=await run('get_visual_design_guidance',{});
    assert.match(design.content[0].text, /Ground your designs in the subject matter/);
    assert.match(design.content[0].text, /scientific accuracy/i);
    const components=await run('get_visual_components',{});
    assert.match(components.content[0].text,/data-pi-quiz/);
    const save=payload(await run('save_visual_html',{filename:'fractions.html',title:'Fractions',htmlContent:'<!doctype html><html><head></head><body>Hello</body></html>',verify:false}));
    assert.equal(save.verification.status,'skipped');
    assert.equal(path.dirname(save.htmlPath),init.assetsDir);
    await run('append_lesson_node',{nodeTitle:'Equal parts',explanationMarkdown:'Three of four.',visualFilename:'fractions.html',visualTitle:'Explore fractions',diagramFilename:'parts.svg'});
    const note=fs.readFileSync(init.notePath,'utf8');
    assert.match(note,/\[Explore fractions\]\(\.\.\/assets\/fractions.html\)/);
    assert.match(note,/!\[\[assets\/parts.svg\]\]/);
    const invalid=await run('save_visual_html',{filename:'../escape.html',title:'Bad',htmlContent:'invalid',verify:false});
    assert.equal(invalid.isError,true);
    const missing=await run('append_lesson_node',{nodeTitle:'Missing',explanationMarkdown:'Missing',visualFilename:'missing.html'});
    assert.equal(missing.isError,true);
    assert.doesNotMatch(fs.readFileSync(init.notePath,'utf8'),/### 📌 Missing/);
    await run('append_lesson_node',{nodeTitle:'Static only',explanationMarkdown:'Existing flow',diagramFilename:'static.svg',activeRecallQuiz:{question:'Q',chosenAnswer:'A',isCorrect:true,keyTakeaway:'K'}});
    assert.match(fs.readFileSync(init.notePath,'utf8'),/static.svg/);
    assert.match(fs.readFileSync(init.notePath,'utf8'),/Your Answer/);
    const previousBrowser=process.env.PI_LEARN_BROWSER_PATH;
    process.env.PI_LEARN_BROWSER_PATH='/nonexistent/pi-browser';
    try {
      const unverified=payload(await run('save_visual_html',{filename:'unverified.html',title:'Unverified',htmlContent:'<!doctype html><html><head></head><body>Hello</body></html>'}));
      assert.equal(unverified.status,'saved');assert.equal(unverified.verification.status,'unavailable');
    }finally{if(previousBrowser===undefined) delete process.env.PI_LEARN_BROWSER_PATH;else process.env.PI_LEARN_BROWSER_PATH=previousBrowser;}
    await commands.get('md-log').handler('Geometry',{ui:{notify:()=>{}}});
    const switched=payload(await run('save_visual_html',{filename:'geometry.html',title:'Geometry',htmlContent:'<!doctype html><html><head></head><body>Hello</body></html>',verify:false}));
    assert.equal(switched.assetsDir,path.join(home,'Documents/Vault/Study/SAS-I/assets'));
  }finally{if(oldHome===undefined) delete process.env.HOME;else process.env.HOME=oldHome;fs.rmSync(home,{recursive:true,force:true});}
});

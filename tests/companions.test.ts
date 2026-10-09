import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const modulePath = '../extensions/visuals/companions.ts';
const doc = '<!doctype html><html><head></head><body><main>Hello</main></body></html>';

test('companion module is available', async () => {
  const mod = await import(modulePath).catch(() => null);
  assert.ok(mod, 'HTML companion saving is not implemented');
});
test('saves a standalone document with shared styles and event listeners', async () => {
  const {saveCompanion} = await import(modulePath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-visual-test-'));
  try {
    const result = saveCompanion({assetsDir:dir,filename:'fractions.html',title:'Parts & wholes',htmlContent:doc});
    const html = fs.readFileSync(result.htmlPath,'utf8');
    assert.match(html,/Parts &amp; wholes/);
    assert.match(html,/viewport/);
    assert.match(html,/addEventListener/);
    assert.match(html,/--pi-cobalt/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('rejects traversal, wrong extension, empty content, and symlink overwrite', async () => {
  const {saveCompanion} = await import(modulePath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-visual-test-'));
  try {
    for (const filename of ['../bad.html','bad.svg','nested/a.html','a\\b.html']) {
      assert.throws(()=>saveCompanion({assetsDir:dir,filename,title:'Test',htmlContent:doc}));
    }
    assert.throws(()=>saveCompanion({assetsDir:dir,filename:'a.html',title:'Test',htmlContent:'<div>fragment</div>'}));
    const target = path.join(dir,'target.txt');fs.writeFileSync(target,'keep');
    if (process.platform !== 'win32') {
    fs.symlinkSync(target,path.join(dir,'link.html'));
    assert.throws(()=>saveCompanion({assetsDir:dir,filename:'link.html',title:'Test',htmlContent:doc}));
    assert.equal(fs.readFileSync(target,'utf8'),'keep');
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('builds portable Markdown links relative to nested notes',async()=>{
  const {companionLink}=await import(modulePath);
  assert.equal(companionLink(path.resolve('vault/Exam/Unit/note.md'),path.resolve('vault/Exam/assets/a b.html'),'Parts [test]'), '[Parts \\[test\\]](../assets/a%20b.html)');
});

test('preserves SVG accessibility titles while replacing the document title',async()=>{
  const {assembleCompanion}=await import(modulePath);
  const html=assembleCompanion('<!doctype html><html><head><title>Old</title></head><body><svg><title>Diagram description</title></svg></body></html>','New');
  assert.match(html,/<svg><title>Diagram description<\/title>/);
  assert.doesNotMatch(html,/<title>Old<\/title>/);
});

test('standalone equations retain bundled KaTeX copyright and licence notices',async()=>{
  const {assembleCompanion}=await import(modulePath);
  const html=assembleCompanion(doc,'Math',true);
  assert.ok(html.includes('Copyright (c) 2013-2020 Khan Academy'));
  assert.ok(html.includes('Permission is hereby granted'));
});

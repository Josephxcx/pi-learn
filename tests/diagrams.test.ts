import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveDiagram, validateSvg } from '../extensions/learning/diagrams.ts';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" fill="white"/><text x="20" y="40" font-size="20">A clear label</text></svg>';

test('saves a local SVG and readable PNG without a shell command', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-diagram-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const result = await saveDiagram(root, 'lesson.svg', svg);
  assert.equal(await fs.readFile(result.svgPath, 'utf8'), svg);
  assert.ok(result.pngPreviewPath);
  const png = await fs.readFile(result.pngPreviewPath!);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(result.visuallyVerified, false);
  assert.equal(result.pngConversionSuccess, true);
});

test('rejects traversal, command-like and non-svg filenames', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-diagram-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  for (const filename of ['../escape.svg', 'sub/file.svg', 'a\\b.svg', '$(touch pwn).svg', 'bad.png', '.svg']) {
    await assert.rejects(saveDiagram(root, filename, svg), /filename/i);
  }
});

test('rejects malformed or active/external SVG content before saving', () => {
  for (const content of [
    '<svg><rect></svg>', '<html/>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="file:///etc/passwd"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/a.svg)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com);</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
  ]) assert.throws(() => validateSvg(content), /svg|element|attribute|external|doctype|xml/i);
});

test('supports local marker references but limits hostile dimensions and complexity', () => {
  validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><defs><marker id="arrow"><path d="M0 0 L1 1"/></marker></defs><path d="M0 0 L10 10" marker-end="url(#arrow)"/></svg>');
  assert.throws(() => validateSvg(svg.replace('400 200', '0 200')), /viewBox/);
  assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg">' + '<g/>'.repeat(5001) + '</svg>'), /complex|elements/);
});

test('uses actual SVG viewport dimensions when bounding renderer memory', () => {
  assert.deepEqual(validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="10" height="200"/>'), {width:10,height:200});
  assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1" height="1000000"/>'), /aspect/);
  assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100%"/>'), /dimension|width/);
});

test('preview generation preserves unrelated PNG files in the assets folder', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-diagram-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const existing = path.join(root, 'lesson.png');
  await fs.writeFile(existing,'An existing user asset');
  const result = await saveDiagram(root,'lesson.svg',svg);
  assert.equal(await fs.readFile(existing,'utf8'),'An existing user asset');
  assert.notEqual(result.pngPreviewPath,existing);
  assert.ok(result.pngConversionSuccess);
});

test('refuses to overwrite a different diagram or follow an asset symlink', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-diagram-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await saveDiagram(root, 'lesson.svg', svg);
  await assert.rejects(saveDiagram(root, 'lesson.svg', svg.replace('label', 'replacement')), /exists|overwrite/);
  assert.equal(await fs.readFile(path.join(root, 'lesson.svg'), 'utf8'), svg);
  if (process.platform !== 'win32') {
    await fs.symlink(path.join(root, 'lesson.svg'), path.join(root, 'linked.svg'));
    await assert.rejects(saveDiagram(root, 'linked.svg', svg), /symbolic|symlink/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAndLoadExtensions, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ExtensionContext, ExtensionCommandContext, ToolDefinition } from '@earendil-works/pi-coding-agent';

const entry = fileURLToPath(new URL('../extensions/md-log.ts', import.meta.url));
async function setup(t: import('node:test').TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-pi-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const oldVault = process.env.PI_LEARN_VAULT;
  const oldState = process.env.PI_LEARN_STATE_DIR;
  process.env.PI_LEARN_VAULT = path.join(root, 'vault');
  process.env.PI_LEARN_STATE_DIR = path.join(root, 'state');
  t.after(() => {
    if (oldVault === undefined) delete process.env.PI_LEARN_VAULT; else process.env.PI_LEARN_VAULT = oldVault;
    if (oldState === undefined) delete process.env.PI_LEARN_STATE_DIR; else process.env.PI_LEARN_STATE_DIR = oldState;
  });
  const loaded = await discoverAndLoadExtensions([entry], root, path.join(root, 'agent'));
  assert.deepEqual(loaded.errors, [], 'Pi must load the real extension entry');
  const messages: Array<{content: unknown; options: unknown}> = [];
  // The loader intentionally supplies throwing runtime stubs until Pi binds them.
  loaded.runtime.sendMessage = (message, options) => { messages.push({content:message.content,options}); };
  loaded.runtime.sendUserMessage = (content, options) => { messages.push({content,options}); };
  const extension = loaded.extensions.find(item => item.tools.has('init_learning_session'));
  assert.ok(extension);
  // Other context capabilities are intentionally absent: headless tools must not use them.
  const ctx = {cwd: root, hasUI: false, mode: 'print', sessionManager: SessionManager.inMemory(root)} as unknown as ExtensionContext;
  const call = async (name: string, params: unknown, id = `test-${name}`, context = ctx, signal?: AbortSignal) => {
    const tool = extension.tools.get(name)?.definition;
    assert.ok(tool, `Registered tool: ${name}`);
    return tool.execute(id, params as never, signal, undefined, context as Parameters<ToolDefinition['execute']>[4]);
  };
  return {root, extension, ctx, call, loaded, messages};
}

test('registers production commands, review tools and correctly shaped Pi results', async t => {
  const {extension} = await setup(t);
  for (const command of ['pi-teach', 'md-log', 'md-view', 'learn-status', 'learn-review', 'learn-recover']) {
    assert.ok(extension.commands.has(command), `Command ${command} must be registered`);
  }
  for (const tool of ['init_learning_session', 'append_lesson_node', 'save_diagram_svg', 'get_learning_status', 'get_due_reviews', 'record_review_attempt']) {
    assert.ok(extension.tools.has(tool), `Tool ${tool} must be registered`);
  }
});

test('headless tools preserve notes, return details and isolate Pi sessions', async t => {
  const {root, ctx, call} = await setup(t);
  const first = await call('init_learning_session', {topic:'Indian polity',goal:'Understand rights'});
  const detail = first.details as {notePath:string};
  assert.ok(detail.notePath.startsWith(root));
  await call('append_lesson_node', {nodeTitle:'Enforceability',nodeId:'rights',explanationMarkdown:'Rights can be enforced through courts.',revisionSummary:'Rights have constitutional remedies.'});
  const content = await fs.readFile(detail.notePath, 'utf8');
  await call('init_learning_session', {topic:'Indian polity',goal:'Resume learning'});
  assert.equal(await fs.readFile(detail.notePath, 'utf8'), content);
  const otherCtx = {...ctx, sessionManager:SessionManager.inMemory(root)};
  const empty = await call('get_learning_status', {}, 'other', otherCtx);
  assert.equal((empty.details as {active:unknown}).active, null);
  const status = await call('get_learning_status', {});
  assert.ok(status.details);
});

test('cancelled calls make no files and missing sessions report actionable errors', async t => {
  const {root, call} = await setup(t);
  await assert.rejects(call('init_learning_session', {topic:'Cancelled',goal:'None'},'cancel',undefined,AbortSignal.abort()), /abort/i);
  await assert.rejects(fs.stat(path.join(root,'vault')), {code:'ENOENT'});
  await assert.rejects(call('append_lesson_node', {nodeTitle:'Absent',explanationMarkdown:'No active note'}), /init_learning_session|active|session/i);
});

test('cancellation during a lock wait cannot append a lesson afterward', async t => {
  const {call} = await setup(t);
  const initial = await call('init_learning_session',{topic:'Cancellation',goal:'Stop safely'});
  const active = initial.details as {notePath:string;progressPath:string};
  const before = await fs.readFile(active.notePath,'utf8');
  const beforeProgress = await fs.readFile(active.progressPath,'utf8');
  const lockPath = `${active.notePath}.lock`;
  await fs.writeFile(lockPath,'A different writer holds this lock');
  let onAttempt!: () => void;
  const attempted = new Promise<void>(resolve => {onAttempt=resolve;});
  const originalOpen = fs.open;
  fs.open = async (...args:Parameters<typeof fs.open>) => {
    if(args[0]===lockPath)onAttempt();
    return originalOpen(...args);
  };
  const controller = new AbortController();
  const pending = call('append_lesson_node',{nodeTitle:'Cancelled',explanationMarkdown:'Must not persist'},'waiting',undefined,controller.signal);
  const outcome = pending.then(()=>null,error=>error);
  try {await attempted;} finally {fs.open=originalOpen;}
  controller.abort();
  await fs.unlink(lockPath);
  assert.match(String(await outcome),/abort/i);
  assert.equal(await fs.readFile(active.notePath,'utf8'),before);
  assert.equal(await fs.readFile(active.progressPath,'utf8'),beforeProgress);
  await assert.rejects(fs.stat(`${active.notePath}.pi-learn.transaction.json`),{code:'ENOENT'});
});

test('md-log initializes full note and assets state through the same storage path', async t => {
  const {extension,ctx,call} = await setup(t);
  const command = extension.commands.get('md-log');
  assert.ok(command);
  await command.handler('General English', ctx as ExtensionCommandContext);
  const status = await call('get_learning_status',{});
  const active = (status.details as {active:{notePath:string;assetsDir:string}}).active;
  assert.match(active.notePath, /general-english\.md$/);
  assert.ok(active.assetsDir);
});

test('pi-teach expands the installed skill through the actual Pi command API', async t => {
  const {extension,ctx,messages} = await setup(t);
  await extension.commands.get('pi-teach')!.handler('English grammar',ctx as ExtensionCommandContext);
  assert.deepEqual(messages,[{content:'/skill:pi-learn English grammar',options:{expandPromptTemplates:true,deliverAs:'followUp'}}]);
});

test('rejects invalid drill-down targets instead of selecting the first topic', async t => {
  const {root,call} = await setup(t);
  const source = path.join(root,'exam.json');
  await fs.writeFile(source,JSON.stringify({schemaVersion:1,examId:'demo',examTitle:'Demo',vaultRelativeDir:'demo',totalMarks:10,units:[{id:'u',unitNumber:1,title:'Unit',paper:'GS',officialMarks:10,subtopics:[{id:'s',title:'Topic',prerequisites:[],masteryStatus:'pending',cognitiveFriction:1}]}]}));
  await assert.rejects(call('drill_down_syllabus',{taxonomyPath:source,stage:'unit_detail',unitNumber:999}),/unit|999/i);
  await assert.rejects(call('drill_down_syllabus',{taxonomyPath:source,stage:'subtopic_dossier',subtopicId:'missing'}),/subtopic|missing/i);
  const result = await call('prioritize_syllabus',{taxonomyPath:source});
  assert.equal((result.details as {examId:string}).examId,'demo');
});

test('prioritization selects unit IDs and rejects ambiguous numbers across papers', async t => {
  const {root,call} = await setup(t);
  const source=path.join(root,'two-papers.json');
  await fs.writeFile(source,JSON.stringify({examId:'demo',examTitle:'Demo',vaultRelativeDir:'demo',units:[1,2].map(n=>({id:`u${n}`,unitNumber:1,title:`Unit ${n}`,paper:`Paper ${n}`,subtopics:[{id:`topic${n}`,title:`Topic ${n}`,prerequisites:[],masteryStatus:'pending'}]}))}));
  await assert.rejects(call('prioritize_syllabus',{taxonomyPath:source,unitNumber:1}),/ambiguous|exact.*unitId/i);
  const result=await call('prioritize_syllabus',{taxonomyPath:source,unitId:'u2'});
  assert.deepEqual((result.details as {topics:Array<{id:string}>}).topics.map(t=>t.id),['topic2']);
});

test('HTML companions follow Pi sessions and survive managed note regeneration', async t => {
  const {root,ctx,call,extension}=await setup(t);
  const guidance=await call('get_visual_design_guidance',{});
  assert.match(String(guidance.details),/frontend-design/);
  assert.match(String((await call('get_visual_components',{})).details),/data-pi-quiz/);
  const html='<!doctype html><html><head></head><body><main>Parts of a whole</main></body></html>';
  await assert.rejects(call('save_visual_html',{filename:'parts.html',title:'Parts',htmlContent:html,verify:false}),/active|init_learning_session/i);
  const first=(await call('init_learning_session',{topic:'Fractions',goal:'Understand parts',customPath:'Nested/fractions.md'})).details as {notePath:string;assetsDir:string};
  const saved=(await call('save_visual_html',{filename:'parts whole.html',title:'Parts [whole]',htmlContent:html,verify:false})).details as {htmlPath:string;verification:{status:string}};
  assert.equal(path.dirname(saved.htmlPath),first.assetsDir);
  assert.equal(saved.verification.status,'skipped');
  await call('append_lesson_node',{nodeId:'parts',nodeTitle:'Parts',explanationMarkdown:'A fraction compares parts with a whole.',visualFilename:'parts whole.html',visualTitle:'Parts [whole]'},'append-parts');
  const link='[Parts \\[whole\\]](fractions.assets/parts%20whole.html)';
  assert.ok((await fs.readFile(first.notePath,'utf8')).includes(link));
  await call('record_review_attempt',{nodeId:'parts',kind:'immediate',isCorrect:true},'review-parts');
  assert.ok((await fs.readFile(first.notePath,'utf8')).includes(link));
  await fs.appendFile(first.notePath,'\nMy personal annotation.\n');
  const beforeRepair=await fs.readFile(first.notePath,'utf8');
  await fs.writeFile(first.notePath,beforeRepair.replace('A fraction compares parts with a whole.','Manual change to managed text.'));
  await extension.commands.get('learn-repair')!.handler('',ctx as ExtensionCommandContext);
  const repaired=await fs.readFile(first.notePath,'utf8');
  assert.ok(repaired.includes(link));
  assert.ok(repaired.includes('My personal annotation.'));
  const otherCtx={...ctx,sessionManager:SessionManager.inMemory(root)};
  await assert.rejects(call('save_visual_html',{filename:'other.html',title:'Other',htmlContent:html,verify:false},'other',otherCtx),/active|init_learning_session/i);
  await extension.commands.get('md-log')!.handler('New topic',ctx as ExtensionCommandContext);
  await assert.rejects(call('append_lesson_node',{nodeTitle:'Wrong note',explanationMarkdown:'Missing',visualFilename:'parts whole.html'},'wrong-note'),/missing/i);
  const next=(await call('save_visual_html',{filename:'next.html',title:'Next',htmlContent:html,verify:false})).details as {htmlPath:string};
  assert.notEqual(path.dirname(next.htmlPath),first.assetsDir);
  await assert.rejects(call('save_visual_html',{filename:'cancelled.html',title:'Cancel',htmlContent:html,verify:false},'cancelled',ctx,AbortSignal.abort()),/abort/i);
  await assert.rejects(fs.stat(path.join(path.dirname(next.htmlPath),'cancelled.html')),{code:'ENOENT'});
});


test('HTML save reports unavailable verification and rejects unsafe asset paths', async t => {
  const {root,call}=await setup(t);
  const active=(await call('init_learning_session',{topic:'Visual safety',goal:'Preserve files'})).details as {assetsDir:string};
  const html='<!doctype html><html><head></head><body>Safe</body></html>';
  const oldBrowser=process.env.PI_LEARN_BROWSER_PATH;
  process.env.PI_LEARN_BROWSER_PATH=path.join(root,'missing-browser');
  try {
    const saved=(await call('save_visual_html',{filename:'saved.html',title:'Saved',htmlContent:html})).details as {htmlPath:string;status:string;verification:{status:string}};
    assert.equal(saved.status,'saved');
    assert.equal(saved.verification.status,'unavailable');
    assert.match(await fs.readFile(saved.htmlPath,'utf8'),/Safe/);
  } finally {
    if(oldBrowser===undefined)delete process.env.PI_LEARN_BROWSER_PATH;else process.env.PI_LEARN_BROWSER_PATH=oldBrowser;
  }
  await assert.rejects(call('save_visual_html',{filename:'../escape.html',title:'Escape',htmlContent:html,verify:false}),/filename/i);
  if(process.platform!=='win32') {
    const outside=path.join(root,'outside.html');
    await fs.writeFile(outside,'Keep this');
    await fs.symlink(outside,path.join(active.assetsDir,'link.html'));
    await assert.rejects(call('save_visual_html',{filename:'link.html',title:'Link',htmlContent:html,verify:false}),/symlink/i);
    await assert.rejects(call('append_lesson_node',{nodeTitle:'Link',explanationMarkdown:'Unsafe',visualFilename:'link.html'}),/symlink/i);
    assert.equal(await fs.readFile(outside,'utf8'),'Keep this');
  }
});

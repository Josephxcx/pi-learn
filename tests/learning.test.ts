import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LearningStore } from '../extensions/learning/store.ts';
import { resolveLearningConfig } from '../extensions/learning/config.ts';
import { assertSafePath, atomicWriteFile, fileHash, readOptional } from '../extensions/learning/files.ts';
import type { ReviewInput } from '../extensions/learning/store.ts';

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-learn-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let time = new Date('2026-10-08T12:00:00Z');
  const options = { vaultPath: path.join(root, 'vault'), stateDir: path.join(root, 'state'), now: () => time };
  return { root, options, store: new LearningStore(options), advance(days: number) { time = new Date(time.getTime() + days * 86400000); } };
}

test('initialization resumes existing prose without overwriting it or selecting an exam', async t => {
  const { store, options } = await fixture(t);
  const notePath = path.join(options.vaultPath, 'General', 'soil-science.md');
  await fs.mkdir(path.dirname(notePath), { recursive: true });
  const prose = '# My own soil notes\n\nLeave this exact content alone.\n';
  await fs.writeFile(notePath, prose);
  const result = await store.init('session-a', { topic: 'Soil science', goal: 'Learn' });
  assert.equal(result.resumed, true);
  assert.equal(result.examId, 'General');
  assert.equal(await fs.readFile(notePath, 'utf8'), prose);
  assert.equal(await fs.stat(path.join(options.vaultPath, '.obsidian')).catch(() => null), null);
});

test('persisted active notes, progress and adjacent assets remain isolated across sessions', async t => {
  const { store, options } = await fixture(t);
  const a = await store.init('a', { topic: 'Alpha', goal: 'Learn A' });
  const b = await store.init('b', { topic: 'Beta', goal: 'Learn B', customPath: 'Exam/Paper-II/beta.md', examProfile: { id: 'exam', post: 'Officer', gazetted: 'unknown' } });
  const reloaded = new LearningStore(options);
  await reloaded.appendNode('a', { nodeTitle: 'Alpha node', explanationMarkdown: 'A explanation', nodeId: 'alpha' }, 'call-a');
  assert.match(await fs.readFile(a.notePath, 'utf8'), /A explanation/);
  assert.doesNotMatch(await fs.readFile(b.notePath, 'utf8'), /A explanation/);
  assert.equal((await reloaded.status('b'))?.notePath, b.notePath);
  assert.equal((await reloaded.status('a'))?.progress.nodes.length, 1);
  assert.equal(path.dirname(a.assetsDir), path.dirname(a.notePath));
  assert.equal(path.dirname(b.assetsDir), path.dirname(b.notePath));
  assert.equal((await reloaded.status('b'))?.examId, 'exam');
});

test('managed updates preserve surrounding manual prose and retries do not duplicate nodes or attempts', async t => {
  const { store } = await fixture(t);
  const active = await store.init('a', { topic: 'Memory', goal: 'Remember' });
  await store.updatePlan('a', { mermaidDiagram: 'graph TD\n A --> B', planSummary: 'First plan' }, 'plan-1');
  await fs.appendFile(active.notePath, '\n## My journal\nA manual sentence.\n');
  await store.updatePlan('a', { mermaidDiagram: 'graph TD\n A --> C', planSummary: 'Second plan' }, 'plan-2');
  const node = { nodeTitle: 'Retrieval', explanationMarkdown: 'Try recalling.', nodeId: 'retrieval', revisionSummary: 'Retrieve before rereading.', mnemonic: 'R means recall.', sources: ['https://example.org/source'], activeRecallQuiz: { question: 'What first?', chosenAnswer: 'Recall', isCorrect: true, keyTakeaway: 'Recall first' } };
  await store.appendNode('a', node, 'call-1');
  await store.appendNode('a', node, 'call-1');
  await store.appendNode('a', node, 'another-call');
  const state = await store.status('a');
  assert.equal(state?.progress.nodes.length, 1);
  assert.equal(state?.progress.attempts.length, 1);
  const markdown = await fs.readFile(active.notePath, 'utf8');
  assert.match(markdown, /## My journal\nA manual sentence\./);
  assert.match(markdown, /Second plan/);
  assert.doesNotMatch(markdown, /First plan/);
  assert.match(markdown, /## Revision/);
  assert.match(markdown, /https:\/\/example.org\/source/);
});

test('review schedule separates immediate success from delayed recall and preserves mistakes', async t => {
  const { store, advance } = await fixture(t);
  await store.init('a', { topic: 'Recall', goal: 'Practice' });
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Concept', nodeId: 'a', activeRecallQuiz: { question: 'Q', chosenAnswer: 'A', isCorrect: true, keyTakeaway: 'K' } }, 'teach');
  assert.equal((await store.status('a'))?.progress.nodes[0]?.retention, 'immediate-recall');
  assert.equal((await store.dueReviews('a')).length, 0);
  await assert.rejects(store.recordReview('a', { nodeId: 'a', isCorrect: true, kind: 'delayed' }, 'too-early'), /24 hours/);
  advance(1);
  assert.equal((await store.dueReviews('a')).length, 1);
  await store.recordReview('a', { nodeId: 'a', isCorrect: true, kind: 'delayed', attemptId: 'review-1' }, 'review-call');
  await store.recordReview('a', { nodeId: 'a', isCorrect: true, kind: 'delayed', attemptId: 'review-1' }, 'review-call');
  let state = await store.status('a');
  assert.equal(state?.progress.nodes[0]?.retention, 'delayed-recall');
  assert.equal(state?.progress.nodes[0]?.nextReviewAt, '2026-10-12T12:00:00.000Z');
  advance(3);
  await store.recordReview('a', { nodeId: 'a', isCorrect: false, kind: 'delayed', chosenAnswer: 'Mistake', keyTakeaway: 'Correction' }, 'review-2');
  state = await store.status('a');
  assert.equal(state?.progress.attempts.length, 3);
  assert.equal(state?.progress.attempts.filter(a => !a.isCorrect).length, 1);
  assert.equal(state?.progress.nodes[0]?.nextReviewAt, '2026-10-13T12:00:00.000Z');
  const markdown = await fs.readFile(state!.notePath, 'utf8');
  assert.match(markdown, /## Mistakes to revisit/);
  assert.match(markdown, /Correction/);
});

test('review timestamps cannot move backward and repeated delayed recall uses the capped schedule', async t => {
  const { store, advance } = await fixture(t);
  const state = await store.init('a', { topic: 'Schedule', goal: 'Practice' });
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Concept', nodeId: 'a' });
  advance(-1);
  await assert.rejects(store.recordReview('a', { nodeId: 'a', kind: 'immediate', isCorrect: true }), /clock|timestamp/i);
  assert.equal((await store.status('a'))?.progress.attempts.length, 0);
  advance(2);
  for (const interval of [3, 7, 14, 30, 30]) {
    const result = await store.recordReview('a', { nodeId: 'a', kind: 'delayed', isCorrect: true });
    assert.equal(Date.parse(result.progress.nodes[0]!.nextReviewAt) - Date.parse(result.progress.attempts.at(-1)!.timestamp), interval * 86400000);
    advance(interval);
  }
  assert.match(await fs.readFile(state.notePath, 'utf8'), /Delayed recall/);
});

test('rejects traversal and symlinks while allowing deliberately absolute custom notes', async t => {
  const { store, root, options } = await fixture(t);
  await assert.rejects(store.init('a', { topic: 'Bad', goal: 'x', customPath: '../escape.md' }), /outside|traversal/i);
  await fs.mkdir(options.vaultPath, { recursive: true });
  const external = path.join(root, 'external');
  await fs.mkdir(external);
  await fs.symlink(external, path.join(options.vaultPath, 'linked'), 'junction');
  await assert.rejects(store.init('a', { topic: 'Bad', goal: 'x', customPath: 'linked/file.md' }), /symlink/i);
  const custom = await store.init('a', { topic: 'Fine', goal: 'x', customPath: path.join(external, 'custom.md') });
  assert.equal(custom.notePath, path.join(external, 'custom.md'));
  assert.equal(path.dirname(custom.assetsDir), external);
  await assert.rejects(store.appendNode('a', { nodeTitle: 'Bad asset', explanationMarkdown: 'x', diagramFilename: '../bad.svg' }), /filename|asset/i);
});

test('corrupt state, managed blocks and progress produce explicit errors without data loss', async t => {
  const { store, options } = await fixture(t);
  const state = await store.init('a', { topic: 'Safe', goal: 'x' });
  const noteBefore = await fs.readFile(state.notePath, 'utf8');
  await fs.writeFile(state.progressPath, '{broken');
  await assert.rejects(store.status('a'), /corrupt|invalid/i);
  assert.equal(await fs.readFile(state.notePath, 'utf8'), noteBefore);
  await assert.rejects(store.init('a', { topic: 'Safe', goal: 'x' }), /corrupt|invalid/i);
  const stateFiles = await fs.readdir(path.join(options.stateDir, 'sessions'));
  await fs.writeFile(path.join(options.stateDir, 'sessions', stateFiles[0]!), '{broken');
  await assert.rejects(store.status('a'), /corrupt|invalid/i);
});

test('concurrent sessions updating a shared note retain every node', async t => {
  const { store } = await fixture(t);
  await store.init('a', { topic: 'Shared', goal: 'x' });
  await store.init('b', { topic: 'Shared', goal: 'x' });
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.appendNode(index % 2 ? 'a' : 'b', { nodeTitle: `Node ${index}`, explanationMarkdown: `Concept ${index}`, nodeId: `node-${index}` }, `call-${index}`)));
  assert.equal((await store.status('a'))?.progress.nodes.length, 12);
});

test('legacy state requires explicit recovery and ignores stale asset paths', async t => {
  const { store, root } = await fixture(t);
  const oldNote = path.join(root, 'legacy.md');
  const legacy = path.join(root, 'learn-session.json');
  await fs.writeFile(oldNote, '# Legacy\n');
  await fs.writeFile(legacy, JSON.stringify({ notePath: oldNote, assetsDir: '/stale/assets', topic: 'Legacy', examId: 'SAS-I' }));
  assert.equal(await store.status('a'), null);
  const recovered = await store.recoverLegacy('a', legacy);
  assert.equal(recovered.notePath, oldNote);
  assert.equal(path.dirname(recovered.assetsDir), root);
  assert.equal(recovered.examId, 'SAS-I');
  assert.equal(await fs.readFile(oldNote, 'utf8'), '# Legacy\n');
});

test('configuration honors explicit paths and declines ambiguous vault discovery', async t => {
  const { root } = await fixture(t);
  const vault = path.join(root, 'explicit');
  const state = path.join(root, 'explicit-state');
  assert.deepEqual(resolveLearningConfig({ env: { PI_LEARN_VAULT: vault, PI_LEARN_STATE_DIR: state }, homeDir: root, platform: 'linux' }), { vaultPath: vault, stateDir: state });
  const configDir = path.join(root, '.config', 'obsidian');
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(path.join(root, 'one'));
  await fs.mkdir(path.join(root, 'two'));
  await fs.writeFile(path.join(configDir, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: path.join(root, 'one'), open: true }, b: { path: path.join(root, 'two') } } }));
  assert.throws(() => resolveLearningConfig({ env: {}, homeDir: root, platform: 'linux' }), /multiple|ambiguous/i);
});

test('configuration discovers Obsidian via macOS, Windows APPDATA and Linux XDG locations', async t => {
  const { root } = await fixture(t);
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  const cases: Array<{ platform: NodeJS.Platform; env: NodeJS.ProcessEnv; directory: string }> = [
    { platform: 'darwin', env: {}, directory: path.join(root, 'Library', 'Application Support', 'obsidian') },
    { platform: 'win32', env: { APPDATA: path.join(root, 'roaming') }, directory: path.join(root, 'roaming', 'obsidian') },
    { platform: 'linux', env: { XDG_CONFIG_HOME: path.join(root, 'config') }, directory: path.join(root, 'config', 'obsidian') },
  ];
  for (const entry of cases) {
    await fs.mkdir(entry.directory, { recursive: true });
    await fs.writeFile(path.join(entry.directory, 'obsidian.json'), JSON.stringify({ vaults: { one: { path: vault } } }));
    assert.equal(resolveLearningConfig({ platform: entry.platform, env: entry.env, homeDir: root }).vaultPath, vault);
  }
  assert.throws(() => resolveLearningConfig({ env: { PI_LEARN_VAULT: './relative' }, homeDir: root }), /absolute/);
  assert.equal(resolveLearningConfig({ env: { PI_LEARN_VAULT: '~/vault' }, homeDir: root }).vaultPath, vault);
});

test('storage rejects literal traversal before an absent path component', async t => {
  const { root } = await fixture(t);
  await assert.rejects(assertSafePath([root, 'absent', '..', 'elsewhere.md'].join(path.sep)), /traversal/i);
});

test('macOS system aliases remain usable without allowing user-created symlinks', { skip: process.platform !== 'darwin' }, async t => {
  const root = await fs.mkdtemp('/tmp/pi-learn-alias-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assertSafePath(path.join(root, 'note.md'));
  await atomicWriteFile(path.join(root, 'note.md'), 'Note', null);
  assert.equal(await fs.readFile(path.join(root, 'note.md'), 'utf8'), 'Note');
  await fs.symlink(path.join(root, 'note.md'), path.join(root, 'user-link.md'));
  await assert.rejects(assertSafePath(path.join(root, 'user-link.md')), /symlink/i);
});

test('colliding initial attempt IDs leave existing progress readable and unchanged', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Attempts', goal: 'Practice' });
  await store.appendNode('a', { nodeTitle: 'Existing', explanationMarkdown: 'Concept', nodeId: 'old' });
  await store.recordReview('a', { nodeId: 'old', kind: 'immediate', isCorrect: true, attemptId: 'initial:new' });
  const before = await fs.readFile(state.progressPath, 'utf8');
  await assert.rejects(store.appendNode('a', { nodeTitle: 'New', explanationMarkdown: 'New concept', nodeId: 'new', activeRecallQuiz: { question: 'Q', chosenAnswer: 'A', isCorrect: true, keyTakeaway: 'K' } }), /duplicate.*attempt/i);
  assert.equal(await fs.readFile(state.progressPath, 'utf8'), before);
  assert.equal((await store.status('a'))?.progress.nodes.length, 1);
  assert.equal(await fs.stat(`${state.notePath}.pi-learn.transaction.json`).catch(() => null), null);
});

test('non-string review kinds and invalid source strings cannot corrupt stored progress', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Validation', goal: 'Practice' });
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Concept', nodeId: 'a' });
  const before = await fs.readFile(state.progressPath, 'utf8');
  const input = { nodeId: 'a', isCorrect: true, kind: { toString: () => 'immediate' } } as unknown as ReviewInput;
  await assert.rejects(store.recordReview('a', input), /review.*kind/i);
  await assert.rejects(store.appendNode('a', { nodeTitle: 'B', explanationMarkdown: 'Concept', sources: ['bad\0source'] }), /source/i);
  assert.equal(await fs.readFile(state.progressPath, 'utf8'), before);
});

test('managed-block edits are preserved and reported before further writes', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Manual edits', goal: 'Preserve' });
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Original concept', nodeId: 'a' });
  const edited = (await fs.readFile(state.notePath, 'utf8')).replace('Original concept', 'My corrected concept');
  await fs.writeFile(state.notePath, edited);
  await assert.rejects(store.updatePlan('a', { mermaidDiagram: '', planSummary: 'A plan' }), /edited outside/i);
  assert.equal(await fs.readFile(state.notePath, 'utf8'), edited);
});

test('explicit managed repair keeps a complete backup and surrounding personal notes', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Repair', goal: 'Preserve' });
  assert.match(await fs.readFile(state.notePath, 'utf8'), /Write your own notes here; pi-learn preserves this section\./);
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Saved concept', nodeId: 'a' });
  const edited = `${(await fs.readFile(state.notePath, 'utf8')).replace('Saved concept', 'Manual concept edit')}\nPersonal trailing prose.\n`;
  await fs.writeFile(state.notePath, edited);
  const repaired = await store.recoverManaged('a');
  assert.equal(await fs.readFile(repaired.backupPath, 'utf8'), edited);
  assert.notEqual(repaired.backupPath, state.notePath);
  const restored = await fs.readFile(state.notePath, 'utf8');
  assert.match(restored, /Saved concept/);
  assert.doesNotMatch(restored, /Manual concept edit/);
  assert.match(restored, /Personal trailing prose/);
  assert.equal((await store.status('a'))?.progress.nodes.length, 1);
});

test('explicit managed repair refuses ambiguous markers and corrupt saved progress', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Bad repair', goal: 'Preserve' });
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Concept', nodeId: 'a' });
  const original = await fs.readFile(state.notePath, 'utf8');
  const ambiguous = original.replace('<!-- pi-learn:managed:end -->', '');
  await fs.writeFile(state.notePath, ambiguous);
  await assert.rejects(store.recoverManaged('a'), /markers/i);
  assert.equal(await fs.readFile(state.notePath, 'utf8'), ambiguous);
  await fs.writeFile(state.notePath, original);
  await fs.writeFile(state.progressPath, '{broken');
  await assert.rejects(store.recoverManaged('a'), /Corrupt JSON/);
  assert.equal(await fs.readFile(state.notePath, 'utf8'), original);
});

test('atomic writes reject stale expectations and preserve binary bytes', async t => {
  const { root } = await fixture(t);
  const destination = path.join(root, 'asset.bin');
  const content = Uint8Array.from([0, 128, 255, 32]);
  await atomicWriteFile(destination, content, null);
  await assert.rejects(atomicWriteFile(destination, 'replacement', null), /Concurrent edit/);
  await assert.rejects(atomicWriteFile(destination, 'replacement', fileHash('wrong')), /Concurrent edit/);
  assert.deepEqual(await fs.readFile(destination), Buffer.from(content));
  assert.deepEqual(await fs.readdir(root), ['asset.bin']);
});

test('concurrent create-only atomic writes never replace a winner', async t => {
  const { root } = await fixture(t);
  const destination = path.join(root, 'create-only.txt');
  const results = await Promise.allSettled(Array.from({ length: 16 }, (_, index) => atomicWriteFile(destination, `writer-${index}`, null)));
  const winners = results.flatMap((result, index) => result.status === 'fulfilled' ? [index] : []);
  assert.equal(winners.length, 1);
  assert.equal(await fs.readFile(destination, 'utf8'), `writer-${winners[0]}`);
});

test('interrupted note/progress transaction completes once and refuses conflicting edits', async t => {
  const { store } = await fixture(t);
  const state = await store.init('a', { topic: 'Recovery', goal: 'Preserve' });
  const noteBefore = await fs.readFile(state.notePath, 'utf8');
  const progressBefore = await fs.readFile(state.progressPath, 'utf8');
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Recovered concept', nodeId: 'a' }, 'operation');
  const noteAfter = await fs.readFile(state.notePath, 'utf8');
  const progressAfter = await fs.readFile(state.progressPath, 'utf8');
  const journal = JSON.stringify({ version: 1, noteBefore: fileHash(noteBefore), noteAfter, progressBefore: fileHash(progressBefore), progressAfter });
  const transactionPath = `${state.notePath}.pi-learn.transaction.json`;
  await fs.writeFile(state.progressPath, progressBefore);
  await fs.writeFile(transactionPath, journal);
  assert.equal((await store.status('a'))?.progress.nodes.length, 1);
  assert.equal(await fs.readFile(state.progressPath, 'utf8'), progressAfter);
  assert.equal(await fs.stat(transactionPath).catch(() => null), null);
  await store.appendNode('a', { nodeTitle: 'A', explanationMarkdown: 'Recovered concept', nodeId: 'a' }, 'operation');
  assert.equal((await store.status('a'))?.progress.nodes.length, 1);
  await fs.writeFile(transactionPath, journal);
  const edited = `${noteAfter}\nManual post-crash addition.\n`;
  await fs.writeFile(state.notePath, edited);
  await assert.rejects(store.status('a'), /conflicts with a manual edit/i);
  assert.equal(await fs.readFile(state.notePath, 'utf8'), edited);
  assert.equal(await fs.readFile(transactionPath, 'utf8'), journal);
});

test('replacement preserves a human save arriving after the optimistic hash check', async t => {
  const { root } = await fixture(t);
  for (const strategy of ['in-place', 'atomic']) {
    const target = path.join(root, `${strategy}.md`);
    await fs.writeFile(target, 'Before');
    const originalRename = fs.rename;
    let injected = false;
    fs.rename = async (source, destination) => {
      if (!injected && (source === target || destination === target)) {
        injected = true;
        if (strategy === 'in-place') await fs.writeFile(target, 'Human edit');
        else {
          const editorFile = path.join(root, 'editor.tmp');
          await fs.writeFile(editorFile, 'Human edit');
          await originalRename(editorFile, target);
        }
      }
      return originalRename(source, destination);
    };
    try {
      await assert.rejects(atomicWriteFile(target, 'Tool replacement', fileHash('Before')), /Concurrent edit/);
      assert.equal(injected, true);
      assert.equal(await fs.readFile(target, 'utf8'), 'Human edit');
    } finally { fs.rename = originalRename; }
  }
});

test('successful replacement keeps the displaced bytes as a recovery copy', async t => {
  const { root } = await fixture(t);
  const target = path.join(root, 'snapshot.md');
  await fs.writeFile(target, 'Old note');
  await atomicWriteFile(target, 'New note', fileHash('Old note'));
  assert.equal(await fs.readFile(target, 'utf8'), 'New note');
  const backups = await fs.readdir(path.join(root, '.pi-learn-backups'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(root, '.pi-learn-backups', backups[0]!), 'utf8'), 'Old note');
});

test('an editor publishing during replacement keeps its file and the displaced version', async t => {
  const { root } = await fixture(t);
  const target = path.join(root, 'mid-write.md');
  await fs.writeFile(target, 'Before');
  const originalLink = fs.link;
  let injected = false;
  fs.link = async (source, destination) => {
    if (!injected && destination === target && String(source).endsWith('.tmp')) {
      injected = true;
      await fs.writeFile(target, 'Editor wins');
    }
    return originalLink(source, destination);
  };
  try {
    await assert.rejects(atomicWriteFile(target, 'Tool replacement', fileHash('Before')), /Concurrent edit/);
    assert.equal(await fs.readFile(target, 'utf8'), 'Editor wins');
    const backups = await fs.readdir(path.join(root, '.pi-learn-backups'));
    assert.equal(await fs.readFile(path.join(root, '.pi-learn-backups', backups[0]!), 'utf8'), 'Before');
  } finally { fs.link = originalLink; }
});

test('an editor holding the old inode can still recover its later writes from the snapshot', async t => {
  const { root } = await fixture(t);
  const target = path.join(root, 'open-handle.md');
  await fs.writeFile(target, 'Before');
  const handle = await fs.open(target, 'r+');
  try {
    await atomicWriteFile(target, 'Tool replacement', fileHash('Before'));
    await handle.truncate(0);
    await handle.writeFile('Later editor text');
  } finally { await handle.close(); }
  const backups = await fs.readdir(path.join(root, '.pi-learn-backups'));
  assert.equal(await fs.readFile(path.join(root, '.pi-learn-backups', backups[0]!), 'utf8'), 'Later editor text');
});

test('a killed replacement writer restores a missing path without replacing a later editor save', async t => {
  const { root } = await fixture(t);
  for (const externalSave of [false, true]) {
    const target = path.join(root, `killed-${externalSave}.md`);
    await fs.writeFile(target, 'Displaced content');
    const dir = path.join(root, '.pi-learn-backups');
    await fs.mkdir(dir, {recursive:true});
    const backup = `${path.basename(target)}.snapshot.bak`;
    await fs.rename(target, path.join(dir, backup));
    const record = `${target}.pi-learn-replacement.json`;
    await fs.writeFile(record, JSON.stringify({pid:2147483647,backup}));
    if (externalSave) await fs.writeFile(target, 'Later editor save');
    assert.equal(await readOptional(target), externalSave ? 'Later editor save' : 'Displaced content');
    await assert.rejects(fs.stat(record),{code:'ENOENT'});
    assert.equal(await fs.readFile(path.join(dir,backup),'utf8'),'Displaced content');
  }
});

test('a diagram from another active note cannot create a broken embed', async t => {
  const { store } = await fixture(t);
  const first = await store.init('a',{topic:'First',goal:'Diagram'});
  await fs.writeFile(path.join(first.assetsDir,'only-first.svg'),'<svg/>');
  const second = await store.init('a',{topic:'Second',goal:'Diagram'});
  await assert.rejects(store.appendNode('a',{nodeTitle:'Missing',explanationMarkdown:'Text',diagramFilename:'only-first.svg'}),/diagram.*missing|not.*exist/i);
  assert.equal((await store.status('a'))?.progress.nodes.length,0);
  assert.doesNotMatch(await fs.readFile(second.notePath,'utf8'),/only-first/);
});

test('cancelling a resume before pointer publication keeps the previous active note', async t => {
  const {store,options} = await fixture(t);
  const a=await store.init('session',{topic:'Active A',goal:'Keep this active'});
  const b=await store.init('other',{topic:'Existing B',goal:'Resume later'});
  const controller=new AbortController();
  const originalMkdir=fs.mkdir;
  fs.mkdir=(async (...args:Parameters<typeof fs.mkdir>)=>{
    const result=await originalMkdir(...args);
    if(args[0]===b.assetsDir)controller.abort();
    return result;
  }) as typeof fs.mkdir;
  try {
    const cancellable=new LearningStore({...options,signal:controller.signal});
    await assert.rejects(cancellable.init('session',{topic:'Existing B',goal:'Resume later'}),/abort/i);
    assert.equal((await store.status('session'))?.notePath,a.notePath);
  } finally {fs.mkdir=originalMkdir;}
});

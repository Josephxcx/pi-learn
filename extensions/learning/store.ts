import fs from 'node:fs/promises';
import { companionLink, validateVisualFilename } from '../visuals/companions.ts';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { assertSafePath, atomicWriteFile, fileHash, isMissing, readOptional, withFileLock } from './files.ts';
import { addDays, applyReview, record, stringValue, validateExamProfile, validateLesson, validatePlan, validateProgress, validateReview } from './progress.ts';
import type { ExamProfile, LearningPlan, LearningProgress, LessonInput, LessonNode, ReviewInput } from './progress.ts';

export type { ExamProfile, LearningPlan, LearningProgress, LessonInput, LessonNode, ReviewInput } from './progress.ts';
export interface StoreOptions { vaultPath: string; stateDir: string; now?: () => Date; signal?: AbortSignal }
export interface InitInput { topic: string; goal: string; customPath?: string; examProfile?: ExamProfile }
interface SessionPointer {
  version: 1;
  sessionId: string;
  notePath: string;
  vaultPath: string;
  startedAt: string;
}
export interface LearningState {
  sessionId: string;
  notePath: string;
  assetsDir: string;
  progressPath: string;
  vaultPath: string;
  topic: string;
  examId: string;
  examProfile?: ExamProfile;
  resumed: boolean;
  progress: LearningProgress;
  duplicate?: boolean;
}
interface Journal { version: 1; noteBefore: string | null; noteAfter: string; progressBefore: string | null; progressAfter: string }
const BEGIN = '<!-- pi-learn:managed:start -->';
const END = '<!-- pi-learn:managed:end -->';

function json(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
function parseJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw); } catch { throw new Error(`Corrupt JSON in ${label}; restore or explicitly repair it before continuing.`); }
}
function optionalHash(content: string | null): string | null { return content === null ? null : fileHash(content); }
function assetsPath(notePath: string): string { return path.join(path.dirname(notePath), `${path.basename(notePath, path.extname(notePath))}.assets`); }
function progressPath(notePath: string): string { return `${notePath}.pi-learn.json`; }
function journalPath(notePath: string): string { return `${notePath}.pi-learn.transaction.json`; }
function markdownTitle(text: string): string { return text.replace(/[\r\n]+/g, ' '); }
function slug(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || `topic-${fileHash(text).slice(0, 12)}`;
}

function managedRange(note: string): { start: number; end: number; content: string } | null {
  const start = note.indexOf(BEGIN);
  const end = note.indexOf(END);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end < start || note.indexOf(BEGIN, start + BEGIN.length) !== -1 || note.indexOf(END, end + END.length) !== -1) throw new Error('Invalid managed block markers in note. Repair the block or restore a backup; no text was overwritten.');
  return { start, end: end + END.length, content: note.slice(start, end + END.length) };
}

function renderManaged(progress: LearningProgress, notePath: string): string {
  const lines = [BEGIN, '', '## Revision', ''];
  const revisionNodes = progress.nodes.filter(node => node.revisionSummary || node.mnemonic);
  if (!revisionNodes.length) lines.push('Revision summaries will appear here as concepts are taught.', '');
  for (const node of revisionNodes) {
    lines.push(`### ${markdownTitle(node.nodeTitle)}`, '', node.revisionSummary ?? '', '');
    if (node.mnemonic) lines.push('**Mnemonic**', '', node.mnemonic, '');
  }
  if (progress.plan) {
    lines.push('## Learning roadmap', '');
    if (progress.plan.mermaidDiagram.trim()) lines.push('```mermaid', progress.plan.mermaidDiagram, '```', '');
    lines.push(progress.plan.planSummary, '');
  }
  lines.push('## Lesson steps', '');
  for (const node of progress.nodes) {
    lines.push(`### ${markdownTitle(node.nodeTitle)}`, '', node.explanationMarkdown, '');
    if (node.diagramFilename) {
      const assetLink = [path.basename(assetsPath(notePath)), node.diagramFilename].map(encodeURIComponent).join('/');
      lines.push(`![Diagram for ${markdownTitle(node.nodeTitle).replace(/[\[\]]/g, '')}](./${assetLink})`, '');
    }
    if (node.visualFilename) lines.push(companionLink(notePath, path.join(assetsPath(notePath), node.visualFilename), node.visualTitle || node.nodeTitle), '');
    if (node.sources?.length) lines.push('**Sources**', '', ...node.sources.map(source => `- ${source}`), '');
    lines.push(`*Progress: ${node.retention}; next review: ${node.nextReviewAt.slice(0, 10)}. Node ID: \`${node.nodeId.replace(/`/g, '')}\`.*`, '');
  }
  lines.push('## Retrieval history', '', 'Immediate accuracy is practice evidence. Delayed recall requires a gap of at least 24 hours; the review schedule is a simple heuristic.', '');
  for (const attempt of progress.attempts) {
    const node = progress.nodes.find(item => item.nodeId === attempt.nodeId)!;
    lines.push(`### ${markdownTitle(node.nodeTitle)} — ${attempt.timestamp.slice(0, 10)}`, '', `**${attempt.kind === 'delayed' ? 'Delayed recall' : 'Immediate practice'}:** ${attempt.isCorrect ? 'Correct' : 'Needs correction'}`, '');
    if (attempt.question) lines.push(`**Question:** ${attempt.question}`, '');
    if (attempt.chosenAnswer) lines.push(`**Answer given:** ${attempt.chosenAnswer}`, '');
    if (attempt.keyTakeaway) lines.push(`**Correction / takeaway:** ${attempt.keyTakeaway}`, '');
  }
  const mistakes = progress.attempts.filter(attempt => !attempt.isCorrect);
  if (mistakes.length) {
    lines.push('## Mistakes to revisit', '');
    for (const attempt of mistakes) lines.push(`- ${attempt.timestamp.slice(0, 10)} · ${markdownTitle(progress.nodes.find(node => node.nodeId === attempt.nodeId)!.nodeTitle)}: ${attempt.keyTakeaway ?? attempt.chosenAnswer ?? 'Revisit this concept.'}`);
    lines.push('');
  }
  lines.push(END);
  return lines.join('\n');
}

/** All active pointers are keyed by the caller's Pi session ID; no module-global session state. */
export class LearningStore {
  private readonly options: StoreOptions;
  constructor(options: StoreOptions) {
    if (!path.isAbsolute(options.vaultPath) || !path.isAbsolute(options.stateDir)) throw new Error('vaultPath and stateDir must be absolute.');
    this.options = { ...options, vaultPath: path.resolve(options.vaultPath), stateDir: path.resolve(options.stateDir) };
  }
  private now(): string {
    const date = this.options.now?.() ?? new Date();
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid clock time.');
    return date.toISOString();
  }
  private sessionFile(sessionId: string): string {
    stringValue(sessionId, 'session ID');
    return path.join(this.options.stateDir, 'sessions', `${fileHash(sessionId)}.json`);
  }
  private async pointer(sessionId: string): Promise<SessionPointer | null> {
    const location = this.sessionFile(sessionId);
    const raw = await readOptional(location);
    if (raw === null) return null;
    const data = record(parseJson(raw, location), 'session state');
    if (data.version !== 1 || data.sessionId !== sessionId || typeof data.notePath !== 'string' || !path.isAbsolute(data.notePath) || path.extname(data.notePath).toLowerCase() !== '.md' || typeof data.vaultPath !== 'string' || !path.isAbsolute(data.vaultPath) || typeof data.startedAt !== 'string' || !Number.isFinite(Date.parse(data.startedAt))) throw new Error(`Invalid session state: ${location}. Restore or repair it before continuing.`);
    await assertSafePath(data.notePath);
    return data as unknown as SessionPointer;
  }
  private async requirePointer(sessionId: string): Promise<SessionPointer> {
    const pointer = await this.pointer(sessionId);
    if (!pointer) throw new Error('No learning note is active in this Pi session. Run init_learning_session first.');
    return pointer;
  }
  private state(pointer: SessionPointer, progress: LearningProgress, resumed = true): LearningState {
    return { sessionId: pointer.sessionId, notePath: pointer.notePath, assetsDir: assetsPath(pointer.notePath), progressPath: progressPath(pointer.notePath), vaultPath: pointer.vaultPath, topic: progress.topic, examId: progress.examProfile?.id || 'General', ...(progress.examProfile ? { examProfile: progress.examProfile } : {}), resumed, progress };
  }
  private async recoverTransaction(notePath: string): Promise<void> {
    const location = journalPath(notePath);
    const raw = await readOptional(location);
    if (raw === null) return;
    const data = record(parseJson(raw, location), 'pending transaction');
    if (data.version !== 1 || typeof data.noteAfter !== 'string' || typeof data.progressAfter !== 'string' || ![data.noteBefore, data.progressBefore].every(value => value === null || typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error(`Invalid pending transaction: ${location}`);
    const journal = data as unknown as Journal;
    const nextProgress = parseJson(journal.progressAfter, location);
    validateProgress(nextProgress);
    if (nextProgress.managedHash !== optionalHash(managedRange(journal.noteAfter)?.content ?? null)) throw new Error(`Invalid pending transaction managed content: ${location}`);
    const note = await readOptional(notePath);
    const progress = await readOptional(progressPath(notePath));
    const noteHash = optionalHash(note);
    const progressHash = optionalHash(progress);
    if ((noteHash !== journal.noteBefore && noteHash !== fileHash(journal.noteAfter)) || (progressHash !== journal.progressBefore && progressHash !== fileHash(journal.progressAfter))) throw new Error(`Interrupted transaction conflicts with a manual edit: ${location}. Inspect and repair or restore a backup before continuing.`);
    if (noteHash !== fileHash(journal.noteAfter)) await atomicWriteFile(notePath, journal.noteAfter, noteHash);
    if (progressHash !== fileHash(journal.progressAfter)) await atomicWriteFile(progressPath(notePath), journal.progressAfter, progressHash);
    await fs.unlink(location);
  }
  private async readProgress(notePath: string): Promise<{ progress: LearningProgress; raw: string; note: string }> {
    await this.recoverTransaction(notePath);
    const note = await readOptional(notePath);
    if (note === null) throw new Error(`Active learning note is missing: ${notePath}`);
    const raw = await readOptional(progressPath(notePath));
    if (raw === null) throw new Error(`Learning progress is missing: ${progressPath(notePath)}. Restore it or explicitly initialize a note without managed content.`);
    const progress = parseJson(raw, progressPath(notePath));
    validateProgress(progress);
    const block = managedRange(note);
    if (optionalHash(block?.content ?? null) !== progress.managedHash) throw new Error(`Managed learning content was edited outside pi-learn: ${notePath}. Run /learn-repair to back up the edited note and rebuild managed content from saved progress. Your annotations belong in the Your notes section.`);
    return { progress, raw, note };
  }
  private async commit(notePath: string, beforeNote: string | null, beforeProgress: string | null, note: string, progress: LearningProgress): Promise<void> {
    this.options.signal?.throwIfAborted();
    // Invalid proposed state must never become a pending recovery transaction.
    validateProgress(progress);
    const journal: Journal = { version: 1, noteBefore: optionalHash(beforeNote), noteAfter: note, progressBefore: optionalHash(beforeProgress), progressAfter: json(progress) };
    await atomicWriteFile(journalPath(notePath), json(journal), null);
    await this.recoverTransaction(notePath);
  }
  async init(sessionId: string, input: InitInput): Promise<LearningState> {
    stringValue(input.topic, 'topic');
    stringValue(input.goal, 'goal', true);
    if (input.examProfile !== undefined) validateExamProfile(input.examProfile);
    let notePath: string;
    if (input.customPath !== undefined) {
      stringValue(input.customPath, 'custom path');
      if (input.customPath.split(/[\\/]/).includes('..')) throw new Error('Path traversal is not allowed in a custom path.');
      if (process.platform !== 'win32' && input.customPath.includes('\\')) throw new Error('Use native path separators in a custom path.');
      notePath = path.resolve(this.options.vaultPath, input.customPath);
      if (!path.isAbsolute(input.customPath) && (path.relative(this.options.vaultPath, notePath).startsWith(`..${path.sep}`) || path.relative(this.options.vaultPath, notePath) === '..')) throw new Error('Relative note path is outside the vault.');
    } else {
      notePath = path.join(this.options.vaultPath, input.examProfile?.id ? slug(input.examProfile.id) : 'General', `${slug(input.topic)}.md`);
    }
    if (path.extname(notePath).toLowerCase() !== '.md') throw new Error('Custom learning note must have a .md extension.');
    await assertSafePath(notePath);
    return withFileLock(this.sessionFile(sessionId), async () => {
      await this.pointer(sessionId); // Never silently replace a corrupt session pointer.
      return withFileLock(notePath, async () => {
        await this.recoverTransaction(notePath);
        const existingNote = await readOptional(notePath);
        const existingProgress = await readOptional(progressPath(notePath));
        let progress: LearningProgress;
        if (existingProgress !== null) {
          progress = (await this.readProgress(notePath)).progress;
          if (!input.customPath && progress.topic.normalize('NFKC').toLowerCase() !== input.topic.normalize('NFKC').toLowerCase()) throw new Error('This generated filename already belongs to another topic. Supply a distinct customPath.');
          if (input.examProfile?.id && progress.examProfile?.id !== input.examProfile.id) throw new Error('This note has a different exam profile. Choose a distinct customPath.');
        } else {
          if (existingNote !== null && managedRange(existingNote)) throw new Error('Managed note content exists but its structured progress is missing. Restore the progress file before resuming.');
          const timestamp = this.now();
          progress = { version: 1, topic: input.topic, goal: input.goal, ...(input.examProfile ? { examProfile: { ...input.examProfile } } : {}), createdAt: timestamp, updatedAt: timestamp, revision: 0, managedHash: null, nodes: [], attempts: [], operationIds: [] };
          const header = ['---', `title: ${JSON.stringify(input.topic)}`, `goal: ${JSON.stringify(input.goal)}`, `date: ${timestamp.slice(0, 10)}`, `exam: ${JSON.stringify(input.examProfile?.id ?? 'General')}`, 'tags: [learning, pi-learn]', '---', '', `# ${markdownTitle(input.topic)}`, '', `> **Goal:** ${input.goal.replace(/\n/g, '\n> ')}`, '', '## Your notes', '', 'Write your own notes here; pi-learn preserves this section.', '', ''].join('\n');
          await this.commit(notePath, existingNote, null, existingNote ?? header, progress);
        }
        const assetsDir = assetsPath(notePath);
        await assertSafePath(assetsDir);
        await fs.mkdir(assetsDir, { recursive: true });
        const pointer: SessionPointer = { version: 1, sessionId, notePath, vaultPath: this.options.vaultPath, startedAt: this.now() };
        const oldPointer = await readOptional(this.sessionFile(sessionId));
        // A newly committed note finishes linking even if cancellation arrives
        // afterward. A pure resume has not started a write transaction yet.
        if (existingProgress !== null) this.options.signal?.throwIfAborted();
        await atomicWriteFile(this.sessionFile(sessionId), json(pointer), optionalHash(oldPointer));
        return this.state(pointer, progress, existingNote !== null);
      }, this.options.signal);
    }, this.options.signal);
  }
  async status(sessionId: string): Promise<LearningState | null> {
    const pointer = await this.pointer(sessionId);
    if (!pointer) return null;
    return withFileLock(pointer.notePath, async () => this.state(pointer, (await this.readProgress(pointer.notePath)).progress), this.options.signal);
  }
  /** Explicit recovery only: preserve a complete copy before rebuilding a known managed range. */
  async recoverManaged(sessionId: string): Promise<LearningState & { backupPath: string }> {
    const pointer = await this.requirePointer(sessionId);
    return withFileLock(pointer.notePath, async () => {
      await this.recoverTransaction(pointer.notePath);
      const note = await readOptional(pointer.notePath);
      const raw = await readOptional(progressPath(pointer.notePath));
      if (note === null || raw === null) throw new Error('Both the note and its saved progress are required for managed repair.');
      const progress = parseJson(raw, progressPath(pointer.notePath));
      validateProgress(progress);
      const range = managedRange(note);
      if (!range && progress.managedHash !== null) throw new Error('Managed block markers are missing. Restore their boundaries before repairing; no text was overwritten.');
      const backupPath = `${pointer.notePath.slice(0, -3)}.backup-${this.now().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.md`;
      await atomicWriteFile(backupPath, note, null);
      const block = renderManaged(progress, pointer.notePath);
      progress.managedHash = fileHash(block);
      progress.updatedAt = this.now();
      progress.revision++;
      const repaired = range ? `${note.slice(0, range.start)}${block}${note.slice(range.end)}` : `${note}\n${block}\n`;
      await this.commit(pointer.notePath, note, raw, repaired, progress);
      return {...this.state(pointer, progress), backupPath};
    }, this.options.signal);
  }
  private async mutate(sessionId: string, operationId: string | undefined, change: (progress: LearningProgress, pointer: SessionPointer) => Promise<boolean> | boolean): Promise<LearningState> {
    if (operationId !== undefined) stringValue(operationId, 'operation ID');
    const pointer = await this.requirePointer(sessionId);
    return withFileLock(pointer.notePath, async () => {
      const { progress, raw, note } = await this.readProgress(pointer.notePath);
      if (operationId && progress.operationIds.includes(operationId)) return { ...this.state(pointer, progress), duplicate: true };
      const changed = await change(progress, pointer);
      if (!changed) return { ...this.state(pointer, progress), duplicate: true };
      if (operationId) progress.operationIds.push(operationId);
      progress.updatedAt = this.now();
      progress.revision++;
      const block = renderManaged(progress, pointer.notePath);
      progress.managedHash = fileHash(block);
      const range = managedRange(note);
      const nextNote = range ? `${note.slice(0, range.start)}${block}${note.slice(range.end)}` : `${note}${note.endsWith('\n') ? '\n' : '\n\n'}${block}\n`;
      await this.commit(pointer.notePath, note, raw, nextNote, progress);
      return this.state(pointer, progress);
    }, this.options.signal);
  }
  async updatePlan(sessionId: string, input: LearningPlan, operationId?: string): Promise<LearningState> {
    validatePlan(input);
    return this.mutate(sessionId, operationId, progress => { progress.plan = { ...input }; return true; });
  }
  async appendNode(sessionId: string, input: LessonInput, operationId?: string): Promise<LearningState> {
    validateLesson(input);
    if (input.visualFilename !== undefined) validateVisualFilename(input.visualFilename);
    if (input.diagramFilename && (path.basename(input.diagramFilename) !== input.diagramFilename || /[\\/\[\]\r\n]/.test(input.diagramFilename) || !/\.(svg|png|webp|jpe?g)$/i.test(input.diagramFilename))) throw new Error('Diagram filename must be a single asset filename with an image extension.');
    return this.mutate(sessionId, operationId, async (progress, pointer) => {
      const nodeId = input.nodeId ?? operationId ?? randomUUID();
      if (progress.nodes.some(node => node.nodeId === nodeId)) return false;
      if (input.diagramFilename) {
        const diagramPath = path.join(assetsPath(pointer.notePath), input.diagramFilename);
        await assertSafePath(diagramPath);
        try {
          if (!(await fs.stat(diagramPath)).isFile()) throw new Error('Diagram is not a file.');
        } catch (error) {
          if (isMissing(error)) throw new Error(`Diagram is missing from this note: ${input.diagramFilename}. Save it for the active note before embedding.`);
          throw error;
        }
      }
      if (input.visualFilename) {
        const visualPath = path.join(assetsPath(pointer.notePath), input.visualFilename);
        await assertSafePath(visualPath);
        try {
          if (!(await fs.stat(visualPath)).isFile()) throw new Error('Visual companion is not a file.');
        } catch (error) {
          if (isMissing(error)) throw new Error(`Visual companion is missing from this note: ${input.visualFilename}. Save it for the active note before linking.`);
          throw error;
        }
      }
      const timestamp = this.now();
      const node: LessonNode = { ...input, nodeId, taughtAt: timestamp, retention: 'taught', delayedSuccesses: 0, nextReviewAt: addDays(timestamp, 1) };
      progress.nodes.push(node);
      if (input.activeRecallQuiz) applyReview(progress, { nodeId, ...input.activeRecallQuiz, kind: 'immediate' }, `initial:${nodeId}`, timestamp);
      return true;
    });
  }
  async recordReview(sessionId: string, input: ReviewInput, operationId?: string): Promise<LearningState> {
    validateReview(input);
    return this.mutate(sessionId, operationId, progress => {
      const attemptId = input.attemptId ?? operationId ?? randomUUID();
      if (progress.attempts.some(attempt => attempt.attemptId === attemptId)) return false;
      applyReview(progress, input, attemptId, this.now());
      return true;
    });
  }
  async dueReviews(sessionId: string, at: Date = new Date(this.now())): Promise<LessonNode[]> {
    if (!Number.isFinite(at.getTime())) throw new Error('Invalid review date.');
    const state = await this.status(sessionId);
    if (!state) return [];
    return state.progress.nodes.filter(node => Date.parse(node.nextReviewAt) <= at.getTime()).sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
  }
  async recoverLegacy(sessionId: string, legacyFile = path.join(os.homedir(), '.pi', 'agent', 'learn-session.json')): Promise<LearningState> {
    const raw = await readOptional(legacyFile);
    if (raw === null) throw new Error(`Legacy session file does not exist: ${legacyFile}`);
    const legacy = record(parseJson(raw, legacyFile), 'legacy session');
    if (typeof legacy.notePath !== 'string' || !path.isAbsolute(legacy.notePath)) throw new Error('Invalid legacy note path.');
    await assertSafePath(legacy.notePath);
    try { await fs.access(legacy.notePath); } catch (error) { if (isMissing(error)) throw new Error(`Legacy note is missing: ${legacy.notePath}`); throw error; }
    return this.init(sessionId, { topic: typeof legacy.topic === 'string' && legacy.topic.trim() ? legacy.topic : path.basename(legacy.notePath, '.md'), goal: '', customPath: legacy.notePath, ...(typeof legacy.examId === 'string' && legacy.examId.trim() ? { examProfile: { id: legacy.examId } } : {}) });
  }
}

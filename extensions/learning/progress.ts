export interface ExamProfile {
  id?: string;
  post?: string;
  authority?: string;
  group?: string;
  gazetted?: boolean | 'unknown';
  recruitmentRoute?: string;
  syllabusVersion?: string;
  paper?: string;
  difficultyGuidance?: string;
}

export interface RecallQuiz { question: string; chosenAnswer: string; isCorrect: boolean; keyTakeaway: string }
export interface LessonInput {
  nodeTitle: string;
  explanationMarkdown: string;
  diagramFilename?: string;
  activeRecallQuiz?: RecallQuiz;
  nodeId?: string;
  revisionSummary?: string;
  mnemonic?: string;
  sources?: string[];
}
export interface ReviewInput {
  nodeId: string;
  question?: string;
  chosenAnswer?: string;
  isCorrect: boolean;
  keyTakeaway?: string;
  kind: 'immediate' | 'delayed';
  attemptId?: string;
}
export interface ReviewAttempt extends ReviewInput { attemptId: string; timestamp: string }
export interface LessonNode extends LessonInput {
  nodeId: string;
  taughtAt: string;
  retention: 'taught' | 'immediate-recall' | 'delayed-recall' | 'needs-review';
  delayedSuccesses: number;
  nextReviewAt: string;
}
export interface LearningPlan { mermaidDiagram: string; planSummary: string }
export interface LearningProgress {
  version: 1;
  topic: string;
  goal: string;
  examProfile?: ExamProfile;
  createdAt: string;
  updatedAt: string;
  revision: number;
  managedHash: string | null;
  plan?: LearningPlan;
  nodes: LessonNode[];
  attempts: ReviewAttempt[];
  operationIds: string[];
}

export const DAY_MS = 86_400_000;
const DELAYED_INTERVALS = [3, 7, 14, 30] as const;

export function addDays(iso: string, days: number): string { return new Date(Date.parse(iso) + days * DAY_MS).toISOString(); }

/** Transparent practice heuristic; immediate accuracy is never labeled long-term mastery. */
export function applyReview(progress: LearningProgress, input: ReviewInput, attemptId: string, timestamp: string): void {
  const node = progress.nodes.find(item => item.nodeId === input.nodeId);
  if (!node) throw new Error(`Unknown lesson node: ${input.nodeId}`);
  const previous = progress.attempts.filter(item => item.nodeId === node.nodeId).at(-1);
  const elapsed = Date.parse(timestamp) - Date.parse(previous?.timestamp ?? node.taughtAt);
  if (elapsed < 0) throw new Error('Review timestamp precedes teaching or the latest attempt. Check the system clock before retrying.');
  if (input.kind === 'delayed' && elapsed < DAY_MS) {
    throw new Error('Delayed recall requires at least 24 hours since teaching or the latest attempt. Record an immediate attempt instead.');
  }
  progress.attempts.push({ ...input, attemptId, timestamp });
  if (!input.isCorrect) {
    node.retention = 'needs-review';
    node.delayedSuccesses = 0;
    node.nextReviewAt = addDays(timestamp, 1);
  } else if (input.kind === 'delayed') {
    node.delayedSuccesses++;
    node.retention = 'delayed-recall';
    node.nextReviewAt = addDays(timestamp, DELAYED_INTERVALS[Math.min(node.delayedSuccesses - 1, DELAYED_INTERVALS.length - 1)]!);
  } else {
    if (node.retention !== 'delayed-recall') node.retention = 'immediate-recall';
    node.nextReviewAt = addDays(timestamp, 1);
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}: expected an object.`);
  return value as Record<string, unknown>;
}
export function stringValue(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.includes('\0')) throw new Error(`Invalid ${label}: expected ${allowEmpty ? 'a' : 'a nonempty'} string.`);
  if (value.includes('<!-- pi-learn:')) throw new Error(`Invalid ${label}: reserved pi-learn managed marker.`);
}
function optionalString(value: unknown, label: string): void { if (value !== undefined) stringValue(value, label, true); }
function timestampValue(value: unknown, label: string): void {
  stringValue(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}: expected a timestamp.`);
}
export function validateExamProfile(value: unknown): asserts value is ExamProfile {
  const profile = record(value, 'exam profile');
  for (const key of ['id', 'post', 'authority', 'group', 'recruitmentRoute', 'syllabusVersion', 'paper', 'difficultyGuidance']) optionalString(profile[key], `exam profile ${key}`);
  if (profile.gazetted !== undefined && typeof profile.gazetted !== 'boolean' && profile.gazetted !== 'unknown') throw new Error('Invalid exam profile gazetted: use true, false or unknown.');
}
export function validatePlan(value: unknown): asserts value is LearningPlan {
  const plan = record(value, 'plan');
  stringValue(plan.mermaidDiagram, 'Mermaid diagram', true);
  stringValue(plan.planSummary, 'plan summary');
}
export function validateLesson(value: unknown): asserts value is LessonInput {
  const lesson = record(value, 'lesson');
  stringValue(lesson.nodeTitle, 'node title');
  stringValue(lesson.explanationMarkdown, 'explanation');
  for (const key of ['nodeId', 'diagramFilename', 'revisionSummary', 'mnemonic']) optionalString(lesson[key], key);
  if (lesson.nodeId !== undefined) stringValue(lesson.nodeId, 'node ID');
  if (lesson.sources !== undefined) {
    if (!Array.isArray(lesson.sources)) throw new Error('Invalid sources: expected nonempty strings.');
    for (const source of lesson.sources) stringValue(source, 'source');
  }
  if (lesson.activeRecallQuiz !== undefined) {
    const quiz = record(lesson.activeRecallQuiz, 'recall quiz');
    for (const key of ['question', 'chosenAnswer', 'keyTakeaway']) stringValue(quiz[key], key, true);
    if (typeof quiz.isCorrect !== 'boolean') throw new Error('Invalid quiz correctness.');
  }
}
export function validateReview(value: unknown): asserts value is ReviewInput {
  const attempt = record(value, 'review');
  stringValue(attempt.nodeId, 'node ID');
  if (typeof attempt.isCorrect !== 'boolean' || (attempt.kind !== 'immediate' && attempt.kind !== 'delayed')) throw new Error('Invalid review correctness or kind.');
  for (const key of ['question', 'chosenAnswer', 'keyTakeaway', 'attemptId']) optionalString(attempt[key], key);
  if (attempt.attemptId !== undefined) stringValue(attempt.attemptId, 'attempt ID');
}
export function validateProgress(value: unknown): asserts value is LearningProgress {
  const data = record(value, 'progress');
  if (data.version !== 1) throw new Error('Invalid or unsupported progress version; recover from a backup before continuing.');
  stringValue(data.topic, 'progress topic');
  stringValue(data.goal, 'progress goal', true);
  timestampValue(data.createdAt, 'createdAt');
  timestampValue(data.updatedAt, 'updatedAt');
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0 || !(data.managedHash === null || typeof data.managedHash === 'string' && /^[a-f0-9]{64}$/.test(data.managedHash))) throw new Error('Invalid progress revision or managed-block hash.');
  if (data.examProfile !== undefined) validateExamProfile(data.examProfile);
  if (data.plan !== undefined) validatePlan(data.plan);
  if (!Array.isArray(data.nodes) || !Array.isArray(data.attempts) || !Array.isArray(data.operationIds) || !data.operationIds.every(id => typeof id === 'string')) throw new Error('Invalid progress nodes, attempts or operation IDs.');
  const ids = new Set<string>();
  for (const value of data.nodes) {
    validateLesson(value);
    const node = value as unknown as Record<string, unknown>;
    stringValue(node.nodeId, 'persisted node ID');
    if (ids.has(node.nodeId)) throw new Error('Invalid progress: duplicate node IDs.');
    ids.add(node.nodeId);
    timestampValue(node.taughtAt, 'taughtAt');
    timestampValue(node.nextReviewAt, 'nextReviewAt');
    if (!Number.isSafeInteger(node.delayedSuccesses) || Number(node.delayedSuccesses) < 0 || !['taught', 'immediate-recall', 'delayed-recall', 'needs-review'].includes(String(node.retention))) throw new Error('Invalid node retention state.');
  }
  const attemptIds = new Set<string>();
  for (const value of data.attempts) {
    validateReview(value);
    const attempt = value as unknown as Record<string, unknown>;
    stringValue(attempt.attemptId, 'persisted attempt ID');
    if (attemptIds.has(attempt.attemptId) || !ids.has(value.nodeId)) throw new Error('Invalid progress: duplicate attempt or unknown node.');
    attemptIds.add(attempt.attemptId);
    timestampValue(attempt.timestamp, 'attempt timestamp');
  }
}

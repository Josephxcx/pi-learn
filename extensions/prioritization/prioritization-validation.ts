import type { ExamTaxonomy, SyllabusUnit, SubtopicNode, SourceProvenance, ExamProfile, PYQItem, PYQDataset, ImportDiagnostic, AnalyzedPaper } from "./prioritization-types.ts";

function fail(at: string, message: string): never { throw new Error(`${at}: ${message}`); }
function object(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(at, "expected an object");
  return value as Record<string, unknown>;
}
function string(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) fail(at, "expected a nonempty string");
  return value.trim();
}
function optionalString(value: unknown, at: string): string | undefined { return value === undefined ? undefined : string(value, at); }
function number(value: unknown, at: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(at, `expected a finite number between ${min} and ${max}`);
  return value;
}
function optionalNumber(value: unknown, at: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined { return value === undefined ? undefined : number(value, at, min, max); }
function year(value: unknown, at: string): number | undefined {
  const result = optionalNumber(value, at, 1800, new Date().getUTCFullYear());
  if (result !== undefined && !Number.isInteger(result)) fail(at, "expected an integer year");
  return result;
}
function array(value: unknown, at: string): unknown[] { if (!Array.isArray(value)) fail(at, "expected an array"); return value; }
function stringArray(value: unknown, at: string): string[] { return array(value, at).map((v, i) => string(v, `${at}[${i}]`)); }
function relativePath(value: unknown, at: string): string {
  const result = string(value, at);
  if (/^(?:[A-Za-z]:|[\\/])/.test(result) || result.split(/[\\/]/).some(p => p === ".." || p === ".") || /[\0\r\n]/.test(result)) fail(at, "expected a safe relative path without traversal");
  return result;
}
function provenance(value: unknown, at: string): SourceProvenance | undefined {
  if (value === undefined) return undefined;
  const v = object(value, at);
  return { sourcePath: optionalString(v.sourcePath, `${at}.sourcePath`), sourceUrl: optionalString(v.sourceUrl, `${at}.sourceUrl`), sourceLabel: optionalString(v.sourceLabel, `${at}.sourceLabel`), questionNumber: optionalString(v.questionNumber, `${at}.questionNumber`) };
}
function profile(value: unknown): ExamProfile | undefined {
  if (value === undefined) return undefined;
  const v = object(value, "profile");
  const gazettedStatus = optionalString(v.gazettedStatus, "profile.gazettedStatus");
  if (gazettedStatus !== undefined && !["gazetted", "non-gazetted", "unknown"].includes(gazettedStatus)) fail("profile.gazettedStatus", "expected gazetted, non-gazetted, or unknown");
  const papers = v.papers === undefined ? undefined : array(v.papers, "profile.papers").map((item, i) => {
    const p = object(item, `profile.papers[${i}]`);
    return { id: string(p.id, `profile.papers[${i}].id`), title: string(p.title, `profile.papers[${i}].title`), marks: optionalNumber(p.marks, `profile.papers[${i}].marks`), difficultyGuidance: optionalString(p.difficultyGuidance, `profile.papers[${i}].difficultyGuidance`) };
  });
  if (papers && new Set(papers.map(p => p.id)).size !== papers.length) fail("profile.papers", "duplicate paper id");
  return { post: optionalString(v.post, "profile.post"), authority: optionalString(v.authority, "profile.authority"), group: optionalString(v.group, "profile.group"), gazettedStatus: gazettedStatus as ExamProfile["gazettedStatus"], recruitmentRoute: optionalString(v.recruitmentRoute, "profile.recruitmentRoute"), syllabusVersion: optionalString(v.syllabusVersion, "profile.syllabusVersion"), difficultyGuidance: optionalString(v.difficultyGuidance, "profile.difficultyGuidance"), papers };
}

/** Reject duplicate IDs, unresolved edges and cycles before constructing a dependency closure. */
export function validateDependencyUnits(units: SyllabusUnit[]): void {
  const topics = new Map<string, SubtopicNode>();
  const unitIds = new Set<string>();
  for (const unit of units) {
    if (unitIds.has(unit.id)) fail("units", `duplicate unit id ${unit.id}`);
    unitIds.add(unit.id);
    for (const sub of unit.subtopics) {
      if (topics.has(sub.id)) fail("subtopics", `duplicate subtopic id ${sub.id}`);
      topics.set(sub.id, sub);
    }
  }
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, route: string[]): void => {
    if (state.get(id) === "visiting") fail("prerequisites", `dependency cycle: ${[...route, id].join(" -> ")}`);
    if (state.get(id) === "done") return;
    state.set(id, "visiting");
    const sub = topics.get(id)!;
    if (new Set(sub.prerequisites).size !== sub.prerequisites.length) fail(id, "duplicate prerequisite");
    for (const prerequisite of sub.prerequisites) {
      if (!topics.has(prerequisite)) fail(id, `unknown prerequisite ${prerequisite}`);
      visit(prerequisite, [...route, id]);
    }
    state.set(id, "done");
  };
  for (const id of topics.keys()) visit(id, []);
}

export function validateExamTaxonomy(value: unknown): ExamTaxonomy {
  const v = object(value, "taxonomy");
  if (v.schemaVersion !== undefined && v.schemaVersion !== 1) fail("schemaVersion", "only version 1 is supported");
  const units: SyllabusUnit[] = array(v.units, "units").map((item, i) => {
    const at = `units[${i}]`, u = object(item, at);
    const unitNumber = number(u.unitNumber, `${at}.unitNumber`, 1);
    if (!Number.isInteger(unitNumber)) fail(`${at}.unitNumber`, "expected a positive integer");
    const subtopics: SubtopicNode[] = array(u.subtopics, `${at}.subtopics`).map((item, j) => {
      const sat = `${at}.subtopics[${j}]`, s = object(item, sat);
      const masteryStatus = s.masteryStatus ?? "pending";
      if (!["mastered", "in-progress", "pending", "needs-revision"].includes(String(masteryStatus))) fail(`${sat}.masteryStatus`, "unknown mastery status");
      if (s.syllabusScope !== undefined && typeof s.syllabusScope !== "string") fail(`${sat}.syllabusScope`, "expected a string");
      return { id: string(s.id, `${sat}.id`), title: string(s.title, `${sat}.title`), syllabusScope: s.syllabusScope as string | undefined, officialMarks: optionalNumber(s.officialMarks, `${sat}.officialMarks`), prerequisites: s.prerequisites === undefined ? [] : stringArray(s.prerequisites, `${sat}.prerequisites`), masteryStatus: masteryStatus as SubtopicNode["masteryStatus"], notePath: s.notePath === undefined ? undefined : relativePath(s.notePath, `${sat}.notePath`), cognitiveFriction: optionalNumber(s.cognitiveFriction, `${sat}.cognitiveFriction`, 1, 5) };
    });
    if (!subtopics.length) fail(at, 'no subtopics were parsed; check the syllabus format or supply an explicit exam.json');
    return { id: string(u.id, `${at}.id`), unitNumber, title: string(u.title, `${at}.title`), paper: string(u.paper, `${at}.paper`), officialMarks: optionalNumber(u.officialMarks, `${at}.officialMarks`), subtopics };
  });
  if (!units.length) fail('syllabus', 'no units were parsed; check the syllabus format or supply an explicit exam.json');
  validateDependencyUnits(units);
  return { schemaVersion: 1, examId: string(v.examId, "examId"), examTitle: string(v.examTitle, "examTitle"), totalMarks: optionalNumber(v.totalMarks, "totalMarks"), vaultRelativeDir: relativePath(v.vaultRelativeDir ?? v.examId, "vaultRelativeDir"), units, profile: profile(v.profile), provenance: provenance(v.provenance, "provenance"), metadata: v.metadata === undefined ? undefined : object(v.metadata, "metadata") };
}

/** A canonical sitting ID is preferred. Name + year is a legacy, lower-certainty fallback. */
export function paperIdentity(q: PYQItem): string | undefined {
  if (q.paperId) return `${q.examId}:id:${q.paperId}`;
  return q.year !== undefined && q.paperName ? `${q.examId}:legacy:${q.year}:${q.paperName.trim().toLowerCase()}` : undefined;
}

export function deduplicateQuestions(questions: PYQItem[], diagnostics: ImportDiagnostic[] = []): PYQItem[] {
  const seen = new Map<string, PYQItem>();
  const result: PYQItem[] = [];
  for (const q of questions) {
    const paper = paperIdentity(q);
    const source = q.sourceQuestionId ?? (q.provenance?.sourcePath && q.provenance.questionNumber ? `${q.provenance.sourcePath}#${q.provenance.questionNumber}` : undefined);
    const key = source && paper ? `${paper}:source:${source}` : `${q.examId}:${paper ?? "unknown"}:id:${q.id}`;
    const previous = seen.get(key);
    if (previous) {
      const signature = (item: PYQItem) => JSON.stringify([item.questionText.trim().replace(/\s+/g, " "), item.year, item.marks, item.unitId, item.subtopicId, item.mappingStatus, item.options, item.correctAnswer]);
      if (signature(previous) !== signature(q)) fail(q.id, `conflicting duplicate source question ${key}`);
      diagnostics.push({ code: "duplicate-question", questionId: q.id, message: `Skipped duplicate source question ${q.id} (already imported as ${previous.id}).` });
      continue;
    }
    seen.set(key, q); result.push(q);
  }
  return result;
}

export function validatePYQDataset(value: unknown, taxonomy: ExamTaxonomy): PYQDataset {
  const v = object(value, "PYQ dataset");
  if (v.schemaVersion !== 1) fail("schemaVersion", "expected version 1");
  const examId = string(v.examId, "examId");
  if (examId !== taxonomy.examId) fail("examId", `dataset ${examId} does not match taxonomy ${taxonomy.examId}`);
  const papers: AnalyzedPaper[] = array(v.papers ?? [], "papers").map((item, i) => {
    const at = `papers[${i}]`, p = object(item, at);
    if (p.complete !== undefined && typeof p.complete !== "boolean") fail(`${at}.complete`, "expected boolean");
    return { id: string(p.id, `${at}.id`), paperName: string(p.paperName, `${at}.paperName`), year: year(p.year, `${at}.year`), complete: p.complete as boolean | undefined, provenance: provenance(p.provenance, `${at}.provenance`) };
  });
  const paperMap = new Map(papers.map(p => [p.id, p]));
  if (paperMap.size !== papers.length) fail("papers", "duplicate paper id; use one canonical ID per sitting/paper across booklet copies");
  const topics = new Map(taxonomy.units.flatMap(u => u.subtopics.map(s => [s.id, u.id] as const)));
  const diagnostics: ImportDiagnostic[] = [];
  const ids = new Set<string>();
  const questions = array(v.questions, "questions").map((item, i): PYQItem => {
    const at = `questions[${i}]`, q = object(item, at), id = string(q.id, `${at}.id`);
    if (ids.has(id)) fail(`${at}.id`, `duplicate question id ${id}; sourceQuestionId identifies booklet copies with distinct record IDs`);
    ids.add(id);
    if (q.examId !== undefined && q.examId !== examId) fail(`${at}.examId`, "does not match dataset examId");
    const paperId = optionalString(q.paperId, `${at}.paperId`), paper = paperId ? paperMap.get(paperId) : undefined;
    if (paperId && !paper) fail(`${at}.paperId`, `unknown paper ${paperId}`);
    const explicitYear = year(q.year, `${at}.year`);
    if (paper?.year !== undefined && explicitYear !== undefined && paper.year !== explicitYear) fail(`${at}.year`, "conflicts with paper year");
    const explicitName = optionalString(q.paperName, `${at}.paperName`);
    if (paper && explicitName !== undefined && explicitName !== paper.paperName) fail(`${at}.paperName`, "conflicts with paper name");
    const subtopicId = optionalString(q.subtopicId, `${at}.subtopicId`);
    if (subtopicId && !topics.has(subtopicId)) fail(`${at}.subtopicId`, `unknown subtopic ${subtopicId}`);
    const unitId = optionalString(q.unitId, `${at}.unitId`) ?? (subtopicId ? topics.get(subtopicId) : undefined);
    if (unitId && !taxonomy.units.some(u => u.id === unitId)) fail(`${at}.unitId`, `unknown unit ${unitId}`);
    if (subtopicId && unitId !== topics.get(subtopicId)) fail(`${at}.unitId`, "does not contain the mapped subtopic");
    const mappingStatus = q.mappingStatus ?? (subtopicId ? "explicit" : "unmatched");
    if (!["explicit", "inferred", "ambiguous", "unmatched"].includes(String(mappingStatus))) fail(`${at}.mappingStatus`, "invalid mapping status");
    if ((mappingStatus === "ambiguous" || mappingStatus === "unmatched") && subtopicId) fail(`${at}.subtopicId`, "ambiguous/unmatched questions must remain unassigned");
    if ((mappingStatus === "explicit" || mappingStatus === "inferred") && !subtopicId) fail(`${at}.mappingStatus`, "mapped questions require a subtopicId");
    const candidateSubtopicIds = q.candidateSubtopicIds === undefined ? undefined : stringArray(q.candidateSubtopicIds, `${at}.candidateSubtopicIds`);
    for (const candidate of candidateSubtopicIds ?? []) if (!topics.has(candidate)) fail(`${at}.candidateSubtopicIds`, `unknown candidate ${candidate}`);
    const options = q.options === undefined ? undefined : array(q.options, `${at}.options`).map((entry, j) => { const opt = object(entry, `${at}.options[${j}]`); return { key: string(opt.key, `${at}.options[${j}].key`), text: string(opt.text, `${at}.options[${j}].text`) }; });
    if (options && new Set(options.map(o => o.key)).size !== options.length) fail(`${at}.options`, "duplicate option key");
    const correctAnswer = optionalString(q.correctAnswer, `${at}.correctAnswer`);
    if (options && correctAnswer && !options.some(o => o.key === correctAnswer)) fail(`${at}.correctAnswer`, "does not match any option key");
    const result: PYQItem = { id, examId, paperId, paperName: paper?.paperName ?? explicitName, year: paper?.year ?? explicitYear, marks: optionalNumber(q.marks, `${at}.marks`), unitId, subtopicId, mappingStatus: mappingStatus as PYQItem["mappingStatus"], candidateSubtopicIds, questionText: string(q.questionText, `${at}.questionText`), sourceCode: optionalString(q.sourceCode, `${at}.sourceCode`), sourceQuestionId: optionalString(q.sourceQuestionId, `${at}.sourceQuestionId`), provenance: provenance(q.provenance, `${at}.provenance`), options, correctAnswer, explanation: optionalString(q.explanation, `${at}.explanation`) };
    const missing = [result.year === undefined ? "year" : "", result.marks === undefined ? "marks" : "", !paperIdentity(result) ? "paper identity" : "", !subtopicId ? "topic mapping" : ""].filter(Boolean);
    if (missing.length) diagnostics.push({ code: "missing-evidence", questionId: id, message: `${id}: unknown ${missing.join(", ")}; these values were not inferred.` });
    return result;
  });
  // Resolve unique name/year aliases before source-question de-duplication,
  // so a booklet copy cannot acquire a second identity merely by omitting paperId.
  for (const question of questions) {
    if (question.paperId || question.year === undefined || !question.paperName) continue;
    const matches = papers.filter(paper => paper.year === question.year && paper.paperName.trim().toLowerCase() === question.paperName!.trim().toLowerCase());
    if (matches.length === 1) {
      question.paperId = matches[0]!.id;
      question.paperName = matches[0]!.paperName;
    }
  }
  return { schemaVersion: 1, examId, papers, questions: deduplicateQuestions(questions, diagnostics), diagnostics };
}

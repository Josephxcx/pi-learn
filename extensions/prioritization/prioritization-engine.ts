/** Transparent prioritization heuristics. Scores are neither exam probabilities nor predicted marks. */
import type {
  ActionAnchor, EvidenceBadge, ExamTaxonomy, PYQDataset, PYQItem, PrioritizedSubtopic,
  SubtopicNode, SyllabusUnit, TriVectorMetrics, TriVectorScore,
} from "./prioritization-types.ts";
import { deduplicateQuestions, paperIdentity, validateDependencyUnits, validateExamTaxonomy, validatePYQDataset } from "./prioritization-validation.ts";

function round(value: number): number { return Math.round(value * 10) / 10; }
function clamp(value: number, min = 0, max = 100): number { return Math.min(max, Math.max(min, round(value))); }

/** Validate the DAG and count each transitive dependent once, at its shortest distance. */
export function buildDependencyGraph(units: SyllabusUnit[]): Map<string, Array<{ id: string; distance: number }>> {
  validateDependencyUnits(units);
  const direct = new Map<string, string[]>();
  for (const unit of units) for (const sub of unit.subtopics) direct.set(sub.id, []);
  for (const unit of units) for (const sub of unit.subtopics) {
    for (const prerequisite of sub.prerequisites) direct.get(prerequisite)!.push(sub.id);
  }
  const downstream = new Map<string, Array<{ id: string; distance: number }>>();
  for (const root of direct.keys()) {
    const seen = new Set<string>();
    const queue = [{ id: root, distance: 0 }];
    const descendants: Array<{ id: string; distance: number }> = [];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      for (const id of direct.get(current.id) ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const next = { id, distance: current.distance + 1 };
        queue.push(next); descendants.push(next);
      }
    }
    downstream.set(root, descendants);
  }
  return downstream;
}

/**
 * Fixed, uncalibrated weights: 35% declared weight, 40% known recency-weighted marks,
 * 25% observed paper coverage. The marks component saturates at 8 weighted marks.
 * Unit weight is a shared unit-level prior, never an allocated subtopic mark estimate.
 * Missing components contribute no evidence; absence of evidence is not proof of low importance.
 */
export function calculateExamPriority(
  subtopic: SubtopicNode,
  unit: SyllabusUnit,
  taxonomy: ExamTaxonomy,
  subtopicPYQs: PYQItem[],
  totalAnalyzedPapers: number,
  currentYear = new Date().getUTCFullYear(),
  identifyPaper: (question: PYQItem) => string | undefined = paperIdentity,
): { score: number; metrics: TriVectorMetrics } {
  const evidenceLimitations: string[] = [];
  const hasOfficialWeightage = subtopic.officialMarks !== undefined || unit.officialMarks !== undefined;
  const hasSubtopicWeight = subtopic.officialMarks !== undefined;
  const declaredMarks = subtopic.officialMarks ?? unit.officialMarks;
  const comparableMarks = hasSubtopicWeight
    ? taxonomy.units.flatMap(u => u.subtopics.map(s => s.officialMarks ?? 0))
    : taxonomy.units.map(u => u.officialMarks ?? 0);
  const maxDeclaredMarks = Math.max(0, ...comparableMarks);
  const officialComponent = declaredMarks !== undefined && maxDeclaredMarks > 0 ? 100 * declaredMarks / maxDeclaredMarks : 0;
  if (!hasOfficialWeightage) evidenceLimitations.push("Official weightage is unknown; no weightage was invented.");
  else if (!hasSubtopicWeight) evidenceLimitations.push("Official marks apply to the whole unit; its normalized weight is shared as a prior, not allocated to this subtopic.");

  const years = new Set<number>();
  const papers = new Set<string>();
  let decayedMarks = 0, knownYearQuestions = 0, knownMarksQuestions = 0, inferredMappingQuestions = 0;
  let missingPaperIdentityQuestions = 0;
  for (const q of subtopicPYQs) {
    if (q.year !== undefined) { years.add(q.year); knownYearQuestions++; }
    if (q.marks !== undefined) knownMarksQuestions++;
    const identity = identifyPaper(q);
    if (identity) papers.add(identity); else missingPaperIdentityQuestions++;
    if (q.mappingStatus === "inferred") inferredMappingQuestions++;
    if (q.year !== undefined && q.marks !== undefined) {
      decayedMarks += q.marks * Math.exp(-0.15 * Math.max(0, currentYear - q.year));
    }
  }
  if (subtopicPYQs.length === 0) evidenceLimitations.push("No mapped PYQs were supplied for this topic; this does not establish a new syllabus or low exam importance.");
  if (knownYearQuestions < subtopicPYQs.length || knownMarksQuestions < subtopicPYQs.length) {
    evidenceLimitations.push("Recency-weighted marks exclude questions with unknown year or marks; zero is a known value.");
  }
  if (missingPaperIdentityQuestions) evidenceLimitations.push(`${missingPaperIdentityQuestions} mapped question(s) have unknown paper identity and are excluded from paper coverage.`);
  if (inferredMappingQuestions) evidenceLimitations.push(`${inferredMappingQuestions} topic mapping(s) are inferred and need source review.`);
  if (totalAnalyzedPapers === 0) evidenceLimitations.push("Paper coverage is unknown because no paper identities or declared paper count were supplied.");
  if (subtopic.cognitiveFriction === undefined) evidenceLimitations.push("Study effort is unknown; the effort adjustment is neutral.");

  const consistencyPct = totalAnalyzedPapers > 0 ? 100 * papers.size / totalAnalyzedPapers : 0;
  const score = clamp(0.35 * officialComponent + 0.40 * Math.min(100, decayedMarks / 8 * 100) + 0.25 * consistencyPct);
  return { score, metrics: {
    totalPYQs: subtopicPYQs.length, decayedMarks: round(decayedMarks), consistencyPct: round(consistencyPct),
    downstreamMarks: 0, downstreamPriorityValue: 0, transitivePrereqCount: 0, yearsCovered: years.size,
    hasOfficialWeightage, analyzedPapers: totalAnalyzedPapers, papersWithTopic: papers.size,
    knownYearQuestions, knownMarksQuestions, missingPaperIdentityQuestions, inferredMappingQuestions, evidenceLimitations,
  } };
}

/** Downstream value is discounted priority points, never exam marks. */
export function calculateFoundationScore(
  subtopicId: string,
  downstreamMap: Map<string, Array<{ id: string; distance: number }>>,
  examPriorityMap: Map<string, number>,
  totalSubtopicsCount: number,
): { score: number; downstreamMarks: number; downstreamPriorityValue: number } {
  const dependents = downstreamMap.get(subtopicId) ?? [];
  const directCount = dependents.filter(d => d.distance === 1).length;
  const directCoverage = totalSubtopicsCount > 1 ? directCount / (totalSubtopicsCount - 1) * 100 : 0;
  const value = dependents.reduce((sum, dependent) => sum + (examPriorityMap.get(dependent.id) ?? 0) / dependent.distance, 0);
  const downstreamPriorityValue = round(value);
  return {
    score: clamp(0.40 * directCoverage + 0.60 * Math.min(100, value / 80 * 100)),
    downstreamMarks: downstreamPriorityValue, downstreamPriorityValue,
  };
}

/** A user estimate adjusts priority; it does not estimate learning time or marks/hour. */
export function calculateStudyEfficiency(examScore: number, foundationScore: number, cognitiveFriction?: number): number {
  const payoff = Math.max(examScore, 0.65 * foundationScore);
  if (cognitiveFriction === undefined) return clamp(payoff);
  if (!Number.isFinite(cognitiveFriction) || cognitiveFriction < 1 || cognitiveFriction > 5) throw new Error("cognitiveFriction must be between 1 and 5");
  return clamp(payoff * 2.5 / cognitiveFriction);
}

/** A descriptive evidence sufficiency index, not statistical confidence or answer likelihood. */
export function calculateConfidence(
  yearsCovered: number, totalPYQs: number, hasOfficialWeightage: boolean, qualityCap = 1,
): { level: "high" | "moderate" | "speculative"; score: number } {
  const index = 0.45 * Math.min(1, yearsCovered / 5) + 0.35 * Math.min(1, totalPYQs / 10) + 0.20 * Number(hasOfficialWeightage);
  const score = Math.round(Math.min(index, qualityCap) * 100) / 100;
  return { level: score >= 0.70 ? "high" : score >= 0.38 ? "moderate" : "speculative", score };
}

export function assignActionAnchor(compositeScore: number): ActionAnchor {
  if (compositeScore >= 85) return "Must Study";
  if (compositeScore >= 70) return "High Priority";
  if (compositeScore >= 55) return "Important";
  if (compositeScore >= 40) return "Moderate";
  return "Lower";
}

/** Trend and syllabus-change badges require evidence this importer does not collect. */
export function determineEvidenceBadges(
  _subtopic: SubtopicNode, _unit: SyllabusUnit,
  score: Pick<TriVectorScore, "examPriorityScore" | "foundationScore" | "studyEfficiencyScore" | "metrics">,
): EvidenceBadge[] {
  const badges: EvidenceBadge[] = [];
  if (score.foundationScore >= 75) badges.push("Core Foundation");
  if (score.metrics.totalPYQs === 0) badges.push("No Mapped PYQs");
  return badges;
}

/** Validate legacy arrays without inventing years, marks or source identities. */
function normalizeEvidence(taxonomy: ExamTaxonomy, evidence: PYQItem[] | PYQDataset): PYQDataset {
  if (!Array.isArray(evidence)) return validatePYQDataset(evidence, taxonomy);
  const papers = new Map<string, { id: string; paperName?: string; year?: number }>();
  for (const question of evidence) {
    if (!question.paperId) continue;
    const existing = papers.get(question.paperId);
    if (existing && ((question.year !== undefined && existing.year !== undefined && question.year !== existing.year)
      || (question.paperName !== undefined && existing.paperName !== undefined && question.paperName !== existing.paperName))) {
      throw new Error(`Conflicting metadata for paper ${question.paperId}`);
    }
    papers.set(question.paperId, { id: question.paperId, paperName: question.paperName ?? existing?.paperName, year: question.year ?? existing?.year });
  }
  const result = validatePYQDataset({ schemaVersion: 1, examId: taxonomy.examId,
    papers: [...papers.values()].map(paper => ({ ...paper, paperName: paper.paperName ?? `Unknown paper name (${paper.id})` })),
    questions: deduplicateQuestions(evidence) }, taxonomy);
  // A placeholder required by the manifest schema is not observed question metadata.
  for (const question of result.questions) {
    if (question.paperId && papers.get(question.paperId)?.paperName === undefined) question.paperName = undefined;
  }
  return result;
}

/** Reconcile name/year aliases only when they identify exactly one canonical paper. */
function makePaperIdentifier(dataset: PYQDataset): (question: PYQItem) => string | undefined {
  const aliases = new Map<string, string[]>();
  for (const paper of dataset.papers) {
    if (paper.year === undefined) continue;
    const alias = paperIdentity({ id: paper.id, examId: dataset.examId, paperName: paper.paperName, year: paper.year, questionText: "" })!;
    const list = aliases.get(alias) ?? [];
    list.push(`${dataset.examId}:id:${paper.id}`); aliases.set(alias, list);
  }
  return question => {
    const identity = paperIdentity(question);
    if (!identity || question.paperId) return identity;
    const matches = aliases.get(identity);
    return matches === undefined ? identity : matches.length === 1 ? matches[0] : undefined;
  };
}

/** Actual identified papers are the default denominator; a caller-supplied count must be explicit. */
export function prioritizeTaxonomy(
  taxonomy: ExamTaxonomy, evidence: PYQItem[] | PYQDataset, totalAnalyzedPapers?: number,
): PrioritizedSubtopic[] {
  validateExamTaxonomy(taxonomy);
  const downstreamMap = buildDependencyGraph(taxonomy.units);
  const dataset = normalizeEvidence(taxonomy, evidence);
  const identifyPaper = makePaperIdentifier(dataset);
  const observedPapers = new Set(dataset.papers.map(p => `${dataset.examId}:id:${p.id}`));
  for (const question of dataset.questions) {
    const identity = identifyPaper(question); if (identity) observedPapers.add(identity);
  }
  if (totalAnalyzedPapers !== undefined && (!Number.isInteger(totalAnalyzedPapers) || totalAnalyzedPapers < observedPapers.size || totalAnalyzedPapers < 0)) {
    throw new Error(`totalAnalyzedPapers must be an integer at least ${observedPapers.size}, the number of identified papers`);
  }
  const paperCount = totalAnalyzedPapers ?? observedPapers.size;
  const globalLimitations = ["Scores use an uncalibrated heuristic, not exam predictions. PYQ marks decay by exp(-0.15 × age); the marks component saturates at 8 weighted marks."];
  const incompleteCoverage = dataset.papers.length === 0 || dataset.papers.some(p => p.complete !== true) || observedPapers.size !== dataset.papers.length;
  if (incompleteCoverage) globalLimitations.push("Paper imports are partial or completeness is unverified; observed coverage does not prove absence from other papers.");
  if (totalAnalyzedPapers !== undefined && totalAnalyzedPapers > observedPapers.size) globalLimitations.push("The denominator includes caller-declared papers without source identities; completeness cannot be verified.");
  const unassignedCount = dataset.questions.filter(q => !q.subtopicId).length;
  if (unassignedCount) globalLimitations.push(`${unassignedCount} ambiguous or unmatched question(s) remain unassigned and may affect topic coverage.`);
  const byTopic = new Map<string, PYQItem[]>();
  for (const question of dataset.questions) {
    if (!question.subtopicId) continue;
    const list = byTopic.get(question.subtopicId) ?? [];
    list.push(question); byTopic.set(question.subtopicId, list);
  }
  const preliminary = new Map<string, ReturnType<typeof calculateExamPriority>>();
  const examScores = new Map<string, number>();
  for (const unit of taxonomy.units) for (const subtopic of unit.subtopics) {
    const result = calculateExamPriority(subtopic, unit, taxonomy, byTopic.get(subtopic.id) ?? [], paperCount, new Date().getUTCFullYear(), identifyPaper);
    preliminary.set(subtopic.id, result); examScores.set(subtopic.id, result.score);
  }
  const prerequisites = new Map<string, number>();
  for (const dependents of downstreamMap.values()) for (const dependent of dependents) {
    prerequisites.set(dependent.id, (prerequisites.get(dependent.id) ?? 0) + 1);
  }
  const prioritized: PrioritizedSubtopic[] = [];
  for (const unit of taxonomy.units) for (const subtopic of unit.subtopics) {
    const { score: examPriorityScore, metrics } = preliminary.get(subtopic.id)!;
    const foundation = calculateFoundationScore(subtopic.id, downstreamMap, examScores, examScores.size);
    metrics.downstreamMarks = foundation.downstreamPriorityValue;
    metrics.downstreamPriorityValue = foundation.downstreamPriorityValue;
    metrics.transitivePrereqCount = prerequisites.get(subtopic.id) ?? 0;
    metrics.evidenceLimitations.push(...globalLimitations);
    let qualityCap = incompleteCoverage || unassignedCount > 0 || paperCount !== observedPapers.size ? 0.69 : 1;
    if (metrics.missingPaperIdentityQuestions || metrics.inferredMappingQuestions || metrics.knownYearQuestions < metrics.totalPYQs || metrics.knownMarksQuestions < metrics.totalPYQs) qualityCap = 0.37;
    const confidence = calculateConfidence(metrics.yearsCovered, metrics.totalPYQs, metrics.hasOfficialWeightage, qualityCap);
    const studyEfficiencyScore = calculateStudyEfficiency(examPriorityScore, foundation.score, subtopic.cognitiveFriction);
    const basePriority = Math.max(examPriorityScore, 0.85 * foundation.score);
    const adjustment = subtopic.cognitiveFriction === undefined ? 1 : 0.90 + 0.20 * studyEfficiencyScore / 100;
    const compositeScore = clamp(basePriority * adjustment);
    const score: TriVectorScore = { examPriorityScore, foundationScore: foundation.score, studyEfficiencyScore, compositeScore,
      actionAnchor: assignActionAnchor(compositeScore), evidenceBadges: [], confidence: confidence.level, confidenceScore: confidence.score, metrics };
    score.evidenceBadges = determineEvidenceBadges(subtopic, unit, score);
    // A descriptive frequency badge requires complete, attributable papers and mappings.
    if (!incompleteCoverage && unassignedCount === 0 && qualityCap === 1 && metrics.analyzedPapers >= 4 && metrics.consistencyPct >= 75 && metrics.totalPYQs >= 4) score.evidenceBadges.push("Frequent Anchor");
    prioritized.push({ subtopic, unit: { id: unit.id, unitNumber: unit.unitNumber, title: unit.title, paper: unit.paper, officialMarks: unit.officialMarks }, score });
  }
  return prioritized.sort((a, b) => b.score.compositeScore - a.score.compositeScore || a.subtopic.id.localeCompare(b.subtopic.id));
}

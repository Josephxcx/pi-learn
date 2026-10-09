/** Evidence-aware text views. Unknown input and heuristic score units stay visible. */
import type { ActionAnchor, EvidenceBadge, ExamTaxonomy, PrioritizedSubtopic, SyllabusUnit } from "./prioritization-types.ts";

export function formatAnchorBadge(anchor: ActionAnchor): string { return anchor === "Lower" ? "Lower heuristic priority" : anchor; }
export function formatEvidenceBadge(badge: EvidenceBadge): string { return badge; }
export function formatConfidenceBadge(confidence: "high" | "moderate" | "speculative", score: number): string {
  return `${confidence === "speculative" ? "limited" : confidence} (sufficiency index ${Math.round(score * 100)}/100; not a probability)`;
}
function marks(value: number | undefined): string { return value === undefined ? "official marks unknown" : `${value} official marks`; }
function scopeNote(): string { return "Heuristic priority reflects supplied evidence. A low score with missing evidence does not justify skipping an official syllabus topic."; }
function scoreLine(item: PrioritizedSubtopic): string {
  const score = item.score;
  return `Scores /100: exam priority ${score.examPriorityScore}; foundation ${score.foundationScore}; effort-adjusted priority ${score.studyEfficiencyScore}.`;
}

export function renderSyllabusOverview(taxonomy: ExamTaxonomy, prioritizedList: PrioritizedSubtopic[]): string {
  const lines = [`# ${taxonomy.examTitle}`, `Total: ${marks(taxonomy.totalMarks)}`, "", scopeNote(), ""];
  if (taxonomy.profile) {
    const p = taxonomy.profile;
    const details = [["Post", p.post], ["Authority", p.authority], ["Group", p.group], ["Gazetted status", p.gazettedStatus], ["Recruitment route", p.recruitmentRoute], ["Syllabus version", p.syllabusVersion], ["Difficulty guidance", p.difficultyGuidance]];
    for (const [label, value] of details) if (value !== undefined) lines.push(`${label}: ${value}`);
    lines.push("");
  }
  for (const unit of taxonomy.units) {
    const items = prioritizedList.filter(item => item.unit.id === unit.id);
    const mastered = items.filter(item => item.subtopic.masteryStatus === "mastered").length;
    const pending = items.filter(item => item.subtopic.masteryStatus !== "mastered").sort((a, b) => b.score.compositeScore - a.score.compositeScore);
    const top = pending[0];
    lines.push(`- **Unit ${unit.unitNumber}: ${unit.title}** (${marks(unit.officialMarks)}; ${unit.paper})`,
      `  ID: \`${unit.id}\`. Highest pending priority: ${top ? formatAnchorBadge(top.score.actionAnchor) : "none"}. Recorded mastered: ${mastered}/${unit.subtopics.length}.`);
  }
  if (taxonomy.diagnostics?.length) lines.push("", ...taxonomy.diagnostics.map(diagnostic => diagnostic.message));
  return lines.join("\n");
}

export function renderUnitSubtopicsDetail(unit: SyllabusUnit, subtopics: PrioritizedSubtopic[]): string {
  const lines = [`# Unit ${unit.unitNumber}: ${unit.title}`, `${marks(unit.officialMarks)}; ${unit.paper}`, "", scopeNote(), ""];
  for (const [index, item] of subtopics.entries()) {
    lines.push(`${index + 1}. **${item.subtopic.title}** — ${formatAnchorBadge(item.score.actionAnchor)} (${item.subtopic.masteryStatus}; recorded status)`,
      `   ID: \`${item.subtopic.id}\`. ${scoreLine(item)}`,
      `   Evidence: ${formatConfidenceBadge(item.score.confidence, item.score.confidenceScore)}. Mapped questions: ${item.score.metrics.totalPYQs}. Observed papers: ${item.score.metrics.papersWithTopic}/${item.score.metrics.analyzedPapers}.`);
    if (item.score.evidenceBadges.length) lines.push(`   Labels: ${item.score.evidenceBadges.map(formatEvidenceBadge).join("; ")}.`);
    if (item.subtopic.prerequisites.length) lines.push(`   Direct prerequisites: ${item.subtopic.prerequisites.join(", ")}.`);
    if (item.score.metrics.evidenceLimitations.length) lines.push(`   Limits: ${item.score.metrics.evidenceLimitations.join(" ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderSubtopicDossier(item: PrioritizedSubtopic): string {
  const score = item.score, metrics = score.metrics, subtopic = item.subtopic;
  const lines = [
    `# Prioritization: ${subtopic.title}`, `Unit: ${item.unit.title} (${marks(item.unit.officialMarks)})`,
    `Action: ${formatAnchorBadge(score.actionAnchor)}; composite ${score.compositeScore}/100.`,
    `Evidence: ${formatConfidenceBadge(score.confidence, score.confidenceScore)}.`, "", scopeNote(), "",
    scoreLine(item), `- Recency-weighted known PYQ marks: ${metrics.decayedMarks}. Unknown year or marks are excluded.`,
    `- Mapped PYQs: ${metrics.totalPYQs}; known year: ${metrics.knownYearQuestions}; known marks: ${metrics.knownMarksQuestions}.`,
    metrics.analyzedPapers > 0 ? `- Observed paper coverage: ${metrics.papersWithTopic}/${metrics.analyzedPapers} (${metrics.consistencyPct}%).` : "- Observed paper coverage: unknown.",
    `- Distinct known years among mapped questions: ${metrics.yearsCovered}.`,
    `- Discounted downstream priority: ${metrics.downstreamPriorityValue} score points (not marks).`,
    `- Upstream prerequisites: ${subtopic.prerequisites.length} direct; ${metrics.transitivePrereqCount} including indirect prerequisites.`,
    `- User-supplied effort estimate: ${subtopic.cognitiveFriction === undefined ? "unknown (neutral adjustment)" : `${subtopic.cognitiveFriction}/5`}. No study-time return is predicted.`,
  ];
  if (score.evidenceBadges.length) lines.push("", `Evidence labels: ${score.evidenceBadges.map(formatEvidenceBadge).join("; ")}.`);
  if (metrics.evidenceLimitations.length) lines.push("", "Evidence limitations:", ...metrics.evidenceLimitations.map(message => `- ${message}`));
  if (subtopic.syllabusScope) lines.push("", `Declared syllabus scope: ${subtopic.syllabusScope}`);
  return lines.join("\n");
}

/** Remove known recommendation tags; callers still must author neutral, answer-concealed quizzes. */
export function stripPrioritizationMetadata(rawQuestionText: string): string {
  const labels = "Recommended|Must Study|High Priority|Important|Moderate|Lower(?: Priority)?|Core Foundation|Frequent Anchor|Rising Trend|High Marks|Low Return|New Syllabus|No Mapped PYQs";
  return rawQuestionText
    .replace(new RegExp(`\\s*[\\[(]\\s*(?:[🔴🟠🟡🔵⚪💎⚓📈🎯⏳✨]\\s*)?(?:${labels})\\s*[\\])]`, "giu"), "")
    .trim();
}

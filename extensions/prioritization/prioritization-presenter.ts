/**
 * Two-Layer Presentation Formatter & Progressive Drill-Down UX
 *
 * Formats:
 * 1. Primary Action Anchor (Must Study -> Lower)
 * 2. Secondary Orthogonal Evidence Badges ([Core Foundation], [Frequent Anchor], etc.)
 * 3. Evidence Sufficiency / Confidence Display
 * 4. Progressive Drill-Down CLI/TUI views (Overview -> Unit -> Subtopics)
 * 5. Strict Quizzing Firewall (Strips recommendation tags from test questions)
 */

import type {
  ActionAnchor,
  EvidenceBadge,
  ExamTaxonomy,
  PrioritizedSubtopic,
  SyllabusUnit,
} from "./prioritization-types";

export function formatAnchorBadge(anchor: ActionAnchor): string {
  switch (anchor) {
    case "Must Study":
      return "🔴 Must Study";
    case "High Priority":
      return "🟠 High Priority";
    case "Important":
      return "🟡 Important";
    case "Moderate":
      return "🔵 Moderate";
    case "Lower":
      return "⚪ Lower Priority";
    default:
      return "⚪ " + anchor;
  }
}

export function formatEvidenceBadge(badge: EvidenceBadge): string {
  switch (badge) {
    case "Core Foundation":
      return "💎 Core Foundation";
    case "Frequent Anchor":
      return "⚓ Frequent Anchor";
    case "Rising Trend":
      return "📈 Rising Trend";
    case "High Marks":
      return "🎯 High Marks";
    case "Low Return":
      return "⏳ Low Return";
    case "New Syllabus":
      return "✨ New Syllabus";
    default:
      return `[${badge}]`;
  }
}

export function formatConfidenceBadge(confidence: "high" | "moderate" | "speculative", score: number): string {
  switch (confidence) {
    case "high":
      return `🟢 Conf: HIGH (${Math.round(score * 100)}%)`;
    case "moderate":
      return `🟡 Conf: MODERATE (${Math.round(score * 100)}%)`;
    case "speculative":
      return `⚪ Conf: LOW/SPECULATIVE (${Math.round(score * 100)}%)`;
  }
}

/**
 * Renders Level 1: Syllabus Overview (Units ranked by weightage and pending status)
 */
export function renderSyllabusOverview(
  taxonomy: ExamTaxonomy,
  prioritizedList: PrioritizedSubtopic[]
): string {
  const lines: string[] = [];

  lines.push(`📚 **${taxonomy.examTitle}** (Total: ${taxonomy.totalMarks} Marks)`);
  lines.push(`*Select a Unit to drill down into subtopic recommendations:*\n`);

  for (const unit of taxonomy.units) {
    const unitSubs = prioritizedList.filter((p) => p.unit.id === unit.id);
    const masteredCount = unitSubs.filter((p) => p.subtopic.masteryStatus === "mastered").length;
    const topAnchor = unitSubs.length > 0 ? unitSubs[0].score.actionAnchor : "Important";

    const anchorEmoji = topAnchor === "Must Study" ? "🔴" : topAnchor === "High Priority" ? "🟠" : "🟡";

    lines.push(
      `▸ **Unit ${unit.unitNumber}: ${unit.title}** (${unit.officialMarks}M — ${unit.paper})`
    );
    lines.push(
      `   ${anchorEmoji} Top Need: **${topAnchor}** | Progress: ${masteredCount}/${unit.subtopics.length} Mastered`
    );
  }

  return lines.join("\n");
}

/**
 * Renders Level 2: Subtopics in a Unit with Two-Layer Evidence Badges
 */
export function renderUnitSubtopicsDetail(
  unit: SyllabusUnit,
  subtopics: PrioritizedSubtopic[]
): string {
  const lines: string[] = [];

  lines.push(`📖 **Unit ${unit.unitNumber}: ${unit.title}** (${unit.officialMarks} Marks — ${unit.paper})`);
  lines.push(`*Prioritized by Tri-Vector Scoring (Exam Yield, Foundation Role, and Study Efficiency):*\n`);

  for (let i = 0; i < subtopics.length; i++) {
    const item = subtopics[i];
    const s = item.score;
    const sub = item.subtopic;

    const anchorStr = formatAnchorBadge(s.actionAnchor);
    const badgesStr = s.evidenceBadges.map(formatEvidenceBadge).join(" · ");
    const confStr = formatConfidenceBadge(s.confidence, s.confidenceScore);
    const statusStr = sub.masteryStatus === "mastered" ? "✅ Mastered" : "⏳ Pending";

    lines.push(`${i + 1}. **${sub.title}** — [${anchorStr}] (${statusStr})`);
    lines.push(`   Scores: [Exam: ${s.examPriorityScore} | Found: ${s.foundationScore} | Eff: ${s.studyEfficiencyScore}] ── ${confStr}`);
    if (badgesStr) {
      lines.push(`   Badges: ${badgesStr}`);
    }
    if (sub.prerequisites.length > 0) {
      lines.push(`   ⚠️ Prerequisites: ${sub.prerequisites.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Renders Level 3: Single Subtopic Full Dossier
 */
export function renderSubtopicDossier(item: PrioritizedSubtopic): string {
  const s = item.score;
  const sub = item.subtopic;

  const lines: string[] = [
    `# Prioritization Dossier: ${sub.title}`,
    `**Unit:** ${item.unit.title} (${item.unit.officialMarks} Marks)`,
    `**Primary Action Anchor:** ${formatAnchorBadge(s.actionAnchor)} (Composite: ${s.compositeScore}/100)`,
    `**Evidence Confidence:** ${formatConfidenceBadge(s.confidence, s.confidenceScore)}`,
    "",
    "## 📊 Tri-Vector Breakdown",
    `* **1. Exam Priority Score:** **${s.examPriorityScore}/100**`,
    `  - Decayed PYQ Marks: ${s.metrics.decayedMarks}`,
    `  - Total Mapped PYQs: ${s.metrics.totalPYQs}`,
    `  - Appearance Consistency: ${s.metrics.consistencyPct}% across ${s.metrics.yearsCovered} exam sittings`,
    "",
    `* **2. Foundation Score:** **${s.foundationScore}/100**`,
    `  - Downstream Exam Value Dependent on this: ${s.metrics.downstreamMarks} marks`,
    `  - Upstream Prerequisites: ${s.metrics.transitivePrereqCount}`,
    "",
    `* **3. Study Efficiency Score:** **${s.studyEfficiencyScore}/100**`,
    `  - Estimated Cognitive Friction: ${sub.cognitiveFriction}/5.0`,
    `  - Expected Score Return per Hour of Study: ${s.studyEfficiencyScore >= 70 ? "HIGH" : s.studyEfficiencyScore >= 40 ? "MODERATE" : "LOW"}`,
    "",
  ];

  if (s.evidenceBadges.length > 0) {
    lines.push("## 🏷️ Active Evidence Badges");
    for (const b of s.evidenceBadges) {
      lines.push(`* ${formatEvidenceBadge(b)}`);
    }
    lines.push("");
  }

  if (sub.syllabusScope) {
    lines.push(`## 📋 Official Syllabus Scope\n> ${sub.syllabusScope}\n`);
  }

  return lines.join("\n");
}

/**
 * Strict Quizzing Firewall:
 * Strips all priority anchors, recommendation tags, and badges so that
 * active recall questions NEVER leak hints or reveal answers.
 */
export function stripPrioritizationMetadata(rawQuestionText: string): string {
  return rawQuestionText
    .replace(/\s*\(Recommended\)/gi, "")
    .replace(/\s*\[Recommended\]/gi, "")
    .replace(/\s*\[Must Study\]/gi, "")
    .replace(/\s*\[High Priority\]/gi, "")
    .replace(/\s*\[Important\]/gi, "")
    .replace(/\s*\[Core Foundation\]/gi, "")
    .replace(/\s*\[Frequent Anchor\]/gi, "")
    .replace(/\s*\[Rising Trend\]/gi, "")
    .replace(/\s*\[High Marks\]/gi, "")
    .replace(/\s*\[Low Return\]/gi, "")
    .replace(/\s*\[New Syllabus\]/gi, "")
    .replace(/[🔴🟠🟡🔵⚪💎⚓📈🎯⏳✨]/gu, "")
    .trim();
}

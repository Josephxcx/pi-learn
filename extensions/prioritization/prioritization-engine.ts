/**
 * Pure Mathematical Engine for Tri-Vector Curriculum Scoring & Confidence Gating
 *
 * Implements:
 * 1. Exam Priority Score (0-100)
 * 2. Foundation Score (0-100)
 * 3. Study Efficiency Score (0-100)
 * 4. Two-Layer Badge Attribution
 * 5. Evidence Sufficiency / Confidence Assessment
 */

import type {
  ActionAnchor,
  EvidenceBadge,
  ExamTaxonomy,
  PYQItem,
  PrioritizedSubtopic,
  SubtopicNode,
  SyllabusUnit,
  TriVectorMetrics,
  TriVectorScore,
} from "./prioritization-types";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}

/**
 * Computes downstream transitive dependents for each subtopic in a DAG.
 * Returns a map of subtopicId -> array of { dependentId, distance }.
 */
export function buildDependencyGraph(units: SyllabusUnit[]): Map<string, Array<{ id: string; distance: number }>> {
  const downstreamMap = new Map<string, Array<{ id: string; distance: number }>>();
  const allSubtopics = new Map<string, SubtopicNode>();

  // Index all subtopics
  for (const unit of units) {
    for (const sub of unit.subtopics) {
      allSubtopics.set(sub.id, sub);
      downstreamMap.set(sub.id, []);
    }
  }

  // Build direct forward edges (prerequisite -> dependent)
  const directDependents = new Map<string, string[]>();
  for (const [subId, sub] of allSubtopics.entries()) {
    for (const prereqId of sub.prerequisites) {
      if (!directDependents.has(prereqId)) {
        directDependents.set(prereqId, []);
      }
      directDependents.get(prereqId)!.push(subId);
    }
  }

  // Compute transitive closure with breadth-first search to find shortest distance
  for (const rootId of allSubtopics.keys()) {
    const visited = new Map<string, number>();
    const queue: Array<{ id: string; dist: number }> = [{ id: rootId, dist: 0 }];

    while (queue.length > 0) {
      const { id: currentId, dist } = queue.shift()!;
      const children = directDependents.get(currentId) || [];

      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.set(childId, dist + 1);
          queue.push({ id: childId, dist: dist + 1 });
        }
      }
    }

    const dependentsList: Array<{ id: string; distance: number }> = [];
    for (const [depId, distance] of visited.entries()) {
      dependentsList.push({ id: depId, distance });
    }
    downstreamMap.set(rootId, dependentsList);
  }

  return downstreamMap;
}

/**
 * Calculates the Exam Priority Score (0-100)
 */
export function calculateExamPriority(
  subtopic: SubtopicNode,
  unit: SyllabusUnit,
  taxonomy: ExamTaxonomy,
  subtopicPYQs: PYQItem[],
  totalAnalyzedPapers: number,
  currentYear: number = new Date().getFullYear()
): { score: number; metrics: Partial<TriVectorMetrics> } {
  // 1. Official Unit Weightage Component (0 - 100)
  // Normalized relative to the highest-weight unit in the exam
  const maxUnitMarks = Math.max(
    ...taxonomy.units.map((u) => u.officialMarks || 1),
    1
  );
  const normalizedOfficial = Math.min(100, (unit.officialMarks / maxUnitMarks) * 100);

  // If no PYQs exist (Cold-Start / New Syllabus)
  if (!subtopicPYQs || subtopicPYQs.length === 0) {
    return {
      score: clamp(normalizedOfficial * 0.75),
      metrics: {
        totalPYQs: 0,
        decayedMarks: 0,
        consistencyPct: 0,
        yearsCovered: 0,
        hasOfficialWeightage: unit.officialMarks > 0,
      },
    };
  }

  // 2. Recency-Decayed Marks Sum
  const lambda = 0.15;
  let decayedMarks = 0;
  let totalRawMarks = 0;
  const distinctYears = new Set<number>();

  for (const q of subtopicPYQs) {
    const yearDiff = Math.max(0, currentYear - (q.year || currentYear));
    const recencyFactor = Math.max(0.35, Math.exp(-lambda * yearDiff));
    const questionMarks = q.marks > 0 ? q.marks : 1;

    decayedMarks += questionMarks * recencyFactor;
    totalRawMarks += questionMarks;
    distinctYears.add(q.year);
  }

  // Scale decayed marks to 0-100 (in state exams, 8+ decayed marks in a subtopic is an anchor)
  const normalizedDecayed = Math.min(100, (decayedMarks / 8.0) * 100);

  // 3. Cross-Paper Consistency Percentage
  const numPapers = Math.max(1, totalAnalyzedPapers, distinctYears.size);
  const consistencyPct = (distinctYears.size / numPapers) * 100;

  // Composite Exam Priority Formula (Official weight + Empirical PYQ + Consistency)
  const examScore = clamp(
    0.35 * normalizedOfficial +
    0.40 * normalizedDecayed +
    0.25 * consistencyPct
  );

  return {
    score: examScore,
    metrics: {
      totalPYQs: subtopicPYQs.length,
      decayedMarks: Math.round(decayedMarks * 10) / 10,
      consistencyPct: Math.round(consistencyPct),
      yearsCovered: distinctYears.size,
      hasOfficialWeightage: unit.officialMarks > 0,
    },
  };
}

/**
 * Calculates Foundation Score (0-100) based on downstream DAG enablement
 */
export function calculateFoundationScore(
  subtopicId: string,
  downstreamMap: Map<string, Array<{ id: string; distance: number }>>,
  examPriorityMap: Map<string, number>,
  totalSubtopicsCount: number
): { score: number; downstreamMarks: number } {
  const dependents = downstreamMap.get(subtopicId) || [];

  if (dependents.length === 0) {
    return { score: 12, downstreamMarks: 0 }; // Baseline self-contained leaf node
  }

  // 1. Direct Out-degree Centrality (0 - 100)
  const directCount = dependents.filter((d) => d.distance === 1).length;
  const outDegreeScore = Math.min(100, directCount * 35); // 1 direct dep = 35, 2 deps = 70, 3+ = 100

  // 2. Cumulative Downstream Exam Value Discounted by Distance
  let downstreamMarks = 0;
  for (const dep of dependents) {
    const depExamScore = examPriorityMap.get(dep.id) || 50;
    downstreamMarks += depExamScore / dep.distance;
  }

  const downstreamMarksScore = Math.min(100, (downstreamMarks / 80) * 100);

  const foundationScore = clamp(0.40 * outDegreeScore + 0.60 * downstreamMarksScore);

  return {
    score: foundationScore,
    downstreamMarks: Math.round(downstreamMarks * 10) / 10,
  };
}

/**
 * Calculates Study Efficiency Score (0-100)
 */
export function calculateStudyEfficiency(
  examScore: number,
  foundationScore: number,
  cognitiveFriction: number
): number {
  // Safe friction bounds (1.0 to 5.0, default 2.5)
  const friction = Math.max(1.0, Math.min(5.0, cognitiveFriction || 2.5));

  // Effective payoff considers direct exam yield plus foundational leverage
  const effectivePayoff = Math.max(examScore, 0.65 * foundationScore);

  // Normalization relative to baseline friction 2.5
  const normalizedFriction = friction / 2.5;

  return clamp((effectivePayoff / normalizedFriction));
}

/**
 * Calculates Evidence Sufficiency (Confidence Level: high, moderate, speculative)
 */
export function calculateConfidence(
  yearsCovered: number,
  totalPYQs: number,
  hasOfficialWeightage: boolean
): { level: "high" | "moderate" | "speculative"; score: number } {
  const yearsScore = Math.min(1.0, yearsCovered / 5);
  const pyqScore = Math.min(1.0, totalPYQs / 10);
  const weightScore = hasOfficialWeightage ? 1.0 : 0.0;

  const confidenceScore = 0.45 * yearsScore + 0.35 * pyqScore + 0.20 * weightScore;

  let level: "high" | "moderate" | "speculative" = "speculative";
  if (confidenceScore >= 0.70) {
    level = "high";
  } else if (confidenceScore >= 0.38) {
    level = "moderate";
  }

  return {
    level,
    score: Math.round(confidenceScore * 100) / 100,
  };
}

/**
 * Assigns Primary Action Anchor based on absolute thresholds
 */
export function assignActionAnchor(compositeScore: number): ActionAnchor {
  if (compositeScore >= 85) return "Must Study";
  if (compositeScore >= 70) return "High Priority";
  if (compositeScore >= 55) return "Important";
  if (compositeScore >= 40) return "Moderate";
  return "Lower";
}

/**
 * Determines Secondary Orthogonal Evidence Badges
 */
export function determineEvidenceBadges(
  subtopic: SubtopicNode,
  unit: SyllabusUnit,
  score: {
    examPriorityScore: number;
    foundationScore: number;
    studyEfficiencyScore: number;
    metrics: TriVectorMetrics;
  }
): EvidenceBadge[] {
  const badges: EvidenceBadge[] = [];

  // Core Foundation
  if (score.foundationScore >= 75) {
    badges.push("Core Foundation");
  }

  // Frequent Anchor
  if (score.metrics.consistencyPct >= 75 && score.metrics.totalPYQs >= 4) {
    badges.push("Frequent Anchor");
  }

  // High Marks
  if (unit.officialMarks >= 30 || (score.metrics.totalPYQs > 0 && score.metrics.decayedMarks / score.metrics.totalPYQs >= 3.5)) {
    badges.push("High Marks");
  }

  // Rising Trend
  if (score.metrics.yearsCovered >= 2 && score.metrics.totalPYQs >= 3) {
    // If recent paper concentration is significant
    badges.push("Rising Trend");
  }

  // Low Return
  if (score.studyEfficiencyScore <= 38 && subtopic.cognitiveFriction >= 3.5) {
    badges.push("Low Return");
  }

  // New Syllabus (Cold start)
  if (score.metrics.totalPYQs === 0) {
    badges.push("New Syllabus");
  }

  return badges;
}

/**
 * Main Scoring Engine: Prioritizes an entire syllabus taxonomy against PYQ evidence
 */
export function prioritizeTaxonomy(
  taxonomy: ExamTaxonomy,
  pyqItems: PYQItem[],
  totalAnalyzedPapers = 5
): PrioritizedSubtopic[] {
  const downstreamMap = buildDependencyGraph(taxonomy.units);
  const totalSubtopicsCount = taxonomy.units.reduce((acc, u) => acc + u.subtopics.length, 0);

  // Group PYQs by subtopicId
  const pyqBySubtopic = new Map<string, PYQItem[]>();
  for (const pyq of pyqItems) {
    if (!pyqBySubtopic.has(pyq.subtopicId)) {
      pyqBySubtopic.set(pyq.subtopicId, []);
    }
    pyqBySubtopic.get(pyq.subtopicId)!.push(pyq);
  }

  // Pass 1: Calculate preliminary Exam Priority Scores
  const examScoreMap = new Map<string, number>();
  const preliminaryMetrics = new Map<string, Partial<TriVectorMetrics>>();

  for (const unit of taxonomy.units) {
    for (const sub of unit.subtopics) {
      const qList = pyqBySubtopic.get(sub.id) || [];
      const { score, metrics } = calculateExamPriority(sub, unit, taxonomy, qList, totalAnalyzedPapers);
      examScoreMap.set(sub.id, score);
      preliminaryMetrics.set(sub.id, metrics);
    }
  }

  // Pass 2: Calculate Foundation & Efficiency Scores, Composite, and Badges
  const prioritizedList: PrioritizedSubtopic[] = [];

  for (const unit of taxonomy.units) {
    for (const sub of unit.subtopics) {
      const examScore = examScoreMap.get(sub.id) || 40;
      const metricsPartial = preliminaryMetrics.get(sub.id)!;

      const { score: foundationScore, downstreamMarks } = calculateFoundationScore(
        sub.id,
        downstreamMap,
        examScoreMap,
        totalSubtopicsCount
      );

      const studyEfficiencyScore = calculateStudyEfficiency(examScore, foundationScore, sub.cognitiveFriction);

      // Composite Decision Score
      // Core principle: A topic is prioritized if it has high direct exam value OR high foundational importance
      const basePriority = Math.max(examScore, 0.85 * foundationScore);
      // Efficiency provides an uplift or minor penalty (0.90 to 1.10)
      const efficiencyMultiplier = 0.90 + 0.20 * (studyEfficiencyScore / 100);
      const compositeScore = clamp(basePriority * efficiencyMultiplier);

      const fullMetrics: TriVectorMetrics = {
        totalPYQs: metricsPartial.totalPYQs || 0,
        decayedMarks: metricsPartial.decayedMarks || 0,
        consistencyPct: metricsPartial.consistencyPct || 0,
        downstreamMarks,
        transitivePrereqCount: sub.prerequisites.length,
        yearsCovered: metricsPartial.yearsCovered || 0,
        hasOfficialWeightage: unit.officialMarks > 0,
      };

      const confidence = calculateConfidence(
        fullMetrics.yearsCovered,
        fullMetrics.totalPYQs,
        fullMetrics.hasOfficialWeightage
      );

      const actionAnchor = assignActionAnchor(compositeScore);

      const scoreObj: TriVectorScore = {
        examPriorityScore: examScore,
        foundationScore,
        studyEfficiencyScore,
        compositeScore,
        actionAnchor,
        evidenceBadges: [],
        confidence: confidence.level,
        confidenceScore: confidence.score,
        metrics: fullMetrics,
      };

      scoreObj.evidenceBadges = determineEvidenceBadges(sub, unit, scoreObj);

      prioritizedList.push({
        subtopic: sub,
        unit: {
          id: unit.id,
          unitNumber: unit.unitNumber,
          title: unit.title,
          paper: unit.paper,
          officialMarks: unit.officialMarks,
        },
        score: scoreObj,
      });
    }
  }

  // Sort by composite score descending (highest priority first)
  return prioritizedList.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
}

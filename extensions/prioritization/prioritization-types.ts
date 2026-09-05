/**
 * Core Types & Schemas for the Intelligent Syllabus & PYQ Prioritization System
 */

export type ConfidenceLevel = "high" | "moderate" | "speculative";

export type ActionAnchor =
  | "Must Study"
  | "High Priority"
  | "Important"
  | "Moderate"
  | "Lower";

export type EvidenceBadge =
  | "Core Foundation"
  | "Frequent Anchor"
  | "Rising Trend"
  | "High Marks"
  | "Low Return"
  | "New Syllabus";

export type MasteryStatus = "mastered" | "in-progress" | "pending" | "needs-revision";

export interface SubtopicNode {
  id: string;                          // e.g. "mudal-p2-u2-normalization"
  title: string;                       // e.g. "Normalization (1NF, 2NF, 3NF, BCNF)"
  syllabusScope?: string;              // Descriptive text from syllabus
  officialMarks?: number;              // Subtopic-specific weight if declared
  prerequisites: string[];             // SubtopicNode IDs required before this
  notePath?: string;                   // Relative vault note path if already generated
  masteryStatus: MasteryStatus;
  cognitiveFriction: number;           // Scale 1.0 (intuitive/compact) to 5.0 (vast/abstract)
}

export interface SyllabusUnit {
  id: string;                          // e.g. "mudal-p2-unit-2"
  unitNumber: number;                  // e.g. 2
  title: string;                       // e.g. "Database Management System"
  paper: string;                       // e.g. "Technical Paper II"
  officialMarks: number;               // e.g. 35
  subtopics: SubtopicNode[];
}

export interface ExamTaxonomy {
  examId: string;                      // e.g. "MUDAL-System-Manager", "SAS-I"
  examTitle: string;                   // e.g. "MUDAL System Manager Examination"
  totalMarks: number;                  // e.g. 200
  vaultRelativeDir: string;            // e.g. "MUDAL-System-Manager"
  units: SyllabusUnit[];
  metadata?: Record<string, unknown>;
}

export interface PYQItem {
  id: string;                          // e.g. "MUDAL-2024-Q12"
  sourceCode?: string;                 // e.g. "MPSC-SM-2024-012"
  examId: string;                      // e.g. "MUDAL-System-Manager"
  paperName: string;                   // e.g. "Technical Paper II"
  year: number;                        // e.g. 2024
  marks: number;                       // e.g. 1 (MCQ) or 5 (Descriptive)
  unitId: string;                      // e.g. "mudal-p2-unit-2"
  subtopicId: string;                  // e.g. "mudal-p2-u2-normalization"
  questionText: string;
  options?: { key: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
}

export interface TriVectorMetrics {
  totalPYQs: number;
  decayedMarks: number;
  consistencyPct: number;              // 0 - 100 (% of analyzed papers containing this topic)
  downstreamMarks: number;             // Sum of exam marks in topics dependent on this
  transitivePrereqCount: number;       // Number of upstream prerequisites
  yearsCovered: number;                // Distinct exam years analyzed
  hasOfficialWeightage: boolean;
}

export interface TriVectorScore {
  examPriorityScore: number;           // 0 - 100
  foundationScore: number;             // 0 - 100
  studyEfficiencyScore: number;        // 0 - 100
  compositeScore: number;              // 0 - 100 (for primary anchor assignment)
  actionAnchor: ActionAnchor;
  evidenceBadges: EvidenceBadge[];
  confidence: ConfidenceLevel;
  confidenceScore: number;             // 0.0 - 1.0
  metrics: TriVectorMetrics;
}

export interface PrioritizedSubtopic {
  subtopic: SubtopicNode;
  unit: {
    id: string;
    unitNumber: number;
    title: string;
    paper: string;
    officialMarks: number;
  };
  score: TriVectorScore;
}

export interface PrioritizationSessionState {
  activeSessionId: string;
  examId: string;
  topic: string;
  subtopic?: string;
  notePath: string;
  assetsDir: string;
  startedAt: string;
  lastAccessedAt: string;
  history?: Array<{
    examId: string;
    topic: string;
    subtopic?: string;
    notePath: string;
    accessedAt: string;
  }>;
}

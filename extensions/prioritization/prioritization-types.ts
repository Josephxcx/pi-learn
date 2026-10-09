/** Public data contracts. Missing evidence is undefined, never an invented default. */
export type ConfidenceLevel = "high" | "moderate" | "speculative";
export type ActionAnchor = "Must Study" | "High Priority" | "Important" | "Moderate" | "Lower";
/** Historical labels remain accepted for compatibility; unsupported claims are never emitted. */
export type EvidenceBadge = "Core Foundation" | "Frequent Anchor" | "Rising Trend" | "High Marks" | "Low Return" | "New Syllabus" | "No Mapped PYQs";
export type MasteryStatus = "mastered" | "in-progress" | "pending" | "needs-revision";
export interface ImportDiagnostic { code: string; message: string; source?: string; questionId?: string; }
export interface SourceProvenance { sourcePath?: string; sourceUrl?: string; sourceLabel?: string; questionNumber?: string; }
export interface ExamProfile {
  post?: string;
  authority?: string;
  group?: string;
  gazettedStatus?: "gazetted" | "non-gazetted" | "unknown";
  recruitmentRoute?: string;
  syllabusVersion?: string;
  difficultyGuidance?: string;
  papers?: Array<{ id: string; title: string; marks?: number; difficultyGuidance?: string }>;
}
export interface SubtopicNode {
  id: string;
  title: string;
  syllabusScope?: string;
  officialMarks?: number;
  prerequisites: string[];
  notePath?: string;
  masteryStatus: MasteryStatus;
  /** User-supplied estimate, 1–5. Not inferred from recruitment group or job title. */
  cognitiveFriction?: number;
}
export interface SyllabusUnit {
  id: string;
  unitNumber: number;
  title: string;
  paper: string;
  officialMarks?: number;
  subtopics: SubtopicNode[];
}
export interface ExamTaxonomy {
  schemaVersion?: 1;
  examId: string;
  examTitle: string;
  totalMarks?: number;
  vaultRelativeDir: string;
  profile?: ExamProfile;
  units: SyllabusUnit[];
  provenance?: SourceProvenance;
  diagnostics?: ImportDiagnostic[];
  metadata?: Record<string, unknown>;
}
export interface AnalyzedPaper {
  id: string;
  paperName: string;
  year?: number;
  /** True only when this entire paper has been imported, including unmapped questions. */
  complete?: boolean;
  provenance?: SourceProvenance;
}
export interface PYQItem {
  id: string;
  sourceCode?: string;
  /** Canonical source question identity shared by duplicate scans or booklet copies. */
  sourceQuestionId?: string;
  examId: string;
  paperId?: string;
  paperName?: string;
  year?: number;
  marks?: number;
  unitId?: string;
  subtopicId?: string;
  mappingStatus?: "explicit" | "inferred" | "ambiguous" | "unmatched";
  candidateSubtopicIds?: string[];
  questionText: string;
  provenance?: SourceProvenance;
  options?: { key: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
}
export interface PYQDataset {
  schemaVersion: 1;
  examId: string;
  papers: AnalyzedPaper[];
  questions: PYQItem[];
  diagnostics: ImportDiagnostic[];
}
export interface TriVectorMetrics {
  totalPYQs: number;
  /** Sum only for questions with both known marks and year. */
  decayedMarks: number;
  consistencyPct: number;
  /** @deprecated Compatibility alias of downstreamPriorityValue; these are score points, NOT marks. */
  downstreamMarks: number;
  downstreamPriorityValue: number;
  transitivePrereqCount: number;
  yearsCovered: number;
  hasOfficialWeightage: boolean;
  analyzedPapers: number;
  papersWithTopic: number;
  knownYearQuestions: number;
  knownMarksQuestions: number;
  missingPaperIdentityQuestions: number;
  inferredMappingQuestions: number;
  evidenceLimitations: string[];
}
export interface TriVectorScore {
  examPriorityScore: number;
  foundationScore: number;
  /** Priority adjusted by a user-supplied friction estimate, never predicted marks/hour. */
  studyEfficiencyScore: number;
  compositeScore: number;
  actionAnchor: ActionAnchor;
  evidenceBadges: EvidenceBadge[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  metrics: TriVectorMetrics;
}
export interface PrioritizedSubtopic {
  subtopic: SubtopicNode;
  unit: Pick<SyllabusUnit, "id" | "unitNumber" | "title" | "paper" | "officialMarks">;
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
  history?: Array<{ examId: string; topic: string; subtopic?: string; notePath: string; accessedAt: string }>;
}

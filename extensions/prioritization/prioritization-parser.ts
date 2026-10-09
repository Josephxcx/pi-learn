/** Read-only imports for explicit JSON evidence and the two historical Markdown layouts. */
import fs from "node:fs";
import path from "node:path";
import type { ExamTaxonomy, PYQDataset, PYQItem, SyllabusUnit, ImportDiagnostic } from "./prioritization-types.ts";
import { validateExamTaxonomy, validatePYQDataset, deduplicateQuestions } from "./prioritization-validation.ts";

function cleanTitle(value: string): string { return value.replace(/\*\*/g, "").replace(/^\d+[.)]\s*/, "").trim(); }
function sanitizeId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function wikiDisplay(value: string): string { return value.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => inner.split("|").at(-1) ?? inner); }
function declaredTotal(content: string): number | undefined {
  const match = content.match(/\b(?:exam\s+)?total\s*(?:marks)?\s*[:=–-]\s*(\d+)\b/i);
  return match?.[1] ? Number(match[1]) : undefined;
}
function parseJson(content: string, source: string): unknown {
  try { return JSON.parse(content) as unknown; } catch (error) { throw new Error(`${source}: invalid JSON (${error instanceof Error ? error.message : String(error)})`); }
}
export function parseExamTaxonomyJson(content: string, source = "taxonomy JSON"): ExamTaxonomy {
  try {
    const result = validateExamTaxonomy(parseJson(content, source));
    result.provenance = { ...result.provenance, sourcePath: result.provenance?.sourcePath ?? source };
    return result;
  } catch (error) { throw new Error(`${source}: ${error instanceof Error ? error.message : String(error)}`); }
}
export function loadExamTaxonomyJson(filePath: string): ExamTaxonomy { return parseExamTaxonomyJson(fs.readFileSync(filePath, "utf8"), filePath); }
export function parsePYQDatasetJson(content: string, taxonomy: ExamTaxonomy, source = "PYQ JSON"): PYQDataset {
  try {
    const dataset = validatePYQDataset(parseJson(content, source), taxonomy);
    for (const q of dataset.questions) q.provenance = { ...q.provenance, sourcePath: q.provenance?.sourcePath ?? source };
    return dataset;
  } catch (error) { throw new Error(`${source}: ${error instanceof Error ? error.message : String(error)}`); }
}
export function loadPYQDatasetJson(filePath: string, taxonomy: ExamTaxonomy): PYQDataset { return parsePYQDatasetJson(fs.readFileSync(filePath, "utf8"), taxonomy, filePath); }

/** Split table cells without treating wiki aliases, escaped pipes or inline code as delimiters. */
function tableCells(line: string): string[] {
  const cells: string[] = []; let cell = "", inWiki = false, inCode = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === "\\" && line[i + 1] === "|") { cell += "|"; i++; continue; }
    if (line.slice(i, i + 2) === "[[") inWiki = true;
    if (line.slice(i, i + 2) === "]]") inWiki = false;
    if (char === "`" && !inWiki) inCode = !inCode;
    if (char === "|" && !inWiki && !inCode) { cells.push(cell.trim()); cell = ""; } else cell += char;
  }
  cells.push(cell.trim());
  if (line.startsWith("|")) cells.shift();
  if (line.endsWith("|")) cells.pop();
  return cells;
}

export function parseMudalMasterIndex(content: string, vaultRelativeDir = "MUDAL-System-Manager"): ExamTaxonomy {
  const units: SyllabusUnit[] = [];
  let currentPaper = "Unknown paper", currentUnit: SyllabusUnit | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = wikiDisplay(rawLine.trim());
    const paper = line.match(/\bTechnical\s+Paper\s*[-–—]?\s*(II|I)\b/i);
    if (/^#{1,6}\s/.test(line) && paper) { currentPaper = `Technical Paper ${paper[1]!.toUpperCase()}`; currentUnit = undefined; }
    else if (/^#{1,6}\s/.test(line) && /\bGeneral English\b/i.test(line)) { currentPaper = "General English"; currentUnit = undefined; }
    const match = line.match(/^#{3,6}\s+Unit\s+([IVXLCDM\d]+)\s*[-–—:]\s*(.+?)(?:\s*\((\d+)\s*Marks?\))?\s*$/i);
    if (match) {
      currentUnit = { id: `mudal-${sanitizeId(currentPaper)}-unit-${match[1]!.toLowerCase()}`, unitNumber: units.length + 1, title: cleanTitle(match[2]!), paper: currentPaper, officialMarks: match[3] === undefined ? undefined : Number(match[3]), subtopics: [] };
      units.push(currentUnit); continue;
    }
    const sub = line.match(/^[*-]\s*\[([ xX])\]\s*\*\*([^*]+)\*\*(.*)/);
    if (sub && currentUnit) {
      const title = cleanTitle(sub[2]!);
      currentUnit.subtopics.push({ id: `${currentUnit.id}-${sanitizeId(title)}`, title, syllabusScope: sub[3]!.replace(/^[\s(]+|[\s)]+$/g, ""), prerequisites: [], masteryStatus: sub[1]!.toLowerCase() === "x" ? "mastered" : "pending" });
    }
  }
  return { examId: "MUDAL-System-Manager", examTitle: "MUDAL System Manager Examination", totalMarks: declaredTotal(content), vaultRelativeDir, units, diagnostics: [{ code: "legacy-import", message: "Legacy Markdown import: checklist statuses are recorded claims; prerequisites and cognitive friction were not inferred. Verify syllabus currency and declared marks." }] };
}

export function parseSasMasterDashboard(content: string, vaultRelativeDir = "SAS-I"): ExamTaxonomy {
  const units: SyllabusUnit[] = [];
  let currentPaper = "Unknown paper", currentUnit: SyllabusUnit | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim(), heading = wikiDisplay(line);
    const paper = heading.match(/\bPaper\s*[-–—]?\s*(IV|III)\b/i);
    if (/^#{1,6}\s/.test(heading) && paper) { currentPaper = paper[1]!.toUpperCase() === "III" ? "Paper III: Technical Part A" : "Paper IV: Technical Part B"; currentUnit = undefined; }
    const match = heading.match(/^###\s*\d+\.\s*(.+?)(?:\s*\((\d+)\s*Marks?\))?\s*$/i);
    if (match) {
      const title = cleanTitle(match[1]!.replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}]/gu, ""));
      currentUnit = { id: `sas-${sanitizeId(currentPaper)}-unit-${sanitizeId(title)}`, unitNumber: units.length + 1, title, paper: currentPaper, officialMarks: match[2] === undefined ? undefined : Number(match[2]), subtopics: [] };
      units.push(currentUnit); continue;
    }
    if (!currentUnit || !line.startsWith("|")) continue;
    const parts = tableCells(line);
    if (parts.length < 4 || parts.every(p => /^:?-{3,}:?$/.test(p)) || /^(module|topic|subtopic)$/i.test(cleanTitle(parts[0]!))) continue;
    const title = cleanTitle(parts[0]!), note = parts[3]!.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/)?.[1], status = parts[4] ?? "";
    if (!title) continue;
    currentUnit.subtopics.push({ id: `${currentUnit.id}-${sanitizeId(title)}`, title, syllabusScope: parts[1]!, notePath: note, prerequisites: [], masteryStatus: /^mastered$/i.test(status.trim()) || status.includes("✅") ? "mastered" : "pending" });
  }
  return { examId: "SAS-I", examTitle: "Subordinate Agriculture Service - Grade I (SAS-I)", totalMarks: declaredTotal(content), vaultRelativeDir, units, diagnostics: [{ code: "legacy-import", message: "Legacy table PYQ counts are not question records or official subtopic marks. No marks, dependencies or difficulty were inferred from them." }] };
}

/** Legacy keyword mappings are suggestions: ambiguous or unmatched questions remain unassigned. */
export function parseMudalPYQs(pyqDir: string, taxonomy: ExamTaxonomy): PYQItem[] {
  if (!fs.existsSync(pyqDir)) return [];
  const result: PYQItem[] = [];
  for (const entry of fs.readdirSync(pyqDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = fs.readFileSync(path.join(pyqDir, entry.name), "utf8");
    const blocks = [...content.matchAll(/^###\s*Q(\d+)\.\s*([^\n]*)([\s\S]*?)(?=^###\s*Q\d+\.|$(?![\s\S]))/gm)];
    const paperNumber = entry.name.match(/Paper[_\s-]*(II|I)\b/i)?.[1]?.toUpperCase();
    const units = paperNumber ? taxonomy.units.filter(u => new RegExp(`\\bPaper\\s*[-–]?\\s*${paperNumber}\\b`, "i").test(u.paper)) : taxonomy.units;
    for (const block of blocks) {
      const questionText = block[2]!.trim(); if (!questionText) continue;
      const body = block[3]!, sourceCode = body.match(/\*\*Source:\*\*\s*`?([^`\n]+)`?/)?.[1]?.trim();
      const yearMatch = sourceCode?.match(/\b((?:19|20)\d{2})\b/), marksMatch = body.match(/\*\*Marks:\*\*\s*(\d+(?:\.\d+)?)\b/);
      const normalizedQuestion = questionText.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
      const candidates = units.flatMap(unit => unit.subtopics.filter(sub => {
        const tokens = sub.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(t => t.length > 2 && !["the", "and", "with", "for", "introduction", "basics"].includes(t));
        return tokens.length > 0 && tokens.every(token => normalizedQuestion.split(/\s+/).includes(token));
      }).map(sub => ({ unit, sub })));
      const selected = candidates.length === 1 ? candidates[0] : undefined;
      result.push({ id: `legacy:${entry.name}:Q${block[1]}`, examId: taxonomy.examId, sourceCode, paperName: paperNumber ? `Technical Paper ${paperNumber}` : undefined, year: yearMatch ? Number(yearMatch[1]) : undefined, marks: marksMatch ? Number(marksMatch[1]) : undefined, unitId: selected?.unit.id, subtopicId: selected?.sub.id, mappingStatus: selected ? "inferred" : candidates.length ? "ambiguous" : "unmatched", candidateSubtopicIds: candidates.map(c => c.sub.id), questionText, provenance: { sourcePath: path.join(pyqDir, entry.name), sourceLabel: sourceCode, questionNumber: block[1]! } });
    }
  }
  return deduplicateQuestions(result);
}

/** Discover conventional JSON profiles first; never silently choose between multiple exams. */
export function resolveActiveExamTaxonomy(vaultPath: string, preferredExamId?: string): ExamTaxonomy | null {
  if (!fs.existsSync(vaultPath)) return null;
  if (preferredExamId && (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(preferredExamId) || preferredExamId.includes(".."))) throw new Error("examId must be a simple identifier without path traversal");
  const candidates: Array<{ id: string; file: string; kind: "json" | "mudal" | "sas" }> = [];
  for (const entry of fs.readdirSync(vaultPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(vaultPath, entry.name, "exam.json");
    if (fs.existsSync(file)) candidates.push({ id: entry.name, file, kind: "json" });
  }
  for (const [id, fileName, kind] of [["MUDAL-System-Manager", "00_Master_Index.md", "mudal"], ["SAS-I", "00 - Syllabus & Mastery Dashboard.md", "sas"]] as const) {
    const file = path.join(vaultPath, id, fileName);
    if (!candidates.some(c => c.id === id) && fs.existsSync(file)) candidates.push({ id, file, kind });
  }
  const selected = preferredExamId ? candidates.filter(c => c.id.toLowerCase() === preferredExamId.toLowerCase()) : candidates;
  if (selected.length > 1) throw new Error(`Multiple exam profiles available (${selected.map(c => c.id).join(", ")}); select an exact examId.`);
  const chosen = selected[0]; if (!chosen) return null;
  if (chosen.kind === "json") {
    const result = loadExamTaxonomyJson(chosen.file);
    if (result.examId !== chosen.id) throw new Error(`${chosen.file}: examId ${result.examId} must match its containing directory ${chosen.id}`);
    return result;
  }
  const result = chosen.kind === "mudal" ? parseMudalMasterIndex(fs.readFileSync(chosen.file, "utf8"), chosen.id) : parseSasMasterDashboard(fs.readFileSync(chosen.file, "utf8"), chosen.id);
  result.provenance = { sourcePath: chosen.file };
  return result;
}

export function summarizeImportDiagnostics(diagnostics: ImportDiagnostic[]): string { return diagnostics.map(d => d.message).join("\n"); }

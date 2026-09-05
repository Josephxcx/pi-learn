/**
 * Non-destructive Syllabus Taxonomy & PYQ Ingestion Engine
 *
 * Reads:
 * 1. MUDAL System Manager (00_Master_Index.md & Work/mpsc_system_manager_pyqs/)
 * 2. SAS-I Agriculture (00 - Syllabus & Mastery Dashboard.md & Work/sas-taxonomy/)
 * 3. Generic/Custom Syllabus files in Obsidian Vault
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExamTaxonomy, PYQItem, SubtopicNode, SyllabusUnit } from "./prioritization-types";

function cleanTitle(str: string): string {
  return str.replace(/^\d+[\.\)]\s*/, "").replace(/\*\*/g, "").replace(/\(.*?\)/g, "").trim();
}

function sanitizeId(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Parses MUDAL System Manager from 00_Master_Index.md
 */
export function parseMudalMasterIndex(content: string, vaultRelativeDir = "MUDAL-System-Manager"): ExamTaxonomy {
  const units: SyllabusUnit[] = [];
  const lines = content.split("\n");

  let currentPaper = "Technical Paper II";
  let currentUnit: SyllabusUnit | null = null;
  let unitCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check paper headers
    if (line.includes("Technical Paper – I") || line.includes("Technical Paper I")) {
      currentPaper = "Technical Paper I";
    } else if (line.includes("Technical Paper – II") || line.includes("Technical Paper II")) {
      currentPaper = "Technical Paper II";
    } else if (line.includes("General English")) {
      currentPaper = "General English";
    }

    // Check Unit headers: e.g. #### [[Technical-Paper-II/Unit_II_Database_Management_System|Unit II – Database Management System (35 Marks)]]
    // or #### Unit II – Database Management System (35 Marks)
    const unitMatch = line.match(/Unit\s+([IVXLCDM\d]+)\s*[\–\-:]\s*([^|\(\n]+)(?:\((\d+)\s*Marks?\))?/i);
    if (unitMatch && (line.startsWith("####") || line.startsWith("###"))) {
      const romanOrNum = unitMatch[1];
      const unitName = unitMatch[2].replace(/\]\]/g, "").trim();
      const declaredMarks = unitMatch[3] ? parseInt(unitMatch[3], 10) : 30;

      currentUnit = {
        id: `mudal-${sanitizeId(currentPaper)}-unit-${romanOrNum.toLowerCase()}`,
        unitNumber: unitCounter++,
        title: unitName,
        paper: currentPaper,
        officialMarks: declaredMarks,
        subtopics: [],
      };
      units.push(currentUnit);
      continue;
    }

    // Check Checklist Subtopics: e.g. * [x] **1. Introduction to Computing & Generations** (...)
    if (currentUnit && line.match(/^[\*\-]\s*\[([ xX])\]\s*\*\*([^\*]+)\*\*(.*)/)) {
      const match = line.match(/^[\*\-]\s*\[([ xX])\]\s*\*\*([^\*]+)\*\*(.*)/)!;
      const isChecked = match[1].toLowerCase() === "x";
      const rawTitle = match[2].trim();
      const scopeDesc = match[3].replace(/^[\s\(]+|[\s\)]+$/g, "").trim();

      const subId = `${currentUnit.id}-${sanitizeId(cleanTitle(rawTitle))}`;
      const title = cleanTitle(rawTitle);

      // Estimate cognitive friction based on domain complexity heuristics
      let cognitiveFriction = 2.2;
      const lower = title.toLowerCase() + " " + scopeDesc.toLowerCase();
      if (lower.includes("generations") || lower.includes("shortcuts") || lower.includes("introduction")) {
        cognitiveFriction = 1.3;
      } else if (lower.includes("scheduling") || lower.includes("deadlock") || lower.includes("normalization")) {
        cognitiveFriction = 2.6;
      } else if (lower.includes("b-tree") || lower.includes("cryptography") || lower.includes("subnetting") || lower.includes("kernel")) {
        cognitiveFriction = 3.8;
      }

      // Infer prerequisite relationships based on structural sequence
      const prerequisites: string[] = [];
      if (lower.includes("normalization") && currentUnit.subtopics.some(s => s.title.toLowerCase().includes("key"))) {
        const keySub = currentUnit.subtopics.find(s => s.title.toLowerCase().includes("key"));
        if (keySub) prerequisites.push(keySub.id);
      } else if (lower.includes("sql") && currentUnit.subtopics.some(s => s.title.toLowerCase().includes("key"))) {
        const keySub = currentUnit.subtopics.find(s => s.title.toLowerCase().includes("key"));
        if (keySub) prerequisites.push(keySub.id);
      }

      currentUnit.subtopics.push({
        id: subId,
        title,
        syllabusScope: scopeDesc,
        prerequisites,
        masteryStatus: isChecked ? "mastered" : "pending",
        cognitiveFriction,
      });
    }
  }

  return {
    examId: "MUDAL-System-Manager",
    examTitle: "MUDAL System Manager Examination",
    totalMarks: 400,
    vaultRelativeDir,
    units,
  };
}

/**
 * Parses SAS-I Agriculture Syllabus from 00 - Syllabus & Mastery Dashboard.md
 */
export function parseSasMasterDashboard(content: string, vaultRelativeDir = "SAS-I"): ExamTaxonomy {
  const units: SyllabusUnit[] = [];
  const lines = content.split("\n");

  let currentPaper = "Paper III: Technical Part A";
  let currentUnit: SyllabusUnit | null = null;
  let unitCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes("Paper - III") || line.includes("Paper III")) {
      currentPaper = "Paper III: Technical Part A";
    } else if (line.includes("Paper - IV") || line.includes("Paper IV")) {
      currentPaper = "Paper IV: Technical Part B";
    }

    // Unit match: e.g. ### 1.  Soil Science (40 Marks)
    const unitMatch = line.match(/###\s*\d+\.\s*[^\w]*([^\(\n]+)\((\d+)\s*Marks?\)/i);
    if (unitMatch) {
      const unitName = unitMatch[1].replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}]/gu, "").trim();
      const declaredMarks = parseInt(unitMatch[2], 10);

      currentUnit = {
        id: `sas-unit-${sanitizeId(unitName)}`,
        unitNumber: unitCounter++,
        title: unitName,
        paper: currentPaper,
        officialMarks: declaredMarks,
        subtopics: [],
      };
      units.push(currentUnit);
      continue;
    }

    // Markdown Table Row: | **01. Soil Fertility & Nutrient Management** | Scope | 20 | Note | Status |
    if (currentUnit && line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("module")) {
      const parts = line.split("|").map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 4) {
        const rawModule = parts[0];
        const scope = parts[1];
        const proxyPYQs = parseInt(parts[2], 10) || 0;
        const noteLink = parts[3];
        const statusCol = parts[4] || "";

        const title = cleanTitle(rawModule);
        const subId = `${currentUnit.id}-${sanitizeId(title)}`;
        const isMastered = statusCol.toLowerCase().includes("mastered") || statusCol.includes("✅");

        currentUnit.subtopics.push({
          id: subId,
          title,
          syllabusScope: scope,
          officialMarks: proxyPYQs > 0 ? Math.round(proxyPYQs * 1.5) : undefined,
          prerequisites: [],
          notePath: noteLink.includes("[[") ? noteLink.replace(/\[\[|\]\]/g, "").split("|")[0] : undefined,
          masteryStatus: isMastered ? "mastered" : "pending",
          cognitiveFriction: proxyPYQs > 10 ? 2.5 : 1.8,
        });
      }
    }
  }

  return {
    examId: "SAS-I",
    examTitle: "Subordinate Agriculture Service - Grade I (SAS-I)",
    totalMarks: 600,
    vaultRelativeDir,
    units,
  };
}

/**
 * Scans and parses question banks (e.g. Work/mpsc_system_manager_pyqs/)
 */
export function parseMudalPYQs(pyqDir: string, taxonomy: ExamTaxonomy): PYQItem[] {
  const pyqItems: PYQItem[] = [];
  if (!fs.existsSync(pyqDir)) return pyqItems;

  const files = fs.readdirSync(pyqDir).filter(f => f.endsWith(".md"));
  let qId = 1;

  for (const file of files) {
    const filePath = path.join(pyqDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    let currentUnitId = taxonomy.units[0]?.id || "mudal-default-unit";
    if (file.includes("Paper_II")) {
      currentUnitId = taxonomy.units.find(u => u.paper.includes("II") && u.title.toLowerCase().includes("database"))?.id || currentUnitId;
    }

    const questionBlocks = content.split(/###\s*Q\d+\./);
    for (let i = 1; i < questionBlocks.length; i++) {
      const block = questionBlocks[i];
      const qTextMatch = block.match(/^([^\n]+)/);
      if (!qTextMatch) continue;

      const qText = qTextMatch[1].trim();
      const sourceMatch = block.match(/\*\*Source:\*\*\s*`?([^`\n]+)`?/);
      const sourceStr = sourceMatch ? sourceMatch[1] : "MPSC CSE";

      let year = 2023;
      const yearMatch = sourceStr.match(/\b(20\d\d)\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }

      // Keyword matching to subtopics in this unit
      let matchedSubtopicId = "";
      const currentUnit = taxonomy.units.find(u => u.id === currentUnitId);
      if (currentUnit) {
        for (const sub of currentUnit.subtopics) {
          const keywords = sub.title.toLowerCase().split(/\s+/).filter(k => k.length > 3);
          if (keywords.some(k => qText.toLowerCase().includes(k))) {
            matchedSubtopicId = sub.id;
            break;
          }
        }
        if (!matchedSubtopicId && currentUnit.subtopics.length > 0) {
          matchedSubtopicId = currentUnit.subtopics[0].id;
        }
      }

      pyqItems.push({
        id: `pyq-mudal-${qId++}`,
        sourceCode: sourceStr,
        examId: taxonomy.examId,
        paperName: file,
        year,
        marks: 1,
        unitId: currentUnitId,
        subtopicId: matchedSubtopicId || "mudal-general",
        questionText: qText,
      });
    }
  }

  return pyqItems;
}

/**
 * Resolves the active exam taxonomy from the Obsidian Study Vault
 */
export function resolveActiveExamTaxonomy(vaultPath: string, preferredExamId?: string): ExamTaxonomy | null {
  // 1. If preferredExamId provided
  if (preferredExamId) {
    if (preferredExamId.toLowerCase().includes("mudal")) {
      const mudalIndex = path.join(vaultPath, "MUDAL-System-Manager", "00_Master_Index.md");
      if (fs.existsSync(mudalIndex)) {
        return parseMudalMasterIndex(fs.readFileSync(mudalIndex, "utf-8"), "MUDAL-System-Manager");
      }
    } else if (preferredExamId.toLowerCase().includes("sas")) {
      const sasIndex = path.join(vaultPath, "SAS-I", "00 - Syllabus & Mastery Dashboard.md");
      if (fs.existsSync(sasIndex)) {
        return parseSasMasterDashboard(fs.readFileSync(sasIndex, "utf-8"), "SAS-I");
      }
    }
  }

  // 2. Auto-detect from vault structure
  const mudalIndex = path.join(vaultPath, "MUDAL-System-Manager", "00_Master_Index.md");
  if (fs.existsSync(mudalIndex)) {
    return parseMudalMasterIndex(fs.readFileSync(mudalIndex, "utf-8"), "MUDAL-System-Manager");
  }

  const sasIndex = path.join(vaultPath, "SAS-I", "00 - Syllabus & Mastery Dashboard.md");
  if (fs.existsSync(sasIndex)) {
    return parseSasMasterDashboard(fs.readFileSync(sasIndex, "utf-8"), "SAS-I");
  }

  return null;
}

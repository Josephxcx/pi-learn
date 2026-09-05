import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { resolveActiveExamTaxonomy, parseMudalPYQs } from "./prioritization/prioritization-parser.ts";
import { prioritizeTaxonomy } from "./prioritization/prioritization-engine.ts";
import {
  renderSyllabusOverview,
  renderUnitSubtopicsDetail,
  renderSubtopicDossier,
} from "./prioritization/prioritization-presenter.ts";
import type { PrioritizationSessionState, PrioritizedSubtopic } from "./prioritization/prioritization-types.ts";

const FALLBACK_NOTES_DIR = path.join(os.homedir(), "Documents", "Vault", "Study");

function getObsidianVaultPath(): string {
  try {
    const configPath = path.join(os.homedir(), ".config", "obsidian", "obsidian.json");
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (data.vaults) {
        for (const key of Object.keys(data.vaults)) {
          const v = data.vaults[key];
          if (v.open && v.path && fs.existsSync(v.path)) {
            return v.path;
          }
        }
        for (const key of Object.keys(data.vaults)) {
          const v = data.vaults[key];
          if (v.path && fs.existsSync(v.path)) {
            return v.path;
          }
        }
      }
    }
  } catch {
    // Ignore and fallback
  }
  return FALLBACK_NOTES_DIR;
}
const SESSION_STATE_FILE = path.join(os.homedir(), ".pi", "agent", "learn-session.json");

function loadSessionState(): PrioritizationSessionState | null {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, "utf-8"));
      if (data && data.notePath && fs.existsSync(data.notePath)) {
        return data;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSessionState(state: PrioritizationSessionState): void {
  try {
    const dir = path.dirname(SESSION_STATE_FILE);
    ensureDirectory(dir);
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

let activeSessionState: PrioritizationSessionState | null = loadSessionState();
let activeNotePath: string | null = activeSessionState?.notePath || null;
let activeAssetsDir: string | null = activeSessionState?.assetsDir || null;

function resolveExamAssetsDir(vaultPath: string, targetFilePath: string): string {
  const rel = path.relative(vaultPath, targetFilePath);
  const segments = rel.split(path.sep);

  if (segments.length > 1) {
    const topFolder = segments[0]; // e.g. "MUDAL-System-Manager" or "SAS-I"
    const examAssets = path.join(vaultPath, topFolder, "assets");
    ensureDirectory(examAssets);
    return examAssets;
  }

  const defaultAssets = path.join(vaultPath, "assets");
  ensureDirectory(defaultAssets);
  return defaultAssets;
}

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Maps topic name keywords to hierarchical taxonomy folders
function resolveTopicSubfolder(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes("soil") || lower.includes("clay") || lower.includes("erosion") || lower.includes("fertility") || lower.includes("nutrient")) {
    return "SAS-I/Soil-Science";
  }
  if (lower.includes("weed") || lower.includes("agronomy") || lower.includes("tillage") || lower.includes("cropping") || lower.includes("meteorology")) {
    return "SAS-I/Agronomy";
  }
  if (lower.includes("breed") || lower.includes("genetic") || lower.includes("heterosis") || lower.includes("mendel")) {
    return "SAS-I/Plant-Breeding-Genetics";
  }
  if (lower.includes("pathology") || lower.includes("pest") || lower.includes("disease") || lower.includes("fungal") || lower.includes("bacterial") || lower.includes("insect") || lower.includes("entomology")) {
    return "SAS-I/Plant-Protection";
  }
  if (lower.includes("horticulture") || lower.includes("fruit") || lower.includes("vegetable") || lower.includes("post-harvest") || lower.includes("pomology")) {
    return "SAS-I/Horticulture";
  }
  if (lower.includes("seed")) {
    return "SAS-I/Seeds";
  }
  if (lower.includes("physio") || lower.includes("photosynthesis") || lower.includes("transpiration") || lower.includes("water relation")) {
    return "SAS-I/Crop-Physiology";
  }
  if (lower.includes("machinery") || lower.includes("power") || lower.includes("tillage implement") || lower.includes("tractor")) {
    return "SAS-I/Farm-Power-Machinery";
  }
  if (lower.includes("extension") || lower.includes("communication") || lower.includes("adoption")) {
    return "SAS-I/Agricultural-Extension";
  }
  if (lower.includes("economic") || lower.includes("farm management") || lower.includes("marketing")) {
    return "SAS-I/Agricultural-Economics";
  }
  if (lower.includes("mizo") || lower.includes("polity") || lower.includes("history") || lower.includes("geography") || lower.includes("ecology") || lower.includes("environment")) {
    return "General-Studies";
  }
  if (lower.includes("english") || lower.includes("grammar") || lower.includes("vocabulary")) {
    return "General-English";
  }
  return "SAS-I";
}

function ensureObsidianAssetConfig(vaultDir: string) {
  const obsidianDir = path.join(vaultDir, ".obsidian");
  ensureDirectory(obsidianDir);
  const appJsonPath = path.join(obsidianDir, "app.json");
  try {
    let appConfig: Record<string, any> = {};
    if (fs.existsSync(appJsonPath)) {
      appConfig = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    }
    appConfig.attachmentFolderPath = "assets";
    appConfig.livePreview = true;
    fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2), "utf-8");
  } catch {
    // best effort
  }
}

export default function mdLogExtension(pi: ExtensionAPI) {
  // Command: /md-log [topic]
  pi.registerCommand("md-log", {
    description: "Link or create a session markdown note inside the SAS-I subject taxonomy",
    handler: async (args, ctx) => {
      const vaultPath = getObsidianVaultPath();
      ensureDirectory(vaultPath);
      ensureObsidianAssetConfig(vaultPath);

      const topicStr = args && args.trim() !== "" ? args.trim() : "learning-session";
      const subFolder = resolveTopicSubfolder(topicStr);
      const targetDir = path.join(vaultPath, subFolder);
      ensureDirectory(targetDir);

      const filename = `${sanitizeFilename(topicStr)}.md`;
      const targetFile = path.join(targetDir, filename);

      activeNotePath = targetFile;
      if (!fs.existsSync(targetFile)) {
        const header = [
          "---",
          `title: "${topicStr}"`,
          `date: ${new Date().toISOString().slice(0, 10)}`,
          `subject: "SAS-I ${subFolder.replace("SAS-I/", "").replace(/-/g, " ")}"`,
          `tags: [learning, sas-1, ${sanitizeFilename(topicStr)}]`,
          "status: in-progress",
          "---",
          "",
          `# ${topicStr}`,
          "",
          `*Session initialized on ${new Date().toLocaleString()}*`,
          "",
          "---",
          "",
        ].join("\n");
        fs.writeFileSync(targetFile, header, "utf-8");
      }

      ctx.ui.notify(`Linked note in ${subFolder}: ${path.basename(targetFile)}`, "info");
    },
  });

  // Command: /md-view
  pi.registerCommand("md-view", {
    description: "Open the active note or Dashboard in Obsidian",
    handler: async (_args, ctx) => {
      const vaultPath = getObsidianVaultPath();
      const vaultName = path.basename(vaultPath);
      const targetPath = activeNotePath && fs.existsSync(activeNotePath)
        ? activeNotePath
        : path.join(vaultPath, "00 - Syllabus & Mastery Dashboard.md");

      const relFile = path.relative(vaultPath, targetPath);
      try {
        const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relFile)}`;
        execSync(`xdg-open "${obsidianUri}" >/dev/null 2>&1 || xdg-open "${targetPath}" >/dev/null 2>&1 &`);
        ctx.ui.notify(`Opened in Obsidian: ${relFile}`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Failed to open Obsidian: ${err.message}`, "error");
      }
    },
  });

  // Tool 1: init_learning_session
  pi.registerTool({
    name: "init_learning_session",
    label: "Init Learning Note",
    description:
      "Initialize an Obsidian Markdown note in its proper hierarchical subject folder (e.g. MUDAL-System-Manager/Technical-Paper-II/).",
    parameters: Type.Object({
      topic: Type.String({ description: "The subject or topic being learned." }),
      goal: Type.String({ description: "The learning objective / target understanding." }),
      customPath: Type.Optional(Type.String({ description: "Optional custom relative or absolute file path." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const vaultPath = getObsidianVaultPath();
      ensureDirectory(vaultPath);
      ensureObsidianAssetConfig(vaultPath);

      let filePath: string;
      let subFolder: string;
      let examId = "General";

      if (params.customPath) {
        filePath = path.isAbsolute(params.customPath)
          ? params.customPath
          : path.join(vaultPath, params.customPath);
        subFolder = path.relative(vaultPath, path.dirname(filePath));
        examId = subFolder.split(path.sep)[0] || "General";
      } else {
        // Dynamic Exam detection based on vault folders
        const mudalDir = path.join(vaultPath, "MUDAL-System-Manager");
        const isMudal = fs.existsSync(mudalDir) && (
          params.topic.toLowerCase().includes("mudal") ||
          params.topic.toLowerCase().includes("database") ||
          params.topic.toLowerCase().includes("network") ||
          params.topic.toLowerCase().includes("operating system")
        );

        if (isMudal) {
          examId = "MUDAL-System-Manager";
          subFolder = "MUDAL-System-Manager/Technical-Paper-II";
          const targetDir = path.join(vaultPath, subFolder);
          ensureDirectory(targetDir);
          filePath = path.join(targetDir, `${sanitizeFilename(params.topic)}.md`);
        } else {
          subFolder = resolveTopicSubfolder(params.topic);
          examId = subFolder.split(path.sep)[0] || "SAS-I";
          const targetDir = path.join(vaultPath, subFolder);
          ensureDirectory(targetDir);
          filePath = path.join(targetDir, `${sanitizeFilename(params.topic)}.md`);
        }
      }

      ensureDirectory(path.dirname(filePath));
      const assetsDir = resolveExamAssetsDir(vaultPath, filePath);

      activeNotePath = filePath;
      activeAssetsDir = assetsDir;

      activeSessionState = {
        activeSessionId: `sess-${Date.now()}`,
        examId,
        topic: params.topic,
        notePath: filePath,
        assetsDir,
        startedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
      saveSessionState(activeSessionState);

      const dateStr = new Date().toISOString().slice(0, 10);
      const cleanExamTitle = examId.replace(/-/g, " ");
      const content = [
        "---",
        `title: "${params.topic}"`,
        `date: ${dateStr}`,
        `exam: "${cleanExamTitle}"`,
        `subject: "${cleanExamTitle} - ${params.topic}"`,
        `goal: "${params.goal.replace(/"/g, "'")}"`,
        `tags: [learning, ai-tutor, ${sanitizeFilename(examId)}, ${sanitizeFilename(params.topic)}]`,
        "status: in-progress",
        "---",
        "",
        `# ${params.topic}`,
        "",
        `> **Goal:** ${params.goal}`,
        `> **Started:** ${new Date().toLocaleString()}`,
        `> **Location:** \`${path.relative(vaultPath, filePath)}\``,
        "",
        "---",
        "",
      ].join("\n");

      fs.writeFileSync(filePath, content, "utf-8");

      if (ctx.hasUI) {
        ctx.ui.notify(`Initialized note: ${path.relative(vaultPath, filePath)}`, "info");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              examId,
              notePath: filePath,
              relativeVaultPath: path.relative(vaultPath, filePath),
              vaultPath: vaultPath,
              assetsDir: assetsDir,
              message: `Initialized note at ${path.relative(vaultPath, filePath)}`,
            }),
          },
        ],
      };
    },
  });

  // Tool 2: update_learning_plan
  pi.registerTool({
    name: "update_learning_plan",
    label: "Update Learning Plan",
    description: "Write or update the learning roadmap and Mermaid DAG graph in the active markdown note.",
    parameters: Type.Object({
      mermaidDiagram: Type.String({ description: "The Mermaid flowchart DAG." }),
      planSummary: Type.String({ description: "Concise summary of the planned steps." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!activeNotePath) {
        const reloaded = loadSessionState();
        if (reloaded && reloaded.notePath && fs.existsSync(reloaded.notePath)) {
          activeNotePath = reloaded.notePath;
          activeAssetsDir = reloaded.assetsDir;
        }
      }

      if (!activeNotePath) {
        const vaultPath = getObsidianVaultPath();
        activeNotePath = path.join(vaultPath, "General", "active-learning-session.md");
        ensureDirectory(path.dirname(activeNotePath));
      }

      const planBlock = [
        "## 🗺️ Learning Roadmap & Dependency Graph",
        "",
        "```mermaid",
        params.mermaidDiagram.trim(),
        "```",
        "",
        params.planSummary.trim(),
        "",
        "---",
        "",
      ].join("\n");

      let currentContent = fs.existsSync(activeNotePath) ? fs.readFileSync(activeNotePath, "utf-8") : "";

      if (currentContent.includes("## 🗺️ Learning Roadmap & Dependency Graph")) {
        const regex = /## 🗺️ Learning Roadmap & Dependency Graph[\s\S]*?---\n/;
        currentContent = currentContent.replace(regex, planBlock);
      } else {
        currentContent += "\n" + planBlock;
      }

      fs.writeFileSync(activeNotePath, currentContent, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              notePath: activeNotePath,
              message: "Updated learning roadmap in note.",
            }),
          },
        ],
      };
    },
  });

  // Tool 3: append_lesson_node
  pi.registerTool({
    name: "append_lesson_node",
    label: "Append Lesson Node",
    description: "Append a structured lesson node with LaTeX, visual diagrams, and active recall results.",
    parameters: Type.Object({
      nodeTitle: Type.String({ description: "Title of the node / step." }),
      explanationMarkdown: Type.String({ description: "The conceptual explanation with LaTeX." }),
      diagramFilename: Type.Optional(Type.String({ description: "Filename of SVG diagram in assets/." })),
      activeRecallQuiz: Type.Optional(
        Type.Object({
          question: Type.String(),
          chosenAnswer: Type.String(),
          isCorrect: Type.Boolean(),
          keyTakeaway: Type.String(),
        })
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!activeNotePath) {
        const reloaded = loadSessionState();
        if (reloaded && reloaded.notePath && fs.existsSync(reloaded.notePath)) {
          activeNotePath = reloaded.notePath;
          activeAssetsDir = reloaded.assetsDir;
        }
      }

      if (!activeNotePath) {
        const vaultPath = getObsidianVaultPath();
        activeNotePath = path.join(vaultPath, "General", "active-learning-session.md");
        ensureDirectory(path.dirname(activeNotePath));
      }

      const sections = [`### 📌 ${params.nodeTitle}`, "", params.explanationMarkdown.trim(), ""];

      if (params.diagramFilename) {
        sections.push(
          `#### 🖼️ Visualization`,
          `![[assets/${params.diagramFilename}]]`,
          `*(Rendered from assets/${params.diagramFilename})*`,
          ""
        );
      }

      if (params.activeRecallQuiz) {
        const q = params.activeRecallQuiz;
        const icon = q.isCorrect ? "✅" : "💡";
        sections.push(
          `#### 🧪 Active Recall Check`,
          `> **Q:** ${q.question}`,
          `> **Your Answer:** ${q.chosenAnswer} ${icon}`,
          `> **Key Insight:** ${q.keyTakeaway}`,
          ""
        );
      }

      sections.push("---", "");
      fs.appendFileSync(activeNotePath, "\n" + sections.join("\n"), "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              notePath: activeNotePath,
              message: `Appended node "${params.nodeTitle}" to active note.`,
            }),
          },
        ],
      };
    },
  });

  // Tool 4: save_diagram_svg
  pi.registerTool({
    name: "save_diagram_svg",
    label: "Save SVG Diagram",
    description: "Save an SVG diagram to the active exam assets/ directory and generate a temporary PNG preview in /tmp.",
    parameters: Type.Object({
      filename: Type.String({ description: "Filename ending in .svg." }),
      svgContent: Type.String({ description: "Complete valid SVG source markup." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const vaultPath = getObsidianVaultPath();

      // Dynamically route to exam assets directory
      let assetsDir = activeAssetsDir;
      if (!assetsDir && activeNotePath) {
        assetsDir = resolveExamAssetsDir(vaultPath, activeNotePath);
      }
      if (!assetsDir) {
        assetsDir = path.join(vaultPath, "assets");
      }
      ensureDirectory(assetsDir);

      const previewDir = path.join(os.tmpdir(), "pi-diagram-previews");
      ensureDirectory(previewDir);

      const cleanFilename = path.basename(params.filename);
      const svgPath = path.join(assetsDir, cleanFilename);
      const pngFilename = cleanFilename.replace(/\.svg$/i, ".png");
      const pngPath = path.join(previewDir, pngFilename);

      fs.writeFileSync(svgPath, params.svgContent, "utf-8");

      let pngCreated = false;
      let errorMsg = null;
      try {
        execSync(`rsvg-convert "${svgPath}" -o "${pngPath}" -w 1200 2>&1`);
        pngCreated = true;
      } catch (err: any) {
        errorMsg = err.message;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              svgPath: svgPath,
              pngPreviewPath: pngCreated ? pngPath : null,
              assetsDir: assetsDir,
              pngConversionSuccess: pngCreated,
              pngError: errorMsg,
              message: `SVG saved at ${svgPath}. PNG preview at ${pngCreated ? pngPath : "not generated"}`,
            }),
          },
        ],
      };
    },
  });

  // Tool 5: prioritize_syllabus
  pi.registerTool({
    name: "prioritize_syllabus",
    label: "Prioritize Syllabus",
    description:
      "Analyze exam syllabus and calculate Tri-Vector Scores (Exam Priority, Foundation, Study Efficiency), Primary Action Anchors, and Evidence Badges.",
    parameters: Type.Object({
      examId: Type.Optional(Type.String({ description: "Target exam ID (e.g. 'MUDAL-System-Manager' or 'SAS-I'). Auto-detected if omitted." })),
      unitNumber: Type.Optional(Type.Number({ description: "Filter subtopics to a specific unit number." })),
      minActionAnchor: Type.Optional(Type.String({ description: "Filter out topics below this anchor (e.g. 'Important' or 'High Priority')." })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getObsidianVaultPath();
      const taxonomy = resolveActiveExamTaxonomy(vaultPath, params.examId);
      if (!taxonomy) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: `No syllabus found in vault for exam: ${params.examId || "auto-detect"}`,
              }),
            },
          ],
        };
      }

      let pyqs: any[] = [];
      const mudalPyqDir = path.join(os.homedir(), "Work", "mpsc_system_manager_pyqs");
      if (taxonomy.examId === "MUDAL-System-Manager" && fs.existsSync(mudalPyqDir)) {
        pyqs = parseMudalPYQs(mudalPyqDir, taxonomy);
      }

      let prioritized = prioritizeTaxonomy(taxonomy, pyqs);

      if (params.unitNumber !== undefined) {
        prioritized = prioritized.filter((p) => p.unit.unitNumber === params.unitNumber);
      }

      const anchorRanks: Record<string, number> = {
        "Must Study": 5,
        "High Priority": 4,
        "Important": 3,
        "Moderate": 2,
        "Lower": 1,
      };

      if (params.minActionAnchor && anchorRanks[params.minActionAnchor]) {
        const minRank = anchorRanks[params.minActionAnchor];
        prioritized = prioritized.filter((p) => (anchorRanks[p.score.actionAnchor] || 0) >= minRank);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                examId: taxonomy.examId,
                examTitle: taxonomy.examTitle,
                totalMarks: taxonomy.totalMarks,
                totalSubtopics: prioritized.length,
                topics: prioritized.map((p) => ({
                  id: p.subtopic.id,
                  title: p.subtopic.title,
                  unit: p.unit.title,
                  unitNumber: p.unit.unitNumber,
                  officialUnitMarks: p.unit.officialMarks,
                  actionAnchor: p.score.actionAnchor,
                  evidenceBadges: p.score.evidenceBadges,
                  confidence: p.score.confidence,
                  scores: {
                    examPriority: p.score.examPriorityScore,
                    foundation: p.score.foundationScore,
                    studyEfficiency: p.score.studyEfficiencyScore,
                    composite: p.score.compositeScore,
                  },
                  prerequisites: p.subtopic.prerequisites,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  });

  // Tool 6: drill_down_syllabus
  pi.registerTool({
    name: "drill_down_syllabus",
    label: "Drill Down Syllabus",
    description:
      "Interactive progressive drill-down navigation: Overview -> Unit Detail -> Subtopic Dossier with Two-Layer evidence badges.",
    parameters: Type.Object({
      examId: Type.Optional(Type.String({ description: "Target exam ID (e.g. 'MUDAL-System-Manager', 'SAS-I')." })),
      stage: Type.Union(
        [
          Type.Literal("overview"),
          Type.Literal("unit_detail"),
          Type.Literal("subtopic_dossier"),
        ],
        { description: "Navigation depth: overview, unit_detail, or subtopic_dossier." }
      ),
      unitNumber: Type.Optional(Type.Number({ description: "Required for 'unit_detail'." })),
      subtopicId: Type.Optional(Type.String({ description: "Required for 'subtopic_dossier'." })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getObsidianVaultPath();
      const taxonomy = resolveActiveExamTaxonomy(vaultPath, params.examId);
      if (!taxonomy) {
        return {
          content: [{ type: "text", text: `No syllabus found in vault for exam: ${params.examId || "auto-detect"}` }],
        };
      }

      let pyqs: any[] = [];
      const mudalPyqDir = path.join(os.homedir(), "Work", "mpsc_system_manager_pyqs");
      if (taxonomy.examId === "MUDAL-System-Manager" && fs.existsSync(mudalPyqDir)) {
        pyqs = parseMudalPYQs(mudalPyqDir, taxonomy);
      }

      const prioritized = prioritizeTaxonomy(taxonomy, pyqs);

      if (params.stage === "overview") {
        const text = renderSyllabusOverview(taxonomy, prioritized);
        return { content: [{ type: "text", text }] };
      }

      if (params.stage === "unit_detail") {
        const unit = taxonomy.units.find((u) => u.unitNumber === params.unitNumber) || taxonomy.units[0];
        const unitSubs = prioritized.filter((p) => p.unit.id === unit.id);
        const text = renderUnitSubtopicsDetail(unit, unitSubs);
        return { content: [{ type: "text", text }] };
      }

      if (params.stage === "subtopic_dossier") {
        const item = prioritized.find((p) => p.subtopic.id === params.subtopicId) || prioritized[0];
        const text = renderSubtopicDossier(item);
        return { content: [{ type: "text", text }] };
      }

      return { content: [{ type: "text", text: "Invalid stage requested." }] };
    },
  });
}

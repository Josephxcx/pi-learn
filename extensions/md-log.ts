import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

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

let activeNotePath: string | null = null;

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
    return "Technical/Soil-Science";
  }
  if (lower.includes("weed") || lower.includes("agronomy") || lower.includes("tillage") || lower.includes("cropping") || lower.includes("meteorology")) {
    return "Technical/Agronomy";
  }
  if (lower.includes("breed") || lower.includes("genetic") || lower.includes("heterosis") || lower.includes("mendel")) {
    return "Technical/Plant-Breeding-Genetics";
  }
  if (lower.includes("pathology") || lower.includes("pest") || lower.includes("disease") || lower.includes("fungal") || lower.includes("bacterial") || lower.includes("insect") || lower.includes("entomology")) {
    return "Technical/Plant-Protection";
  }
  if (lower.includes("horticulture") || lower.includes("fruit") || lower.includes("vegetable") || lower.includes("post-harvest") || lower.includes("pomology")) {
    return "Technical/Horticulture";
  }
  if (lower.includes("seed")) {
    return "Technical/Seeds";
  }
  if (lower.includes("physio") || lower.includes("photosynthesis") || lower.includes("transpiration") || lower.includes("water relation")) {
    return "Technical/Crop-Physiology";
  }
  if (lower.includes("machinery") || lower.includes("power") || lower.includes("tillage implement") || lower.includes("tractor")) {
    return "Technical/Farm-Power-Machinery";
  }
  if (lower.includes("extension") || lower.includes("communication") || lower.includes("adoption")) {
    return "Technical/Agricultural-Extension";
  }
  if (lower.includes("economic") || lower.includes("farm management") || lower.includes("marketing")) {
    return "Technical/Agricultural-Economics";
  }
  if (lower.includes("mizo") || lower.includes("polity") || lower.includes("history") || lower.includes("geography") || lower.includes("ecology") || lower.includes("environment")) {
    return "General-Studies";
  }
  if (lower.includes("english") || lower.includes("grammar") || lower.includes("vocabulary")) {
    return "General-English";
  }
  return "Technical";
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
          `subject: "SAS-I ${subFolder.replace("Technical/", "").replace(/-/g, " ")}"`,
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
      "Initialize an Obsidian Markdown note in its proper hierarchical subject folder (e.g. Technical/Soil-Science/).",
    parameters: Type.Object({
      topic: Type.String({ description: "The subject or topic being learned." }),
      goal: Type.String({ description: "The learning objective / target understanding." }),
      customPath: Type.Optional(Type.String({ description: "Optional custom relative or absolute file path." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const vaultPath = getObsidianVaultPath();
      ensureDirectory(vaultPath);
      ensureObsidianAssetConfig(vaultPath);

      const assetsDir = path.join(vaultPath, "assets");
      ensureDirectory(assetsDir);

      let filePath: string;
      let subFolder: string;

      if (params.customPath) {
        filePath = path.isAbsolute(params.customPath)
          ? params.customPath
          : path.join(vaultPath, params.customPath);
        subFolder = path.relative(vaultPath, path.dirname(filePath));
      } else {
        subFolder = resolveTopicSubfolder(params.topic);
        const targetDir = path.join(vaultPath, subFolder);
        ensureDirectory(targetDir);
        filePath = path.join(targetDir, `${sanitizeFilename(params.topic)}.md`);
      }

      activeNotePath = filePath;

      const dateStr = new Date().toISOString().slice(0, 10);
      const content = [
        "---",
        `title: "${params.topic}"`,
        `date: ${dateStr}`,
        `subject: "SAS-I ${subFolder.replace("Technical/", "").replace(/-/g, " ")}"`,
        `goal: "${params.goal.replace(/"/g, "'")}"`,
        `tags: [learning, ai-tutor, sas-1, ${sanitizeFilename(params.topic)}]`,
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
        const vaultPath = getObsidianVaultPath();
        activeNotePath = path.join(vaultPath, "Technical", "active-learning-session.md");
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
        const vaultPath = getObsidianVaultPath();
        activeNotePath = path.join(vaultPath, "Technical", "active-learning-session.md");
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
    description: "Save an SVG diagram to assets/ and generate a PNG preview for visual verification.",
    parameters: Type.Object({
      filename: Type.String({ description: "Filename ending in .svg." }),
      svgContent: Type.String({ description: "Complete valid SVG source markup." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const vaultPath = getObsidianVaultPath();
      const assetsDir = path.join(vaultPath, "assets");
      ensureDirectory(assetsDir);

      const cleanFilename = path.basename(params.filename);
      const svgPath = path.join(assetsDir, cleanFilename);
      const pngPath = svgPath.replace(/\.svg$/i, ".png");

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
}

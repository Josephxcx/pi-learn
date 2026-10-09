# HTML Visual Companions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks inline. The user has authorised analysis and implementation using our judgment.

**Goal:** Save adaptive, offline HTML companions linked from Pi-learn notes, with reusable editorial components and optional browser checks.

**Architecture:** Keep session routing in md-log; isolate document assembly, asset saving, note-link formatting, and browser verification in extensions/visuals. Package a shared CSS visual system and vanilla JavaScript for steps and practice quizzes; allow arbitrary topic-specific markup and SVG.

**Tech Stack:** TypeScript, native HTML/CSS/SVG/JavaScript, optional Playwright and KaTeX.

**Spec:** docs/superpowers/specs/2026-10-09-html-visual-companions-design.md

## Global Constraints
- Offline, self-contained HTML; no paid API or hosted service.
- Existing SVG workflow and terminal progression remain compatible.
- HTML quiz results do not advance the tutor or persist to the vault.
- Approximately 400 CSS pixel narrow-pane support.
- Distinguish passed, failed, and unavailable browser verification.

## Review Focus
- Reject traversal, wrong extensions, and asset symlinks rather than writing outside assets.
- Link companions correctly from nested note directories and escape Markdown labels.
- Browser unavailable or render failure must not become a verified success.
- Multi-answer grading requires the complete correct answer set; selection alone reveals nothing.
- Offline resources, reduced motion, keyboard input, and narrow layouts must work.

### Task 1: Companion storage and document assembly
**Files:** extensions/visuals/companions.ts, assets/visual-companion/editorial.css, assets/visual-companion/interactions.js, tests/companions.test.ts.
**Interfaces:** saveCompanion({assetsDir,filename,htmlContent,title,includeMath?}) returns htmlPath; companionLink(notePath,htmlPath,title) returns Markdown; assembleCompanion(html,title,includeMath?) returns standalone HTML.
- [x] Write and run failing tests for real file saving, invalid filenames, symlinks, nested links, and full-document validation.
- [x] Implement helpers and shared responsive styles/runtime.
- [x] Run node --test tests/companions.test.ts; expect pass.

### Task 2: Browser verification and component interactions
**Files:** extensions/visuals/verify.ts, tests/visuals-browser.test.ts, package.json, package-lock.json.
**Interfaces:** verifyCompanion(htmlPath,previewDir) returns status, screenshots, errors, and checks; missing package/browser returns unavailable.
- [x] Write failing browser tests for step reveals, single/multiple MCQs, hints/retries, fraction slider, offline resource detection, and 400px layout.
- [x] Implement bounded two-viewport verification and interactions without inline handlers or storage.
- [x] Run npm test; expect pass using installed Chromium.

### Task 3: Extension integration, teaching guide, and representative examples
**Files:** extensions/md-log.ts, skills/pi-learn/SKILL.md, skills/pi-learn/references/html-visuals.md, scripts/build-visual-examples.ts, examples/visuals, README.md, tests/extension.test.ts.
**Interfaces:** save_visual_html(filename,htmlContent,title,includeMath?,verify?) and get_visual_components(); append_lesson_node accepts optional visualFilename and visualTitle.
- [x] Write failing extension tests covering tool registration, shared asset routing, note links, verification failure reporting, and SVG-only compatibility.
- [x] Register tools and extend logging with backward-compatible optional fields.
- [x] Package instructions and generate fractions, nitrogen-cycle, and plant-deficiency examples.
- [x] Run npm test and preview checks for all examples; inspect screenshots.
- [x] Review the whole change, fix significant findings, and report tested capabilities and limitations.

## Execution record
- Implemented inline in the existing clean `work` branch, as authorised by the user; no changes to main/master.
- Native HTML/SVG components cover the initial scope; KaTeX is bundled only when requested, and additional drawing/icon libraries were deferred until needed.
- Playwright is optional; browser checks use an offline locally fulfilled virtual URL so relative dependencies are detected without a server.
- Independent review found relative-resource validation and licence-notice defects; regression tests demonstrated failures before fixes. Screenshot dimension tests also caught an ignored viewport option. SVG accessibility titles are now preserved.
- Live Obsidian is unavailable in this environment; plugin compatibility remains an explicitly documented manual check.
- Final regression coverage also verifies asset routing after `/md-log`, clearing stale quiz feedback, and saved/unavailable verification reporting.
- Final validation: 13/13 tests passed; all three representative lessons passed desktop and 400px browser checks; actual screenshot dimensions checked; runtime package contents verified.

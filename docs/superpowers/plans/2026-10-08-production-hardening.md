# pi-learn production hardening implementation plan

**Goal:** Deliver a safe, typed, tested Pi tutoring extension with dependable Obsidian notes and evidence-aware exam preparation.

**Architecture:** Thin Pi bindings call local learning storage and pure prioritization modules. Teaching policy and examples document the learner-facing workflow.

**Tech stack:** TypeScript, Node.js 22.19+, Pi 1.1.0 (legacy 0.85.1 compatibility), TypeBox, Node test runner, local Markdown/JSON.

**Spec:** `docs/superpowers/specs/2026-10-08-production-hardening-design.md`

## Global constraints

- Preserve existing public tool names and compatible parameters; optional new fields are permitted.
- Never overwrite existing notes on initialization or silently discard corrupt state.
- No global dependency installation, shell interpolation or modification of Obsidian preferences.
- Missing exam evidence stays unknown; priority is a heuristic, not a prediction of exam questions.
- All testing uses temporary vaults and state directories.

## Review focus

- Session switching and two Pi sessions addressing different notes must never mix assets or progress.
- Aliased wiki links, Paper II, duplicate booklets and unknown years must retain correct meaning.
- Invalid paths, symlinks, interrupted writes and malformed persisted data must not destroy notes.
- Optional tools, GUI launchers and renderers may be unavailable in headless environments.
- Immediate quiz success must not become a claim of long-term mastery.

## Task 1: Toolchain and distribution

- [x] Pin compatible dependencies; add strict tsconfig, npm test/check/package checks and CI.
- [x] Remove auto-install side effects and document optional MCQ support.
- [x] Validate with the real SDK loader, typecheck and package dry-run.

## Task 2: Learning storage and bindings

- [x] Write regression tests before implementation for resume, preservation, session isolation, assets, progress and retry safety.
- [x] Implement `extensions/learning/` services for configuration, notes, progress and diagrams.
- [x] Replace `md-log.ts` internals with typed registrations, lifecycle-safe context selection and explicit tool errors.
- [x] Add `/pi-teach`, status and due-review access with a plain-chat fallback.
- [x] Run learning and extension integration tests.

## Task 3: Syllabus and evidence

- [x] Write failing parser/engine regressions for the known bugs.
- [x] Repair legacy parsers and add validated explicit taxonomy/PYQ JSON imports.
- [x] Validate dependency graphs, preserve missing evidence, de-duplicate source questions and use actual paper coverage.
- [x] Improve presenters and navigation errors; run prioritization tests.

## Task 4: Teaching and documentation

- [x] Rewrite the skill for exam-calibrated teaching, notes, retrieval, meaningful visuals and mnemonics.
- [x] Add a complete sample lesson with native tables, an uncluttered vector diagram, concealed answers and revision guidance.
- [x] Rewrite README and configuration/import examples around verified behavior and migration.

## Task 5: Integration and independent review

- [x] Run npm checks, headless real-Pi smoke test, install/package checks and sample visual inspection.
- [x] Get independent code review, fix material findings with regression tests.
- [x] Record evidence, limitations and completed work in the progress log.

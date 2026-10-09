# pi-learn production hardening

The user delegated implementation and technical decisions after reviewing the existing extension. The goal is dependable personal teaching and preparation for Mizoram and central recruitment exams. Keep the Pi extension and local Markdown/Obsidian experience. Production readiness means verified behavior and explicit limitations, not a claim that a prompt guarantees teaching quality.

## Architecture

Keep `extensions/md-log.ts` as a thin Pi entry point. Separate configuration/path resolution, note/session storage, review scheduling, diagrams, and syllabus tools. Use the actual installed Pi API types and TypeBox schemas. No global mutable active note, silent write failures, shell interpolation, automatic global package installs, or unsolicited Obsidian configuration edits.

Default notes remain local. Configuration provides a vault path and explicit source locations; cross-platform Obsidian discovery is a convenience. If multiple vaults or exams exist, do not silently pick an unrelated one. General learning works without an exam. Explicit exam profiles carry post, authority, group, gazetted status, recruitment route, syllabus version, paper and difficulty guidance. Classification informs teaching; exact syllabus and PYQs govern depth. Never infer gazetted status or difficulty from a title alone.

## Notes and learning state

Initialization resumes an existing note without replacing user content. Note and asset paths travel together. Each Pi session has its own persisted active-note pointer; each note has versioned structured progress. Legacy session data is read only for explicit recovery. Writes use same-directory atomic replacement and a lock, and reject unsafe paths. Managed Markdown blocks may be replaced without deleting surrounding user text. Retries use tool-call IDs or explicit node IDs to avoid duplicate material and attempts. Corrupt data produces a useful error and is not silently overwritten.

Separate concise revision material from accumulated lesson steps and retrieval history. Log concept attempts with timestamps and whether correct, distinguish taught/immediate recall from delayed retention, expose a due review queue and persistent mistake history. Use a transparent simple schedule rather than claiming a validated adaptive algorithm.

## Syllabus and PYQ evidence

Preserve the legacy syllabus importers while supporting an explicit JSON exam taxonomy and PYQ dataset. Validate data. Preserve source identity, year, marks, paper and mapping certainty; missing information stays missing. Ambiguous/unmatched questions remain unassigned. De-duplicate repeats of the same source question/booklet, not genuinely repeated questions from different sittings. Scores expose evidence limits, never label raw repeated years a rising trend or absence of PYQs a new syllabus. Validate dependencies and count actual papers. Invalid navigation returns an error instead of a different topic.

## Teaching and visual design

Provide `/pi-teach` as a discoverable entry to the pi-learn skill, retain existing tool names and `/md-log`/`md-view`, and add status/review access. The skill supports optional MCQ tooling with a plain-chat fallback, neutral options, answer concealment and one manageable explanation at a time. Use an illustrated textbook style: restrained ink/teal/ochre, generous space, meaningful diagrams, native comparison tables, no decorative emoji/gradients. Mnemonics are optional and include explicit mapping and limitations. Include a representative revision note and diagram. Programmatic diagrams are schematic vector assets, not generated illustration.

## Verification and boundaries

Strict TypeScript against pinned compatible Pi SDK; Node test runner; regression tests of actual files, session isolation, invalid inputs, score evidence and Pi registrations. CI runs install, typecheck, tests and package dry-run. External launch/rendering failures are reported truthfully; SVG preview success does not mean visual inspection. Do not publish, modify personal vaults, or make remote changes as part of validation. No scraping service, database server, or full exam content library in this refactor.

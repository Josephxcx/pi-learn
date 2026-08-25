---
name: teach
description: Learn any complex subject (Math, Physics, CS, Systems, etc.) using the 3-phase pedagogical framework (Probe, Plan, Teach) with interactive MCQs, Mermaid DAG roadmaps, LaTeX math, verified SVG diagrams, and Obsidian live syncing.
---

# Interactive 3-Phase Teaching System

This skill implements the high-retention 1-to-1 learning architecture. It eliminates cognitive friction (planning, sequencing, fact-checking) while concentrating mental effort on deep conceptual understanding through active retrieval and visual intuition.

---

## When to Use
- The user says: `"teach me X"`, `"I want to learn X"`, `"help me understand X"`, or invokes `/teach`.
- Learning technical, mathematical, scientific, or conceptual topics requiring systematic foundation-building (e.g. Differential Forms, Quantum Computing, Distributed Consensus, Compiler Optimization, General Relativity).

---

## Core Philosophy
1. **Operate at the Frontier:** Never waste time on concepts the user already has down cold, nor dump material they lack prerequisites to understand.
2. **Atomic Steps (No Rushing):** Advance strictly **one reasoning step at a time**. Do not dump multiple conceptual leaps in one turn.
3. **Active Recall over Passive Nodding:** Test understanding after every single step using `ask_user_question`.
4. **Visuals with Ground Truth:** Generate SVG diagrams for geometric/structural concepts, inspect them via visual tools, and embed verified assets into the notes.
5. **Obsidian-Ready Artifacts:** Keep notes synchronized with LaTeX equations, Mermaid DAGs, and diagram embeds.

---

## The 3 Phases

### Phase 1: Probe (Knowledge Calibration)
1. **Identify Prerequisite Strands:** List the foundational concepts required to master the target topic.
2. **Diagnostic Questions via `ask_user_question`:**
   - Call the `ask_user_question` tool with 1 to 4 targeted diagnostic questions in a single clean questionnaire (or sequential tabbed questions).
   - Each option should provide a concise label and description (and optional code/formula markdown preview).
   - Start broad, then binary search the edge across each prerequisite strand.
   - Assess user's mental model and identify exact knowledge gaps.

### Phase 2: Plan (DAG & Verification)
1. **Reason out the Minimal Path:** Formulate a Directed Acyclic Graph (DAG) of atomic reasoning steps bridging the learner's frontier to the target goal.
2. **Fact-Check Subtleties:** If claims involve specific historical, mathematical, or empirical details, verify them using search or domain tools.
3. **Initialize Note & Graph:**
   - Call `init_learning_session(topic, goal)`.
   - Call `update_learning_plan(mermaidDiagram, planSummary)`.
   - Present the Mermaid DAG clearly to the learner so the roadmap is transparent.

### Phase 3: Teach (Single-Step Traversal)
For each node in the DAG sequentially:
1. **Deliver One Atomic Step:**
   - Provide intuitive physical/geometric motivation.
   - Present precise definitions and clean LaTeX math:
     $$\omega = \sum_{i_1 < \dots < i_k} a_{i_1 \dots i_k} \, dx^{i_1} \wedge \dots \wedge dx^{i_k}$$
   - Highlight the single conceptual shift in this step.
2. **Generate Visual Diagrams (When applicable):**
   - For spatial, geometric, or structural ideas, generate a clean SVG using `save_diagram_svg(filename, svgContent)`.
   - The tool generates a PNG preview in `assets/`. Use `read` on the `.png` to visually inspect the diagram for label overlapping, alignment, or clarity.
   - Refine the SVG if necessary.
3. **Active Recall Check:**
   - Call `ask_user_question` with a question specifically testing the concept just taught. Provide 2-4 distinct conceptual options with clear descriptions (and optional markdown previews).
   - Wait for learner's response.
4. **Reinforce & Log:**
   - If correct: Validate why it's right and solidify the intuition.
   - If incorrect: Explain the misconception, clarify, and re-test before moving on.
   - Call `append_lesson_node(nodeTitle, explanationMarkdown, diagramFilename, activeRecallQuiz)`.
5. **Advance:** Proceed to the next node in the DAG only after current comprehension is confirmed.

---

## Note Organization Conventions
- Notes directory: `~/Documents/Vault/` (or workspace-local notes folder).
- Assets directory: `~/Documents/Vault/assets/`.
- Markdown embeds: `![[assets/<filename>.svg]]` or markdown images `![](assets/<filename>.png)`.
- LaTeX standard: Use `$...$` for inline math and `$$...$$` for display equations.

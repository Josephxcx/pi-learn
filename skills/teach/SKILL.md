---
name: teach
description: Learn any complex subject (Math, Physics, CS, Systems, etc.) using the 4-phase pedagogical framework (Prioritize, Probe, Plan, Teach) with intelligent syllabus/PYQ prioritization, interactive MCQs, Mermaid DAG roadmaps, LaTeX math, verified SVG diagrams, and Obsidian live syncing.
---

# Interactive 4-Phase Teaching System

This skill implements the high-retention 1-to-1 learning architecture. It eliminates cognitive friction (planning, sequencing, fact-checking, and syllabus prioritization) while concentrating mental effort on deep conceptual understanding through active retrieval and visual intuition.

---

## When to Use
- The user says: `"teach me X"`, `"I want to learn X"`, `"help me understand X"`, or invokes `/teach`.
- Learning technical, mathematical, scientific, or conceptual topics requiring systematic foundation-building (e.g. Database Management Systems, Computer Networks, Operating Systems, Soil Science, Agronomy).

---

## Core Philosophy
1. **Syllabus & Weightage Grounding First (Zero Guesswork):** Always anchor the learning session in the target exam's official syllabus, mark allocation, and PYQ trends before teaching.
2. **Operate at the Frontier:** Never waste time on concepts the user already has down cold, nor dump material they lack prerequisites to understand.
3. **Atomic Steps (No Rushing):** Advance strictly **one reasoning step at a time**. Do not dump multiple conceptual leaps in one turn.
4. **Active Recall with Strict Neutrality:** Test understanding after every single step using `ask_user_question`. Never leak answers or hints with `(Recommended)` labels or priority badges during recall checks.
5. **Visuals with Ground Truth:** Generate SVG diagrams for geometric/structural concepts, inspect them via visual tools, and embed verified assets into the notes.
6. **Obsidian-Ready Artifacts:** Keep notes synchronized with LaTeX equations, Mermaid DAGs, and diagram embeds in dedicated exam directories.

---

## The 4 Phases

### Phase 0: Syllabus Pre-Flight & Prioritization Drill-Down (Mandatory)
Before jumping into lessons, calibrate the session against the student's target examination:
1. **Examine Active Exam & Syllabus:**
   - Call `drill_down_syllabus(stage="overview")` or `prioritize_syllabus()`.
   - Identify the target exam context (e.g. `MUDAL-System-Manager` vs `SAS-I`), unit mark allocations (e.g. Unit II: DBMS = 35 Marks), and eligibility/difficulty stream (e.g. Bachelor of Any Stream vs Specialized).
2. **Present Progressive Two-Layer Recommendations:**
   - Call `drill_down_syllabus(stage="unit_detail", unitNumber=N)` to present subtopics with:
     - **Primary Action Anchor:** 🔴 `Must Study` | 🟠 `High Priority` | 🟡 `Important` | 🔵 `Moderate` | ⚪ `Lower Priority`
     - **Secondary Orthogonal Badges:** 💎 `Core Foundation` | ⚓ `Frequent Anchor` | 📈 `Rising Trend` | 🎯 `High Marks` | ⏳ `Low Return` | ✨ `New Syllabus`
     - **Evidence Confidence:** 🟢 `Conf: HIGH` | 🟡 `Conf: MODERATE` | ⚪ `Conf: LOW/SPECULATIVE`
3. **Learner Agency Selection:**
   - Present the prioritized subtopics clearly so the student remains in complete control.
   - The learner selects or confirms the subtopic to master based on the recommendations.

### Phase 1: Probe (Knowledge Calibration)
1. **Identify Prerequisite Strands:** List the foundational concepts required to master the target topic.
2. **Diagnostic Questions via `ask_user_question`:**
   - Call the `ask_user_question` tool with 1 to 3 targeted diagnostic questions.
   - Assess user's mental model and identify exact knowledge gaps.

### Phase 2: Plan (DAG & Verification)
1. **Reason out the Minimal Path:** Formulate a Directed Acyclic Graph (DAG) of atomic reasoning steps bridging the learner's frontier to the target goal.
2. **Fact-Check Subtleties:** If claims involve specific historical, mathematical, or empirical details, verify them using search or domain tools.
3. **Initialize Note & Graph:**
   - Call `init_learning_session(topic, goal, customPath?)`. (Automatically persists session state to `~/.pi/agent/learn-session.json` and routes assets to `<Exam>/assets/`).
   - Call `update_learning_plan(mermaidDiagram, planSummary)`.
   - Present the Mermaid DAG clearly to the learner so the roadmap is transparent.

### Phase 3: Teach (Single-Step Traversal)
For each node in the DAG sequentially:
1. **Deliver One Atomic Step:**
   - Provide intuitive physical/geometric motivation and real-world analogies (e.g. Mizo concept anchors for Mizoram exams).
   - Present precise definitions, comparison tables, and clean LaTeX math:
     $$\text{Super Key} \supseteq \text{Candidate Key} \supseteq \text{Primary Key}$$
   - Highlight the single conceptual shift in this step.
2. **Generate Visual Diagrams (When applicable):**
   - For structural, relational, or procedural ideas, generate a clean SVG using `save_diagram_svg(filename, svgContent)`.
   - Diagram is saved directly into the active exam's assets folder (e.g. `MUDAL-System-Manager/assets/<filename>.svg`).
3. **Active Recall Check (STRICT FIREWALL RULE):**
   - **MANDATORY:** Active recall questions generated via `ask_user_question` must **NEVER** contain `(Recommended)`, `[Recommended]`, or any priority anchors/badges (`Must Study`, `High Priority`, etc.) in option labels or question text.
   - Randomly shuffle answer options so option 0 is not predictably the correct answer.
   - Ensure all options maintain neutral tone, equal length, and technical symmetry.
   - Wait for learner's response.
4. **Reinforce & Log:**
   - If correct: Validate why it's right and solidify the intuition.
   - If incorrect: Explain the misconception, clarify, and re-test before moving on.
   - Call `append_lesson_node(nodeTitle, explanationMarkdown, diagramFilename, activeRecallQuiz)`.
5. **Advance:** Proceed to the next node in the DAG only after current comprehension is confirmed.

---

## Note Organization Conventions
- Notes directory: `~/Documents/Vault/Study/<Exam>/` (e.g. `Study/MUDAL-System-Manager/` or `Study/SAS-I/`).
- Assets directory: `~/Documents/Vault/Study/<Exam>/assets/`.
- Markdown embeds: `![[assets/<filename>.svg]]`.
- LaTeX standard: Use `$...$` for inline math and `$$...$$` for display equations.

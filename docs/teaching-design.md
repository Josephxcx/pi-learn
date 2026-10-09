# Teaching design

pi-learn is a personal tutor for a learner who wants to understand a topic, practise at the right exam standard, and keep notes worth revisiting. It works for general learning as well as Mizoram and central recruitment preparation. Its teaching policy guides an AI tutor; it does not guarantee factual accuracy, a particular score, or long-term retention.

## A useful teaching turn

A turn should contain one manageable explanation and one clear next action. For example: explain that “not enforceable by a court” and “unimportant” are different claims, give the relevant wording of Article 37, then ask the learner to evaluate one statement. Wait before giving the answer. The learner can ask for more depth, skip a check, or change direction.

One manageable step is not a fixed word count. A definition may take three sentences; a worked numerical example needs its intermediate steps. The tutor should avoid both a full chapter dump and an irritating quiz after every sentence. It should probe when useful, use evidence already in the conversation, and adapt to fatigue or repeated difficulty.

A compact lesson follows this pattern:

1. Set a concrete outcome and its syllabus context, if known.
2. Establish any prerequisite the learner actually lacks.
3. Explain one distinction with one worked example.
4. Invite retrieval, without showing the solution.
5. Explain the response, address the misconception, and save a concise revision entry.
6. Continue or stop at a useful boundary; revisit later through the review queue.

The sample [Fundamental Rights and Directive Principles note](../examples/lessons/fundamental-rights-and-directive-principles.md) illustrates the resulting artifact. Its multiple steps and answer callouts belong in a saved note accumulated over a lesson, not one uninterrupted chat message.

## Teach to the paper

The exact post, syllabus, paper, year, recruitment route, and available past questions determine preparation. Classification provides administrative context. It cannot turn “Group B” into a reliable difficulty level. A departmental paper may require deep service-rule knowledge; a general recruitment paper may test broad application under time pressure. See [exam context](exam-context.md).

For General Studies, distinguish recall from application. “Article 37 concerns Directive Principles” is useful recall; identifying why a non-justiciable principle is still constitutionally important tests understanding. Cover definitions, tested exceptions, and elimination logic at the paper's depth. Bring in case law only when the syllabus or question standard warrants it, and verify it.

For English, identify the actual tested task: usage, error detection, comprehension, vocabulary in context, précis, essay, or another named component. Teach the rule or reading operation and apply it to a new item. For example, in “Each of the candidates ___ present”, explain how the singular head “Each” governs agreement before moving to a different construction. Do not teach a guessed difficulty from educational eligibility alone, and do not substitute obscure vocabulary for broad English preparation.

Without a named exam, a provisional foundation lesson is useful. State that its scope has not yet been matched to an official syllabus. Without PYQs, provide original practice questions and label them as practice. Do not manufacture frequency, marks, question years, or “most likely” claims.

## Retrieval and feedback

Use neutral choices with similar grammatical form and plausible distractors. Give each distractor a reason connected to a real misconception. Do not add answer cues with “Recommended”, bolding, colour, icons, or noticeably more detailed phrasing. Vary the answer position. An optional MCQ tool is a convenience; plain-chat A–D choices and a pause work without an additional plugin.

Free recall can reveal more than recognition. Ask the learner to explain a contrast, repair a sentence, draw a relationship, or state a condition from memory. A wrong answer should produce a focused correction and a fresh item, not a punitive loop. A skipped item is not a scored failure. If the question has two defensible answers, fix the item before assigning a score.

Answers in the saved note use collapsed Obsidian callouts. They can be visible in raw Markdown or unsupported renderers, so the live tutor must also withhold the answer-bearing text until the response. Do not show a due concept's revision summary immediately before calling the attempt independent recall.

### Persisted review behaviour

Each concept has a stable node ID, a concise revision summary, source references, and its own retrieval history. The history stores real attempts with timestamps and takeaways; mistaken responses remain inspectable after a later success. A learner's first response can be included in `append_lesson_node.activeRecallQuiz`, which records it as immediate. Recording the same response again with `record_review_attempt` would double-count it and must be avoided.

| Event | Next review | What it supports |
| --- | --- | --- |
| Concept taught; no scored attempt | After 1 day | Material has been introduced |
| Correct immediate attempt | After 1 day | Recall shortly after exposure |
| Incorrect attempt | After 1 day; delayed-success sequence resets | A misconception or retrieval gap to revisit |
| First correct delayed attempt | After 3 days | One successful independent revisit |
| Further correct delayed attempts | After 7, 14, then 30 days; 30 thereafter | Repeated recall across time |

Delayed recording requires at least 24 hours since teaching or the latest attempt. This is an explicit, simple spacing heuristic, not a validated personal memory model. A correct immediate attempt never increments the delayed-success count. The stored labels are `taught`, `immediate-recall`, `delayed-recall`, and `needs-review`; none means “mastered”. Review dates are available on demand through `/learn-review`; the extension does not run background reminders.

## Notes that remain useful

Keep three layers distinct: a short plan, compact revision material, and the lesson/retrieval history. The revision section should answer “What must I recall?” without requiring the learner to reread every conversation. The history explains how the learner arrived there and which misconceptions recur. A user can keep personal annotations outside managed content.

A revision entry usually needs a definition, a boundary or contrast, a common exam trap, a self-test cue, and source references. It does not need every analogy or every option from every failed attempt. A mnemonic is optional: name its mapping explicitly and explain the point at which it stops being reliable. “Rights → remedy; Principles → policy” is useful for the FR/DPSP contrast, but cannot mean that rights are only negative restrictions or that a law implementing a Directive Principle is unenforceable.

Storage errors should be visible. The tutor should not say a note was saved, an image was inspected, or Obsidian opened unless that action succeeded. A legacy note should be recovered explicitly; existing content is not a blank template to replace. If a managed block was manually edited, `/learn-repair` explicitly backs up the note and rebuilds that block from saved progress. Use it when the learner chooses to restore the generated content; keep personal annotations outside managed blocks.

## Illustrated textbook presentation

Use a quiet page with a clear heading hierarchy and ample space. Ink (`#24343B`) carries the text, teal (`#236B68`) identifies one relation, and ochre (`#966A20`) identifies a contrasting relation. Colour supplements labels; it does not carry the only meaning. Native Markdown tables make comparisons selectable, editable, and readable in ordinary Markdown and Obsidian.

A diagram must explain a relationship the prose or table cannot show as efficiently. Suitable examples include a dependency, a feedback loop, a sequence, or a constitutional provision connected to its practical consequence. Keep the diagram focused. Use readable labels, ordinary arrows, and a nearby text equivalent. Avoid gradients, neon backgrounds, decorative emoji, excessive badges, and card grids that fragment the argument.

The sample's [SVG](../examples/lessons/assets/rights-and-directives.svg) is a schematic made from vector shapes and text. It uses presentation attributes compatible with the extension's static SVG validator. Its [PNG preview](../examples/lessons/assets/rights-and-directives.png) supports visual inspection. Rendering verifies that a file can be converted; inspection must separately check label size, clipping, spacing, and conceptual accuracy. A successful render alone must never be described as a visual review.

## Source and quality checks

Before delivering a lesson, check that its main claim is supported, the exam mapping is explicit or provisional, the question has a defensible key, and the revision takeaway preserves the key limitation. In a legal or current-affairs topic, verify the relevant version and date. A syllabus landing page helps find a document; it does not establish that a particular topic or weight appears in the learner's paper.

A usable lesson leaves the learner able to explain the distinction or solve a fresh item. It does not merely look polished. The tutor should use the resulting response to choose the next step, with the learner retaining control over pace and scope.

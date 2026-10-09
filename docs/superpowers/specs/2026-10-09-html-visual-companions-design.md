# Pi-learn HTML visual companions

## Purpose and scope

Add one self-contained HTML visual companion per taught concept, linked from the existing Markdown lesson. Preserve the current terminal tutor, roadmap, note logging, and active-recall progression. The companion explains the concept through topic-appropriate diagrams, progressive steps, and optional interactions.

The initial visual default is bold editorial: warm ivory, dark ink, cobalt and orange accents, expressive headings, precise diagrams, and numbered callouts. This is a revisable default, not a requirement to force every concept into the fractions mockup.

## Adaptive visual system

Share typography, colour roles, spacing, annotation styling, controls, feedback, and responsive rules. Keep diagram geometry and teaching structure topic-specific. Provide composable components for labelled structures, process sequences, comparisons, equations, insight panels, and practice questions. Allow custom layouts when the reusable patterns do not fit.

Examples: fractions use selectable partitions; the nitrogen cycle uses a transformation map; plant deficiencies use a labelled plant and comparison matrix; protocols use a message sequence. Use interactions only when they help demonstrate a relationship. Avoid ornamental movement and controls that do not support learning.

## Authoring and storage

Introduce a `save_visual_html` tool accepting a filename and complete HTML document, with a short human-readable title. Follow existing active lesson/exam asset routing. Save companions as UTF-8 HTML assets and return the saved path plus validation results. Do not replace `save_diagram_svg`.

Extend lesson logging with an optional visual companion filename and title. Append a vault-relative Markdown link to the HTML file while retaining the existing SVG embedding behaviour. Preserve callers that only supply the current arguments. Filenames must remain within the active asset directory and must have the expected extension.

Generated documents contain local inline styles, scripts, SVG, and embedded assets. Runtime operation must not require a CDN, internet connection, paid API, build server, or hosted website. Package reusable source components with the extension and assemble self-contained outputs. Supply sensible font fallbacks; any bundled fonts and libraries retain their licence notices.

## Tools and dependencies

Use native HTML, CSS, SVG, and JavaScript first. Use KaTeX for equations and Lucide icons where helpful. Rough.js, D3, and Three.js are optional future additions justified by actual lesson needs, not initial dependencies. Browser verification uses Playwright as a local optional capability; missing browser support must be reported clearly without preventing HTML saving.

The reusable components supply reliable presentation and common behaviours. The tutor still generates topic-specific content and geometry; no general semantic diagram engine is required in the first version.

## Obsidian integration

Target HTML Viewer as the initial viewer, opening the companion in an Obsidian tab alongside the Markdown lesson. Document installation and its Scripts ON setting for interactive companions. Do not silently install a community plugin or change its script settings. Plain browser opening remains a fallback.

Use `addEventListener` for generated interactions because HTML Viewer strips inline event handlers. Avoid relying on durable localStorage, parent-window access, or direct vault access from lesson JavaScript. Verify representative HTML inside the target plugin; a Playwright preview alone cannot establish Obsidian compatibility.

## Practice MCQs

Provide a native HTML practice component supporting single-answer and multiple-answer questions, explicit submission, per-choice explanations, hints, and retries. Do not reveal correctness when merely selecting an answer. Use neutral choices without recommendation labels and avoid a predictable correct-answer position. Use semantic controls, keyboard navigation, visible focus, and feedback that does not rely only on colour.

Practice results stay within the companion in this version. The existing terminal quiz remains the progression gate. Synchronising HTML answers back to Pi or persisting practice results requires a separately designed integration and is outside this scope.

## Verification and failures

When browser support is available, render one desktop and one narrow-pane layout, capture a representative screenshot, collect script errors, and exercise applicable step controls, sliders, and quiz submission. Report concise results. Repeat verification after a material correction, rather than generating many previews by default. Save previews outside the learner's note content unless a snapshot is deliberately requested.

The tutor inspects the preview for clipping, overlap, contrast, and misleading geometry. Check factual and mathematical claims separately: rendering success does not prove lesson correctness. Report save success, browser verification status, and failures separately. A failed browser check must not be described as verified; allow correction and rechecking. Missing optional tooling produces an unverified saved artifact, not a false success claim.

## Acceptance criteria

- Existing SVG-only lesson workflows continue to work.
- Companions save under the active asset directory and are reachable from lesson notes.
- Saved HTML opens offline without missing network-dependent resources.
- Bold editorial styling supports different diagram structures without imposing a fixed page composition.
- Representative fractions, nitrogen-cycle, and plant-deficiency companions demonstrate different layouts and subject-specific diagrams.
- Content remains readable at a narrow pane width of approximately 400 CSS pixels; large diagrams provide deliberate internal scrolling or an alternative layout rather than clipping the page.
- Interactive companions work in HTML Viewer with scripts enabled, using event listeners and without relying on persistent viewer storage.
- MCQs require submission and provide explanations and retry behaviour; they do not advance the terminal tutor.
- Verification accurately distinguishes checked, failed, and unavailable states.
- Shared components reduce repeated page generation; actual token usage is measured during trial lessons rather than guaranteed from estimates.

## Out of scope

Full HTML course delivery, replacing terminal recall gates, automatic plugin installation, hosting, paid illustration generation, mandatory 3D rendering, and a general-purpose diagram editor.

## Next stage

Review this written design before creating the implementation plan. The plan should identify extension changes, packaged components, dependency handling, representative lessons, and meaningful verification checks.

# Visual design for Pi-learn

Apply the bundled [frontend-design skill](../../frontend-design/SKILL.md) whenever creating or revising lesson design, art, visuals, diagrams, or quiz presentation. This includes HTML companions, standalone SVG illustrations, Mermaid roadmaps, comparison layouts, and static explanatory figures.

## Load once, apply throughout
Read the frontend-design skill and this adaptation once per session, before the first visual authoring task. `get_visual_design_guidance()` returns both from the installed package, so it does not depend on a globally installed skill. Reuse the guidance across concepts; do not reload it for every diagram unless context has been lost. `get_visual_components()` supplies the separate HTML component contracts.

## Teaching constraints
- Scientific accuracy comes first. Preserve true proportions, meaningful topology, anatomical connections, and accurate process direction. Attractive styling never justifies misleading geometry or claims.
- Begin with the concept's teaching purpose and learner level. Choose a representation that makes the relevant relationship visible.
- Make a short design note before authoring: subject, focal diagram, palette/contrast, typography, layout, and interaction if useful. Keep this inside the authoring workflow; no new learner approval step is needed when the lesson scope is already known.
- Use bold editorial as the initial visual identity, adapting the composition and illustrative treatment to the subject. A biology lesson may use natural contours and plant anatomy; a mathematical proof may use exact geometry; a protocol may use a message sequence. Reusable components are starting points, not a fixed page layout.
- For organisms and physical objects, use recognisable structure, natural contours where appropriate, and believable connections. Avoid generic clipart assembled from unrelated primitives. For abstract concepts, simple geometric forms are often the clearest representation.
- Put labels where they remain legible, with leaders ending on the structure they name. Distinguish illustrative colour from diagnostic evidence.
- Ensure readable contrast on both light and dark panels. Use the shared text tokens for HTML; do not put dark cobalt text on a dark background.
- Apply design guidance to quiz layout and feedback while keeping answer choices neutral. Visual emphasis must not reveal the correct choice before submission. Ask neutral retrieval questions in chat and record only actual responses. Respect requests to skip practice; HTML results do not update Pi progress.
- Keep companions self-contained and offline. Use system-font fallbacks or embedded licensed fonts; do not add CDN assets to satisfy a typography suggestion. No paid image API is required by this skill.
- Test useful interactions and inspect available browser/SVG previews. Critique the rendered design for clarity, hierarchy, clipping, and misleading emphasis. Check facts separately from presentation.

For HTML authoring, continue with [component guidance](html-visuals.md). Preserve Markdown notes and existing SVG workflows.

# Adaptive HTML visual companions

Use one companion per concept and link it from the existing lesson. The visual identity is bold editorial; the explanation structure must adapt to the subject. Do not force a diagram into a fractions layout. Prefer the shared components, but use custom grids, SVG, tables, and JavaScript when needed.

## Workflow
1. Load `get_visual_design_guidance()` once per session to apply the bundled frontend-design skill and teaching constraints. Then call `get_visual_components()` for HTML patterns.
2. Create a complete HTML document with doctype, head, body, and a main landmark. Styles and control scripts below are injected by `save_visual_html`; do not copy their implementation into each lesson.
3. Call `save_visual_html(filename, htmlContent, title, includeMath?, verify?)`. Default verification is on. Files save in the active note’s assets folder. Use a topic-specific filename to avoid overwriting other concepts.
4. Inspect returned screenshots with available image tools. Fix overlap, clipping, and misleading geometry. Also check claims and mathematical relationships separately. `passed` means browser smoke checks passed, not that an AI reviewed the image or proved the content.
5. Log with `append_lesson_node(..., visualFilename, visualTitle)`. The note gets a relative Markdown link. A saved companion with unavailable checks must be described as unverified.
6. Continue neutral retrieval practice in chat, respecting requests to skip it. HTML practice does not record attempts or change Pi review status.

## Visual language
Warm ivory background, ink headings, cobalt for the active concept, orange for numbered annotations. Serif headings with readable system body text. Use restrained emphasis, generous spacing, and diagrams large enough to read in a narrow pane. Avoid decorative animation. CSS variables: `--pi-paper`, `--pi-ink`, `--pi-cobalt`, `--pi-orange`, `--pi-muted`, `--pi-line`, `--pi-mint`. For text use `--pi-text-accent` and `--pi-text-muted`; these switch to light colours inside dark `pi-insight` panels. Reserve cobalt for light-background text and diagram fills.

Classes: `pi-header`, `pi-brand`, `pi-eyebrow`, `pi-accent`, `pi-grid` (responsive columns), `pi-hero`, `pi-diagram` (responsive SVG), `pi-insight`, `pi-number`, `pi-steps`, `pi-step`, `pi-controls`, `pi-secondary`, `pi-caption`, `pi-equation`, `pi-table-scroll`. Wrap wide tables in `pi-table-scroll` so the whole page does not overflow. Use descriptive SVG `<title>`/`<desc>` and readable labels. Diagram topology, geometry, and layout stay topic-specific.

## Diagram quality
Ground the representation in the subject. For plants and other organisms, use recognisable anatomy, natural contours, visible structural details, and believable connections between parts. Reserve simple geometric primitives for concepts where those shapes communicate accurately. Keep labels outside the illustration and attach leader lines to the tissue they name. Use colour changes and highlights to support the explanation; do not present illustrative colours as diagnostic evidence.

The botanical companion in `examples/source/plant-deficiencies.html` and `examples/source/plant-nutrient-mobility.svg` demonstrates a topic-specific composition and an editable illustration. Treat it as a quality reference, not a fixed layout for every biology lesson. For a custom interaction, verify that controls change the diagram and its explanation together, with keyboard access and a readable narrow layout.

## Skeleton
```html
<!doctype html>
<html lang="en"><head></head><body><main>
<header class="pi-header"><div class="pi-brand"><span>π</span> Pi-learn</div><div class="pi-eyebrow">Topic / Concept</div></header>
<h1>Topic-specific <span class="pi-accent">headline</span></h1>
<p>Explain the single conceptual shift.</p>
<section class="pi-grid pi-hero">
  <div class="pi-diagram"><svg viewBox="0 0 600 400" role="img" aria-label="Describe the concept"><!-- precise topic diagram --></svg></div>
  <aside class="pi-insight"><h2>Key insight</h2><p>Explain why the relationship holds.</p></aside>
</section>
</main></body></html>
```

## Progressive explanation
Use any topic-specific content in each step. Controls must be inside their group; include the status element for automatic verification. Step one is visible without JavaScript; mark later steps hidden.
```html
<section class="pi-steps" data-pi-steps aria-label="Explanation steps">
  <article class="pi-step" data-pi-step><h2>First step</h2><p>First explanation.</p></article>
  <article class="pi-step" data-pi-step hidden><h2>Next step</h2><p>Next explanation.</p></article>
  <div class="pi-controls"><button type="button" data-pi-prev>Back</button><button type="button" data-pi-next>Next</button><span role="status" data-pi-step-status></span></div>
</section>
```

## Fraction experiment
This is a reusable control for fractions, not a generic diagram template. The SVG must contain equal parts. The runtime counts elements bearing `data-pi-part` and recolours them when the slider changes.
```html
<section data-pi-fraction aria-label="Explore fractions">
  <svg viewBox="0 0 400 100" role="img" aria-label="Four equal parts">
    <rect data-pi-part x="0" y="0" width="100" height="100" fill="#1249db"/>
    <rect data-pi-part x="100" y="0" width="100" height="100" fill="#1249db"/>
    <rect data-pi-part x="200" y="0" width="100" height="100" fill="#1249db"/>
    <rect data-pi-part x="300" y="0" width="100" height="100" fill="#faf7ef"/>
  </svg>
  <label>Selected parts <input type="range" min="0" max="4" value="3" step="1"></label>
  <output data-pi-fraction-value aria-live="polite">3/4 = 75%</output>
</section>
```

## Practice MCQs
Use radio inputs for single-answer questions, checkboxes for multiple-answer questions. Every input needs `data-pi-answer="true"` or `"false"`; feedback compares the entire selected set. Give each question a unique input name. All controls and feedback stay inside its form. Provide explanations for each choice, a hint, and a retry button. Shuffle option order during authoring. Keep options neutral and avoid recommended labels or predictable answer positions. This is open practice, not a secure exam: answer keys exist in the HTML source.
```html
<form class="pi-quiz" data-pi-quiz>
<fieldset><legend>Which statement is correct?</legend>
<label class="pi-option"><input type="radio" name="question-1" data-pi-answer="false" data-pi-explanation="Why this is incorrect.">First statement</label>
<label class="pi-option"><input type="radio" name="question-1" data-pi-answer="true" data-pi-explanation="Why this is correct.">Second statement</label>
<div class="pi-controls"><button type="submit">Check answer</button><button type="button" class="pi-secondary" data-pi-show-hint>Hint</button><button type="button" class="pi-secondary" data-pi-retry>Retry</button></div>
<p class="pi-feedback" role="status" data-pi-feedback hidden></p>
<p data-pi-hint hidden>A useful hint.</p>
</fieldset></form>
```

## Equations and custom interactions
Set `includeMath: true` to embed KaTeX and fonts offline. Put TeX in `<span data-pi-math="inline">` or `<div data-pi-math="display">`. Escape HTML entities in TeX where necessary. For simple notation, native MathML or plain text avoids the extra asset size. No icon dependency is required; optional symbols may use inline SVG with accessible labels.

Custom scripts must use `addEventListener`; HTML Viewer strips inline handlers. Use no CDN imports, fetches, external fonts, or remote images. Embed assets as data URLs when needed. Do not depend on persistent localStorage, access to the parent window, or a direct connection to Pi. Custom interactions need their own checks; the verifier automatically exercises only the standard steps, fraction slider, and practice controls. Respect reduced-motion preferences and keyboard navigation.

## Viewing and verification
Install and enable HTML Viewer in Obsidian. Open the saved HTML file in a tab beside the note. Enable Scripts ON for trusted interactive companions. Browser checks run locally with Playwright at 1200px and 400px, block external requests, collect script errors, and save temporary screenshots. They do not reproduce all Obsidian behaviours; test representative lessons in the plugin before relying on it. Browser opening is a fallback.

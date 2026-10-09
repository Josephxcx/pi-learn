# Botanical visual refinement

Apply the installed anthropics/skills frontend-design guidance to the plant-deficiency companion.

## Design brief
The learner should recognise a living plant and understand how leaf age relates to nutrient redistribution. The existing four flat leaves and straight stem lack anatomical detail and meaningful annotation.

## Visual tokens
- Page: #F7F8F0, a light botanical plate.
- Text: #203829, deep forest ink.
- Healthy foliage: #3F774D with #8DB65B highlights.
- Older foliage: #B6B952 with #D9C46A highlights, explicitly illustrative.
- Learning controls: existing cobalt #1249DB; high-contrast pale blue on dark surfaces.
- Annotation: #627464, secondary forest ink.
- Type: Palatino/Book Antiqua/Georgia for botanical headings; system sans-serif for annotations and controls. Offline system fonts retain portability.

## Layout
A large illustrated specimen sits beside an explanation that changes with the selected tissue. Labels stay outside foliage and connect with fine leader lines; roots remain visible below. A comparison table and recall practice follow the plate.

    [plant nutrition / topic title]
    [botanical specimen + labels] [leaf-age controls + explanation]
    [diagnostic comparison table]
    [steps and practice]

On a narrow pane, the explanation follows the specimen; controls wrap and labels remain legible.

## Subject-specific decisions
Use irregular leaf contours, branching veins, folded new growth, tapered stem, petioles, and fine roots. Preserve a restrained teaching illustration rather than add decoration. Number only actual teaching steps. Describe coloured lower leaves as illustrative rather than proof of a deficiency. Highlight tissue on user action; avoid ambient motion.

## Verification
Browser-test the leaf-age controls, focus semantics, and explanations. Verify the generated companion offline at 1200px and 400px; inspect screenshots. Preserve existing companion tools and quiz progression.

## Result
Installed `frontend-design` from `anthropics/skills` using the skills.sh CLI for Codex at `/home/agent/.agents/skills/frontend-design`. Rebuilt the plant companion with an editable inline SVG, natural foliage details, roots, deliberate labels, and tissue selection controls. Updated tutor guidance to prefer subject-grounded illustrations. All 15 tests passed; generated companions passed offline checks at 1200px and 400px; desktop and narrow screenshots were inspected.

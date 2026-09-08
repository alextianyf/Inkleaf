# Layout checks

This is the extension point for future checks of rendered HTML/printed geometry
(overflow, clipping, page breaks). It does not rewrite Markdown.

Existing source layout preservation lives in `desktop/html-layout.cjs` and the
document stylesheet. Existing HTML/resource/link notices live in `document.cjs`.
There is no general runtime geometry detector here yet. Regression tests are in
`desktop/test/html-layout-smoke.cjs` and `compatibility-smoke.cjs`.

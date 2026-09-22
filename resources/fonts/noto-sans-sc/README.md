# Noto Sans SC for Modern

Modern uses this bundled Chinese sans-serif font under the internal CSS family
`Inkleaf CJK`. Inter remains first for Latin text; JetBrains Mono remains first
for code. Classic and Minimal keep their existing font choices.

- Source: Google Fonts, Noto Sans SC CSS delivery version `v40`, downloaded 2026-09-21.
- Request: `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap`
- License: SIL Open Font License 1.1; copyright and terms are preserved in `OFL.txt`.
- Files: 101 unmodified variable WOFF2 subsets, weights 100–900, 4,516,508 bytes total.
- `manifest.json` records each subset's original URL, Unicode range, byte count and SHA-256.

The conversion engine chooses subsets from the rendered document's characters
(including generated callout labels and the signature). It embeds them as data
URLs, so PDF conversion does not fetch fonts from the network. Plain ASCII
documents do not embed the Chinese font. Loaded subset CSS is cached in memory;
the total cache is bounded by this finite set of bundled files.

These subsets cover the font's supplied character repertoire, not every Unicode
character. Characters outside it still use system fallback. Browser-generated
page headers and footers retain their existing system-font styling.

To update: fetch the Google Fonts CSS with a full current desktop browser user
agent (the generic response can contain TTF files instead of variable WOFF2
subsets), preserve every `unicode-range`, and download the corresponding WOFF2
files without modifying their contents. Rebuild the manifest and verify the font
license before updating. Run the bundled-CJK unit and Electron integration tests,
then inspect Chinese and English quality samples.

```powershell
npm.cmd test
npm.cmd run test:cjk
npm.cmd run check:quality -- --themes=modern --langs=en,zh
```

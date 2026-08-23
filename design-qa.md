# Design QA

## Scope

- Surface: canvas workspace on mobile and desktop.
- Target: make image/video generation styles selectable and keep the mobile workspace controls readable without covering the canvas.
- State: isolated local QA account with one image node, one generated image asset, one newly created video node, personal image/video providers, and nine saved styles.

## Visual truth

- User reference: `/Users/zhanghanyue/Downloads/IMG_7110.PNG` (1320×2868 physical pixels).
- Implemented mobile toolbar: `/tmp/manga-style-mobile-toolbar-fixed.png` (390×844 CSS pixels, device scale factor 1).
- Implemented image style menu: `/tmp/manga-style-mobile-menu.png` (390×844 CSS pixels, device scale factor 1).
- Implemented video style menu: `/tmp/manga-video-style-mobile-menu.png` (390×844 CSS pixels, device scale factor 1).
- Full-view comparison: `/tmp/manga-style-mobile-comparison.png` (780×844; reference normalized to 390×844 on the left, implementation on the right).

## Findings and fixes

1. P1 — The reference mobile layout squeezed the selected-node action labels into vertical text and placed the large creation toolbar over the canvas. The node action toolbar is now a fixed, horizontally scrollable row below the workspace header; the creation toolbar is a compact, horizontally scrollable bottom dock.
2. P1 — Image and video generation nodes had no direct style control even though the backend already accepted `style_id`. Both nodes now expose the same thumbnail style picker, send the selected `style_id` in generation payloads, and persist both `styleId` and `style_id` with the project.
3. P2 — The workspace header was a single clipped row on mobile. It now occupies two stable rows above the iframe, so project navigation, workbench tabs, save state, API settings, and logout remain reachable without covering node actions.
4. P2 — The minimap consumed a large part of the mobile viewport. It is hidden below 880 px, and an explicit `适配` action remains in the bottom dock.
5. Focused comparison — At 390×844, toolbar labels remain horizontal, the style menu renders at an unscaled 280 px width with readable thumbnails, and no control overlaps the workspace header or bottom dock.

## Functional checks

- Image node style selection: selected `真人短剧`; persisted as `styleId/style_id = style_1` in the isolated project JSON.
- Video node creation and style selection: selected `电影写实`; persisted as `styleId/style_id = style_2` in the same project JSON.
- Reopening at the desktop viewport restored both selected style names, proving project persistence rather than transient component state.
- Mobile interactions tested: switch workbench tabs, fit view, select an image node, horizontally inspect node actions, open/close the style menu, choose an image style, create a video node, and choose a video style.
- Desktop DOM check confirmed image and video style controls remain visible and the minimap remains available.
- Console review found no new application errors. The existing Three.js duplicate-import warning is unchanged.

## Verification

- Canvas tests: 14 passed.
- TypeScript typecheck: passed.
- Canvas production build: passed.
- Python tests: 41 passed.
- `git diff --check`: passed.

## Final result

passed

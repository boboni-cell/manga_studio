# Design QA

## Scope

- Surface: authenticated homepage and canvas workspace shell.
- Target: align the workspace palette with the homepage and prevent the mobile workspace header from covering canvas controls.
- State: isolated local QA account with a saved project and imported personal API profiles.

## Visual truth

- User issue reference: `/var/folders/09/2l28qsrs7c581dly276t5q940000gn/T/codex-clipboard-0881dbed-3b46-4053-85dc-0402bec195a8.png` (1206×232).
- Homepage reference capture: `/tmp/manga-qa-home-mobile.png` (390×844, device scale factor 1).
- Implemented workspace capture: `/tmp/manga-qa-workspace-mobile-v2.png` (390×844, device scale factor 1).
- Side-by-side comparison: `/tmp/manga-qa-theme-comparison.png` (780×844).

## Findings and fixes

1. P1 — The fixed mobile workspace switcher overlaid the canvas iframe and hid controls. The workspace shell now uses a column layout: the switcher occupies the first 56 px and the canvas stage begins at y=56. The switcher remains horizontally scrollable so every action stays reachable at 390 px width.
2. P2 — Workspace, canvas, API settings, admin, login, and asset pages used disconnected gray/blue tokens. Their backgrounds, borders, accents, focus rings, and active states now use the homepage purple/black palette while preserving the existing typography, spacing, and component structure.
3. Focused comparison — The user-flagged top header no longer covers content; the full-screen comparison confirms the workspace and homepage share the same background, border, and purple accent family.

## Functional checks

- Provider menus expose separate `平台模型` and `个人 API` groups; multiple imported personal image profiles appear together and remain individually selectable.
- Image-node skill controls use platform/personal text models and keep the classic-workbench text-model route.
- API settings and admin `返回工作台` use same-origin browser history and fall back to the homepage only when no safe previous page exists.
- Browser media helpers cover image/video/audio download, image clipboard copy, URL-copy fallback, and authenticated history-media fallback; unit tests exercise proxy URL and download-name resolution.
- Mobile header geometry: header top 0, bottom 56, height 56; canvas stage top 56, height 788 at 390×844.
- Console review found no new application error after the back-navigation fix. The existing Three.js duplicate-import warning is unchanged.

## Verification

- Canvas tests: 14 passed.
- TypeScript typecheck: passed.
- Canvas production build: passed.
- Python tests: 41 passed.
- `git diff --check`: passed.

## Final result

passed

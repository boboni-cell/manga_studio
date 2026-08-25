# Design QA

## Evidence

- Source visual truth: `/var/folders/09/2l28qsrs7c581dly276t5q940000gn/T/codex-clipboard-e814b397-3544-4cca-9c0f-e80b9b69a509.png` (1022 × 724 px), showing the redundant Base URL, submit URL, and query URL fields that the user asked to replace with one complete URL field.
- Classic history reference: `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/classic-history-desktop.png` (1440 × 1000 px).
- API implementation: `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/api-settings-desktop.png` (1425 × 1042 px) and focused `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/api-settings-custom-video-focused.png` (384 × 692 px).
- Canvas history implementation: `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/canvas-history-desktop.png` (1440 × 1000 px) and `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/canvas-history-mobile.png` (390 × 844 px).
- Mobile API implementation: `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/api-settings-mobile.png` (375 × 2343 px).
- CSS viewports: desktop 1440 × 1000, mobile 390 × 844. Device scale factor 1; no density normalization was required.
- State: authenticated local QA user, video provider switched to Custom API, and canvas history panel open with two shared history records.

## Full-view comparison

- API settings keeps the existing dark purple visual system, type hierarchy, field dimensions, radii, and action-button treatment. Custom API now shows one complete URL field; Base URL and query URL are not visible.
- Canvas adds a matching rail button without changing the existing toolbar size or visual language. The history panel reads from the same `/api/history` records as the classic workbench and remains inside the viewport on desktop and mobile.

## Focused comparison

- The original API screenshot and focused implementation were opened together. The implementation removes the two redundant address fields while retaining the API key and model fields in the same order.
- The classic and canvas history captures were opened together. Both show the same record names and media. Canvas intentionally uses the existing asset-panel card layout so selecting a record adds it directly to the node canvas.

## Fidelity surfaces

- Fonts and typography: existing system font stack, weights, sizes, line heights, and truncation behavior are preserved.
- Spacing and layout rhythm: the single endpoint field reduces vertical density; history panel spacing and mobile two-column cards fit without clipping persistent controls.
- Colors and tokens: existing canvas and API purple tokens, borders, backgrounds, and active states are reused.
- Image quality and assets: history previews use the original history media URLs; the new history icon comes from the existing Lucide icon dependency.
- Copy and content: labels now say “完整接口 URL” and “历史记录”; guidance explicitly says only one URL is required and history is synchronized with the classic workbench.

## Comparison history

1. Initial API visual check found a P1 issue: the Base URL label still rendered because the author `label { display:block }` rule overrode the HTML `hidden` attribute.
2. Added an explicit `[hidden] { display:none!important }` rule, reloaded the page, and recaptured the same Custom API state. The Base URL and query URL are no longer visible.

## Interaction and console checks

- Tested opening the canvas history button on desktop and mobile.
- Confirmed the history category opens directly, shows the same two classic records, and exposes media activation controls.
- Confirmed Custom API exposes one visible complete endpoint field and the DashScope example placeholder.
- Browser console: no errors. One pre-existing Three.js duplicate-instance warning remains and is unrelated to these changes.

## Findings

- No actionable P0, P1, or P2 differences remain.
- P3: the canvas history presentation is a compact picker rather than the classic full-page timeline; this is intentional so a record can be added to the canvas without leaving the current graph.

## Implementation checklist

- [x] One complete Custom API URL field.
- [x] DashScope async submit and task polling derived automatically.
- [x] Dedicated canvas history rail button.
- [x] Shared classic history data on desktop and mobile.
- [x] No new viewport obstruction.

final result: passed

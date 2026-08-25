# Canvas mobile and asset UI design QA

- Source visual truth:
  - `/Users/zhanghanyue/Downloads/IMG_7139.PNG`
  - `/var/folders/09/2l28qsrs7c581dly276t5q940000gn/T/codex-clipboard-c26c18e1-4664-490a-bec1-39d9400dcdfe.png`
  - `/var/folders/09/2l28qsrs7c581dly276t5q940000gn/T/codex-clipboard-20a8ab4a-a484-4e8e-a245-fc37a9e8e78d.png`
- Browser-rendered implementation evidence:
  - `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/mobile-asset-panel.png`
  - `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/mobile-node-selected.png`
  - `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/mobile-multi-select-final.png`
  - `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/desktop-asset-panel.png`
  - `/Users/zhanghanyue/Movies/manga_studio/artifacts/design-qa/desktop-ai-image-node-final.png`
- Viewports: 402 × 874 CSS px for mobile; 1280 × 800 CSS px for desktop.
- Pixels and density: browser captures use the active browser density. The supplied mobile source is 1320 × 2868 px and was compared by normalized content regions because it includes Safari chrome; desktop sources are 856 × 1238 px and 1458 × 828 px.
- State: canvas workbench with AI image nodes; selected-node toolbar; asset panel; mobile multi-select with two selected nodes.

## Findings

- No actionable P0/P1/P2 issue remains in the changed surfaces.
- The mobile source shows a fixed-width tool panel extending outside the viewport and controls trapped behind it. The implementation keeps canvas panels inside the viewport, enables panel scrolling, and gives the selected-node toolbar a 372 px viewport over a 1133 px horizontal scroll range with `touch-action: pan-x`.
- The mobile source has no usable multi-select path. The implementation adds an explicit mobile-only multi-select control. Browser verification selected two nodes and rendered the batch toolbar; its 552 px content scrolls inside a 384 px viewport without shrinking or vertically wrapping actions.
- The desktop asset source hides categories in a narrow horizontal strip and wraps the add label. The implementation uses the existing purple canvas tokens, a 720 px desktop panel, a single-line accent add action, and wrapped category chips so all eight categories remain visible.
- The AI image source compresses all controls into one line. The implementation gives model configuration its own row and keeps style, camera, count, and generate actions in a separate aligned row.
- The supplied screenshots document broken states rather than a desired visual mock, so the implementation intentionally does not reproduce their overflow and obstruction.

## Interaction checks

- Tapped an AI image node at mobile width and confirmed the selected-node toolbar appeared.
- Confirmed the selected-node toolbar can scroll horizontally to its full content width.
- Enabled mobile multi-select, selected two nodes, and confirmed batch actions appeared in a horizontally scrollable toolbar.
- Opened the asset panel at mobile and desktop widths; all category tabs were visible and the content area remained vertically scrollable.
- Browser error overlay: none. Browser errors: none. Existing Three.js duplicate-instance warnings remain unrelated to this change.

## Required fidelity surfaces

- Fonts and typography: existing application font stack, weights, truncation, and hierarchy are preserved; mobile batch actions stay on one line.
- Spacing and layout rhythm: mobile panels respect 8 px viewport gutters and the bottom tool rail; desktop asset spacing uses the existing 8/12/16 px rhythm.
- Colors and visual tokens: asset and floating panels now use the canvas surface, border, muted-text, and accent tokens instead of an isolated gray treatment.
- Image quality and asset fidelity: asset preview rendering and object-cover behavior are unchanged.
- Copy and content: existing labels are retained; only the explicit `多选` control and category-aware add label were introduced.

## Comparison history

- First pass found the mobile batch toolbar shrinking labels into vertical text.
- The toolbar children were changed to non-shrinking, single-line items inside a horizontal scroll container.
- Post-fix browser evidence measured two selected nodes, a visible batch toolbar, 384 px client width, 552 px scroll width, and zero flex shrink on all actions.

final result: passed

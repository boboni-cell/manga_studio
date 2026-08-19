# Third-Party Notices

This project references (does not wholesale copy) the following MIT-licensed
repositories. Original copyright notices are preserved in the corresponding
LICENSE files under `third_party/`.

## 1. open-canvas

- URL: https://github.com/ZeroLu/open-canvas
- Commit: `cf3a906bb8c35bb940d3267497e7f394b8f42582` (main)
- License: MIT — Copyright (c) 2026 ZeroLu
- Local license: `third_party/open-canvas-LICENSE`
- Referenced / adapted:
  - Note text node concept → adapted into Manga Studio `note` canvas node
    (local: `canvas/src/nodes.tsx`, `canvas/src/NodeInspector.tsx`,
    `app.py` canvas whitelist).
  - Canvas JSON import/export idea → adapted into Manga Studio's own safe
    `manga-studio-canvas` schema (local: `app.py`,
    `POST /api/projects/import`, `GET /api/canvas/<id>/export`).
  - Node duplication → already implemented natively in Manga Studio
    (`canvas/src/App.tsx` `duplicateNode`).
  - Branching menu / studio layout → used only as interaction reference;
    re-implemented with @xyflow/react (`canvas/src/App.tsx`).
- NOT imported: Open Canvas login, Cyberbara, OpenRouter/Replicate providers,
  local cookie key storage, `open-canvas-db.json`, its upload/storage code,
  its Next.js backend, its points/execution logic.

## 2. seedance-2.0

- URL: https://github.com/Emily2040/seedance-2.0
- Commit: `44b514992963a2570beee71aaf2a8720785f7ec2` (main)
- License: MIT — Copyright (c) 2026 Iamemily2050 (@iamemily2050)
- Local license: `third_party/seedance-2.0-LICENSE`
- Referenced / adapted:
  - Director/prompt capabilities (prompt, sequence, continuation, camera,
    motion, characters, audio, troubleshoot) → re-written as Manga Studio
    minimal text-only prompts in `prompts/skills/seedance/*.md`.
  - These local prompts are original minimal rewrites; repository prose,
    model IDs, date-specific claims and pricing are not copied.
- NOT imported: any provider SDK, upload logic, or generation API calls.

## 3. drama-skills

- URL: https://github.com/worldwonderer/drama-skills
- Commit: `bc040191458da3d5b6eaa7068da67527ae3c912f` (main)
- License: MIT — Copyright (c) 2026 drama-skills contributors
- Local license: `third_party/drama-skills-LICENSE`
- Referenced / adapted:
  - Text creation workflow stages (init, novel analyze, develop, write,
    assets, image prompts, storyboard, video prompts, review) → re-written as
    Manga Studio minimal text-only prompts in `prompts/skills/drama/*.md`.
  - These local prompts are original minimal rewrites; no repository text is
    copied verbatim.
- NOT imported: any image/video/audio generator, uploader, or execution logic.

## 4. open-storyboard-canvas

- URL: https://github.com/ganbo-gab/open-storyboard-canvas
- Commit (locked): `c610d5895aab59bf39735c2a2802c3a8b7b124f7` (main, v0.1.26)
- License: MIT — "Open Storyboard Canvas additions: Copyright (c) 2026
  ganbo-gab and contributors"; original project attribution retained:
  "Storyboard-Copilot by henjicc / 痕继痕迹",
  https://github.com/henjicc/Storyboard-Copilot (authorized continuation).
- Local copies: `canvas-v2/LICENSE`, `canvas-v2/NOTICE`,
  `canvas-v2/docs/legal/upstream-author-authorization-2026-05-31.jpg`
- Ported / adapted into `canvas-v2/` (Manga Studio's new canvas workbench):
  - Canvas core: `src/features/canvas/Canvas.tsx` (框选/多选/复制粘贴/拖放/
    连线/右键菜单/批处理工具条), `CanvasSideToolbar.tsx`,
    `NodeSelectionMenu.tsx`
  - Node selection context: `ui/SelectedNodeOverlay.tsx`,
    `ui/NodeActionToolbar.tsx`, `ui/NodeDeleteToolbar.tsx`,
    `ui/nodeToolbarConfig.ts` (改造为 Manga Studio 节点下方编辑浮层
    `ui/MangaNodeEditPanel.tsx`)
  - Node components: `nodes/*`（UploadNode/ImageEditNode/ExportImageNode/
    AiTextNode/TextAnnotationNode/JsonCardNode/AiVideoNode/VideoNode/
    AiAudioNode/AudioNode/StoryboardNode/StoryboardGenNode/GroupNode/TagNode/
    TagGroupNode/PanoramaNode/BlueprintNode 等）
  - Domain/application logic: `domain/canvasNodes.ts`, `domain/nodeRegistry.ts`,
    `application/nodeCatalog.ts`, `nodeFactory.ts`, `canvasCommandGraph.ts`,
    `canvasCommandRegistry.ts`, `canvasCommandService.ts`,
    `canvasConnectionRules.ts`, `canvasNodePlacement.ts`,
    `canvasGraphIndex.ts`, `canvasGraphSelectors.ts`, `imageData.ts`,
    `imageDragDrop.ts`, `imageNodeSizing.ts`, `imageRequestGeometry.ts`,
    `imageOutputGeometry.ts`, `generatedMediaNaming.ts`,
    `generationRecovery.ts`, `generationRetry.ts`, `generationSubmitLock.ts`,
    `promptImport/*`, `canvasAssetCatalog.ts`
  - Edges: `edges/DisconnectableEdge.tsx`, `edges/edgeRouting.ts`
  - Hooks: `useCanvasShortcuts.ts`, `useCanvasWasdPan.ts`,
    `useCanvasGenerationPolling.ts`, `useImageViewer*.ts`
  - Stores: `stores/canvasStore.ts`, `stores/panelStateStore.ts`
  - UI shell & i18n: `components/ui/*`, `i18n/*`（上游中文文案基线）
- NOT imported: `src-tauri/`（Tauri 原生层）, provider/API-Key 客户端配置,
  `features/canvas/agent/*`（外部 Agent Dock）, 自动更新, 原生文件对话框,
  客户端第三方上传, Dreamina/自定义服务商网关, 品牌图标与名称
  （不复制 open-storyboard-canvas 品牌作为 Manga Studio 品牌）.
- 集成改造（本地新增，不属上游代码）: `src/api.ts`,
  `infrastructure/webApiGateway.ts`, `src/WorkbenchApp.tsx`,
  `lib/legacyCompat.ts`（旧画布一次性迁移）.

## Notes

- All referenced content is MIT-licensed; original copyright lines are kept in
  the LICENSE files above.
- Manga Studio's Flask auth, user isolation, projects, billing, personal API,
  R2/TOS storage, and Postgres dual-write remain the single source of truth.

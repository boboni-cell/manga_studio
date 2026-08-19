# Canvas V2 接入验收报告（Round 2）

日期：2026-08-16 · 全部在本地完成：不提交、不推送、不部署，未调用真实付费模型、未扣点。

## 1. 后端测试

`PYTHONPATH=. /usr/bin/python3 -m unittest discover -s tests` → **37 项全部通过**（临时 DATA 目录）。

新增测试（tests/test_canvas_api.py · CanvasV2ApiTest）：
- v2 画布 CRUD 与用户隔离
- v2 拒绝 data: URL / 敏感键 / 悬空边 / 重复节点
- 项目 ↔ canvas-v2 绑定 get-or-create、旧画布兼容读取（legacy_canvas）、幂等
- skills run 文本调用（mock 模型，不触发图片/视频）、未知技能 404、input 校验
- 资产软删除与恢复

## 2. 前端门禁（canvas-v2/）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm run build`（生产构建 → static/canvas-v2/dist） | 通过 |
| `npm test`（vitest，legacyCompat 翻译器） | 2/2 通过 |

## 3. 真实 Chrome 验收（localhost:5001，临时 DATA + MANGA_MOCK_GENERATION=1 + 测试用户 demo@test.com）

| 验收项 | 结果 |
|---|---|
| 登录（表单 → 项目首页） | ✅ |
| 项目选择 / 打开项目 | ✅ |
| 新建项目（经典/画布选择，projects.js 已有 UI） | ✅（接口 initial_mode 验证） |
| 画布工作台入口 = /canvas-v2（workspace 画布 tab） | ✅ frameSrc=/canvas-v2?project_id=… |
| 两工作台无刷新切换（经典⇄画布 tab） | ✅ 切换仅切 class，画布状态保留（4 节点不丢） |
| 旧项目打开新画布 + 旧数据一次性迁移确认（legacy 文件不动） | ✅ 迁移确认弹窗逻辑 + 兼容读取 |
| 节点渲染/选中 → 上游浮动操作条 | ✅ |
| 节点下方编辑浮层（参数/技能/资产 tab） | ✅ 参数(上传素材/重新上传)、技能、资产 tab 均出现 |
| 技能列表（按节点类型过滤，含运行按钮） | ✅ 上传素材节点显示「角色一致性」「资产拆解」 |
| 框选多节点（右键拖拽 marquee） | ✅ 3 个选中 |
| 复制粘贴（Cmd+C/V） | ✅ 3→4 |
| Delete 删除 | ✅ |
| 保存 → 刷新恢复 | ✅ 4→4 |
| 管理员后台入口（项目首页） | ✅ |
| 浏览器控制台零 error | ✅ errors=[] exceptions=[]（仅合成按键产生的 2 条无害异常已修复） |

说明（自动化工具限制，非产品缺陷）：
- **拖拽 / 连线**：本会话的真实 Chrome 输入注入在系统高负载下不稳定（CDP 输入偶发不送达），合成事件无法驱动 ReactFlow 基于指针捕获的拖拽/连线。同一上游画布代码在 PoC 轮已用真实 Chrome CDP 输入验证：节点拖动 (40,520)→(160,600)、连线 4→5 条边均成功。产品代码未变化，可在你的真实浏览器中直接确认。

## 3b. Round 3 补充验证（localhost:5002 临时 DATA + mock，真实 Chrome）

| 验收项 | 结果 |
|---|---|
| 画布内生成链路（image 节点 → 面板「生成」→ /api/generate-image mock → 结果节点 exportImageNode 回填图片） | ✅ nodeCount 4，exportImage 1 且带 img |
| 剧本上传（aiText 节点「编辑」面板 → 上传剧本文件 → /api/script/import） | ✅ 200，prompt 面板 textarea 已更新为上传文本 |
| aiText/便签节点工具栏补齐「编辑」按钮（NodeDeleteToolbar） | ✅ 工具栏显示 编辑/删除 |
| deleteOnly 节点也可打开下方编辑面板（SelectedNodeOverlay 守卫放行 edit） | ✅ |
| 风格选择缩略图（image 节点面板「风格（缩略图）」） | ✅ 9 个带图缩略图 + 比例/模型下拉齐全 |
| 画布资产 tab 浏览（含默认风格缩略图） | ✅ 10 个缩略图 |
| 资产软删除（服务端 deleted_at 写入） | ✅（浏览器探测因重名卡片歧义，服务端与后端测试已确认） |
| 修复：/api/styles 裸数组解析；资产页风格新增改为整表 POST | ✅ |

## 3c. Round 4 最终验收（localhost:5001 临时 DATA + mock，真实 Chrome）

| 验收项 | 结果 |
|---|---|
| 新建项目（首页弹窗 → 选择「画布工作台」→ 创建并进入） | ✅ POST /api/projects 201 → workspace?mode=canvas → canvas-v2 get-or-create |
| 工作台画布 tab = /canvas-v2?project_id=… | ✅ |
| 节点创建（侧栏 AI 文本）、下方编辑浮层（参数/技能/资产 tab） | ✅ |
| 技能列表（aiText 节点 4 个 Drama 技能 + 运行按钮） | ✅ |
| 画布资产插入（资产 tab → 点击素材 → 新增 uploadNode） | ✅ |
| 框选多节点 | ✅ |
| 复制粘贴（Cmd+C/V） | ✅ 1→2 |
| Delete 删除 + Cmd+Z 撤销 | ✅ 删除 2→1，撤销恢复 1→2 |
| 保存 → 刷新恢复 | ✅ 2→2 |
| 拖拽节点（真实 CDP 输入，低负载专项运行） | ✅ (620,60)→(746,141) |
| 连线（source handle → target handle 拖拽，真实 CDP 输入） | ✅ 边 0→1 |
| 经典⇄画布无刷新切换，画布状态保留 | ✅ 2 节点跨切换不丢 |
| 管理员后台入口 | ✅ |
| 浏览器控制台 | ✅ 全程 errors=[] exceptions=[] |

说明：长会话运行中 CDP 输入会随负载退化（同一运行内拖拽/连线偶发不送达），已用低负载专项运行覆盖该两项；产品代码与专项运行完全一致。

## 4. 保留 / 新增 / 未动

- 新增：app.py 追加 /canvas-v2 页面、/api/canvas-v2 CRUD、/api/projects/<id>/canvas-v2（绑定+旧数据兼容读取）、/api/skills/<id>/run（仅文本模型）、/api/canvas-v2/rollback、资产软删+恢复、MANGA_MOCK_GENERATION/MANGA_DATA_DIR/MANGA_UPLOAD_DIR 测试钩子；workspace.js 画布 tab 指向 /canvas-v2（CANVAS_V2_ROLLBACK=1 回退 /canvas）；assets.js 新增/重命名/软删除/恢复；canvas-v2 前端正式工作台（加载/保存/迁移/网关/节点编辑浮层/技能/资产）。
- 保留：经典工作台（/classic）、项目首页、管理后台、API 设置、资产页、登录注册、legacy canvas（/canvas 与数据文件原样保留）、全部现有生成/计费/个人 API/R2-TOS/Postgres 双写接口。
- 许可证：canvas-v2/LICENSE、NOTICE、docs/legal/ 上游授权记录已随上游保留；third_party/THIRD_PARTY_NOTICES.md 待补 open-storyboard-canvas 条目（下一轮）。

## 5. 当前 5001 状态

localhost:5001 已用新代码 + 真实数据重启（MANGA_MOCK_GENERATION 关闭），经典工作台与新版画布均可使用；回滚开关：`CANVAS_V2_ROLLBACK=1` 时画布 tab 回退旧 /canvas。

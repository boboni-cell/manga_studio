import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, addEdge, useNodesState, useEdgesState, useReactFlow, SelectionMode, type Connection, type Viewport } from '@xyflow/react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { api } from './api';
import { CanvasContext } from './context';
import { nodeTypes } from './nodes';
import { branchGroups, gridPositionFor, nextNodePosition, serializeEdges, serializeNodes } from './lib/canvas-logic';
import LeftPanel from './LeftPanel';
import RightToolbar from './RightToolbar';
import NodeInspector from './NodeInspector';
import NodeSkills from './NodeSkills';
import { refreshAssetCache, type AssetItem } from './asset-cache';
import type { CanvasNode, CanvasEdge, CanvasSummary, CanvasViewport } from './types';

const NODE_TYPES: Array<{ type: string; label: string }> = [
  { type: 'script', label: '剧本文本' },
  { type: 'shot', label: '镜头段落' },
  { type: 'asset', label: '素材引用' },
  { type: 'image', label: '图片生成' },
  { type: 'video', label: '视频生成' },
  { type: 'note', label: '便签' },
];

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultData(type: string): Record<string, unknown> {
  if (type === 'script') return { label: '剧本文本', script: '', script_model: 'doubao', split_mode: 'smart', split: { job_id: null, status: 'idle', shots: [], error: null } };
  if (type === 'shot') return { label: '镜头段落', shot_index: 0, segment: null };
  if (type === 'asset') return { label: '素材引用 · character', asset_type: 'character', refs: [] };
  if (type === 'image') return { label: '图片生成', role: 'storyboard', prompt: '', image_model: 'gpt-image-2', ratio: '1:1', status: 'idle', image_url: null, error: null, job_id: null };
  if (type === 'video') return { label: '视频生成', video_model: 'seedance', ratio: '9:16', duration: 5, resolution: '720p', optimize_prompt: true, status: 'idle', error: null, job_id: null };
  if (type === 'note') return { label: '便签', text: '', color: '#5b8def' };
  return { label: '结果', kind: 'image', media_url: null };
}

function makeNode(type: string, x: number, y: number): CanvasNode {
  return { id: 'n_' + uid(), type, position: { x, y }, data: defaultData(type) } as CanvasNode;
}

function CanvasApp() {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>([]);
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [canvasId, setCanvasId] = useState<string>('');
  const [title, setTitle] = useState('未命名画布');
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 0.85 });
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [apiProfiles, setApiProfiles] = useState<Record<string, any[]>>({ text: [], image: [], video: [] });
  const [selectedApiProfiles, setSelectedApiProfiles] = useState<Record<string, string>>({});
  const [modelCaps, setModelCaps] = useState<Record<string, any>>({});
  const [branchMenu, setBranchMenu] = useState<{ clientX: number; clientY: number; sourceId: string; groups: { title: string; options: { type: string; label: string }[] }[] } | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [panelTab, setPanelTab] = useState<'params' | 'skills'>('params');
  const [immersive, setImmersive] = useState(false);
  const [assetsVersion, setAssetsVersion] = useState(0);

  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1';
  const projectId = new URLSearchParams(window.location.search).get('project_id') || null;
  const coverSentRef = useRef(false);

  const loadingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const viewportRef = useRef(viewport); viewportRef.current = viewport;
  const titleRef = useRef(title); titleRef.current = title;
  const canvasIdRef = useRef(canvasId); canvasIdRef.current = canvasId;

  async function refreshList() {
    const r = await api<{ canvases?: CanvasSummary[] }>('/api/canvas');
    setCanvases(r.canvases || []);
    return r.canvases || [];
  }

  async function loadCanvas(id: string) {
    loadingRef.current = true;
    try {
      const r = await api<{ canvas: any }>('/api/canvas/' + encodeURIComponent(id));
      const canvas = r.canvas;
      setCanvasId(canvas.id);
      setTitle(canvas.title || '未命名画布');
      setViewport(canvas.viewport || { x: 0, y: 0, zoom: 0.85 });
      setNodes(canvas.nodes || []);
      setEdges((canvas.edges || []).map((edge: any) => ({ id: edge.id, source: edge.source, target: edge.target })));
      setLoaded(true);
    } finally {
      loadingRef.current = false;
    }
  }

  async function newCanvas() {
    const r = await api<{ canvas: any }>('/api/canvas', { method: 'POST', body: JSON.stringify({ title: '未命名画布', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.85 } }) });
    await refreshList();
    await loadCanvas(r.canvas.id);
  }

  async function deleteCanvas() {
    if (!canvasId) return;
    if (!window.confirm('确定删除当前画布？此操作不可恢复。')) return;
    await api('/api/canvas/' + encodeURIComponent(canvasId), { method: 'DELETE' });
    const list = await refreshList();
    if (list.length > 0) await loadCanvas(list[0].id);
    else await newCanvas();
  }

  async function exportCanvas() {
    const r = await api<any>('/api/canvas/' + encodeURIComponent(canvasIdRef.current) + '/export');
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (titleRef.current || 'canvas') + '.manga-studio-canvas.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCanvas(file: File) {
    const text = await file.text();
    let data: any;
    try { data = JSON.parse(text); } catch { window.alert('JSON 解析失败'); return; }
    const nodeCount = Array.isArray(data.nodes) ? data.nodes.length : 0;
    const edgeCount = Array.isArray(data.edges) ? data.edges.length : 0;
    if (!window.confirm('导入将创建新项目，包含 ' + nodeCount + ' 个节点、' + edgeCount + ' 条边。是否继续？')) return;
    const r = await api<any>('/api/projects/import', { method: 'POST', body: text });
    window.location.href = '/workspace/' + r.project.id + '?mode=canvas';
  }

  async function doSave() {
    if (!canvasIdRef.current || !loaded || loadingRef.current) return;
    setSaveState('saving');
    try {
      await api('/api/canvas/' + encodeURIComponent(canvasIdRef.current), {
        method: 'PUT',
        body: JSON.stringify({ title: titleRef.current, nodes: serializeNodes(nodesRef.current), edges: serializeEdges(edgesRef.current), viewport: viewportRef.current }),
      });
      if (projectId) {
        await api('/api/projects/' + encodeURIComponent(projectId), { method: 'PUT', body: JSON.stringify({ title: titleRef.current }) }).catch(() => undefined);
      }
      setSaveState('saved');
    } catch (saveError) {
      setSaveState('error');
      console.error('保存失败', saveError);
    }
  }

  useEffect(() => {
    if (!loaded || loadingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    saveTimerRef.current = window.setTimeout(() => { doSave(); }, 800);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, viewport, title, loaded]);

  useEffect(() => {
    if (!projectId || !loaded || coverSentRef.current) return;
    const coverNode = nodes.find((n) => (n.type === 'image' && n.data.image_url) || (n.type === 'result' && n.data.media_url));
    if (!coverNode) return;
    const coverUrl = coverNode.type === 'result' ? String(coverNode.data.media_url) : String(coverNode.data.image_url);
    if (!coverUrl) return;
    coverSentRef.current = true;
    api('/api/projects/' + encodeURIComponent(projectId), { method: 'PUT', body: JSON.stringify({ cover_url: coverUrl }) }).catch(() => undefined);
  }, [nodes, projectId, loaded]);

  useEffect(() => {
    (async () => {
      try {
        if (projectId) {
          const r = await api<{ project: any }>('/api/projects/' + encodeURIComponent(projectId));
          setCanvases([{ id: r.project.canvas_id, title: r.project.title, created_at: r.project.created_at, updated_at: r.project.updated_at }]);
          await loadCanvas(r.project.canvas_id);
        } else {
          const list = await refreshList();
          if (list.length > 0) await loadCanvas(list[0].id);
          else await newCanvas();
        }
      } catch (initError) { setError((initError as Error).message); }
    })();
  }, []);

  useEffect(() => {
    api<{ api_profiles?: Record<string, any[]>; selected_api_profiles?: Record<string, string> }>('/api/settings').then((settings) => { setApiProfiles(settings.api_profiles || { text: [], image: [], video: [] }); setSelectedApiProfiles(settings.selected_api_profiles || {}); }).catch(() => undefined);
    api<Record<string, any>>('/api/model-caps').then((caps) => setModelCaps(caps || {})).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBranchMenu(null);
        setNodeMenuOpen(false);
        setEditorOpen(false);
        setImmersive(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== location.origin) return;
      const data = event.data;
      if (data && data.type === 'workspace:activated' && data.mode === 'canvas') {
        refreshAssetCache().then(() => setAssetsVersion((v) => v + 1));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (embedded && projectId && window.parent) {
      window.parent.postMessage({ type: 'canvas:save-state', state: saveState }, location.origin);
    }
  }, [saveState, embedded, projectId]);

  function updateNodeData(id: string, patch: Record<string, unknown>) {
    setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)));
  }

  function addResultNode(sourceId: string, kind: 'image' | 'video', url: string) {
    const source = nodesRef.current.find((node) => node.id === sourceId);
    const pos = source ? { x: source.position.x + 340, y: source.position.y } : { x: 0, y: 0 };
    const node = makeNode('result', pos.x, pos.y);
    node.data = { ...node.data, label: kind === 'video' ? '视频结果' : '图片结果', kind, media_url: url };
    setNodes((nds) => [...nds, node]);
    setEdges((eds) => [...eds, { id: 'e_' + uid(), source: sourceId, target: node.id }]);
  }

  function onConnect(params: Connection) {
    setEdges((eds) => addEdge({ ...params, id: 'e_' + uid() }, eds));
  }

  function addNodeFromPalette(type: string) {
    const pos = gridPositionFor(nodesRef.current.length);
    setNodes((nds) => [...nds, makeNode(type, pos.x, pos.y)]);
  }

  function addConnectedNode(sourceId: string, targetType: string) {
    const source = nodesRef.current.find((node) => node.id === sourceId);
    if (!source) { setBranchMenu(null); return; }
    const pos = nextNodePosition(source, nodesRef.current);
    const newNode = makeNode(targetType, pos.x, pos.y);
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, { id: 'e_' + uid(), source: sourceId, target: newNode.id }]);
    setBranchMenu(null);
  }

  function addAssetNode(item: AssetItem) {
    const pos = gridPositionFor(nodesRef.current.length);
    const node = makeNode('asset', pos.x, pos.y);
    node.data = { ...node.data, label: '素材引用 · ' + item.nodeAssetType, asset_type: item.nodeAssetType, refs: [{ source: item.source, ref_id: item.refId, name: item.name, url: item.url, role_label: item.role_label }] };
    setNodes((nds) => [...nds, node]);
  }

  function openBranchMenu(nodeId: string) {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const groups = branchGroups(node);
    if (groups.length === 0) return;
    const el = document.querySelector('[data-id="' + nodeId + '"]') as HTMLElement | null;
    const rect = el ? el.getBoundingClientRect() : null;
    setBranchMenu({ clientX: rect ? rect.right + 8 : 240, clientY: rect ? rect.top : 120, sourceId: nodeId, groups });
  }

  function openInspector(nodeId: string) {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
    setEditorOpen(true);
  }

  function duplicateNode(id: string) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const copy = makeNode(String(node.type || 'result'), node.position.x + 40, node.position.y + 40);
    copy.data = JSON.parse(JSON.stringify(node.data));
    setNodes((nds) => [...nds, copy]);
  }

  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }

  function previewNode(id: string) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const url = node.data.image_url || node.data.media_url;
    if (!url) { window.alert('该节点暂无预览内容'); return; }
    const openUrl = node.type === 'result' && node.data.kind === 'video' ? '/api/history/media?url=' + encodeURIComponent(String(url)) : String(url);
    window.open(openUrl, '_blank', 'noopener');
  }

  function onMoveEnd(_event: unknown, vp: Viewport) {
    setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
  }

  function focusNode(id: string) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
    rf.setCenter(node.position.x, node.position.y, { zoom: viewportRef.current.zoom, duration: 300 });
  }

  function fitView() {
    rf.fitView({ padding: 0.25, duration: 300 });
  }

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedCount = selectedNodes.length;
  const selectedNode = selectedCount === 1 ? selectedNodes[0] : null;
  const selectedAssetNode = selectedNode && selectedNode.type === 'asset' ? selectedNode : null;

  useEffect(() => {
    if (!editorOpen || !selectedNode) { setPanelPos(null); return; }
    const id = selectedNode.id;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-id="' + id + '"]') as HTMLElement | null;
      if (!el) { setPanelPos(null); return; }
      const rect = el.getBoundingClientRect();
      const panelWidth = Math.min(440, window.innerWidth - 16);
      const panelHeight = Math.min(window.innerHeight * 0.55, 480);
      let top = rect.bottom + 8;
      if (top + panelHeight > window.innerHeight - 8) top = Math.max(8, rect.top - panelHeight - 8);
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
      left = Math.max(8, left);
      setPanelPos({ left, top });
    });
    return () => cancelAnimationFrame(raf);
  }, [editorOpen, selectedNode, viewport, nodes]);

  const contextValue = useMemo(() => ({
    nodes, edges, apiProfiles, selectedApiProfiles, modelCaps,
    updateNodeData, addResultNode, openBranchMenu, openInspector, duplicateNode, deleteNode, previewNode,
  }), [nodes, edges, apiProfiles, selectedApiProfiles, modelCaps]);

  return (
    <div className="app">
      {!immersive && !(embedded && projectId) ? (
        <header className="canvas-topbar">
          <span className="brand">Manga Studio</span>
          <Input
            className="title-input h-8"
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="画布名称"
          />
          {!projectId ? (
            <select className="canvas-select h-8 text-xs" value={canvasId} onChange={(event) => { if (event.target.value) loadCanvas(event.target.value); }}>
              {canvases.map((canvas) => <option key={canvas.id} value={canvas.id}>{canvas.title || '未命名画布'}</option>)}
            </select>
          ) : null}
          <span className="save-state">{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : saveState === 'error' ? '保存失败' : ''}</span>
          {!projectId ? <Button variant="outline" size="sm" onClick={newCanvas}>新建</Button> : null}
          {!projectId ? <Button variant="destructive" size="sm" onClick={deleteCanvas}>删除</Button> : null}
          {!embedded ? <Button variant="outline" size="sm" onClick={() => setImmersive(true)}>沉浸</Button> : null}
          {!embedded ? <a className="back-link" href="/">返回工作区</a> : null}
        </header>
      ) : null}

      {error ? <div className="banner">{error}</div> : null}

      <div className="canvas-main">
        <CanvasContext.Provider value={contextValue}>
        {!immersive ? (
          <LeftPanel open={leftOpen} onClose={() => setLeftOpen(false)} nodes={nodes} assetsVersion={assetsVersion} selectedAssetNode={selectedAssetNode} updateNodeData={updateNodeData} addAssetNode={addAssetNode} onFocusNode={focusNode} onFitView={fitView} />
        ) : null}
        {!leftOpen && !immersive ? <Button variant="outline" className="left-open-btn" onClick={() => setLeftOpen(true)}>☰</Button> : null}

        <RightToolbar mode={interactionMode} setMode={setInteractionMode} onAddNode={() => setNodeMenuOpen((v) => !v)} onFitView={fitView} assetsOpen={leftOpen} setAssetsOpen={setLeftOpen} minimapOpen={minimapOpen} setMinimapOpen={setMinimapOpen} immersive={immersive} setImmersive={setImmersive} onTools={() => setToolsOpen((v) => !v)} />

        {nodeMenuOpen ? (
          <div className="node-menu-pop">
            {NODE_TYPES.map((item) => <button key={item.type} onClick={() => { addNodeFromPalette(item.type); setNodeMenuOpen(false); }}>{item.label}</button>)}
          </div>
        ) : null}

        {toolsOpen ? (
          <div className="node-menu-pop" style={{ right: 52, top: 300 }}>
            <button onClick={() => { exportCanvas(); setToolsOpen(false); }}>导出当前画布</button>
            <button onClick={() => { addNodeFromPalette('note'); setToolsOpen(false); }}>新建便签</button>
          </div>
        ) : null}

        {branchMenu ? (
          <div className="branch-menu" style={{ left: branchMenu.clientX, top: branchMenu.clientY }}>
            {branchMenu.groups.map((group) => (
              <div key={group.title} className="branch-group">
                <div className="branch-group-title">{group.title}</div>
                {group.options.map((option) => (
                  <button key={option.type} className="branch-item" onClick={() => addConnectedNode(branchMenu.sourceId, option.type)}>{option.label}</button>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {!immersive && editorOpen && selectedNode && panelPos ? (
          <div className="node-float-panel" style={{ left: panelPos.left, top: panelPos.top }}>
            <div className="node-float-panel-head">
              <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as 'params' | 'skills')}>
                <TabsList className="h-8">
                  <TabsTrigger value="params" className="text-xs px-3">参数</TabsTrigger>
                  <TabsTrigger value="skills" className="text-xs px-3">技能</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>关闭</Button>
            </div>
            {panelTab === 'params'
              ? <NodeInspector node={selectedNode} onClose={() => setEditorOpen(false)} onOpenAssets={() => setLeftOpen(true)} />
              : <NodeSkills nodeType={String(selectedNode.type)} />}
          </div>
        ) : null}

        <div className="flow-wrap">
            <ReactFlow
              key={canvasId}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onMoveEnd={onMoveEnd}
              onNodeClick={(event, node) => {
                const target = event.target as HTMLElement;
                if (target && typeof target.closest === 'function') {
                  if (target.closest('input, textarea, select, button, a, .react-flow__handle, .branch-add, .node-floatbar, img, video')) return;
                }
                openInspector(node.id);
              }}
              onNodeDoubleClick={(_event, node) => openInspector(node.id)}
              onPaneClick={() => { setBranchMenu(null); setNodeMenuOpen(false); }}
              onSelectionDragStart={() => setBranchMenu(null)}
              defaultViewport={viewport}
              nodeTypes={nodeTypes}
              panOnDrag={interactionMode === 'pan' ? true : [1, 2]}
              selectionOnDrag={interactionMode === 'select'}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={['Backspace', 'Delete']}
              minZoom={0.2}
              maxZoom={4}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.08)" />
              {minimapOpen ? <MiniMap /> : null}
            </ReactFlow>

          <div className="zoom-controls">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => rf.zoomOut()}>−</Button>
            <span className="tb-count">{Math.round(viewport.zoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => rf.zoomIn()}>＋</Button>
            <Button variant="outline" size="sm" className="h-7" onClick={fitView}>适应</Button>
          </div>
        </div>
        </CanvasContext.Provider>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}
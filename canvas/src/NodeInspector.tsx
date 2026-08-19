import { useEffect, useState } from 'react';
import { api, pollImage, pollScriptSplit, pollVideo, upstreamAllOfType, upstreamOfType } from './api';
import StylePicker from './StylePicker';
import { useCanvas } from './context';
import {
  buildImagePayload,
  buildScriptSplitPayload,
  buildVideoPayload,
  defaultApiProfileId,
  isValidApiProfileId,
  resolveVideoCaps,
  resolveVideoInputs,
  segmentPrompt,
  validateVideoCapabilities,
} from './lib/canvas-logic';
import type { AssetRef, CanvasNode, ScriptSplitState, ShotSegment } from './types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface NodeInspectorProps {
  node: CanvasNode;
  onClose: () => void;
  onOpenAssets: () => void;
}

let stylesCache: any[] | null = null;
let stylesPromise: Promise<any[]> | null = null;
function loadStyles(): Promise<any[]> {
  if (stylesCache) return Promise.resolve(stylesCache);
  if (!stylesPromise) {
    stylesPromise = api<any[]>('/api/styles').then((list) => { stylesCache = Array.isArray(list) ? list : []; return stylesCache; }).catch(() => { stylesCache = []; return stylesCache; });
  }
  return stylesPromise;
}

function StyleSelect(props: { value: string | null; onChange: (id: string) => void }) {
  const [styles, setStyles] = useState<any[]>([]);
  useEffect(() => { loadStyles().then(setStyles); }, []);
  return (
    <Select value={props.value || 'none'} onValueChange={(v) => props.onChange(v === 'none' ? '' : v)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="不指定风格" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">不指定风格</SelectItem>
        {styles.map((style) => <SelectItem key={String(style.id)} value={String(style.id)}>{String(style.name || style.id)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ApiProfileSelect(props: { kind: 'text' | 'image' | 'video'; value: string | null; onChange: (id: string) => void }) {
  const { apiProfiles } = useCanvas();
  const profiles = apiProfiles[props.kind] || [];
  if (profiles.length === 0) return null;
  const current = props.value && profiles.some((p: any) => String(p.id) === props.value) ? props.value : 'none';
  return (
    <Select value={current} onValueChange={(v) => props.onChange(v === 'none' ? '' : v)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="选择接口" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">不指定</SelectItem>
        {profiles.map((p: any) => <SelectItem key={String(p.id)} value={String(p.id)}>{String(p.name || p.model || p.id)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function NodeInspector(props: NodeInspectorProps) {
  const { nodes, edges, updateNodeData, addResultNode, apiProfiles, selectedApiProfiles, modelCaps, openBranchMenu } = useCanvas();
  const node = props.node;
  const id = node.id;
  const data = node.data;

  function update(patch: Record<string, unknown>) { updateNodeData(id, patch); }

  function updateSegment(patch: Record<string, unknown>) {
    const seg = (data.segment as ShotSegment) || {};
    updateNodeData(id, { segment: { ...seg, ...patch } });
  }

  if (node.type === 'script') {
    const split = (data.split as ScriptSplitState) || { job_id: null, status: 'idle', shots: [], error: null };
    const textProfiles = apiProfiles.text || [];
    const model = String(data.script_model || 'doubao');
    return (
      <ScriptEditor id={id} data={data} model={model} textProfiles={textProfiles} split={split} update={update} selectedApiProfiles={selectedApiProfiles} />
    );
  }
  if (node.type === 'shot') {
    const seg = (data.segment as ShotSegment) || {};
    const charactersText = Array.isArray(seg.characters) ? seg.characters.join('、') : String(seg.characters || '');
    return (
      <div className="flex flex-col gap-2 p-1">
        <div className="flex gap-2">
          <Input className="h-8 text-xs" value={String(seg.segment_no ?? '')} placeholder="镜头编号" onChange={(e) => updateSegment({ segment_no: e.target.value })} />
          <Input className="h-8 text-xs" value={String(seg.scene || '')} placeholder="场景" onChange={(e) => updateSegment({ scene: e.target.value })} />
        </div>
        <Input className="h-8 text-xs" value={charactersText} placeholder="角色（顿号分隔）" onChange={(e) => updateSegment({ characters: e.target.value.split('、').filter(Boolean) })} />
        <Input className="h-8 text-xs" value={String(seg.emotion || '')} placeholder="情绪" onChange={(e) => updateSegment({ emotion: e.target.value })} />
        <Textarea className="min-h-[60px] text-xs" value={String(seg.story_action || seg.action || '')} placeholder="动作" onChange={(e) => updateSegment({ story_action: e.target.value, action: e.target.value })} />
        <Textarea className="min-h-[60px] text-xs" value={String(seg.dialogue || '')} placeholder="对白" onChange={(e) => updateSegment({ dialogue: e.target.value })} />
        <Textarea className="min-h-[60px] text-xs" value={segmentPrompt(seg)} placeholder="video_prompt" onChange={(e) => updateSegment({ video_prompt: e.target.value })} />
        <Textarea className="min-h-[60px] text-xs" value={String(seg.timeline_text || '')} placeholder="timeline" onChange={(e) => updateSegment({ timeline_text: e.target.value })} />
      </div>
    );
  }
  if (node.type === 'asset') {
    const refs = (data.refs as AssetRef[]) || [];
    return (
      <div className="flex flex-col gap-2 p-1">
        <Select value={String(data.asset_type || 'character')} onValueChange={(v) => update({ asset_type: v, label: '素材引用 · ' + v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="character">角色</SelectItem>
            <SelectItem value="outfit">服装</SelectItem>
            <SelectItem value="scene">场景</SelectItem>
            <SelectItem value="audio">音频</SelectItem>
            <SelectItem value="video">参考视频</SelectItem>
            <SelectItem value="upload">多图参考</SelectItem>
            <SelectItem value="style">风格</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="text-xs" onClick={props.onOpenAssets}>打开资产库</Button>
          <span className="text-xs text-muted-foreground">已选 {refs.length} 项</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {refs.map((ref) => (
            <div key={ref.url} className="flex flex-col items-center gap-0.5">
              <img className="w-10 h-10 rounded object-cover bg-muted" src={ref.url} alt={ref.name} />
              <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1 text-destructive hover:text-destructive" onClick={() => update({ refs: refs.filter((r) => r.url !== ref.url) })}>移除</Button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (node.type === 'image') {
    return <ImageEditor id={id} data={data} nodes={nodes} edges={edges} update={update} apiProfiles={apiProfiles} selectedApiProfiles={selectedApiProfiles} />;
  }
  if (node.type === 'video') {
    return <VideoEditor id={id} data={data} nodes={nodes} edges={edges} update={update} addResultNode={addResultNode} apiProfiles={apiProfiles} selectedApiProfiles={selectedApiProfiles} modelCaps={modelCaps} />;
  }
  if (node.type === 'note') {
    return (
      <div className="flex flex-col gap-2 p-1">
        <Input className="h-8 text-xs" value={String(data.label || '便签')} placeholder="便签标题" onChange={(e) => update({ label: e.target.value })} />
        <Textarea className="min-h-[80px] text-xs" value={String(data.text || '')} placeholder="便签内容" onChange={(e) => update({ text: e.target.value })} />
        <Input className="h-8 text-xs" value={String(data.color || '#5b8def')} placeholder="颜色 #hex" onChange={(e) => update({ color: e.target.value })} />
      </div>
    );
  }
  if (node.type === 'result') {
    const url = String(data.media_url || '');
    return (
      <div className="flex flex-col gap-2 p-1">
        {url ? (data.kind === 'video' ? <video className="w-full max-h-[180px] object-contain rounded bg-black" controls src={'/api/history/media?url=' + encodeURIComponent(url)} /> : <img className="w-full max-h-[180px] object-contain rounded bg-black" src={url} alt="结果" />) : <div className="text-xs text-muted-foreground">暂无结果。</div>}
        <div className="flex gap-2 items-center">
          {url ? <Button variant="outline" size="sm" className="text-xs" asChild><a href={'/api/history/media?download=1&url=' + encodeURIComponent(url)}>下载</a></Button> : null}
          <Button variant="default" size="sm" className="text-xs" onClick={() => openBranchMenu(id)}>{data.kind === 'video' ? '续接视频' : '生成视频'}</Button>
        </div>
      </div>
    );
  }
  return <div className="text-xs text-muted-foreground p-2">未知节点类型</div>;
}

function ScriptEditor(props: any) {
  const [busy, setBusy] = useState(false);
  const [fileInfo, setFileInfo] = useState('');
  const running = busy || props.split.status === 'running';

  async function uploadScript(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/script/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '上传失败');
      if (typeof d.text === 'string') props.update({ script: d.text });
      const len = typeof d.length === 'number' ? d.length : (d.text ? String(d.text).length : 0);
      setFileInfo(file.name + ' · ' + len + ' 字符');
    } catch (err) {
      setFileInfo('错误：' + ((err as Error).message || '上传失败'));
    }
  }
  async function run() {
    const script = String(props.data.script || '').trim();
    if (!script) { window.alert('请先输入剧本文本'); return; }
    if (props.model === 'personal-api' && !isValidApiProfileId(props.textProfiles, props.data.api_profile_id || null)) { window.alert('请先选择有效的个人 API 接口'); return; }
    setBusy(true);
    props.update({ split: { ...props.split, status: 'running', error: null } });
    try {
      const payload = buildScriptSplitPayload({ script, mode: String(props.data.split_mode || 'smart'), model: props.model, usePersonalApi: props.model === 'personal-api', apiProfileId: props.model === 'personal-api' ? (props.data.api_profile_id || null) : null, styleId: props.data.style_id || null });
      const r = await api<{ job_id?: string; error?: string }>('/api/script/split', { method: 'POST', body: JSON.stringify(payload) });
      if (!r.job_id) throw new Error(r.error || '提交失败');
      props.update({ split: { ...props.split, job_id: r.job_id, status: 'running' } });
      const shots = await pollScriptSplit(r.job_id);
      props.update({ split: { job_id: r.job_id, status: 'succeeded', shots, error: null } });
    } catch (error) { props.update({ split: { ...props.split, status: 'failed', error: (error as Error).message } }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex gap-2 items-center">
        <Label className="cursor-pointer text-xs flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80">
          上传剧本文件
          <input type="file" accept=".txt,.md,.docx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) uploadScript(f); e.target.value = ''; }} />
        </Label>
        {fileInfo ? <span className="text-xs text-muted-foreground">{fileInfo}</span> : null}
      </div>
      <Textarea className="min-h-[80px] text-xs" value={String(props.data.script || '')} placeholder="剧本文本" onChange={(e) => props.update({ script: e.target.value })} />
      <div className="flex gap-2 items-center">
        <Select value={props.model} onValueChange={(v) => { const patch: any = { script_model: v }; if (v === 'personal-api' && props.textProfiles.length > 0) patch.api_profile_id = defaultApiProfileId(props.textProfiles, props.selectedApiProfiles.text || null); props.update(patch); }}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="doubao">豆包</SelectItem>
            <SelectItem value="glm46">GPT-4.1 Mini</SelectItem>
            <SelectItem value="claude46">Claude 4.6</SelectItem>
            {props.textProfiles.length > 0 ? <SelectItem value="personal-api">自己的 API</SelectItem> : null}
          </SelectContent>
        </Select>
        <Select value={String(props.data.split_mode || 'smart')} onValueChange={(v) => props.update({ split_mode: v })}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smart">智能段落</SelectItem>
            <SelectItem value="short">短镜头</SelectItem>
            <SelectItem value="long">长段落</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {props.model === 'personal-api' ? <ApiProfileSelect kind="text" value={props.data.api_profile_id || null} onChange={(profileId) => props.update({ api_profile_id: profileId })} /> : null}
      <StylePicker value={props.data.style_id || null} onChange={(styleId) => props.update({ style_id: styleId || null })} />
      <div className="flex gap-2 items-center">
        <Button disabled={running} size="sm" className="text-xs" onClick={run}>{running ? '拆分中…' : '拆分成镜头'}</Button>
        <span className="text-xs text-muted-foreground">{props.split.status === 'succeeded' ? '已拆分 ' + props.split.shots.length + ' 段' : props.split.error || props.split.status}</span>
      </div>
    </div>
  );
}

function ImageEditor(props: any) {
  const [models, setModels] = useState<string[]>([]);
  const [ratios, setRatios] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const running = busy || props.data.status === 'running';
  useEffect(() => { api<{ models?: string[]; ratios?: string[] }>('/api/image-models').then((r) => { setModels(r.models || []); setRatios(r.ratios || []); }).catch(() => undefined); }, []);
  const profiles = props.apiProfiles.image || [];
  const model = String(props.data.image_model || 'gpt-image-2');
  async function run() {
    if (model === 'personal-api' && !isValidApiProfileId(profiles, props.data.api_profile_id || null)) { window.alert('请先选择有效的个人 API 接口'); return; }
    setBusy(true);
    props.update({ status: 'running', error: null });
    try {
      const assets = upstreamAllOfType(props.id, 'asset', props.nodes, props.edges);
      const inputImages: { url: string; role_label: string }[] = [];
      for (const asset of assets) for (const ref of ((asset.data.refs as AssetRef[]) || [])) if (ref.url && ref.role_label !== '参考音频' && ref.role_label !== '参考视频') inputImages.push({ url: ref.url, role_label: ref.role_label });
      let prompt = String(props.data.prompt || '').trim();
      if (!prompt) { const shot = upstreamOfType(props.id, 'shot', props.nodes, props.edges); if (shot) prompt = segmentPrompt(shot.data.segment as ShotSegment); else { const sn = upstreamOfType(props.id, 'script', props.nodes, props.edges); if (sn) prompt = String(sn.data.script || '').slice(0, 2000); } }
      if (!prompt) throw new Error('请先填写提示词或连接上游节点');
      const payload = buildImagePayload({ prompt, imageModel: model, ratio: String(props.data.ratio || '1:1'), inputImages, usePersonalApi: model === 'personal-api', apiProfileId: model === 'personal-api' ? (props.data.api_profile_id || null) : null, styleId: props.data.style_id || null });
      const r = await api<{ job_id?: string; error?: string }>('/api/generate-image', { method: 'POST', body: JSON.stringify(payload) });
      if (!r.job_id) throw new Error(r.error || '提交失败');
      props.update({ job_id: r.job_id });
      const url = await pollImage(r.job_id);
      props.update({ status: 'succeeded', image_url: url, error: null });
    } catch (error) { props.update({ status: 'failed', error: (error as Error).message }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex gap-2 items-center">
        <Select value={String(props.data.role || 'storyboard')} onValueChange={(v) => props.update({ role: v })}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="storyboard">分镜</SelectItem>
            <SelectItem value="first_frame">首帧</SelectItem>
            <SelectItem value="last_frame">尾帧</SelectItem>
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={(v) => { const patch: any = { image_model: v }; if (v === 'personal-api' && profiles.length > 0) patch.api_profile_id = defaultApiProfileId(profiles, props.selectedApiProfiles.image || null); props.update(patch); }}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            {profiles.length > 0 ? <SelectItem value="personal-api">自己的 API</SelectItem> : null}
          </SelectContent>
        </Select>
        <Select value={String(props.data.ratio || '1:1')} onValueChange={(v) => props.update({ ratio: v })}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ratios.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Textarea className="min-h-[60px] text-xs" value={String(props.data.prompt || '')} placeholder="分镜提示词" onChange={(e) => props.update({ prompt: e.target.value })} />
      {model === 'personal-api' ? <ApiProfileSelect kind="image" value={props.data.api_profile_id || null} onChange={(profileId) => props.update({ api_profile_id: profileId })} /> : null}
      <StylePicker value={props.data.style_id || null} onChange={(styleId) => props.update({ style_id: styleId || null })} />
      <div className="flex gap-2 items-center"><Button disabled={running} size="sm" className="text-xs" onClick={run}>{running ? '生成中…' : '生成图片'}</Button><span className="text-xs text-muted-foreground">{props.data.error || props.data.status}</span></div>
      {props.data.image_url ? <img className="w-full max-h-[180px] object-contain rounded bg-black" src={String(props.data.image_url)} alt="结果" /> : null}
    </div>
  );
}

function VideoEditor(props: any) {
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const running = busy || props.data.status === 'running';
  useEffect(() => { api<{ models?: string[] }>('/api/models').then((r) => setModels(r.models || [])).catch(() => undefined); }, []);
  const profiles = props.apiProfiles.video || [];
  const model = String(props.data.video_model || 'seedance');
  async function run() {
    if (model === 'personal-api' && !isValidApiProfileId(profiles, props.data.api_profile_id || null)) { window.alert('请先选择有效的个人 API 接口'); return; }
    setBusy(true);
    props.update({ error: null });
    try {
      const inputs = resolveVideoInputs(props.id, props.nodes, props.edges);
      if (!inputs.script) throw new Error('请连接镜头段落或剧本文本节点');
      const apiProfileId = model === 'personal-api' ? String(props.data.api_profile_id || '') : null;
      const caps = resolveVideoCaps({ model, usePersonalApi: model === 'personal-api', apiProfileId, profiles, modelCaps: props.modelCaps });
      const ratio = String(props.data.ratio || '9:16');
      const duration = Number(props.data.duration || 5);
      const resolution = String(props.data.resolution || '720p');
      const gate = validateVideoCapabilities({ model, caps, inputs, ratio, duration, resolution });
      if (!gate.ok) { props.update({ error: gate.error }); window.alert(gate.error); return; }
      props.update({ status: 'running' });
      const payload = buildVideoPayload({ inputs, ratio, duration, resolution, optimize: props.data.optimize_prompt !== false, model, usePersonalApi: model === 'personal-api', apiProfileId, styleId: props.data.style_id || null });
      const r = await api<{ job_id?: string; error?: string }>('/api/generate', { method: 'POST', body: JSON.stringify(payload) });
      if (!r.job_id) throw new Error(r.error || '提交失败');
      props.update({ job_id: r.job_id });
      const url = await pollVideo(r.job_id);
      props.update({ status: 'succeeded', error: null });
      if (url) props.addResultNode(props.id, 'video', url);
    } catch (error) { props.update({ status: 'failed', error: (error as Error).message }); } finally { setBusy(false); }
  }
  const inputs = resolveVideoInputs(props.id, props.nodes, props.edges);
  return (
    <div className="flex flex-col gap-2 p-1">
      <pre className="text-xs bg-muted p-2 rounded max-h-[80px] overflow-auto whitespace-pre-wrap">{inputs.script ? inputs.script.slice(0, 260) : '（无上游提示词）'}</pre>
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={model} onValueChange={(v) => { const patch: any = { video_model: v }; if (v === 'personal-api' && profiles.length > 0) patch.api_profile_id = defaultApiProfileId(profiles, props.selectedApiProfiles.video || null); props.update(patch); }}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            {profiles.length > 0 ? <SelectItem value="personal-api">自己的 API</SelectItem> : null}
          </SelectContent>
        </Select>
        <Select value={String(props.data.ratio || '9:16')} onValueChange={(v) => props.update({ ratio: v })}>
          <SelectTrigger className="h-8 text-xs w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="9:16">9:16</SelectItem>
            <SelectItem value="16:9">16:9</SelectItem>
            <SelectItem value="1:1">1:1</SelectItem>
            <SelectItem value="4:3">4:3</SelectItem>
            <SelectItem value="3:4">3:4</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" className="h-8 text-xs w-[60px]" min={1} max={120} value={Number(props.data.duration || 5)} onChange={(e) => props.update({ duration: Number(e.target.value) })} />
        <Select value={String(props.data.resolution || '720p')} onValueChange={(v) => props.update({ resolution: v })}>
          <SelectTrigger className="h-8 text-xs w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="480p">480p</SelectItem>
            <SelectItem value="720p">720p</SelectItem>
            <SelectItem value="1080p">1080p</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {model === 'personal-api' ? <ApiProfileSelect kind="video" value={props.data.api_profile_id || null} onChange={(profileId) => props.update({ api_profile_id: profileId })} /> : null}
      <StylePicker value={props.data.style_id || null} onChange={(styleId) => props.update({ style_id: styleId || null })} />
      <Label className="flex items-center gap-2 text-xs">
        <input type="checkbox" className="accent-primary" checked={props.data.optimize_prompt !== false} onChange={(e) => props.update({ optimize_prompt: e.target.checked })} />
        优化提示词
      </Label>
      <div className="text-xs text-muted-foreground">首帧：{inputs.firstUrl || '无'} · 尾帧：{inputs.lastUrl || '无'} · 分镜：{inputs.storyboardUrl || '无'} · 音频：{inputs.audioUrl || '无'} · 参考视频：{inputs.videoUrl || '无'}</div>
      <div className="flex gap-2 items-center"><Button disabled={running} size="sm" className="text-xs" onClick={run}>{running ? '生成中…' : '生成视频'}</Button><span className="text-xs text-muted-foreground">{props.data.error || props.data.status}</span></div>
    </div>
  );
}

import { Handle, Position } from '@xyflow/react';
import { useCanvas } from './context';
import { branchGroups, segmentPrompt } from './lib/canvas-logic';
import type { ScriptSplitState, ShotSegment } from './types';
import { Button } from "@/components/ui/button";

type Props = { id: string; data: Record<string, any>; selected?: boolean };

function NodeShell(props: { id: string; label: string; color: string; children: any; source?: boolean; target?: boolean; selected?: boolean }) {
  const ctx = useCanvas();
  const source = props.source !== false;
  const target = props.target !== false;
  const node = ctx.nodes.find((n) => n.id === props.id);
  const groups = node ? branchGroups(node) : [];
  const multiSelected = ctx.nodes.filter((n) => n.selected).length > 1;
  const showBranch = source && groups.length > 0 && !multiSelected;

  return (
    <div className="canvas-node" style={{ borderColor: props.color }}>
      {props.selected ? (
        <div className="node-floatbar" onPointerDown={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2" onClick={() => ctx.openInspector(props.id)}>编辑</Button>
          <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2" onClick={() => ctx.previewNode(props.id)}>预览</Button>
          <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2" onClick={() => ctx.duplicateNode(props.id)}>复制</Button>
          <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2 text-destructive hover:text-destructive" onClick={() => ctx.deleteNode(props.id)}>删除</Button>
        </div>
      ) : null}
      {showBranch ? (
        <button className="branch-add" onPointerDown={(event) => event.stopPropagation()} onClick={() => ctx.openBranchMenu(props.id)} title="添加后续节点">＋</button>
      ) : null}
      {target ? <Handle type="target" position={Position.Left} /> : null}
      <div className="canvas-node-title" style={{ background: props.color }}>{props.label}</div>
      <div className="canvas-node-body">{props.children}</div>
      {source ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

function ScriptNode({ id, data, selected }: Props) {
  const split = (data.split as ScriptSplitState) || { job_id: null, status: 'idle', shots: [], error: null };
  return (
    <NodeShell id={id} label={String(data.label || '剧本文本')} color="#5b8def" selected={selected}>
      <div className="node-summary">
        <pre className="preview">{String(data.script || '').slice(0, 180) || '（暂无剧本）'}</pre>
        <div className="text-xs text-muted-foreground">{split.status === 'succeeded' ? '已拆分 ' + split.shots.length + ' 段' : split.status === 'running' ? '拆分中…' : '未拆分'}</div>
      </div>
    </NodeShell>
  );
}

function ShotNode({ id, data, selected }: Props) {
  const segment = data.segment as ShotSegment | undefined;
  return (
    <NodeShell id={id} label={String(data.label || '镜头段落')} color="#8a5be0" selected={selected}>
      <div className="node-summary">
        <div className="text-xs text-muted-foreground">段落 {String((segment && segment.segment_no) || (data.shot_index || 0) + 1)} · {String((segment && segment.scene) || '')}</div>
        <div className="text-xs text-muted-foreground">{Array.isArray(segment && segment.characters) ? (segment as ShotSegment).characters!.join('、') : ''}</div>
        <pre className="preview">{String((segment && segment.story_action) || (segment && segment.action) || '').slice(0, 120)}</pre>
      </div>
    </NodeShell>
  );
}

function AssetNode({ id, data, selected }: Props) {
  const refs = (data.refs as any[]) || [];
  return (
    <NodeShell id={id} label={String(data.label || '素材引用')} color="#2f9e77" selected={selected}>
      <div className="node-summary">
        <div className="text-xs text-muted-foreground">素材类型：{String(data.asset_type || 'character')}</div>
        {refs.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {refs.slice(0, 3).map((ref) => <img key={ref.url} className="w-10 h-10 rounded object-cover bg-muted" src={ref.url} alt={ref.name} />)}
          </div>
        ) : <div className="text-xs text-muted-foreground">未选择素材</div>}
        <div className="text-xs text-muted-foreground">已选 {refs.length} 项</div>
      </div>
    </NodeShell>
  );
}

function ImageNode({ id, data, selected }: Props) {
  const roleLabel = String(data.role === 'first_frame' ? '首帧' : data.role === 'last_frame' ? '尾帧' : '分镜');
  return (
    <NodeShell id={id} label={String(data.label || '图片生成')} color="#d8832f" selected={selected}>
      <div className="node-summary">
        <div className="text-xs text-muted-foreground">{roleLabel}</div>
        {data.image_url ? <img className="w-full max-h-[140px] object-contain rounded bg-black" src={String(data.image_url)} alt="预览" /> : <div className="text-xs text-muted-foreground">未生成</div>}
        <div className="text-xs text-muted-foreground">{String(data.image_model || '')} · {data.status || 'idle'}</div>
      </div>
    </NodeShell>
  );
}

function VideoNode({ id, data, selected }: Props) {
  return (
    <NodeShell id={id} label={String(data.label || '视频生成')} color="#c0392b" selected={selected}>
      <div className="node-summary">
        <div className="text-xs text-muted-foreground">{String(data.video_model || 'seedance')}</div>
        <div className="text-xs text-muted-foreground">{data.duration || 5}s · {data.ratio || '9:16'} · {data.resolution || '720p'}</div>
        <div className="text-xs text-muted-foreground">状态：{data.status || 'idle'}</div>
      </div>
    </NodeShell>
  );
}

function NoteNode({ id, data, selected }: Props) {
  return (
    <NodeShell id={id} label={String(data.label || '便签')} color={String(data.color || '#5b8def')} selected={selected}>
      <div className="node-summary">
        <pre className="preview">{String(data.text || '').slice(0, 200) || '（空便签）'}</pre>
      </div>
    </NodeShell>
  );
}

function ResultNode({ id, data, selected }: Props) {
  const url = String(data.media_url || '');
  const isVideo = data.kind === 'video';
  return (
    <NodeShell id={id} label={String(data.label || '结果')} color="#5b8def" target={true} source={data.kind === 'video'} selected={selected}>
      <div className="node-summary">
        {url ? (isVideo ? <video className="w-full max-h-[140px] object-contain rounded bg-black" controls src={'/api/history/media?url=' + encodeURIComponent(url)} /> : <img className="w-full max-h-[140px] object-contain rounded bg-black" src={url} alt="结果" />) : <div className="text-xs text-muted-foreground">运行上游节点后显示结果。</div>}
      </div>
    </NodeShell>
  );
}

export const nodeTypes = {
  script: ScriptNode,
  shot: ShotNode,
  asset: AssetNode,
  image: ImageNode,
  video: VideoNode,
  result: ResultNode,
  note: NoteNode,
};
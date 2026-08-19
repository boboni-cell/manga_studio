import type { CanvasNode } from './types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BottomEditorProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedNode: CanvasNode | null;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  onQuickAdd: (type: string) => void;
}

const QUICK_TYPES = ['script', 'shot', 'asset', 'image', 'video'];

function NodeFields(props: { node: CanvasNode; updateNodeData: (id: string, patch: Record<string, unknown>) => void }) {
  const { node, updateNodeData } = props;
  const id = node.id;
  const data = node.data;
  if (node.type === 'script') {
    return (
      <div className="flex flex-col gap-2">
        <Textarea className="min-h-[60px] text-xs" value={String(data.script || '')} onChange={(event) => updateNodeData(id, { script: event.target.value })} rows={3} placeholder="剧本文本" />
        <Select value={String(data.split_mode || 'smart')} onValueChange={(v) => updateNodeData(id, { split_mode: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smart">智能段落</SelectItem>
            <SelectItem value="short">短镜头</SelectItem>
            <SelectItem value="long">长段落</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (node.type === 'shot') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">{String((data.segment && (data.segment as any).story_action) || (data.segment && (data.segment as any).action) || '（选择镜头内容）')}</div>
      </div>
    );
  }
  if (node.type === 'asset') {
    const refs = (data.refs as any[]) || [];
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">已选素材 {refs.length} 项：{refs.map((ref) => ref.name).join('、')}</div>
      </div>
    );
  }
  if (node.type === 'image') {
    return (
      <div className="flex flex-col gap-2">
        <Textarea className="min-h-[60px] text-xs" value={String(data.prompt || '')} onChange={(event) => updateNodeData(id, { prompt: event.target.value })} rows={3} placeholder="图片提示词" />
        <div className="flex gap-2 items-center">
          <Input className="h-8 text-xs flex-1" value={String(data.image_model || '')} onChange={(event) => updateNodeData(id, { image_model: event.target.value })} placeholder="模型" />
          <Input className="h-8 text-xs w-[60px]" value={String(data.ratio || '1:1')} onChange={(event) => updateNodeData(id, { ratio: event.target.value })} placeholder="比例" />
          <Select value={String(data.role || 'storyboard')} onValueChange={(v) => updateNodeData(id, { role: v })}>
            <SelectTrigger className="h-8 text-xs w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="storyboard">分镜</SelectItem>
              <SelectItem value="first_frame">首帧</SelectItem>
              <SelectItem value="last_frame">尾帧</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }
  if (node.type === 'video') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center flex-wrap">
          <Input className="h-8 text-xs flex-1 min-w-[60px]" value={String(data.video_model || 'seedance')} onChange={(event) => updateNodeData(id, { video_model: event.target.value })} placeholder="模型" />
          <Input className="h-8 text-xs w-[60px]" value={String(data.ratio || '9:16')} onChange={(event) => updateNodeData(id, { ratio: event.target.value })} placeholder="比例" />
          <Input type="number" className="h-8 text-xs w-[60px]" min={1} max={120} value={Number(data.duration || 5)} onChange={(event) => updateNodeData(id, { duration: Number(event.target.value) })} placeholder="时长" />
          <Input className="h-8 text-xs w-[70px]" value={String(data.resolution || '720p')} onChange={(event) => updateNodeData(id, { resolution: event.target.value })} placeholder="分辨率" />
        </div>
      </div>
    );
  }
  if (node.type === 'result') {
    const url = String(data.media_url || '');
    return (
      <div className="flex flex-col gap-2">
        {url ? (data.kind === 'video' ? <video className="w-full max-h-[160px] object-contain rounded bg-black" controls src={'/api/history/media?url=' + encodeURIComponent(url)} /> : <img className="w-full max-h-[160px] object-contain rounded bg-black" src={url} alt="结果" />) : <div className="text-xs text-muted-foreground">暂无结果。</div>}
      </div>
    );
  }
  return null;
}

export default function BottomEditor(props: BottomEditorProps) {
  return (
    <div className={'bottom-editor' + (props.open ? '' : ' collapsed')}>
      <div className="bottom-editor-head">
        <span>{props.selectedNode ? '编辑：' + String(props.selectedNode.data.label || props.selectedNode.id) : '选择一个节点开始编辑'}</span>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => props.setOpen(!props.open)}>{props.open ? '收起' : '展开'}</Button>
      </div>
      {props.open ? (
        props.selectedNode ? (
          <NodeFields node={props.selectedNode} updateNodeData={props.updateNodeData} />
        ) : (
          <div className="be-quick">
            {QUICK_TYPES.map((type) => <Button key={type} variant="outline" size="sm" className="text-xs" onClick={() => props.onQuickAdd(type)}>{type}</Button>)}
          </div>
        )
      ) : null}
    </div>
  );
}
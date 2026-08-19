import { useEffect, useState } from 'react';
import { api } from './api';
import { Button } from "@/components/ui/button";

const MAP: Record<string, string[]> = {
  script: ['short-drama-novel-analyze', 'short-drama-write', 'short-drama-assets', 'short-drama-storyboard'],
  shot: ['seedance-prompt', 'seedance-sequence', 'seedance-camera', 'seedance-motion', 'seedance-characters', 'seedance-audio', 'short-drama-image-prompts', 'short-drama-video-prompts', 'short-drama-review'],
  image: ['short-drama-image-prompts', 'short-drama-review'],
  video: ['seedance-prompt', 'seedance-continuation', 'seedance-camera', 'seedance-motion', 'seedance-audio', 'seedance-troubleshoot', 'short-drama-video-prompts'],
  asset: ['short-drama-assets', 'seedance-characters'],
  note: ['short-drama-review'],
  result: ['short-drama-review', 'seedance-troubleshoot'],
};

export default function NodeSkills(props: { nodeType: string }) {
  const [skills, setSkills] = useState<any[]>([]);
  useEffect(() => {
    api<{ skills?: any[] }>('/api/skills').then((d) => setSkills(d.skills || [])).catch(() => setSkills([]));
  }, []);
  const ids = MAP[props.nodeType] || [];
  const list = skills.filter((s) => ids.indexOf(s.id) >= 0);
  return (
    <div className="flex flex-col gap-2 p-1">
      {list.length === 0 ? <div className="text-xs text-muted-foreground">该节点暂无可用技能。</div> : null}
      {list.map((s) => (
        <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2">
          <div className="text-xs font-semibold">{s.title}</div>
          <div className="text-xs text-muted-foreground">{s.description}</div>
          <Button variant="outline" size="sm" className="text-xs self-start" disabled title="运行功能即将接入">运行</Button>
        </div>
      ))}
    </div>
  );
}
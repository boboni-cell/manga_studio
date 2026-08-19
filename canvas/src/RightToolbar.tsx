import { Button } from "@/components/ui/button";

interface RightToolbarProps {
  mode: 'pan' | 'select';
  setMode: (mode: 'pan' | 'select') => void;
  onAddNode: () => void;
  onFitView: () => void;
  assetsOpen: boolean;
  setAssetsOpen: (open: boolean) => void;
  minimapOpen: boolean;
  setMinimapOpen: (open: boolean) => void;
  immersive: boolean;
  setImmersive: (open: boolean) => void;
  onTools: () => void;
}

export default function RightToolbar(props: RightToolbarProps) {
  return (
    <div className="right-toolbar">
      <Button variant="outline" size="icon" className="rt-btn" title="添加节点" onClick={props.onAddNode}>＋</Button>
      <Button variant={props.mode === 'pan' ? 'default' : 'outline'} size="icon" className="rt-btn" title="手型模式" onClick={() => props.setMode('pan')}>✋</Button>
      <Button variant={props.mode === 'select' ? 'default' : 'outline'} size="icon" className="rt-btn" title="框选模式" onClick={() => props.setMode('select')}>⬚</Button>
      <Button variant="outline" size="icon" className="rt-btn" title="适应全部节点" onClick={props.onFitView}>◉</Button>
      <Button variant={props.assetsOpen ? 'default' : 'outline'} size="icon" className="rt-btn" title="资产库" onClick={() => props.setAssetsOpen(!props.assetsOpen)}>▣</Button>
      <Button variant={props.minimapOpen ? 'default' : 'outline'} size="icon" className="rt-btn" title="小地图" onClick={() => props.setMinimapOpen(!props.minimapOpen)}>🗺</Button>
      <Button variant={props.immersive ? 'default' : 'outline'} size="icon" className="rt-btn" title="沉浸模式" onClick={() => props.setImmersive(!props.immersive)}>⤢</Button>
      <Button variant="outline" size="icon" className="rt-btn" title="画布工具" onClick={props.onTools}>🛠</Button>
    </div>
  );
}
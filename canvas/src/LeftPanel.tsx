import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ASSET_CATEGORIES, loadAssets, type AssetCategory, type AssetItem } from './asset-cache';
import type { AssetRef, CanvasNode } from './types';

interface LeftPanelProps {
  open: boolean;
  onClose: () => void;
  nodes: CanvasNode[];
  assetsVersion: number;
  selectedAssetNode: CanvasNode | null;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  addAssetNode: (item: AssetItem) => void;
  onFocusNode: (id: string) => void;
  onFitView: () => void;
}

export default function LeftPanel(props: LeftPanelProps) {
  const [tab, setTab] = useState<'flow' | 'assets'>('flow');
  const [category, setCategory] = useState<AssetCategory>('character');
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function reload(cat: AssetCategory) {
    setLoading(true);
    try { setItems(await loadAssets(cat)); } catch { setItems([]); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (props.open && tab === 'assets') reload(category);
  }, [props.open, tab, category, props.assetsVersion]);

  async function removeRef(refId: string) {
    if (!props.selectedAssetNode) return;
    const refs: AssetRef[] = (props.selectedAssetNode.data.refs as AssetRef[]) || [];
    props.updateNodeData(props.selectedAssetNode.id, { refs: refs.filter((r) => r.ref_id !== refId) });
  }

  const filtered = search ? items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) || (item.role_label && item.role_label.toLowerCase().includes(search.toLowerCase()))) : items;

  if (!props.open) return null;

  return (
    <div className="left-panel">
      <div className="left-panel-head">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'flow' | 'assets'); if (v === 'assets') reload(category); }}>
          <TabsList className="h-8">
            <TabsTrigger value="flow" className="text-xs px-3">流程视图</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs px-3">素材库</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={props.onClose}>✕</Button>
      </div>

      {tab === 'flow' ? (
        <ScrollArea className="flex-1 min-h-0">
          <div className="left-panel-flow">
            <div className="lp-toolbar">
              <Input
                placeholder="搜索节点…"
                className="h-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="lp-group">
              <div className="lp-group-title">画布节点 ({props.nodes.length})</div>
              {props.nodes.map((node) => {
                const label = String(node.data.label || node.type);
                return (
                  <Button
                    key={node.id}
                    variant="ghost"
                    className="lp-item justify-start text-left h-auto py-2"
                    onClick={() => props.onFocusNode(node.id)}
                  >
                    <span className="truncate text-xs">{label}</span>
                  </Button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={props.onFitView}>
              适应全部节点
            </Button>
          </div>
        </ScrollArea>
      ) : (
        <>
          <div className="left-panel-cats">
            {ASSET_CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={category === cat ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => { setCategory(cat); reload(cat); }}
              >
                {cat === 'character' ? '角色' : cat === 'outfit' ? '服装' : cat === 'scene' ? '场景' : cat === 'audio' ? '音频' : cat === 'style' ? '风格' : cat}
              </Button>
            ))}
          </div>

          <div className="lp-toolbar">
            <Input
              placeholder="搜索素材…"
              className="h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              加载中…
            </div>
          ) : (
            <div className="left-panel-assets">
              {filtered.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                  暂无素材
                </div>
              ) : (
                <div className="asset-drawer-grid">
                  {filtered.map((item) => (
                    <div key={item.refId} className="asset-card">
                      <Button variant="ghost" className="asset-card-main p-0 h-auto" onClick={() => props.addAssetNode(item)}>
                        {item.url ? (
                          item.url.match(/.(mp4|webm|ogg)$/i) ? (
                            <div className="asset-thumb asset-thumb-video bg-gradient-to-br from-blue-900 to-purple-900">
                              <span>▶</span>
                            </div>
                          ) : (
                            <img className="asset-thumb" src={item.url} alt={item.name} loading="lazy" />
                          )
                        ) : (
                          <div className="asset-thumb bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-lg">
                            🖼
                          </div>
                        )}
                        <div className="asset-name">{item.name}</div>
                      </Button>
                      {props.selectedAssetNode ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="asset-add w-full text-xs h-7"
                          onClick={() => {
                            const refs: AssetRef[] = (props.selectedAssetNode.data.refs as AssetRef[]) || [];
                            props.updateNodeData(props.selectedAssetNode.id, {
                              refs: [...refs, { source: item.source, ref_id: item.refId, name: item.name, url: item.url, role_label: item.role_label }],
                            });
                          }}
                        >
                          + 引用到此节点
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="asset-add w-full text-xs h-7"
                          onClick={() => props.addAssetNode(item)}
                        >
                          + 添加到画布
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {props.selectedAssetNode ? (
        <div className="border-t border-border pt-2 mt-2">
          <div className="text-xs text-muted-foreground mb-1">已选节点引用：</div>
          {((props.selectedAssetNode.data.refs as AssetRef[]) || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">无引用</div>
          ) : (
            <div className="flex flex-col gap-1">
              {(props.selectedAssetNode.data.refs as AssetRef[]).map((ref) => (
                <div key={ref.ref_id} className="flex items-center gap-2 bg-card p-1.5 rounded-md">
                  {ref.url ? (
                    <img className="w-6 h-6 rounded object-cover bg-muted" src={ref.url} alt="" />
                  ) : null}
                  <span className="flex-1 truncate text-xs">{ref.name}</span>
                  <Badge variant="outline" className="text-[10px] h-5">{ref.role_label || ref.source}</Badge>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => removeRef(ref.ref_id)}>✕</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
import { useEffect, useState } from 'react';
import { ASSET_CATEGORIES, loadAssets, type AssetCategory, type AssetItem } from './asset-cache';
import type { AssetRef, CanvasNode } from './types';

interface AssetLibraryProps {
  open: boolean;
  refreshVersion: number;
  selectedAssetNode: CanvasNode | null;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  addAssetNode: (item: AssetItem) => void;
  onClose: () => void;
}

export default function AssetLibrary(props: AssetLibraryProps) {
  const [category, setCategory] = useState<AssetCategory>('character');
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function reload(cat: AssetCategory) {
    setLoading(true);
    try {
      const list = await loadAssets(cat);
      setItems(list);
    } catch (error) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (props.open) reload(category);
  }, [props.open, category, props.refreshVersion]);

  const filtered = items.filter((item) => item.name.toLowerCase().indexOf(search.trim().toLowerCase()) >= 0);

  function refFor(item: AssetItem): AssetRef {
    return { source: item.source, ref_id: item.refId, name: item.name, url: item.url, role_label: item.role_label };
  }

  function toggleIntoSelected(item: AssetItem) {
    const node = props.selectedAssetNode;
    if (!node) return;
    const refs = (node.data.refs as AssetRef[]) || [];
    const exists = refs.some((ref) => ref.url === item.url);
    const next = exists ? refs.filter((ref) => ref.url !== item.url) : [...refs, refFor(item)];
    props.updateNodeData(node.id, { refs: next });
  }

  function onCardClick(item: AssetItem) {
    const node = props.selectedAssetNode;
    if (!node) return;
    if (node.data.asset_type !== item.nodeAssetType) {
      window.alert('当前选中的素材节点类型不匹配，请切换素材节点类型或使用「添加到画布」新建素材节点');
      return;
    }
    toggleIntoSelected(item);
  }

  if (!props.open) return null;

  return (
    <aside className="asset-drawer">
      <div className="asset-drawer-head">
        <span>资产库</span>
        <button className="tb" onClick={props.onClose}>收起</button>
      </div>
      <div className="asset-drawer-tabs">
        {ASSET_CATEGORIES.map((cat) => (
          <button key={cat.id} className={category === cat.id ? 'active' : ''} onClick={() => setCategory(cat.id)}>{cat.label}</button>
        ))}
      </div>
      <div className="asset-drawer-tools">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索…" />
        <button className="tb" onClick={() => reload(category)}>刷新</button>
      </div>
      <div className="asset-drawer-grid">
        {loading ? <div className="hint">加载中…</div> : null}
        {!loading && filtered.length === 0 ? <div className="hint">暂无资产。</div> : null}
        {filtered.map((item) => (
          <div key={item.key} className="asset-card">
            <button className="asset-card-main" onClick={() => onCardClick(item)}>
              {item.source === 'audio' ? (
                <span className="asset-thumb asset-thumb-video">🎵</span>
              ) : item.kind === 'video' ? (
                <span className="asset-thumb asset-thumb-video">▶</span>
              ) : (
                <img className="asset-thumb" src={item.url} alt={item.name} />
              )}
              <span className="asset-name">{item.name}</span>
            </button>
            <button className="asset-add" onClick={() => props.addAssetNode(item)}>添加到画布</button>
          </div>
        ))}
      </div>
    </aside>
  );
}

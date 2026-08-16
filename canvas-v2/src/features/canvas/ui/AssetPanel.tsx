import { memo, useEffect, useMemo, useState } from 'react';
import { Film, ImageIcon, Music, Search, X } from 'lucide-react';

import { MANGA_ASSET_CATEGORIES, type MangaAssetCategory } from '@/lib/mangaAssetLibrary';

export type CanvasAssetKind = 'image' | 'video' | 'audio';

interface CanvasAssetItemBase {
  id: string;
  nodeId?: string | null;
  kind: CanvasAssetKind;
  category: MangaAssetCategory;
  aspectRatio?: string;
  title: string;
  sourceLabel: string;
  order: number;
}

export interface CanvasImageAssetItem extends CanvasAssetItemBase {
  kind: 'image';
  rawImageUrl: string;
  rawPreviewImageUrl?: string | null;
  imageUrl: string;
  previewImageUrl: string;
}

export interface CanvasVideoAssetItem extends CanvasAssetItemBase {
  kind: 'video';
  rawVideoUrl: string;
  rawThumbnailUrl?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
}

export interface CanvasAudioAssetItem extends CanvasAssetItemBase {
  kind: 'audio';
  rawAudioUrl: string;
  audioUrl: string;
}

export type CanvasAssetItem = CanvasImageAssetItem | CanvasVideoAssetItem | CanvasAudioAssetItem;

interface AssetPanelProps {
  isOpen: boolean;
  assets: CanvasAssetItem[];
  buttonRect: DOMRect | null;
  mode?: 'browse' | 'select';
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onActivate: (asset: CanvasAssetItem) => void;
  onRename?: (asset: CanvasAssetItem, title: string) => void;
}

export const AssetPanel = memo(({
  isOpen,
  assets,
  buttonRect,
  mode = 'browse',
  title = '资产',
  subtitle = '与经典工作台资产库同步 · 双击项目资产定位，单击素材添加到画布',
  onClose,
  onActivate,
  onRename,
}: AssetPanelProps) => {
  const [query, setQuery] = useState('');
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<MangaAssetCategory>('project');
  const categoryCounts = useMemo(() => {
    const counts = new Map<MangaAssetCategory, number>();
    for (const asset of assets) counts.set(asset.category, (counts.get(asset.category) || 0) + 1);
    return counts;
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const categoryAssets = assets
      .filter((asset) => asset.category === activeCategory)
      .sort((a, b) => b.order - a.order);
    if (!normalized) return categoryAssets;
    return categoryAssets.filter((asset) => {
      const haystack = `${asset.title} ${asset.sourceLabel}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeCategory, assets, query]);
  const activeCategoryLabel = MANGA_ASSET_CATEGORIES.find((category) => category.id === activeCategory)?.label || '资产';

  useEffect(() => {
    if (!isOpen) return;
    setNameDrafts((previous) => {
      const next: Record<string, string> = {};
      for (const asset of assets) {
        next[asset.id] = Object.prototype.hasOwnProperty.call(previous, asset.id)
          ? previous[asset.id]
          : asset.title;
      }
      return next;
    });
  }, [assets, isOpen]);

  const commitAssetName = (asset: CanvasAssetItem) => {
    const draft = (nameDrafts[asset.id] ?? asset.title).trim();
    if (!draft) {
      setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
      return;
    }
    if (draft !== asset.title) {
      onRename?.(asset, draft);
    }
    setNameDrafts((previous) => ({ ...previous, [asset.id]: draft }));
  };

  if (!isOpen || !buttonRect) {
    return null;
  }

  const panelWidth = 360;
  const panelLeft = Math.min(
    Math.max(8, buttonRect.right + 8),
    Math.max(8, window.innerWidth - panelWidth - 8)
  );
  const panelTop = Math.min(
    Math.max(8, buttonRect.top - 120),
    Math.max(8, window.innerHeight - 560)
  );

  return (
    <div
      className="fixed z-[220] flex max-h-[540px] flex-col rounded-xl border border-white/12 bg-[#202020] shadow-2xl"
      style={{ left: panelLeft, top: panelTop, width: panelWidth }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] text-white/45">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
          title="关闭资产面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ui-scrollbar flex gap-1 overflow-x-auto border-b border-white/8 px-3 py-2">
        {MANGA_ASSET_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs transition-colors ${
              activeCategory === category.id
                ? 'bg-accent/85 text-white'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/85'
            }`}
          >
            {category.label}
            <span className="text-[10px] opacity-70">{categoryCounts.get(category.id) || 0}</span>
          </button>
        ))}
      </div>

      <div className="border-b border-white/8 px-3 py-2">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 text-white/70 focus-within:border-accent/50">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${activeCategoryLabel}名称`}
            className="min-w-0 flex-1 bg-transparent text-xs text-white/85 outline-none placeholder:text-white/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white/75"
              title="清空搜索"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      <div className="ui-scrollbar flex-1 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-6 text-center">
            <ImageIcon className="mb-3 h-8 w-8 text-white/25" />
            <div className="text-sm text-white/70">资产库为空</div>
            <div className="mt-1 text-[11px] leading-5 text-white/40">
              可以前往首页“资产”添加，保存后会自动同步到这里。
            </div>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-6 text-center">
            {query ? (
              <Search className="mb-3 h-7 w-7 text-white/25" />
            ) : activeCategory === 'audio' ? (
              <Music className="mb-3 h-7 w-7 text-white/25" />
            ) : (
              <ImageIcon className="mb-3 h-7 w-7 text-white/25" />
            )}
            <div className="text-sm text-white/70">
              {query ? `没有匹配的${activeCategoryLabel}资产` : `暂无${activeCategoryLabel}资产`}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-white/40">
              {query ? '换个名称试试，或清空搜索查看全部资产。' : '可以前往首页“资产”添加，保存后会自动同步到这里。'}
            </div>
          </div>
        ) : (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-white/70">{activeCategoryLabel}</h3>
              <span className="text-[10px] text-white/35">{filteredAssets.length} 个</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.id}
                      title={mode === 'select' ? `${asset.title} · 选择并连接` : asset.nodeId ? `${asset.title} · 双击定位` : `${asset.title} · 添加到画布`}
                      className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left transition-colors hover:border-accent/70 hover:bg-accent/10"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (mode === 'select' || !asset.nodeId) {
                            onActivate(asset);
                          }
                        }}
                        onDoubleClick={() => {
                          if (mode === 'browse' && asset.nodeId) {
                            onActivate(asset);
                          }
                        }}
                        className="block aspect-square w-full overflow-hidden bg-black/30"
                        title={mode === 'select' ? `${asset.title} · 选择并连接` : asset.nodeId ? `${asset.title} · 双击定位` : `${asset.title} · 添加到画布`}
                      >
                        {asset.kind === 'image' ? (
                          <img
                            src={asset.previewImageUrl}
                            alt={asset.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            draggable={false}
                          />
                        ) : asset.kind === 'video' ? (
                          <div className="relative h-full w-full bg-black">
                            <video
                              src={asset.videoUrl}
                              poster={asset.thumbnailUrl ?? undefined}
                              className="h-full w-full object-cover opacity-90 transition-transform group-hover:scale-105"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white">
                                <Film className="h-4 w-4" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-black/35 text-white/70">
                            <Music className="h-8 w-8" />
                          </div>
                        )}
                      </button>
                      <div className="space-y-0.5 px-2 py-1.5">
                        {mode === 'browse' && asset.nodeId && onRename ? (
                          <input
                            value={nameDrafts[asset.id] ?? asset.title}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setNameDrafts((previous) => ({ ...previous, [asset.id]: nextValue }));
                            }}
                            onBlur={() => commitAssetName(asset)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
                                event.currentTarget.blur();
                              }
                            }}
                            className="nodrag w-full rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] font-medium text-white/80 outline-none transition-colors hover:border-white/20 hover:bg-black/35 focus:border-accent/60 focus:bg-black/40"
                            title="双击资产定位；这里可直接改名，允许同名"
                          />
                        ) : (
                          <div className="truncate rounded border border-transparent px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                            {asset.title}
                          </div>
                        )}
                        <div className="truncate text-[9px] text-white/35">{asset.sourceLabel}</div>
                      </div>
                    </div>
                  ))}
                </div>
          </section>
        )}
      </div>
    </div>
  );
});

AssetPanel.displayName = 'AssetPanel';

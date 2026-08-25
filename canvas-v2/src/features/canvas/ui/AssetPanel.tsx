import { memo, useEffect, useMemo, useState } from 'react';
import { Check, Film, ImageIcon, Music, Pencil, Plus, Search, X } from 'lucide-react';

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
  onRename?: (asset: CanvasAssetItem, title: string) => Promise<void> | void;
  onAdd?: (category: MangaAssetCategory) => void;
  onCreateStyle?: (file: File, name: string, prompt: string) => Promise<void>;
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
  onAdd,
  onCreateStyle,
}: AssetPanelProps) => {
  const [query, setQuery] = useState('');
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<MangaAssetCategory>('project');
  const [showStyleForm, setShowStyleForm] = useState(false);
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [styleName, setStyleName] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [styleSaveError, setStyleSaveError] = useState<string | null>(null);
  const [isStyleSaving, setIsStyleSaving] = useState(false);
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

  const commitAssetName = async (asset: CanvasAssetItem) => {
    const draft = (nameDrafts[asset.id] ?? asset.title).trim();
    if (!draft) {
      setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
      setRenameError('资产名称不能为空');
      return;
    }
    if (draft === asset.title) {
      setEditingAssetId(null);
      setRenameError(null);
      return;
    }
    try {
      setSavingAssetId(asset.id);
      setRenameError(null);
      await onRename?.(asset, draft);
      setNameDrafts((previous) => ({ ...previous, [asset.id]: draft }));
      setEditingAssetId(null);
    } catch (error) {
      setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
      setRenameError(error instanceof Error ? error.message : '资产改名失败');
    } finally {
      setSavingAssetId(null);
    }
  };

  const createStyle = async () => {
    if (!styleFile || !styleName.trim() || !onCreateStyle) return;
    try {
      setIsStyleSaving(true);
      setStyleSaveError(null);
      await onCreateStyle(styleFile, styleName.trim(), stylePrompt.trim());
      setShowStyleForm(false);
      setStyleFile(null);
      setStyleName('');
      setStylePrompt('');
    } catch (error) {
      setStyleSaveError(error instanceof Error ? error.message : '风格添加失败');
    } finally {
      setIsStyleSaving(false);
    }
  };

  if (!isOpen || !buttonRect) {
    return null;
  }

  const mobileViewport = window.innerWidth <= 880;
  const panelWidth = Math.min(720, window.innerWidth - 16);
  const panelMaxHeight = Math.max(
    240,
    Math.min(mobileViewport ? window.innerHeight - 112 : 680, window.innerHeight - 16)
  );
  const panelLeft = Math.min(
    Math.max(8, mobileViewport ? 8 : buttonRect.right + 12),
    Math.max(8, window.innerWidth - panelWidth - 8)
  );
  const panelTop = Math.min(
    Math.max(8, mobileViewport ? 64 : buttonRect.top - 120),
    Math.max(8, window.innerHeight - panelMaxHeight - (mobileViewport ? 72 : 8))
  );

  return (
    <div
      className="canvas-asset-panel fixed z-[220] flex flex-col overflow-hidden rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--canvas-node-menu-bg)] shadow-2xl backdrop-blur-xl"
      style={{ left: panelLeft, top: panelTop, width: panelWidth, maxHeight: panelMaxHeight }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--canvas-node-divider)] px-5 py-4">
        <div className="min-w-0">
          <div className="text-base font-semibold text-text-dark">{title}</div>
          <div className="mt-1 text-xs leading-5 text-text-muted">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'browse' && onAdd && (
            <button
              type="button"
              onClick={() => {
                if (activeCategory === 'style' && onCreateStyle) {
                  setShowStyleForm(true);
                  return;
                }
                onAdd(activeCategory);
                if (activeCategory === 'project') setActiveCategory('upload');
              }}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/70 bg-accent px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-accent/85"
              title={activeCategory === 'history' ? '前往完整资产库' : `添加${activeCategoryLabel}`}
            >
              <Plus className="h-3.5 w-3.5" />
              添加{activeCategory === 'history' ? '' : activeCategoryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-[var(--canvas-node-menu-hover)] hover:text-text-dark"
            title="关闭资产面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="ui-scrollbar flex flex-wrap gap-1.5 border-b border-[var(--canvas-node-divider)] bg-black/10 px-4 py-3">
        {MANGA_ASSET_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
              activeCategory === category.id
                ? 'border-accent/70 bg-accent/20 text-accent'
                : 'border-[var(--canvas-node-field-border)] bg-[var(--canvas-node-button-bg)] text-text-muted hover:border-accent/35 hover:bg-[var(--canvas-node-menu-hover)] hover:text-text-dark'
            }`}
          >
            {category.label}
            <span className="text-[10px] opacity-70">{categoryCounts.get(category.id) || 0}</span>
          </button>
        ))}
      </div>

      {showStyleForm && activeCategory === 'style' && (
        <div className="border-b border-white/8 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-white/80">添加自定义风格</span>
            <button
              type="button"
              className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
              onClick={() => setShowStyleForm(false)}
              aria-label="关闭风格表单"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              className="block w-full text-[11px] text-white/55 file:mr-2 file:rounded-md file:border-0 file:bg-accent/20 file:px-2 file:py-1.5 file:text-accent-light"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setStyleFile(file);
                if (file && !styleName) setStyleName(file.name.replace(/\.[^.]+$/, ''));
              }}
            />
            <input
              value={styleName}
              onChange={(event) => setStyleName(event.target.value)}
              placeholder="风格名称"
              className="h-8 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white/85 outline-none placeholder:text-white/30 focus:border-accent/50"
            />
            <textarea
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
              placeholder="风格提示词（可选）"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white/85 outline-none placeholder:text-white/30 focus:border-accent/50"
            />
            {styleSaveError && <div className="text-[11px] text-red-300">{styleSaveError}</div>}
            <button
              type="button"
              disabled={!styleFile || !styleName.trim() || isStyleSaving}
              className="h-8 w-full rounded-lg bg-accent text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => { void createStyle(); }}
            >
              {isStyleSaving ? '正在添加…' : '添加到风格库'}
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-[var(--canvas-node-divider)] px-4 py-3">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--canvas-node-field-border)] bg-[var(--canvas-node-field-bg)] px-3 text-text-muted focus-within:border-accent/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${activeCategoryLabel}名称`}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-dark outline-none placeholder:text-text-muted/60"
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

      <div className="ui-scrollbar flex-1 overflow-y-auto p-4">
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
            {renameError && (
              <div className="mb-2 rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">
                {renameError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
                        {editingAssetId === asset.id ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <input
                              autoFocus
                              value={nameDrafts[asset.id] ?? asset.title}
                              disabled={savingAssetId === asset.id}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setNameDrafts((previous) => ({ ...previous, [asset.id]: nextValue }));
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void commitAssetName(asset);
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
                                  setEditingAssetId(null);
                                  setRenameError(null);
                                }
                              }}
                              className="nodrag min-w-0 flex-1 rounded border border-accent/60 bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white outline-none"
                              aria-label={`修改${asset.title}的名称`}
                            />
                            <button
                              type="button"
                              disabled={savingAssetId === asset.id}
                              onClick={() => { void commitAssetName(asset); }}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-accent-light hover:bg-accent/20 disabled:opacity-40"
                              title="保存名称"
                              aria-label="保存名称"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-1">
                            <div className="min-w-0 flex-1 truncate rounded border border-transparent px-1.5 py-0.5 text-[10px] font-medium text-white/80" title={asset.title}>
                              {asset.title}
                            </div>
                            {mode === 'browse' && asset.category !== 'history' && onRename && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNameDrafts((previous) => ({ ...previous, [asset.id]: asset.title }));
                                  setEditingAssetId(asset.id);
                                  setRenameError(null);
                                }}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/40 hover:bg-accent/20 hover:text-accent-light"
                                title="修改资产名称"
                                aria-label={`修改${asset.title}的名称`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
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

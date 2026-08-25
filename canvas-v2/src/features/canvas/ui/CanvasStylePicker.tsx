import { Check, ChevronDown, Palette } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { api } from '@/api';
import { UiButton } from '@/components/ui';
import {
  NODE_CONTROL_CHIP_CLASS,
  NODE_CONTROL_ICON_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';

interface CanvasStyleItem {
  id: string;
  name: string;
  thumbnail_url?: string;
  deleted_at?: string | null;
}

let cachedStyles: CanvasStyleItem[] | null = null;
let pendingStyles: Promise<CanvasStyleItem[]> | null = null;

function loadStyles(): Promise<CanvasStyleItem[]> {
  if (cachedStyles) return Promise.resolve(cachedStyles);
  if (pendingStyles) return pendingStyles;
  pendingStyles = api<CanvasStyleItem[] | { styles?: CanvasStyleItem[] }>('/api/styles')
    .then((response) => {
      const styles = Array.isArray(response)
        ? response
        : Array.isArray(response.styles) ? response.styles : [];
      cachedStyles = styles.filter((style) => style.id && !style.deleted_at);
      return cachedStyles;
    })
    .catch(() => [])
    .finally(() => {
      pendingStyles = null;
    });
  return pendingStyles;
}

interface CanvasStylePickerProps {
  value?: string | null;
  onChange: (styleId: string | null) => void;
}

export const CanvasStylePicker = memo(({ value, onChange }: CanvasStylePickerProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [styles, setStyles] = useState<CanvasStyleItem[]>(cachedStyles ?? []);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number }>({ left: 12, bottom: 12 });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      cachedStyles = null;
      void loadStyles().then((items) => {
        if (active) setStyles(items);
      });
    };
    void loadStyles().then((items) => {
      if (active) setStyles(items);
    });
    window.addEventListener('manga:styles-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('manga:styles-updated', refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const handleViewportChange = () => setOpen(false);
    document.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  const selectedStyle = useMemo(
    () => styles.find((style) => style.id === value) ?? null,
    [styles, value],
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <UiButton
        type="button"
        variant={selectedStyle ? 'primary' : 'muted'}
        className={`max-w-[108px] ${NODE_CONTROL_CHIP_CLASS}`}
        title={selectedStyle ? `风格：${selectedStyle.name}` : '选择生成风格'}
        aria-label="选择生成风格"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            const rect = rootRef.current?.getBoundingClientRect();
            if (rect) {
              const width = Math.min(280, window.innerWidth - 24);
              const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
              if (rect.top > Math.min(330, window.innerHeight * 0.55)) {
                setMenuPosition({ left, bottom: Math.max(12, window.innerHeight - rect.top + 6) });
              } else {
                setMenuPosition({ left, top: Math.max(12, rect.bottom + 6) });
              }
            }
          }
          setOpen((current) => !current);
        }}
      >
        <Palette className={NODE_CONTROL_ICON_CLASS} />
        <span className="min-w-0 truncate">{selectedStyle?.name || '风格'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </UiButton>

      {open && createPortal(
        <div
          ref={menuRef}
          className="canvas-style-picker-menu nowheel fixed z-[20000] w-[280px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--canvas-node-field-border)] bg-[var(--canvas-node-menu-bg)] p-2 shadow-2xl"
          style={menuPosition}
          onMouseDown={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-text-muted">
            <span>生成风格</span>
            <span>{styles.length} 个</span>
          </div>
          <button
            type="button"
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
              !value
                ? 'bg-[var(--canvas-node-menu-active)] text-text-dark'
                : 'text-text-muted hover:bg-[var(--canvas-node-menu-hover)]'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--canvas-node-field-border)] bg-[var(--canvas-node-button-bg)]">
              <Palette className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">不使用风格</span>
            {!value && <Check className="h-3.5 w-3.5 text-accent" />}
          </button>
          {styles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--canvas-node-field-border)] px-3 py-4 text-center text-xs text-text-muted">
              暂无风格，请先在资产库添加
            </div>
          ) : (
            <div className="ui-scrollbar grid max-h-[248px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              {styles.map((style) => {
                const selected = style.id === value;
                return (
                  <button
                    key={style.id}
                    type="button"
                    title={style.name}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left text-xs transition-colors ${
                      selected
                        ? 'border-accent/60 bg-accent/15 text-text-dark'
                        : 'border-[var(--canvas-node-field-border)] text-text-muted hover:border-accent/40 hover:bg-[var(--canvas-node-menu-hover)]'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(style.id);
                      setOpen(false);
                    }}
                  >
                    {style.thumbnail_url ? (
                      <img src={style.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--canvas-node-button-bg)] text-[10px]">
                        {style.name.slice(0, 2)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{style.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
});

CanvasStylePicker.displayName = 'CanvasStylePicker';

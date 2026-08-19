import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

let cache: any[] | null = null;
let promise: Promise<any[]> | null = null;
function loadStyles(): Promise<any[]> {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = api<any[]>('/api/styles').then((list) => { cache = Array.isArray(list) ? list : []; return cache; }).catch(() => { cache = []; return cache; });
  }
  return promise;
}

export default function StylePicker(props: { value: string | null; onChange: (id: string) => void }) {
  const [styles, setStyles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  useEffect(() => { loadStyles().then(setStyles); }, []);

  const selected = styles.find((s) => String(s.id) === props.value) || null;
  const filtered = styles.filter((s) => String(s.name || '').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8 gap-2">
          {selected && selected.thumbnail_url && !imgError[selected.id] ? (
            <img className="w-5 h-5 rounded object-cover flex-none" src={selected.thumbnail_url} alt="" onError={() => setImgError((m) => ({ ...m, [selected.id]: true }))} />
          ) : null}
          <span className="truncate">{selected ? String(selected.name || selected.id) : '不指定风格'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <Input
          className="h-8 text-xs mb-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索风格…"
        />
        <ScrollArea className="h-[260px]">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={props.value == null ? 'default' : 'outline'}
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-3 text-xs"
              onClick={() => { props.onChange(''); setOpen(false); }}
            >
              <span className="w-full h-12 flex items-center justify-center rounded bg-gradient-to-br from-gray-600 to-gray-700 text-xl text-muted-foreground">—</span>
              <span className="truncate">不指定风格</span>
            </Button>
            {filtered.map((style) => (
              <Button
                key={String(style.id)}
                variant={String(style.id) === props.value ? 'default' : 'outline'}
                size="sm"
                className="flex flex-col items-center gap-1 h-auto py-3 text-xs"
                onClick={() => { props.onChange(String(style.id)); setOpen(false); }}
              >
                {style.thumbnail_url && !imgError[style.id] ? (
                  <img className="w-full h-12 rounded object-cover" src={style.thumbnail_url} alt="" onError={() => setImgError((m) => ({ ...m, [style.id]: true }))} />
                ) : (
                  <span className="w-full h-12 flex items-center justify-center rounded bg-gradient-to-br from-blue-800 to-purple-800 text-xl">🎬</span>
                )}
                <span className="truncate">{String(style.name || style.id)}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
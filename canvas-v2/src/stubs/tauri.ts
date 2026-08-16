// Minimal Tauri IPC stubs for the Canvas V2 preview build.
// The upstream UI is kept as-is; every Tauri native call becomes a friendly
// preview-mode error instead of a real backend request.
export const isTauri = () => true;

// Return benign values for clipboard / media-persistence commands so the
// upstream copy-paste and image handling keep working in preview mode.
// Every real native capability (generation, provider, project persistence,
// file dialogs) still surfaces the preview-mode notice.
export async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case 'read_system_clipboard':
      return { image: null, text: '' };
    case 'copy_image_source_to_clipboard':
      return null;
    case 'persist_image_source':
    case 'persist_video_source':
    case 'persist_image_binary':
    case 'load_image':
    case 'load_audio_source_data_url':
    case 'crop_image_source':
      return args.source ?? args.sourcePath ?? '';
    case 'prepare_node_image_source':
    case 'prepare_node_image_source_with_headers':
      return {
        imagePath: args.source ?? '',
        previewImagePath: args.source ?? '',
        aspectRatio: '1:1',
      };
    case 'prepare_node_image_binary':
      return { imagePath: '', previewImagePath: '', aspectRatio: '1:1' };
    case 'rename_local_media_files':
      return {
        primaryPath: (args.payload as Record<string, unknown> | undefined)?.primaryPath ?? '',
        previewPath: null,
        fileName: '',
      };
    case 'save_image_source_to_downloads':
    case 'save_image_source_to_path':
    case 'save_image_source_to_directory':
    case 'save_video_source_to_path':
    case 'save_video_source_to_directory':
    case 'save_audio_source_to_path':
    case 'save_image_source_to_app_debug_dir':
      return null;
    default:
      throw new Error('Canvas V2 预览模式，尚未接入 Manga Studio 生成接口。');
  }
}

export async function listen(): Promise<() => void> {
  return () => {};
}
export type UnlistenFn = () => void;

export function convertFileSrc(filePath: string): string {
  return filePath;
}

export async function join(...parts: string[]): Promise<string> {
  return parts.join('/');
}

export async function getVersion(): Promise<string> {
  return '0.0.0-preview';
}

export function getCurrentWindow() {
  return {
    minimize: async () => {},
    toggleMaximize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    startDragging: async () => {},
    setTitle: async () => {},
    onResized: () => () => {},
  };
}

export async function open(): Promise<string | null> {
  return null;
}
export async function save(): Promise<string | null> {
  return null;
}
export async function ask(): Promise<boolean> {
  return true;
}
export async function message(): Promise<void> {}

export async function openPath(): Promise<void> {}
export async function revealItemInDir(): Promise<void> {}
export async function openUrl(): Promise<void> {}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Canvas V2 preview: near-vanilla open-storyboard-canvas UI.
// Tauri IPC / provider / agent modules are aliased to local stubs so the
// upstream UI builds unchanged; see src/stubs/tauri.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tauri-apps/api/core': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/api/event': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/api/path': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/api/app': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/api/window': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@tauri-apps/plugin-opener': path.resolve(__dirname, './src/stubs/tauri.ts'),
      '@openai/agents': path.resolve(__dirname, './src/stubs/openai-agents.ts'),
    },
  },
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
  },
  base: '/static/canvas-v2/dist/',
  build: {
    outDir: '../static/canvas-v2/dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          konva: ['konva', 'react-konva'],
          pano: ['@photo-sphere-viewer/core'],
          markdown: ['react-markdown', 'remark-gfm', 'remark-breaks'],
          reactflow: ['@xyflow/react'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5001',
      '/static': 'http://127.0.0.1:5001',
    },
  },
});

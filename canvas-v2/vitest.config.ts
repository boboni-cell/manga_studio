import { defineConfig } from 'vitest/config';
import path from 'path';

// Canvas V2 unit tests: pure logic only (no Tauri, no browser APIs).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: [
      'src/lib/**/*.test.ts',
      'src/features/canvas/application/*Catalog.test.ts',
      'src/features/canvas/application/canvasClipboard.test.ts',
      'src/features/canvas/application/graphReferenceResolver.test.ts',
    ],
    environment: 'node',
  },
});

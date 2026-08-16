import { defineConfig } from 'vitest/config';

// Canvas V2 unit tests: pure logic only (no Tauri, no browser APIs).
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
});

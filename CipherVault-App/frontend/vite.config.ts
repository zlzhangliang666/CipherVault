/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 桌面端通过 file:// 加载，必须使用相对路径
  base: './',
  plugins: [react()],
  build: {
    outDir: '../desktop/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});

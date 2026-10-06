/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    {
      name: 'exclude-wasm-from-bundle',
      generateBundle(_, bundle) {
        for (const fileName in bundle) {
          if (fileName.endsWith('.wasm')) {
            delete bundle[fileName];
          }
        }
      },
    },
  ],
  server: {
    https: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});

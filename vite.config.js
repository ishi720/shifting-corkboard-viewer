import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        admin: resolve(import.meta.dirname, 'index.html'),
        board: resolve(import.meta.dirname, 'board.html'),
      },
    },
  },
});

import { defineConfig } from 'vite';

// VITE_BASE é definido pelo workflow do GitHub Pages ("/nome-do-repo/").
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});

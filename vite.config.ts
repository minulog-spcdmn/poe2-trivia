import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on any GitHub Pages sub-path.
  base: './',
  plugins: [svelte()],
});

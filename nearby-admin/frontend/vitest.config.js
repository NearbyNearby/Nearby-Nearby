import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Bind-mounted path (not the anonymous node_modules volume) so the Vite/Vitest
  // cache survives across `docker compose run` invocations instead of dying
  // with each ephemeral container.
  cacheDir: '.vite',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    css: false,
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: [
      'tests/**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
      'frontend/src/**/__tests__/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
    ],
    // Run test files sequentially to avoid port conflicts when starting/stopping servers
    fileParallelism: false,
    // Increase hook timeout for server startup
    hookTimeout: 60000,
  },
});

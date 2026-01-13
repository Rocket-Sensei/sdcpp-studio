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
    // Coverage configuration using v8
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Include all source files in coverage report
      include: [
        'frontend/src/**/*.{js,jsx,ts,tsx}',
        'backend/**/*.js',
      ],
      // Exclude common non-source files
      exclude: [
        'frontend/src/main.jsx',
        'frontend/src/vite-env.d.ts',
        'frontend/dist/**',
        'frontend/build/**',
        '**/*.test.{js,jsx,ts,tsx}',
        '**/*.spec.{js,jsx,ts,tsx}',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.{idea,git,cache,output,temp}',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc}.config.{js,ts,mjs}',
        '**/{test,tests,spec}/**',
        '**/__tests__/**',
        '**/{.eslintrc,.prettierrc,.prettierrc.js,.prettierrc.json,.prettierrc.yml,.prettierrc.yaml}',
      ],
      // Set thresholds for coverage (target: 80%)
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
      // Don't fail if thresholds are not met initially
      perFile: false,
    },
  },
});

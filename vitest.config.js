import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { vi } from 'vitest';

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
    // Mock configuration for external dependencies
    mock: {
      'easy-dl': {
        default: class MockEasyDl {
          constructor(url, destPath, options) {
            this.url = url;
            this.destPath = destPath;
            this.options = options;
            this._progressCallbacks = [];
            this._shouldFail = false;
          }
          on(event, callback) {
            if (event === 'progress') {
              this._progressCallbacks.push(callback);
            }
            return this;
          }
          async wait() {
            if (this._shouldFail) {
              throw new Error('Mock download failed');
            }
            // Simulate progress
            for (const cb of this._progressCallbacks) {
              cb({ percent: 100, downloaded: 1000000, total: 1000000, speed: 1000000, remaining: 0 });
            }
            return true;
          }
          cancel() {
            // Cancel download
          }
          // Test helper to make the download fail
          _fail() {
            this._shouldFail = true;
          }
        }
      },
      'pino': {
        default: vi.fn(() => ({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          child: vi.fn(() => ({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          })),
        })),
        destination: vi.fn(() => ({
          flushSync: vi.fn(),
        })),
        multistream: vi.fn((streams) => streams),
      },
    },
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

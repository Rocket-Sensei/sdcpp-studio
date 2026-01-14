import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import path from 'path';
import { fileURLToPath } from 'url';

// Set test database path BEFORE importing any backend modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, 'backend', 'data', 'test-sd-cpp-studio.db');
process.env.DB_PATH = TEST_DB_PATH;

// Set test images directories BEFORE importing any backend modules
// This prevents tests from using production image directories
const TEST_IMAGES_DIR = path.join(__dirname, 'backend', 'data', 'test-images');
const TEST_INPUT_DIR = path.join(__dirname, 'backend', 'data', 'test-input');
process.env.IMAGES_DIR = TEST_IMAGES_DIR;
process.env.INPUT_DIR = TEST_INPUT_DIR;

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// Mock easy-dl globally for all backend tests
vi.mock('easy-dl', () => ({
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
}));

// Mock pino globally for all backend tests
vi.mock('pino', () => ({
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
}));

// Mock ApiKeyContext for all tests (App component uses it)
vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  ApiKeyProvider: ({ children }) => children,
  useApiKeyContext: () => ({
    apiKey: null,
    version: 0,
    notifyApiKeyChanged: vi.fn(),
  }),
}));

// Don't mock fetch globally - let individual test files decide
// Integration tests need real fetch, unit tests can mock it locally

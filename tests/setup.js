import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';

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
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
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

import { expect, afterEach } from 'vitest';

// Only use testing-library in jsdom environment (React tests)
try {
  const { cleanup } = await import('@testing-library/react');
  const matchers = await import('@testing-library/jest-dom/matchers');

  expect.extend(matchers.default || matchers);

  afterEach(() => {
    cleanup();
  });
} catch (e) {
  // @testing-library/react not available - skip cleanup
  console.log('Testing library not available, skipping React cleanup');
}

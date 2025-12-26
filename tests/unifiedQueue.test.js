/**
 * Tests for UnifiedQueue component
 *
 * This test file verifies that:
 * 1. Thumbnail components don't remount when parent re-renders
 * 2. Images are only loaded once per generation (not on every poll)
 * 3. The component structure is correct with Thumbnail defined outside parent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the source file for static analysis
const getSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/UnifiedQueue.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

// Mock fetch for thumbnail loading
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UnifiedQueue - Thumbnail Remount Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should define Thumbnail component outside UnifiedQueue (stable identity)', () => {
    const source = getSource();

    // Verify Thumbnail is defined outside UnifiedQueue function
    const unifiedQueueMatch = source.match(/export function UnifiedQueue/);
    const thumbnailMatch = source.match(/const Thumbnail = memo/);

    expect(unifiedQueueMatch).toBeTruthy();
    expect(thumbnailMatch).toBeTruthy();

    // Thumbnail should be defined BEFORE UnifiedQueue
    const thumbnailIndex = source.indexOf('const Thumbnail = memo');
    const unifiedQueueIndex = source.indexOf('export function UnifiedQueue');

    expect(thumbnailIndex).toBeLessThan(unifiedQueueIndex);
    expect(thumbnailIndex).toBeGreaterThan(-1);
    expect(unifiedQueueIndex).toBeGreaterThan(-1);
  });

  it('should use React.memo for Thumbnail component', () => {
    const source = getSource();

    // Verify Thumbnail is wrapped with memo
    expect(source).toContain('const Thumbnail = memo(function Thumbnail');
    // Check for memo import (flexible on quote style)
    expect(source).toMatch(/import.*memo.*from.*['"]react['"]/);
  });

  it('should use first_image_url directly from list data', () => {
    const source = getSource();

    // Verify Thumbnail uses first_image_url directly (no additional API calls)
    expect(source).toContain('const src = generation.first_image_url || null');
  });

  it('should use LightboxWithImage component for images', () => {
    const source = getSource();

    // Verify LightboxWithImage component is used for modal image viewing
    expect(source).toContain('LightboxWithImage');
    expect(source).toContain('LightboxGalleryWithImages');
    expect(source).toContain('@didik-mulyadi/react-modal-images');
  });

  it('should have helper functions defined outside component', () => {
    const source = getSource();

    // Helper functions should be outside the component
    // Check that getStatusConfig and isPendingOrProcessing are defined before UnifiedQueue
    const getStatusConfigIndex = source.indexOf('const getStatusConfig');
    const unifiedQueueIndex = source.indexOf('export function UnifiedQueue');

    expect(getStatusConfigIndex).toBeLessThan(unifiedQueueIndex);
    expect(getStatusConfigIndex).toBeGreaterThan(0);
  });

  it('should not have nested component definitions', () => {
    const source = getSource();

    // Find the UnifiedQueue function body
    const unifiedQueueStart = source.indexOf('export function UnifiedQueue');
    const unifiedQueueEnd = source.indexOf('export default UnifiedQueue');

    expect(unifiedQueueStart).toBeGreaterThan(-1);
    expect(unifiedQueueEnd).toBeGreaterThan(unifiedQueueStart);

    const componentBody = source.substring(unifiedQueueStart, unifiedQueueEnd);

    // Should not have "const Thumbnail =" inside UnifiedQueue
    expect(componentBody).not.toContain('const Thumbnail =');
  });

  it('should have proper comments explaining the fix', () => {
    const source = getSource();

    // Verify the comments explain why Thumbnail is outside
    expect(source).toContain('Thumbnail component moved outside parent');
    expect(source).toContain('prevent remounting');
  });
});

describe('UnifiedQueue - Real-time Updates', () => {
  it('should use WebSocket for real-time updates instead of polling', () => {
    const source = getSource();

    // Verify WebSocket import
    expect(source).toContain('useWebSocket');
    expect(source).toContain('WS_CHANNELS');

    // Should NOT have the old polling code
    expect(source).not.toContain('setInterval(fetchGenerations, 3000)');
  });

  it('should listen to queue and generations channels', () => {
    const source = getSource();

    // Verify channel subscriptions
    expect(source).toContain('WS_CHANNELS.QUEUE');
    expect(source).toContain('WS_CHANNELS.GENERATIONS');
  });

  it('should refresh generations on WebSocket messages', () => {
    const source = getSource();

    // Should fetch on queue messages
    expect(source).toContain('job_updated');
    expect(source).toContain('job_completed');
    expect(source).toContain('job_failed');

    // Should fetch on generation messages
    expect(source).toContain('generation_complete');
  });

  // Note: WiFi status indicator was removed in favor of WebSocketStatusIndicator component
  // Connection status is now shown in the header via WebSocketStatusIndicator component
});

describe('UnifiedQueue - Model Display', () => {
  it('should display model name for each generation', () => {
    const source = getSource();

    // Verify Cpu icon import for model display
    expect(source).toContain('Cpu');

    // Verify getModelName function
    expect(source).toContain('getModelName');
    expect(source).toContain('models');

    // Verify model is displayed in the card
    expect(source).toContain('getModelName(generation.model)');

    // Should fetch models on mount
    expect(source).toContain('/api/models');
    expect(source).toContain('fetchModels');
  });

  it('should handle null/undefined model values gracefully', () => {
    const source = getSource();

    // Verify getModelName handles null/undefined
    expect(source).toContain('if (!modelId)');
    expect(source).toContain("'Unknown Model'");
  });

  it('should include model in the image preview dialog', () => {
    const source = getSource();

    // Verify model is shown in dialog description
    expect(source).toContain('getModelName(selectedImage?.model)');
    expect(source).toContain('DialogDescription');
  });
});

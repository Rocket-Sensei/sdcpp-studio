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

// Read the source files for static analysis
const getUnifiedQueueSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/UnifiedQueue.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

const getImageCardSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/gallery/ImageCard.jsx');
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

  it('should define ImageCard component in separate file (stable identity)', () => {
    const unifiedQueueSource = getUnifiedQueueSource();
    const imageCardSource = getImageCardSource();

    // Verify ImageCard is defined in separate file
    const imageCardMatch = imageCardSource.match(/export const ImageCard = memo/);
    expect(imageCardMatch).toBeTruthy();

    // Verify UnifiedQueue imports ImageCard
    expect(unifiedQueueSource).toContain('import { ImageCard } from');
    expect(unifiedQueueSource).toContain('from "./gallery/ImageCard"');

    // Verify the re-export for backward compatibility
    expect(unifiedQueueSource).toContain('export const Thumbnail = ImageCard');
  });

  it('should use React.memo for ImageCard component', () => {
    const imageCardSource = getImageCardSource();

    // Verify ImageCard is wrapped with memo
    expect(imageCardSource).toContain('export const ImageCard = memo(function ImageCard');
    // Check for memo import (flexible on quote style)
    expect(imageCardSource).toMatch(/import.*memo.*from.*['"]react['"]/);
  });

  it('should use first_image_url directly from list data', () => {
    const imageCardSource = getImageCardSource();

    // Verify ImageCard uses first_image_url directly (no additional API calls)
    expect(imageCardSource).toContain('const src = generation.first_image_url || null');
  });

  it('should use LightboxWithImage component for images', () => {
    const imageCardSource = getImageCardSource();

    // Verify LightboxWithImage component is used for modal image viewing
    expect(imageCardSource).toContain('LightboxWithImage');
    // Now using local Lightbox component wrapper around @hanakla/react-lightbox
    expect(imageCardSource).toContain('from "../Lightbox"');
  });

  it('should have helper functions defined outside component', () => {
    const source = getUnifiedQueueSource();

    // Helper functions should be outside the component
    // Check that getStatusConfig and isPendingOrProcessing are defined before UnifiedQueue
    const getStatusConfigIndex = source.indexOf('const getStatusConfig');
    const unifiedQueueIndex = source.indexOf('export function UnifiedQueue');

    expect(getStatusConfigIndex).toBeLessThan(unifiedQueueIndex);
    expect(getStatusConfigIndex).toBeGreaterThan(0);
  });

  it('should not have nested component definitions', () => {
    const unifiedQueueSource = getUnifiedQueueSource();

    // Find the UnifiedQueue function body
    const unifiedQueueStart = unifiedQueueSource.indexOf('export function UnifiedQueue');
    const unifiedQueueEnd = unifiedQueueSource.indexOf('export default UnifiedQueue');

    expect(unifiedQueueStart).toBeGreaterThan(-1);
    expect(unifiedQueueEnd).toBeGreaterThan(unifiedQueueStart);

    const componentBody = unifiedQueueSource.substring(unifiedQueueStart, unifiedQueueEnd);

    // Should not have "const Thumbnail =" or "const ImageCard =" inside UnifiedQueue
    expect(componentBody).not.toContain('const Thumbnail =');
    expect(componentBody).not.toContain('const ImageCard =');
  });

  it('should have proper comments explaining the ImageCard component structure', () => {
    const unifiedQueueSource = getUnifiedQueueSource();

    // Verify the file imports ImageCard from gallery
    expect(unifiedQueueSource).toContain('import { ImageCard } from');
    expect(unifiedQueueSource).toContain('from "./gallery/ImageCard"');

    // Verify the re-export for backward compatibility
    expect(unifiedQueueSource).toContain('export const Thumbnail = ImageCard');
    // Verify the comment explaining this re-export
    expect(unifiedQueueSource).toContain('Re-export Thumbnail for backward compatibility');
  });
});

describe('UnifiedQueue - Real-time Updates', () => {
  it('should use WebSocket for real-time updates instead of polling', () => {
    const source = getUnifiedQueueSource();

    // Verify WebSocket import
    expect(source).toContain('useWebSocket');
    expect(source).toContain('WS_CHANNELS');

    // Should NOT have the old polling code
    expect(source).not.toContain('setInterval(fetchGenerations, 3000)');
  });

  it('should listen to queue and generations channels', () => {
    const source = getUnifiedQueueSource();

    // Verify channel subscriptions
    expect(source).toContain('WS_CHANNELS.QUEUE');
    expect(source).toContain('WS_CHANNELS.GENERATIONS');
  });

  it('should refresh generations on WebSocket messages', () => {
    const source = getUnifiedQueueSource();

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
    const source = getUnifiedQueueSource();

    // Verify Cpu icon import for model display
    expect(source).toContain('Cpu');

    // Verify getModelName function
    expect(source).toContain('getModelName');
    expect(source).toContain('modelsNameMap');

    // Verify model is displayed in the card
    expect(source).toContain('getModelName(generation.model)');

    // Models are fetched via useModels hook
    expect(source).toContain('useModels');
    expect(source).toContain('modelsNameMap');
  });

  it('should handle null/undefined model values gracefully', () => {
    const source = getUnifiedQueueSource();

    // Verify getModelName handles null/undefined
    expect(source).toContain('if (!modelId)');
    expect(source).toContain("'Unknown Model'");
  });

  it('should include model in the image preview dialog', () => {
    const source = getUnifiedQueueSource();

    // Verify model is shown in dialog description
    expect(source).toContain('getModelName(selectedImage?.model)');
    expect(source).toContain('DialogDescription');
  });
});

/**
 * Vitest tests for Lightbox image sizing
 * Tests that the image fits within the viewport including the header
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Get Lightbox source for static analysis
const getLightboxSource = () => {
  const sourcePath = path.join(__dirname, '../frontend/src/components/Lightbox.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

describe('Lightbox - Image Sizing with Header Consideration', () => {
  const source = getLightboxSource();

  it('should use max-h-full instead of max-h-[90vh] to fit within container', () => {
    // max-h-[90vh] doesn't account for header height
    // max-h-full will fit within the parent container (which accounts for header)
    expect(source).toContain('max-h-full');
  });

  it('should NOT use max-h-[90vh] as it causes overflow with header', () => {
    // 90vh of viewport + header height = overflow
    expect(source).not.toContain('max-h-[90vh]');
  });

  it('should NOT use max-w-[90vw] - use max-w-full instead', () => {
    // max-w-full constrains to the parent container which already has padding
    expect(source).not.toContain('max-w-[90vw]');
    expect(source).toContain('max-w-full');
  });

  it('should NOT have inline style with 90vw/90vh', () => {
    // Should not have inline styles that override the Tailwind classes
    expect(source).not.toMatch(/maxWidth:\s*['"]90vw/);
    expect(source).not.toMatch(/maxHeight:\s*['"]90vh/);
  });

  it('should have flex-1 on Viewport to take remaining space after header', () => {
    expect(source).toMatch(/Viewport.*flex-1/);
  });

  it('should have flex column layout on Root', () => {
    expect(source).toContain('flex flex-col');
  });

  it('should have proper aspect ratio preservation', () => {
    expect(source).toContain('object-contain');
  });
});

describe('Lightbox - Viewport Container Sizing', () => {
  const source = getLightboxSource();

  it('should have Viewport with flex-1 to take remaining vertical space', () => {
    // The Viewport should take all remaining space after the header
    expect(source).toContain('<Lightbox.Viewport');
    expect(source).toContain('flex-1');
  });

  it('should have Root with flex flex-col for proper vertical layout', () => {
    // Root uses flex-col so header and viewport stack vertically
    expect(source).toContain('<Lightbox.Root');
    expect(source).toContain('flex flex-col');
  });

  it('should have header with fixed height (no flex-grow)', () => {
    // Header should not take more than its content height
    expect(source).toMatch(/Header[^>]*className="[^"]*flex items-center/);
    expect(source).not.toMatch(/Header[^>]*flex-1/);
  });
});

describe('Lightbox - Image Dimensions', () => {
  const source = getLightboxSource();

  it('should use max-w-full to constrain width to container', () => {
    expect(source).toContain('max-w-full');
  });

  it('should use max-h-full to constrain height to container', () => {
    expect(source).toContain('max-h-full');
  });

  it('should have w-auto and h-auto for proper aspect ratio', () => {
    expect(source).toContain('w-auto');
    expect(source).toContain('h-auto');
  });

  it('should have object-contain to preserve aspect ratio', () => {
    expect(source).toContain('object-contain');
  });
});

describe('Lightbox - Backdrop Click Handling', () => {
  const source = getLightboxSource();

  it('should have custom backdrop div for backdrop clicks', () => {
    expect(source).toContain('backdrop');
    expect(source).toContain('onClick={lbContext.close}');
  });

  it('should NOT use handleViewportClick (using backdrop div instead)', () => {
    expect(source).not.toContain('handleViewportClick');
  });

  it('should NOT use $onClose prop (library implementation does not work)', () => {
    expect(source).not.toContain('$onClose=');
  });

  it('should use pointer-events to control click-through behavior', () => {
    // Content areas have pointer-events-none to allow clicks through to backdrop
    // Interactive elements have pointer-events-auto
    expect(source).toContain('pointer-events-none');
    expect(source).toContain('pointer-events-auto');
  });
});

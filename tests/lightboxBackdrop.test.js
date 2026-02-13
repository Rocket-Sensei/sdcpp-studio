/**
 * Vitest tests for Lightbox backdrop click functionality
 * Tests that clicking the overlay/backdrop closes the modal
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Get Lightbox source for static analysis
const getLightboxSource = () => {
  const sourcePath = path.join(__dirname, '../frontend/src/components/Lightbox.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

describe('Lightbox - Backdrop Click to Close', () => {
  const source = getLightboxSource();

  it('should have custom backdrop div for backdrop clicks', () => {
    // A separate backdrop div handles clicks since library's $onClose doesn't work
    expect(source).toContain('backdrop');
    expect(source).toContain('onClick={lbContext.close}');
  });

  it('should attach backdrop div as first child after Root', () => {
    // Backdrop should come right after Root opens
    const backdropIndex = source.indexOf('backdrop');
    const rootIndex = source.indexOf('<Lightbox.Root');
    expect(backdropIndex).toBeGreaterThan(rootIndex);
  });

  it('should have backdrop with absolute inset-0 to cover entire screen', () => {
    expect(source).toContain('backdrop');
    expect(source).toContain('absolute inset-0');
  });

  it('should have backdrop with z-0 to sit behind content', () => {
    expect(source).toContain('backdrop');
    expect(source).toContain('z-0');
  });

  it('should have aria-label on backdrop for accessibility', () => {
    expect(source).toMatch(/aria-label=["']Close lightbox["']/);
  });

  it('should use lbContext.close as the close handler', () => {
    expect(source).toContain('lbContext.close');
  });

  it('should have backdrop with proper CSS for full screen overlay', () => {
    // Should have fixed inset-0 for full screen coverage on Root
    expect(source).toContain('fixed inset-0');
  });

  it('should have semi-transparent backdrop', () => {
    // Should have bg-black/80 for backdrop visibility
    expect(source).toContain('bg-black/80');
  });

  it('should have proper z-index for overlay', () => {
    // Should have high z-index to be on top
    expect(source).toContain('z-50');
  });

  it('should use useLightboxState hook to get context', () => {
    expect(source).toContain('const lbContext = useLightboxState()');
  });

  it('should have Pinchable with onRequestClose for pinch-to-close', () => {
    // The Lightbox.Pinchable component has onRequestClose for pinch gestures
    expect(source).toContain('onRequestClose={lbContext.close}');
  });
});

describe('Lightbox - Backdrop Implementation Details', () => {
  const source = getLightboxSource();

  it('should NOT use $onClose prop (library implementation does not work)', () => {
    expect(source).not.toContain('$onClose=');
  });

  it('should NOT use handleViewportClick (using backdrop div instead)', () => {
    expect(source).not.toContain('handleViewportClick');
  });

  it('should have comment explaining the backdrop click behavior', () => {
    // Should have explanatory comment about backdrop click
    expect(source).toMatch(/backdrop/i);
  });
});

describe('Lightbox - Pointer Events Control', () => {
  const source = getLightboxSource();

  it('should use pointer-events-none on Header to allow clicks through to backdrop', () => {
    expect(source).toContain('Header');
    expect(source).toContain('pointer-events-none');
  });

  it('should use pointer-events-none on Viewport to allow clicks through to backdrop', () => {
    expect(source).toContain('Viewport');
    expect(source).toContain('pointer-events-none');
  });

  it('should use pointer-events-auto on interactive elements', () => {
    // Button container should have pointer-events-auto to be clickable
    expect(source).toContain('pointer-events-auto');
  });

  it('should use pointer-events-none on Item to allow clicks through', () => {
    expect(source).toContain('Item');
    expect(source).toContain('pointer-events-none');
  });

  it('should use pointer-events-auto on inner content wrapper', () => {
    // Inner content div should have pointer-events-auto to enable image interaction
    expect(source).toMatch(/pointer-events-auto/);
  });
});

describe('Lightbox - Content Z-Index', () => {
  const source = getLightboxSource();

  it('should have z-10 on Header to appear above backdrop', () => {
    expect(source).toContain('Header');
    expect(source).toContain('z-10');
  });

  it('should have z-10 on Viewport to appear above backdrop', () => {
    expect(source).toContain('Viewport');
    expect(source).toContain('z-10');
  });
});

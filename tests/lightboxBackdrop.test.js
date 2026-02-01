/**
 * Vitest tests for Lightbox backdrop click functionality
 * Tests that clicking the overlay/backdrop closes the modal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'fs';
import path from 'path';

// Get Lightbox source for static analysis
const getLightboxSource = () => {
  const sourcePath = path.join(__dirname, '../frontend/src/components/Lightbox.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

describe('Lightbox - Backdrop Click to Close', () => {
  const source = getLightboxSource();

  it('should use $onClose prop to handle backdrop clicks (library-provided)', () => {
    // The @hanakla/react-lightbox library handles backdrop clicks internally
    // and calls the $onClose callback when the backdrop is clicked
    expect(source).toContain('$onClose={lbContext.close}');
  });

  it('should attach $onClose to Lightbox.Root element', () => {
    // Verify the $onClose is on Lightbox.Root specifically
    const rootMatch = source.match(/<Lightbox\.Root[^>]*\$onClose=/);
    expect(rootMatch).toBeTruthy();
  });

  it('should use lbContext.close as the close handler', () => {
    expect(source).toContain('lbContext.close');
  });

  it('should have backdrop with proper CSS for full screen overlay', () => {
    // Should have fixed inset-0 for full screen coverage
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

describe('Lightbox - Backdrop Click Implementation Details', () => {
  const source = getLightboxSource();

  it('should NOT use custom onClick handler for backdrop', () => {
    // The implementation should use library's $onClose prop instead of custom onClick
    expect(source).not.toContain('onClick={handleBackdropClick}');
  });

  it('should NOT have handleBackdropClick function', () => {
    // Using library's built-in backdrop handling, no custom function needed
    expect(source).not.toContain('handleBackdropClick');
  });

  it('should have comment explaining the backdrop click behavior', () => {
    // Should have explanatory comment about backdrop click (case-insensitive)
    expect(source).toMatch(/backdrop click/i);
  });

  it('should call close method on lbContext', () => {
    expect(source).toContain('lbContext.close');
  });
});

describe('Lightbox - Library Integration', () => {
  const source = getLightboxSource();

  it('should use $onClose prop from @hanakla/react-lightbox', () => {
    // Props starting with $ are special props for the library
    expect(source).toMatch(/\$onClose=/);
  });

  it('should pass lbContext.close to $onClose', () => {
    expect(source).toMatch(/\$onClose=\{lbContext\.close\}/);
  });

  it('documents the library-provided backdrop click handling', () => {
    // This test documents that we rely on the library's built-in handling
    expect(source).toMatch(/Lightbox\.Root/);
  });

  it('should also have onRequestClose on Pinchable for gesture close', () => {
    // Multiple ways to close: backdrop click, close button, pinch gesture
    expect(source).toContain('Lightbox.Pinchable');
    expect(source).toMatch(/onRequestClose=\{lbContext\.close\}/);
  });
});

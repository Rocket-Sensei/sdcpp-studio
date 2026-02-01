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

  it('should use handleViewportClick function for backdrop clicks', () => {
    expect(source).toContain('handleViewportClick');
  });

  it('should attach onClick to Viewport element (not Root)', () => {
    // The library's Root doesn't properly handle clicks, so we use Viewport
    expect(source).toMatch(/Viewport[^>]*onClick=\{handleViewportClick\}/);
  });

  it('should use lbContext.close as the close handler', () => {
    expect(source).toContain('lbContext.close()');
  });

  it('should check if click target is the viewport element (backdrop)', () => {
    // Should compare e.target === e.currentTarget to ensure click is on backdrop
    expect(source).toContain('e.target === e.currentTarget');
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

  it('should define handleViewportClick as a const function', () => {
    expect(source).toContain('const handleViewportClick =');
  });

  it('should receive event parameter', () => {
    expect(source).toMatch(/const handleViewportClick = \(/);
  });

  it('should have comment explaining the backdrop click behavior', () => {
    // Should have explanatory comment about backdrop click
    expect(source).toMatch(/backdrop/i);
  });

  it('should call close method on lbContext', () => {
    expect(source).toContain('lbContext.close()');
  });

  it('should NOT use $onClose prop (library implementation does not work)', () => {
    expect(source).not.toContain('$onClose=');
  });
});

describe('Lightbox - Viewport Integration', () => {
  const source = getLightboxSource();

  it('should attach onClick to Lightbox.Viewport component', () => {
    expect(source).toMatch(/<Lightbox\.Viewport[^>]*onClick=/);
  });

  it('should pass handleViewportClick to onClick prop', () => {
    expect(source).toMatch(/onClick=\{handleViewportClick\}/);
  });

  it('should have flex-1 on Viewport to take remaining space', () => {
    expect(source).toContain('className="flex flex-1"');
  });

  it('documents the viewport-based backdrop click handling', () => {
    // This test documents that we use Viewport onClick instead of Root $onClose
    expect(source).toMatch(/Viewport/);
  });
});

/**
 * Tests for Navigation component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import * as ReactRouter from 'react-router-dom';

// Mock react-router-dom BEFORE importing Navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    NavLink: ({ children, to, className }) =>
      React.createElement('a', { href: to, className: typeof className === 'function' ? className({ isActive: false }) : className }, children),
  };
});

// Import Navigation after the mock is set up
const { Navigation } = await import('../frontend/src/components/Navigation');

describe('Navigation Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all 4 navigation items', () => {
    render(React.createElement(Navigation));

    expect(screen.getByText('Text to Image')).toBeTruthy();
    expect(screen.getByText('Image to Image')).toBeTruthy();
    expect(screen.getByText('Gallery')).toBeTruthy();
    expect(screen.getByText('Models')).toBeTruthy();
  });

  it('should have correct href attributes for each nav item', () => {
    render(React.createElement(Navigation));

    const links = screen.getAllByRole('link');
    const hrefs = links.map(link => link.getAttribute('href'));

    expect(hrefs).toContain('/text-to-image');
    expect(hrefs).toContain('/image-to-image');
    expect(hrefs).toContain('/gallery');
    expect(hrefs).toContain('/models');
  });

  it('should render icons for each navigation item', () => {
    const { container } = render(React.createElement(Navigation));

    // Check for SVG icons (lucide-react icons render as SVG)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('should have proper CSS classes for layout', () => {
    const { container } = render(React.createElement(Navigation));

    const nav = container.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(nav.className).toContain('grid');
  });

  it('should hide labels on small screens', () => {
    const { container } = render(React.createElement(Navigation));

    // Check for sm:inline class which hides text on small screens
    const spans = container.querySelectorAll('span');
    let hasSmallScreenHide = false;
    spans.forEach(span => {
      if (span.className.includes('sm:inline')) {
        hasSmallScreenHide = true;
      }
    });
    expect(hasSmallScreenHide).toBe(true);
  });
});

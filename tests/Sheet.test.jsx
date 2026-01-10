/**
 * Tests for Sheet UI component
 * Tests that the Sheet component has proper width configuration without max-w-sm
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// Import the actual Sheet component (not mocked)
// We need to unmock it to test the actual rendered classes
vi.unmock('../frontend/src/components/ui/sheet');

const { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } = await import('../frontend/src/components/ui/sheet');

describe('Sheet Component', () => {
  beforeEach(() => {
    cleanup();
  });

  describe('Width Configuration', () => {
    it('should NOT have sm:max-w-sm class in base left variant', () => {
      // Render SheetContent with left side
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, { side: 'left' },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            'Test content'
          )
        )
      );

      // Find the SheetContent element - Radix UI uses Portal so it's in document.body
      // Need to query for the actual content div, not the overlay
      // The overlay has data-state=open but the content div has 'left-0' or 'right-0' class
      const sheetContent = document.body.querySelector('.left-0');
      expect(sheetContent).toBeTruthy();

      // The base variant should NOT include max-w-sm which would limit width
      // The left variant should have: inset-y-0 left-0 h-full w-3/4 border-r
      // WITHOUT sm:max-w-sm
      expect(sheetContent.className).toContain('left-0');
      expect(sheetContent.className).toContain('w-3/4');
      expect(sheetContent.className).not.toContain('max-w-sm');
    });

    it('should NOT have sm:max-w-sm class in base right variant', () => {
      // Render SheetContent with right side
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, { side: 'right' },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            'Test content'
          )
        )
      );

      const sheetContent = document.body.querySelector('.right-0');
      expect(sheetContent).toBeTruthy();

      // The right variant should have: inset-y-0 right-0 h-full w-3/4 border-l
      // WITHOUT sm:max-w-sm
      expect(sheetContent.className).toContain('right-0');
      expect(sheetContent.className).toContain('w-3/4');
      expect(sheetContent.className).not.toContain('max-w-sm');
    });

    it('should allow custom width classes via className prop', () => {
      // Test that custom width classes can override base classes
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, {
            side: 'left',
            className: 'sm:w-[500px] md:w-[600px] lg:w-[700px]'
          },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            'Test content'
          )
        )
      );

      const sheetContent = document.body.querySelector('.left-0');
      expect(sheetContent).toBeTruthy();

      // Custom width classes should be present
      expect(sheetContent.className).toContain('sm:w-[500px]');
      expect(sheetContent.className).toContain('md:w-[600px]');
      expect(sheetContent.className).toContain('lg:w-[700px]');
    });

    it('should have animation classes for slide effects', () => {
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, { side: 'left' },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            'Test content'
          )
        )
      );

      const sheetContent = document.body.querySelector('.left-0');
      expect(sheetContent).toBeTruthy();

      // Should have animation classes
      expect(sheetContent.className).toContain('animate-slide-in-left');
      expect(sheetContent.className).toContain('data-[state=closed]:animate-slide-out-left');
    });
  });

  describe('Structure', () => {
    it('should render children correctly', () => {
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, { side: 'left' },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            React.createElement('p', null, 'Test content')
          )
        )
      );

      expect(screen.getByText('Test content')).toBeTruthy();
    });

    it('should render with proper positioning classes', () => {
      render(
        React.createElement(Sheet, { open: true },
          React.createElement(SheetContent, { side: 'left' },
            React.createElement(SheetHeader, null,
              React.createElement(SheetTitle, null, 'Test Title'),
              React.createElement(SheetDescription, null, 'Test Description')
            ),
            'Content'
          )
        )
      );

      const sheetContent = document.body.querySelector('.left-0');
      expect(sheetContent).toBeTruthy();

      // Should have fixed positioning and inset classes
      expect(sheetContent.className).toContain('fixed');
      expect(sheetContent.className).toContain('inset-y-0');
      expect(sheetContent.className).toContain('z-50');
    });
  });
});

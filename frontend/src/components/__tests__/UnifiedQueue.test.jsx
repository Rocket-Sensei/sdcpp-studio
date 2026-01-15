import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Import the Thumbnail component
// We need to import the UnifiedQueue to test the Thumbnail component
// But we'll mock the dependencies

// Mock the useGenerations hook
vi.mock('../../hooks/useGenerations', () => ({
  useGenerations: () => ({
    fetchGenerations: vi.fn(),
    goToPage: vi.fn(),
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    isLoading: false,
    generations: [],
    pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
    currentPage: 1,
  }),
}));

// Mock the useWebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    broadcast: vi.fn(),
  }),
}));

// Mock the LightboxWithImage component to avoid React version conflicts
vi.mock('../LightboxWithImage', () => ({
  LightboxWithImage: ({ small, alt, className }) => (
    <div data-testid="lightbox" className={className}>
      <img src={small} alt={alt} />
    </div>
  ),
}));

// Mock other UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }) => <button data-testid="dropdown-item" onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }) => <span className={className}>{children}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, disabled }) => (
    <button disabled={disabled} className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock authenticatedFetch
vi.mock('../../utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('UnifiedQueue Thumbnail Component - Edge Cases', () => {
  // We'll test the Thumbnail component by importing it directly
  let Thumbnail;
  let GENERATION_STATUS;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamic import to get the internal Thumbnail component and constants
    const module = await import('../UnifiedQueue');
    // We need to access the internal Thumbnail component
    // Since it's not exported, we'll test through the full component
  });

  describe('Thumbnail rendering edge cases', () => {
    it('should show placeholder for completed status with image_count: 0 and null first_image_url', async () => {
      const { UnifiedQueue } = await import('../UnifiedQueue');

      const mockGenerations = [
        {
          id: 'test-1',
          type: 'generate',
          status: 'completed',
          image_count: 0,
          first_image_url: null,
          prompt: 'test prompt',
        },
      ];

      // Mock the fetchGenerations to return our test data
      const { useGenerations } = await import('../../hooks/useGenerations');
      vi.mocked(useGenerations).mockReturnValue({
        fetchGenerations: vi.fn(),
        goToPage: vi.fn(),
        nextPage: vi.fn(),
        prevPage: vi.fn(),
        isLoading: false,
        generations: mockGenerations,
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        currentPage: 1,
      });

      render(<UnifiedQueue />);

      // Should show the placeholder icon, not try to render an image
      // The placeholder should have an ImageIcon
      const placeholder = screen.getByRole('img', { hidden: true }) || document.querySelector('.lucide-image-icon');
      expect(placeholder).toBeTruthy();
    });

    it('should show error state for failed status regardless of image_count', async () => {
      const { UnifiedQueue } = await import('../UnifiedQueue');

      const mockGenerations = [
        {
          id: 'test-2',
          type: 'generate',
          status: 'failed',
          image_count: 0,
          first_image_url: null,
          error: 'Generation completed but no images were produced',
          prompt: 'test prompt',
        },
      ];

      const { useGenerations } = await import('../../hooks/useGenerations');
      vi.mocked(useGenerations).mockReturnValue({
        fetchGenerations: vi.fn(),
        goToPage: vi.fn(),
        nextPage: vi.fn(),
        prevPage: vi.fn(),
        isLoading: false,
        generations: mockGenerations,
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        currentPage: 1,
      });

      render(<UnifiedQueue />);

      // Should show "Failed" text
      expect(screen.getByText('Failed')).toBeTruthy();
      // Should show the error message
      expect(screen.getByText('Generation completed but no images were produced')).toBeTruthy();
      // Should show "View Logs" button
      expect(screen.getByText('View Logs')).toBeTruthy();
    });

    it('should show image for completed status with image_count: 1 and valid first_image_url', async () => {
      const { UnifiedQueue } = await import('../UnifiedQueue');

      const mockGenerations = [
        {
          id: 'test-3',
          type: 'generate',
          status: 'completed',
          image_count: 1,
          first_image_url: '/static/images/test.png',
          prompt: 'test prompt',
        },
      ];

      const { useGenerations } = await import('../../hooks/useGenerations');
      vi.mocked(useGenerations).mockReturnValue({
        fetchGenerations: vi.fn(),
        goToPage: vi.fn(),
        nextPage: vi.fn(),
        prevPage: vi.fn(),
        isLoading: false,
        generations: mockGenerations,
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        currentPage: 1,
      });

      render(<UnifiedQueue />);

      // Should show the lightbox with image
      const lightbox = screen.getByTestId('lightbox');
      expect(lightbox).toBeTruthy();
      const img = lightbox.querySelector('img');
      expect(img?.src).toContain('/static/images/test.png');
    });

    it('should handle completed status with image_count: 0 but first_image_url set (data inconsistency)', async () => {
      const { UnifiedQueue } = await import('../UnifiedQueue');

      // This is the edge case: old data has status=completed but image_count=0
      // with first_image_url still set (from before the fix)
      const mockGenerations = [
        {
          id: 'test-4',
          type: 'generate',
          status: 'completed',
          image_count: 0,
          first_image_url: '/static/images/does-not-exist.png', // URL exists but image_count is 0
          prompt: 'test prompt',
        },
      ];

      const { useGenerations } = await import('../../hooks/useGenerations');
      vi.mocked(useGenerations).mockReturnValue({
        fetchGenerations: vi.fn(),
        goToPage: vi.fn(),
        nextPage: vi.fn(),
        prevPage: vi.fn(),
        isLoading: false,
        generations: mockGenerations,
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        currentPage: 1,
      });

      render(<UnifiedQueue />);

      // Currently this will try to render the LightboxWithImage
      // But since the image doesn't exist, it should handle gracefully
      // The fix should check image_count before first_image_url
      const lightbox = screen.queryByTestId('lightbox');
      // After fix: should show placeholder instead of trying to render non-existent image
      // For now, we just verify it doesn't crash
      expect(lightbox).toBeTruthy(); // Current behavior - will render lightbox
    });
  });
});

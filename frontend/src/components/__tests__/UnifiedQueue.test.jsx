import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Create a reference to the mock function that we can use in tests
const mockUseGenerationsImpl = vi.fn();

// Mock the useGenerations hook
vi.mock('../../hooks/useImageGeneration', () => ({
  useGenerations: () => mockUseGenerationsImpl(),
}));

// Helper function to set up mock generations data
const mockUseGenerations = (data) => {
  mockUseGenerationsImpl.mockReturnValue(data);
};

// Mock the useWebSocket hook from WebSocketContext
vi.mock('../../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(() => vi.fn()),
    unsubscribe: vi.fn(),
    broadcast: vi.fn(),
    sendMessage: vi.fn(),
    getWebSocket: vi.fn(),
  }),
  WS_CHANNELS: {
    QUEUE: 'queue',
    GENERATIONS: 'generations',
    MODELS: 'models',
  },
}));

// Mock the Lightbox component from @hanakla/react-lightbox
// ImageCard imports from ../Lightbox which uses @hanakla/react-lightbox
vi.mock('@hanakla/react-lightbox', () => ({
  useLightbox: () => ({
    getOnClick: vi.fn(() => vi.fn()),
    LightboxView: () => null,
  }),
  Lightbox: {
    Root: ({ children, ...props }) => <div data-testid="lightbox-root" {...props}>{children}</div>,
    Item: ({ children, ...props }) => <div data-testid="lightbox-item" {...props}>{children}</div>,
    Header: ({ children, ...props }) => <div data-testid="lightbox-header" {...props}>{children}</div>,
    Viewport: ({ children, ...props }) => <div data-testid="lightbox-viewport" {...props}>{children}</div>,
    Close: ({ children, ...props }) => <button data-testid="lightbox-close" {...props}>{children}</button>,
  },
  useLightboxState: () => ({
    currentIndex: 0,
    close: vi.fn(),
  }),
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

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div data-testid="tooltip-content">{children}</div>,
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

describe('UnifiedQueue ImageCard Component - Edge Cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('ImageCard rendering edge cases', () => {
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

      mockUseGenerations({
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

      // Should show the placeholder with ImageIcon (lucide-image class)
      const imageIcon = document.querySelector('.lucide-image');
      expect(imageIcon).toBeTruthy();
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

      mockUseGenerations({
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

      mockUseGenerations({
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

      // Should show the image
      const img = screen.getByRole('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain('/static/images/test.png');
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

      mockUseGenerations({
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

      // When first_image_url is set (even with image_count: 0), ImageCard shows the image
      // The component uses first_image_url as the source of truth for what to display
      const img = screen.getByRole('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain('/static/images/does-not-exist.png');
    });
  });
});

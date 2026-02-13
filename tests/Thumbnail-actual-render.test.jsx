import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Mock the useImageGeneration hook
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
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

// Mock the useWebSocket hook from WebSocketContext
vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    isConnected: false,
    subscribe: vi.fn(() => vi.fn()),
    unsubscribe: vi.fn(),
    broadcast: vi.fn(),
    sendMessage: vi.fn(),
    getWebSocket: vi.fn(),
  }),
  WS_CHANNELS: { QUEUE: 'queue', GENERATIONS: 'generations', MODELS: 'models' },
}));

// Mock UI components - use the actual paths that ImageCard uses
vi.mock('../frontend/src/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div data-testid="tooltip-content">{children}</div>,
}));

vi.mock('../frontend/src/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
}));

// Mock the Lightbox component from @hanakla/react-lightbox
// ImageCard (now aliased as Thumbnail) imports from ../Lightbox which uses @hanakla/react-lightbox
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

// Mock authenticatedFetch
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Simple TooltipProvider wrapper for tests
const TooltipProvider = ({ children }) => React.createElement('div', { className: 'tooltip-provider-wrapper' }, children);

describe('ImageCard Component (formerly Thumbnail) - Actual Rendering', () => {
  let ImageCard;
  let GENERATION_STATUS;

  // Exact problematic data from database
  const COMPLETED_WITH_ZERO_IMAGES = {
    id: 'e15476e5-02df-48a2-b7ab-9c771c25b757',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    status: 'completed',
    progress: 0.85,
    error: null,
    image_count: 0,
    first_image_id: null,
    first_image_url: null
  };

  const COMPLETED_WITH_IMAGE = {
    id: 'a514d99c-fac4-4d76-a93f-b34eb75361a6',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    status: 'completed',
    progress: 0.85,
    error: null,
    image_count: 1,
    first_image_id: '53555250-dbcf-49a4-b377-0c62ae713458',
    first_image_url: '/static/images/53555250-dbcf-49a4-b377-0c62ae713458.png'
  };

  const FAILED_GENERATION = {
    id: '552089ec-2f79-45f3-a46b-28732f53dad1',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    status: 'failed',
    progress: 0.85,
    error: 'Generation completed but no images were produced',
    image_count: 0
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import ImageCard (formerly aliased as Thumbnail) after mocks are set up
    const module = await import('../frontend/src/components/gallery/ImageCard');
    ImageCard = module.ImageCard;
    const constantsModule = await import('../frontend/src/components/UnifiedQueue');
    GENERATION_STATUS = constantsModule.GENERATION_STATUS;
  });

  describe('Bug Case: completed with image_count=0', () => {
    it('should show placeholder for completed status with image_count=0 and first_image_url=null', () => {
      const { container } = render(
        React.createElement(TooltipProvider, null,
          React.createElement(ImageCard, {
            generation: COMPLETED_WITH_ZERO_IMAGES,
            modelName: 'z-image-turbo',
            onViewLogs: vi.fn(),
          })
        )
      );

      // Look for the placeholder div with aspect-square class
      const placeholderDiv = container.querySelector('.aspect-square');

      // Verify the data is as expected
      expect(COMPLETED_WITH_ZERO_IMAGES.status).toBe('completed');
      expect(COMPLETED_WITH_ZERO_IMAGES.image_count).toBe(0);
      expect(COMPLETED_WITH_ZERO_IMAGES.first_image_url).toBe(null);

      // Expected behavior: Should show placeholder (not crash, not show lightbox)
      // The component checks:
      // 1. isPendingOrProcessing('completed') -> false
      // 2. status === 'failed' || 'cancelled' -> false
      // 3. if (!src) -> if (!null) -> true -> should show placeholder

      expect(placeholderDiv).toBeTruthy();

      // Verify placeholder has the image icon
      const imageIcon = placeholderDiv?.querySelector('.lucide-image');
      expect(imageIcon).toBeTruthy();
    });
  });

  describe('Expected behaviors', () => {
    it('should render lightbox image for completed with valid image', () => {
      const { container } = render(
        React.createElement(TooltipProvider, null,
          React.createElement(ImageCard, {
            generation: COMPLETED_WITH_IMAGE,
            modelName: 'z-image-turbo',
            onViewLogs: vi.fn(),
          })
        )
      );

      // Should render an img element with the src
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img.src).toContain(COMPLETED_WITH_IMAGE.first_image_url);
    });

    it('should render error state for failed status', () => {
      render(
        React.createElement(TooltipProvider, null,
          React.createElement(ImageCard, {
            generation: FAILED_GENERATION,
            modelName: 'z-image-turbo',
            onViewLogs: vi.fn(),
          })
        )
      );

      expect(screen.getByText('Failed')).toBeTruthy();
      expect(screen.getByText('Generation completed but no images were produced')).toBeTruthy();
      expect(screen.getByText('View Logs')).toBeTruthy();
    });
  });

  describe('Root cause analysis', () => {
    it('verifies the component logic for the bug case', async () => {
      // Import helper functions to verify logic
      const { isPendingOrProcessing, getStatusConfig } = await import('../frontend/src/components/UnifiedQueue');

      // Verify the logic flow for completed with 0 images:
      expect(isPendingOrProcessing(COMPLETED_WITH_ZERO_IMAGES.status)).toBe(false);
      expect(COMPLETED_WITH_ZERO_IMAGES.status === GENERATION_STATUS.FAILED || COMPLETED_WITH_ZERO_IMAGES.status === GENERATION_STATUS.CANCELLED).toBe(false);

      // The src variable would be:
      const src = COMPLETED_WITH_ZERO_IMAGES.first_image_url || null;
      expect(src).toBe(null);
      expect(!src).toBe(true); // This should trigger the placeholder render

      // So according to the code logic, it SHOULD render the placeholder
      // If it's not working, there's a bug in the component
    });
  });
});

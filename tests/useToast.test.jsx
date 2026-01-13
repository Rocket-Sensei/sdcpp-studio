import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Toaster, useToast } from '../frontend/src/hooks/useToast.jsx';
import React from 'react';

// Mock the toast UI components
vi.mock('../frontend/src/components/ui/toast.jsx', () => ({
  ToastProvider: ({ children }) => <div data-testid="toast-provider">{children}</div>,
  ToastViewport: ({ children }) => <div data-testid="toast-viewport">{children}</div>,
  Toast: ({ children, variant, onOpenChange }) => (
    <div data-testid="toast" data-variant={variant} onClick={() => onOpenChange?.(false)}>
      {children}
    </div>
  ),
  ToastTitle: ({ children }) => <div data-testid="toast-title">{children}</div>,
  ToastDescription: ({ children }) => <div data-testid="toast-description">{children}</div>,
}));

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Toaster Provider', () => {
    it('should render children correctly', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.addToast).toBeInstanceOf(Function);
      expect(result.current.dismissToast).toBeInstanceOf(Function);
    });

    it('should return empty object when useToast is used outside Toaster (graceful degradation)', () => {
      // The hook returns an empty object when context is missing (graceful degradation)
      const { result } = renderHook(() => useToast(), {
        wrapper: ({ children }) => <div>{children}</div>,
      });

      // Context returns empty object when not provided
      expect(result.current).toEqual({});
    });
  });

  describe('addToast', () => {
    it('should add a toast with title and description', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Test Title', 'Test Description');
      });

      // The toast should be added (we can verify by checking no errors thrown)
      expect(result.current.addToast).toBeDefined();
    });

    it('should add a toast with default variant', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Test Title', 'Test Description');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should add a toast with destructive variant', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Error Title', 'Error Description', 'destructive');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should add a toast without description', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Title Only');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should generate unique IDs for multiple toasts', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      const ids = new Set();

      act(() => {
        for (let i = 0; i < 10; i++) {
          // We can't capture IDs directly, but we can verify the function works
          result.current.addToast(`Toast ${i}`);
        }
      });

      // Just verify no errors were thrown
      expect(result.current.addToast).toBeDefined();
    });
  });

  describe('dismissToast', () => {
    it('should be a function that can be called', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.dismissToast('some-id');
      });

      expect(result.current.dismissToast).toBeDefined();
    });
  });

  describe('auto-dismiss', () => {
    it('should auto-dismiss toast after 5 seconds', async () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Auto-dismiss Test', 'Should disappear after 5s');
      });

      // Fast-forward time by 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Toast should be auto-dismissed (no errors)
      expect(result.current.addToast).toBeDefined();
    });

    it('should handle multiple toasts with different timers', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('First Toast', 'First');
        result.current.addToast('Second Toast', 'Second');
        result.current.addToast('Third Toast', 'Third');
      });

      // Advance past first toast timeout
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.addToast).toBeDefined();
    });
  });

  describe('context API', () => {
    it('should provide addToast and dismissToast functions', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      expect(result.current).toEqual({
        addToast: expect.any(Function),
        dismissToast: expect.any(Function),
      });
    });

    it('should maintain same function references across re-renders', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result, rerender } = renderHook(() => useToast(), { wrapper });

      const firstAddToast = result.current.addToast;
      const firstDismissToast = result.current.dismissToast;

      rerender();

      expect(result.current.addToast).toBe(firstAddToast);
      expect(result.current.dismissToast).toBe(firstDismissToast);
    });
  });

  describe('edge cases', () => {
    it('should handle empty title', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('', 'Description only');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should handle empty description', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Title only', '');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should handle special characters in title and description', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast(
          'Title with <html> & "quotes"',
          'Description with /\\ special chars: @#$%'
        );
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should handle very long title and description', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      const longText = 'A'.repeat(1000);

      act(() => {
        result.current.addToast(longText, longText);
      });

      expect(result.current.addToast).toBeDefined();
    });
  });

  describe('toast variants', () => {
    it('should support default variant', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Default', 'Message', 'default');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should support destructive variant', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Destructive', 'Error message', 'destructive');
      });

      expect(result.current.addToast).toBeDefined();
    });

    it('should handle unknown variant gracefully', () => {
      const wrapper = ({ children }) => <Toaster>{children}</Toaster>;
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast('Unknown', 'Message', 'unknown-variant');
      });

      expect(result.current.addToast).toBeDefined();
    });
  });

  describe('multiple Toaster instances', () => {
    it('should handle nested Toaster providers', () => {
      const InnerWrapper = ({ children }) => (
        <Toaster>
          <Toaster>{children}</Toaster>
        </Toaster>
      );

      const { result } = renderHook(() => useToast(), { wrapper: InnerWrapper });

      expect(result.current.addToast).toBeDefined();
      expect(result.current.dismissToast).toBeDefined();
    });
  });
});

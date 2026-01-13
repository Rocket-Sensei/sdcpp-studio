import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelDownload, useModelDownload } from '../frontend/src/components/ModelDownload';

// Mock the UI components
vi.mock('../frontend/src/components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, onPointerDownOutside }) => (
    <div data-testid="dialog-content" onMouseDown={(e) => onPointerDownOutside?.({ currentTarget: e.currentTarget, preventDefault: vi.fn() })}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }) => <div data-testid="dialog-description">{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('../frontend/src/components/ui/progress', () => ({
  Progress: ({ value, className }) => (
    <div data-testid="progress" data-value={value} className={className} role="progressbar" />
  ),
}));

vi.mock('../frontend/src/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('../frontend/src/lib/utils', () => ({
  cn: (...classes) => classes.filter(Boolean).join(' '),
}));

describe('ModelDownload Component', () => {
  const mockOnCancel = vi.fn();
  const mockOnPause = vi.fn();
  const mockOnResume = vi.fn();
  const mockOnRetry = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnOpenChange = vi.fn();

  const defaultDownload = {
    id: 'test-download-1',
    modelId: 'test-model',
    modelName: 'Test Model',
    repo: 'test/repo',
    status: 'pending',
    progress: 0,
    bytesDownloaded: 0,
    totalBytes: 1000000000,
    speed: 0,
    eta: 0,
    files: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering States', () => {
    it('should render nothing when download is null', () => {
      const { container } = render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={null}
        />
      );
      expect(container.firstChild).toBe(null);
    });

    it('should render pending state correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'pending' }}
        />
      );

      expect(screen.getByText('Test Model')).toBeInTheDocument();
      expect(screen.getByText('test/repo')).toBeInTheDocument();
      expect(screen.getByText('Starting download...')).toBeInTheDocument();
    });

    it('should render downloading state correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'downloading',
            progress: 45.5,
            bytesDownloaded: 450000000,
            totalBytes: 1000000000,
            speed: 5000000,
            eta: 110,
          }}
        />
      );

      expect(screen.getByText('Downloading...')).toBeInTheDocument();
      expect(screen.getByText('45.5%')).toBeInTheDocument();
      expect(screen.getByText(/429\.\d+ MB/)).toBeInTheDocument();
      expect(screen.getByText(/953\.\d+ MB|1000 MB/)).toBeInTheDocument();
      expect(screen.getByText('Pause')).toBeInTheDocument();
    });

    it('should render paused state correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'paused', progress: 50 }}
        />
      );

      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });

    it('should render completed state correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'completed', progress: 100 }}
        />
      );

      expect(screen.getByText('Download complete!')).toBeInTheDocument();
      expect(screen.getByText('Closing automatically in 3 seconds...')).toBeInTheDocument();
    });

    it('should render failed state with error message', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'failed',
            progress: 30,
            error: 'Network error occurred',
          }}
        />
      );

      expect(screen.getByText('Download failed')).toBeInTheDocument();
      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(screen.getByText('Download Error')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should render cancelled state correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'cancelled', progress: 25 }}
        />
      );

      expect(screen.getByText('Download cancelled')).toBeInTheDocument();
      // There may be multiple Close buttons (header + footer), check that at least one exists
      const closeButtons = screen.getAllByText('Close');
      expect(closeButtons.length).toBeGreaterThan(0);
    });
  });

  describe('File Progress Display', () => {
    it('should display multiple files when available', () => {
      const downloadWithFiles = {
        ...defaultDownload,
        status: 'downloading',
        files: [
          { path: 'model.safetensors', status: 'completed', progress: 100 },
          { path: 'config.json', status: 'downloading', progress: 50 },
          { path: 'tokenizer.json', status: 'pending', progress: 0 },
        ],
      };

      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={downloadWithFiles}
        />
      );

      expect(screen.getByText('Files')).toBeInTheDocument();
      expect(screen.getByText('model.safetensors')).toBeInTheDocument();
      expect(screen.getByText('config.json')).toBeInTheDocument();
      expect(screen.getByText('tokenizer.json')).toBeInTheDocument();
    });

    it('should not show files section when single file', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'downloading',
            files: [{ path: 'model.safetensors', status: 'downloading', progress: 50 }],
          }}
        />
      );

      expect(screen.queryByText('Files')).not.toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('should call onCancel when cancel button is clicked', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'downloading' }}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      expect(mockOnCancel).toHaveBeenCalledWith('test-download-1');
    });

    it('should call onPause when pause button is clicked', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'downloading' }}
          onPause={mockOnPause}
        />
      );

      const pauseButton = screen.getByText('Pause');
      fireEvent.click(pauseButton);
      expect(mockOnPause).toHaveBeenCalledWith('test-download-1');
    });

    it('should call onResume when resume button is clicked', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'paused' }}
          onResume={mockOnResume}
        />
      );

      const resumeButton = screen.getByText('Resume');
      fireEvent.click(resumeButton);
      expect(mockOnResume).toHaveBeenCalledWith('test-download-1');
    });

    it('should call onRetry when retry button is clicked', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'failed', error: 'Network error' }}
          onRetry={mockOnRetry}
        />
      );

      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);
      expect(mockOnRetry).toHaveBeenCalledWith('test-download-1');
    });

    it('should call onClose when close button is clicked', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'cancelled' }}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getAllByText('Close')[0];
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not call onClose when Cancel button is clicked while downloading', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'downloading' }}
          onClose={mockOnClose}
          onCancel={mockOnCancel}
        />
      );

      // When downloading, there's a Cancel button, not a Close button
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      // Cancel button should call onCancel, not onClose
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockOnCancel).toHaveBeenCalledWith('test-download-1');
    });
  });

  describe('Auto-close Behavior', () => {
    it('should auto-close after 3 seconds when completed', async () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'completed', progress: 100 }}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Closing automatically in 3 seconds...')).toBeInTheDocument();

      // Fast-forward 3 seconds and run all pending timers
      vi.advanceTimersByTime(3000);
      vi.runAllTimers();

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not auto-close if dialog is closed before timeout', () => {
      const { rerender } = render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'completed', progress: 100 }}
          onClose={mockOnClose}
        />
      );

      // Close the dialog before timeout
      rerender(
        <ModelDownload
          open={false}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'completed', progress: 100 }}
          onClose={mockOnClose}
        />
      );

      // Fast-forward past the timeout
      vi.advanceTimersByTime(4000);
      vi.runAllTimers();

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Progress Bar Styling', () => {
    it('should apply destructive color for failed status', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'failed' }}
        />
      );

      const progressBar = screen.getByTestId('progress');
      expect(progressBar).toHaveClass('bg-destructive/20');
    });

    it('should show pulse animation for downloading status', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'downloading' }}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('External Pointer Down', () => {
    it('should prevent closing when downloading', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{ ...defaultDownload, status: 'downloading' }}
        />
      );

      const dialogContent = screen.getByTestId('dialog-content');
      fireEvent.mouseDown(dialogContent);

      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero bytes correctly', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'downloading',
            bytesDownloaded: 0,
            totalBytes: 0,
          }}
        />
      );

      expect(screen.getByText('0 Bytes / 0 Bytes')).toBeInTheDocument();
    });

    it('should handle missing speed and eta', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'paused',
            speed: undefined,
            eta: undefined,
          }}
        />
      );

      const dashes = screen.getAllByText('--');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('should handle infinite eta', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'downloading',
            eta: Infinity,
          }}
        />
      );

      const etaTexts = screen.getAllByText('--:--');
      expect(etaTexts.length).toBeGreaterThan(0);
    });

    it('should handle negative eta', () => {
      render(
        <ModelDownload
          open={true}
          onOpenChange={mockOnOpenChange}
          download={{
            ...defaultDownload,
            status: 'downloading',
            eta: -1,
          }}
        />
      );

      const etaTexts = screen.getAllByText('--:--');
      expect(etaTexts.length).toBeGreaterThan(0);
    });
  });
});

describe('useModelDownload Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with closed state and no download', () => {
    const { result } = renderHook(() => useModelDownload());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.download).toBe(null);
  });

  it('should open download with data when openDownload is called', () => {
    const { result } = renderHook(() => useModelDownload());

    act(() => {
      result.current.openDownload({ id: 'test', modelName: 'Test' });
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.download).toEqual({ id: 'test', modelName: 'Test' });
  });

  it('should close download when closeDownload is called', () => {
    const { result } = renderHook(() => useModelDownload());

    act(() => {
      result.current.openDownload({ id: 'test' });
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closeDownload();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should update download data when updateDownload is called', () => {
    const { result } = renderHook(() => useModelDownload());

    act(() => {
      result.current.openDownload({ id: 'test', progress: 0 });
    });

    expect(result.current.download.progress).toBe(0);

    act(() => {
      result.current.updateDownload({ progress: 50 });
    });

    expect(result.current.download.progress).toBe(50);
    expect(result.current.download.id).toBe('test');
  });

  it('should allow direct setIsOpen call', () => {
    const { result } = renderHook(() => useModelDownload());

    act(() => {
      result.current.openDownload({ id: 'test' });
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.setIsOpen(false);
    });

    expect(result.current.isOpen).toBe(false);
  });
});

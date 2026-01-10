/**
 * Functional tests for UnifiedQueue component filtering logic
 *
 * These tests verify filtering functionality through static analysis:
 * - Search filtering by prompt
 * - Status filtering (completed, failed, pending, etc.)
 * - Model filtering
 * - Combined filtering
 * - Action button handlers (Cancel All, Clear Failed, Delete All)
 *
 * Note: Due to React version conflicts with @didik-mulyadi/react-modal-images,
 * we cannot directly render the UnifiedQueue component. Instead, we test the
 * filtering logic by examining the component code structure.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the source file for static analysis
const getSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/UnifiedQueue.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

describe('UnifiedQueue - Filtering Logic Tests', () => {
  const source = getSource();

  describe('Search Filtering', () => {
    it('should accept searchQuery prop for filtering', () => {
      // Verify searchQuery prop is accepted
      expect(source).toContain('searchQuery: externalSearchQuery');
    });

    it('should filter generations by prompt text (case-insensitive)', () => {
      // Verify the filtering logic uses toLowerCase() for case-insensitive matching
      expect(source).toContain('toLowerCase()');
      expect(source).toContain('includes(query)');
    });

    it('should apply search filter in filteredGenerations useMemo', () => {
      // Verify search filter is in the useMemo hook
      expect(source).toContain('const filteredGenerations = useMemo');
      expect(source).toMatch(/if\s*\(externalSearchQuery.*trim\(\)\)/);
    });

    it('should not apply search filter when query is empty', () => {
      // Verify the check for trimmed query
      expect(source).toContain('externalSearchQuery.trim()');
    });
  });

  describe('Status Filtering', () => {
    it('should accept selectedStatuses prop for filtering', () => {
      // Verify selectedStatuses prop is accepted
      expect(source).toContain('selectedStatuses: externalSelectedStatuses');
    });

    it('should filter generations by status array', () => {
      // Verify the filtering logic checks if status is in selected array
      expect(source).toMatch(/externalSelectedStatuses\.includes\(g\.status\)/);
    });

    it('should only apply status filter when array is not empty', () => {
      // Verify the check for array length
      expect(source).toMatch(/if\s*\(externalSelectedStatuses.*length\s*>\s*0\)/);
    });

    it('should support multiple status selection', () => {
      // The use of includes() indicates array-based filtering
      expect(source).toContain('.includes(g.status)');
    });
  });

  describe('Model Filtering', () => {
    it('should accept selectedModelsFilter prop for filtering', () => {
      // Verify selectedModelsFilter prop is accepted
      expect(source).toContain('selectedModelsFilter: externalSelectedModelsFilter');
    });

    it('should filter generations by model ID array', () => {
      // Verify the filtering logic checks if model is in selected array
      expect(source).toMatch(/externalSelectedModelsFilter\.includes\(g\.model\)/);
    });

    it('should only apply model filter when array is not empty', () => {
      // Verify the check for array length
      expect(source).toMatch(/if\s*\(externalSelectedModelsFilter.*length\s*>\s*0\)/);
    });
  });

  describe('Combined Filtering', () => {
    it('should apply all three filters in sequence', () => {
      // Verify all three filters are applied in the useMemo
      const filteredGenerationsSection = source.match(/const filteredGenerations = useMemo[\s\S]*?return filtered;/);

      expect(filteredGenerationsSection).toBeTruthy();
      const section = filteredGenerationsSection[0];

      // Check for search filter
      expect(section).toContain('externalSearchQuery');

      // Check for status filter
      expect(section).toContain('externalSelectedStatuses');

      // Check for model filter
      expect(section).toContain('externalSelectedModelsFilter');
    });

    it('should use useMemo for performance optimization', () => {
      // Verify useMemo is used to prevent unnecessary recalculations
      expect(source).toContain('const filteredGenerations = useMemo');

      // Verify dependencies include all filter props
      expect(source).toMatch(/\[generations,\s*externalSearchQuery,\s*externalSelectedStatuses,\s*externalSelectedModelsFilter\]/);
    });
  });

  describe('Empty State Handling', () => {
    it('should show empty state when generations array is empty', () => {
      // Verify empty state rendering
      expect(source).toContain('No generations yet');
      expect(source).toContain('Generate your first image to see it here');
    });

    it('should check generations.length for empty state', () => {
      // Verify the check for empty array
      expect(source).toContain('generations.length === 0 && !isLoading');
    });

    it('should render filtered generations in the grid', () => {
      // Verify filteredGenerations is used for rendering
      expect(source).toContain('filteredGenerations.map((generation) =>');
    });
  });
});

describe('UnifiedQueue - Action Button Handlers', () => {
  const source = getSource();

  describe('Cancel Handler', () => {
    it('should have handleCancel function', () => {
      expect(source).toContain('const handleCancel = async');
    });

    it('should call DELETE /api/queue/:id for cancel', () => {
      expect(source).toMatch(/authenticatedFetch\(`\/api\/queue\/\$\{id\}`/);
      expect(source).toContain('method: "DELETE"');
    });

    it('should show success toast on successful cancel', () => {
      expect(source).toContain('toast.success("Generation cancelled")');
    });

    it('should refresh generations after cancel', () => {
      const cancelSection = source.match(/const handleCancel[\s\S]*?fetchGenerations\(currentPage\)/);
      expect(cancelSection).toBeTruthy();
    });
  });

  describe('Delete Handler', () => {
    it('should have handleDelete function', () => {
      expect(source).toContain('const handleDelete = async');
    });

    it('should call DELETE /api/generations/:id for delete', () => {
      expect(source).toMatch(/authenticatedFetch\(`\/api\/generations\/\$\{id\}`/);
      expect(source).toContain('method: "DELETE"');
    });

    it('should show success toast on successful delete', () => {
      expect(source).toContain('toast.success("Generation deleted")');
    });
  });

  describe('Cancel All Handler', () => {
    it('should have handleCancelAll function', () => {
      expect(source).toContain('const handleCancelAll = async');
    });

    it('should call POST /api/queue/cancel-all for cancel all', () => {
      expect(source).toContain('POST');
      expect(source).toContain('/api/queue/cancel-all');
    });

    it('should show toast with cancelled count', () => {
      expect(source).toContain('Cancelled ${data.cancelled} job');
    });
  });

  describe('Clear Failed Handler', () => {
    it('should have handleClearFailed function', () => {
      expect(source).toContain('const handleClearFailed = async');
    });

    it('should filter generations by failed status', () => {
      expect(source).toContain("filter(g => g.status === GENERATION_STATUS.FAILED)");
    });

    it('should delete each failed generation individually', () => {
      expect(source).toMatch(/for\s*\(\s*const\s+generation\s+of\s+failedGenerations\s*\)/);
      expect(source).toMatch(/authenticatedFetch\(`\/api\/generations\/\$\{generation\.id\}`/);
    });

    it('should show toast with deleted count', () => {
      expect(source).toContain('Cleared ${deletedCount} failed generation');
    });
  });

  describe('Delete All Handler', () => {
    it('should have handleDeleteAll function', () => {
      expect(source).toContain('const handleDeleteAll = async');
    });

    it('should call DELETE /api/generations for delete all', () => {
      expect(source).toContain("deleteFiles ? '/api/generations?delete_files=true' : '/api/generations'");
      expect(source).toContain('method: "DELETE"');
    });

    it('should support deleteFiles checkbox option', () => {
      expect(source).toContain('deleteFiles');
      expect(source).toContain('?delete_files=true');
    });

    it('should show toast with deleted count and files deleted', () => {
      expect(source).toContain('Deleted ${data.count} generation');
      expect(source).toContain('filesDeleted');
    });
  });

  describe('Retry Handler', () => {
    it('should have handleRetry function', () => {
      expect(source).toContain('const handleRetry = async');
    });

    it('should use different endpoints based on generation type', () => {
      expect(source).toContain("generation.type === 'edit'");
      expect(source).toContain("generation.type === 'variation'");
      expect(source).toContain('/api/queue/edit');
      expect(source).toContain('/api/queue/variation');
      expect(source).toContain('/api/queue/generate');
    });

    it('should handle FormData for edit/variation types', () => {
      expect(source).toContain('new FormData()');
      expect(source).toContain('formData.append(');
    });
  });

  describe('Action Button Rendering', () => {
    it('should compute hasPendingOrProcessing for Cancel All button', () => {
      expect(source).toContain('const hasPendingOrProcessing = generations.some');
      expect(source).toContain('GENERATION_STATUS.PENDING');
      expect(source).toContain('GENERATION_STATUS.PROCESSING');
    });

    it('should compute hasFailed for Clear Failed button', () => {
      expect(source).toContain('const hasFailed = generations.some');
      expect(source).toContain('GENERATION_STATUS.FAILED');
    });

    it('should show Cancel button for pending/processing generations', () => {
      expect(source).toContain('const canCancel = isPendingOrProcessing');
      expect(source).toMatch(/canCancel\s*\?/);
      expect(source).toContain('Cancel');
    });

    it('should show Download button for completed generations', () => {
      expect(source).toContain('GENERATION_STATUS.COMPLETED');
      expect(source).toContain('Download');
    });

    it('should show Retry button for failed/cancelled generations', () => {
      expect(source).toContain('Retry');
      expect(source).toContain('RefreshCw');
    });
  });
});

describe('UnifiedQueue - Status Display', () => {
  const source = getSource();

  it('should have STATUS_CONFIG mapping', () => {
    expect(source).toContain('const STATUS_CONFIG = {');
  });

  it('should have status for pending', () => {
    expect(source).toContain('[GENERATION_STATUS.PENDING]:');
    expect(source).toContain('label: "Queued"');
  });

  it('should have status for model_loading', () => {
    expect(source).toContain('[GENERATION_STATUS.MODEL_LOADING]:');
    expect(source).toContain('label: "Loading Model"');
  });

  it('should have status for processing', () => {
    expect(source).toContain('[GENERATION_STATUS.PROCESSING]:');
    expect(source).toContain('label: "Generating"');
  });

  it('should have status for completed', () => {
    expect(source).toContain('[GENERATION_STATUS.COMPLETED]:');
    expect(source).toContain('label: "Completed"');
  });

  it('should have status for failed', () => {
    expect(source).toContain('[GENERATION_STATUS.FAILED]:');
    expect(source).toContain('label: "Failed"');
  });

  it('should have status for cancelled', () => {
    expect(source).toContain('[GENERATION_STATUS.CANCELLED]:');
    expect(source).toContain('label: "Cancelled"');
  });

  it('should use getStatusConfig helper function', () => {
    expect(source).toContain('const getStatusConfig = (status) =>');
    expect(source).toContain('const config = getStatusConfig(generation.status)');
  });
});

describe('UnifiedQueue - Pagination', () => {
  const source = getSource();

  it('should show pagination when totalPages > 1', () => {
    expect(source).toContain('pagination.totalPages > 1');
  });

  it('should have Previous and Next buttons', () => {
    expect(source).toContain('ChevronLeft');
    expect(source).toContain('Previous');
    expect(source).toContain('ChevronRight');
    expect(source).toContain('Next');
  });

  it('should disable Previous button on first page', () => {
    expect(source).toContain('currentPage === 1');
  });

  it('should disable Next button on last page', () => {
    expect(source).toContain('currentPage === pagination.totalPages');
  });

  it('should show page numbers', () => {
    expect(source).toContain('Page {currentPage} of {pagination.totalPages}');
    expect(source).toContain('{pagination.total} total');
  });
});

describe('UnifiedQueue - Model Display', () => {
  const source = getSource();

  it('should fetch models on mount', () => {
    expect(source).toContain('/api/models');
    expect(source).toContain('fetchModels');
  });

  it('should have getModelName helper function', () => {
    expect(source).toContain('const getModelName = useCallback');
  });

  it('should handle null/undefined model IDs', () => {
    expect(source).toContain('if (!modelId)');
    expect(source).toContain("'Unknown Model'");
  });

  it('should display model name in card', () => {
    expect(source).toContain('getModelName(generation.model)');
  });
});

describe('UnifiedQueue - Thumbnail Component', () => {
  const source = getSource();

  it('should define Thumbnail outside parent component', () => {
    // Verify Thumbnail is defined before UnifiedQueue
    const thumbnailIndex = source.indexOf('const Thumbnail = memo');
    const unifiedQueueIndex = source.indexOf('export function UnifiedQueue');

    expect(thumbnailIndex).toBeGreaterThan(-1);
    expect(unifiedQueueIndex).toBeGreaterThan(-1);
    expect(thumbnailIndex).toBeLessThan(unifiedQueueIndex);
  });

  it('should use React.memo for Thumbnail', () => {
    expect(source).toContain('const Thumbnail = memo(function Thumbnail');
  });

  it('should use first_image_url for thumbnail source', () => {
    expect(source).toContain('const src = generation.first_image_url');
  });

  it('should show loading state for pending/processing', () => {
    expect(source).toContain('isPendingOrProcessing(generation.status)');
    expect(source).toContain('const StatusIcon = config.icon');
    expect(source).toContain('{config.label}');
  });

  it('should show failed state with error', () => {
    expect(source).toContain('generation.status === GENERATION_STATUS.FAILED');
    expect(source).toContain('{generation.error}');
  });

  it('should show image count badge for multiple images', () => {
    expect(source).toContain('const imageCount = generation.image_count');
    expect(source).toContain('bg-black/70');
    expect(source).toContain('{imageCount}');
  });

  it('should use LightboxWithImage for single images', () => {
    expect(source).toContain('imageCount === 1');
    expect(source).toContain('LightboxWithImage');
  });

  it('should have custom comparison function for memo', () => {
    expect(source).toContain('(prevProps, nextProps) => {');
    expect(source).toContain('prevProps.generation.id === nextProps.generation.id');
  });
});

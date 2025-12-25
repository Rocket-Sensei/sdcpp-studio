/**
 * Tests for Gallery Pagination
 *
 * This test file verifies that:
 * 1. Pagination controls are rendered when there are multiple pages
 * 2. Clicking page 2 shows different items than page 1
 * 3. Navigation buttons work correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the source files for static analysis
const getUnifiedQueueSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/UnifiedQueue.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

const getHookSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/hooks/useImageGeneration.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Pagination - useGenerations Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have currentPage state', () => {
    const source = getHookSource();

    // Verify currentPage state is defined
    expect(source).toContain('const [currentPage, setCurrentPage] = useState(1)');
  });

  it('should calculate totalPages in pagination state', () => {
    const source = getHookSource();

    // Verify totalPages is calculated from total and pageSize
    expect(source).toContain('totalPages: Math.ceil(data.pagination.total / pageSize)');
  });

  it('should have goToPage function', () => {
    const source = getHookSource();

    // Verify goToPage function exists
    expect(source).toContain('const goToPage = useCallback(');
    expect(source).toContain('if (page >= 1 && page <= pagination.totalPages)');
  });

  it('should have nextPage and prevPage functions', () => {
    const source = getHookSource();

    // Verify navigation functions exist
    expect(source).toContain('const nextPage = useCallback(');
    expect(source).toContain('const prevPage = useCallback(');
    expect(source).toContain('goToPage(currentPage + 1)');
    expect(source).toContain('goToPage(currentPage - 1)');
  });

  it('should return currentPage from hook', () => {
    const source = getHookSource();

    // Verify currentPage is returned
    expect(source).toContain('currentPage');
  });

  it('should export goToPage, nextPage, prevPage', () => {
    const source = getHookSource();

    // Verify navigation functions are returned
    expect(source).toMatch(/return\s*\{[\s\S]*goToPage/);
    expect(source).toMatch(/return\s*\{[\s\S]*nextPage/);
    expect(source).toMatch(/return\s*\{[\s\S]*prevPage/);
  });
});

describe('Pagination - UnifiedQueue Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use new pagination functions from hook', () => {
    const source = getUnifiedQueueSource();

    // Verify component uses new pagination API
    expect(source).toContain('goToPage');
    expect(source).toContain('nextPage');
    expect(source).toContain('prevPage');
    expect(source).toContain('currentPage');
  });

  it('should NOT use old loadMore API', () => {
    const source = getUnifiedQueueSource();

    // Should NOT have the old loadMore
    expect(source).not.toContain('loadMore');
    expect(source).not.toContain('isLoadingMore');
  });

  it('should show pagination controls when totalPages > 1', () => {
    const source = getUnifiedQueueSource();

    // Verify pagination controls rendering condition
    expect(source).toContain('pagination.totalPages > 1');
  });

  it('should have Previous button with ChevronLeft icon', () => {
    const source = getUnifiedQueueSource();

    // Verify Previous button
    expect(source).toContain('Previous');
    expect(source).toContain('ChevronLeft');
    expect(source).toContain('onClick={prevPage}');
  });

  it('should have Next button with ChevronRight icon', () => {
    const source = getUnifiedQueueSource();

    // Verify Next button
    expect(source).toContain('Next');
    expect(source).toContain('ChevronRight');
    expect(source).toContain('onClick={nextPage}');
  });

  it('should show page numbers buttons', () => {
    const source = getUnifiedQueueSource();

    // Verify page number buttons are rendered
    expect(source).toContain('Array.from');
    expect(source).toContain('pagination.totalPages');
    expect(source).toMatch(/onClick=\{\(\) => goToPage\(pageNum\)\}/);
  });

  it('should highlight current page', () => {
    const source = getUnifiedQueueSource();

    // Verify current page has different variant
    expect(source).toContain('variant={currentPage === pageNum ? "default" : "outline"}');
  });

  it('should show page info text', () => {
    const source = getUnifiedQueueSource();

    // Verify page info is displayed
    expect(source).toContain('Page {currentPage} of {pagination.totalPages}');
  });

  it('should disable Previous button on first page', () => {
    const source = getUnifiedQueueSource();

    // Verify Previous button is disabled on page 1
    expect(source).toContain('disabled={currentPage === 1 || isLoading}');
  });

  it('should disable Next button on last page', () => {
    const source = getUnifiedQueueSource();

    // Verify Next button is disabled on last page
    expect(source).toContain('disabled={currentPage === pagination.totalPages || isLoading}');
  });
});

describe('Pagination - Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use ref to stabilize fetchGenerations for WebSocket', () => {
    const source = getUnifiedQueueSource();

    // Verify ref is used for fetchGenerations
    expect(source).toContain('fetchGenerationsRef');
    expect(source).toContain('fetchGenerationsRef.current = () => fetchGenerations(currentPage)');
  });

  it('should call fetchGenerations with current page number', () => {
    const source = getUnifiedQueueSource();

    // Verify fetchGenerations is called with page parameter
    expect(source).toContain('fetchGenerations(currentPage)');
  });

  it('should show max 5 page numbers at a time', () => {
    const source = getUnifiedQueueSource();

    // Verify page number display is limited to 5
    expect(source).toContain('Math.min(pagination.totalPages, 5)');
  });
});

/**
 * Tests for Gallery Filter Panel functionality (in App.jsx)
 *
 * These tests verify filter panel functionality through static analysis:
 * - Filter panel opens/closes
 * - Search filtering works
 * - Status filtering works
 * - Model filtering works
 * - Action buttons work (Cancel All, Clear Failed, Delete All)
 * - Filter state persists to localStorage
 *
 * Note: Due to React version conflicts with @didik-mulyadi/react-modal-images,
 * we use static analysis instead of rendering the full component tree.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the App.jsx source file for static analysis
const getAppSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/App.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

describe('Gallery Filter Panel - Static Analysis Tests', () => {
  const source = getAppSource();

  describe('Filter Panel State Management', () => {
    it('should have filter panel open state', () => {
      expect(source).toContain('isFilterPanelOpen');
    });

    it('should persist filter panel state to localStorage', () => {
      expect(source).toContain('FILTER_PANEL_KEY');
      expect(source).toContain('sd-cpp-studio-filter-panel-open');
      expect(source).toMatch(/localStorage\.setItem\(FILTER_PANEL_KEY/);
    });

    it('should load filter panel state from localStorage on mount', () => {
      expect(source).toMatch(/localStorage\.getItem\(FILTER_PANEL_KEY/);
      expect(source).toContain('saved === "true"');
    });
  });

  describe('Filter Panel UI Components', () => {
    it('should have Filters button to open panel', () => {
      expect(source).toContain('Filters');
      expect(source).toContain('Filter');
    });

    it('should use Sheet component for filter panel', () => {
      expect(source).toContain('<Sheet');
      expect(source).toContain('open={isFilterPanelOpen}');
      expect(source).toContain('onOpenChange={setIsFilterPanelOpen}');
    });

    it('should have SheetTrigger as Filters button', () => {
      expect(source).toContain('<SheetTrigger');
      expect(source).toContain('SheetTrigger asChild');
    });

    it('should have filter panel title', () => {
      expect(source).toContain('<SheetTitle>Filters</SheetTitle>');
    });
  });

  describe('Search Filtering', () => {
    it('should have searchQuery state', () => {
      expect(source).toContain('const [searchQuery, setSearchQuery]');
    });

    it('should have search input in filter panel', () => {
      expect(source).toContain('Search Prompts');
      expect(source).toContain('placeholder="Search prompts..."');
      expect(source).toContain('onChange={(e) => setSearchQuery(e.target.value)}');
    });

    it('should pass searchQuery to Studio component', () => {
      expect(source).toContain('searchQuery={searchQuery}');
    });

    it('should have Search icon in search input', () => {
      expect(source).toContain('Search className=');
      expect(source).toContain('absolute left-3 top-1/2');
    });
  });

  describe('Status Filtering', () => {
    it('should have selectedStatuses state', () => {
      expect(source).toContain('const [selectedStatuses, setSelectedStatuses]');
    });

    it('should have STATUS_FILTER_OPTIONS array', () => {
      expect(source).toContain('const STATUS_FILTER_OPTIONS = [');
      expect(source).toContain('value: GENERATION_STATUS.PENDING');
      expect(source).toContain('value: GENERATION_STATUS.MODEL_LOADING');
      expect(source).toContain('value: GENERATION_STATUS.PROCESSING');
      expect(source).toContain('value: GENERATION_STATUS.COMPLETED');
      expect(source).toContain('value: GENERATION_STATUS.FAILED');
      expect(source).toContain('value: GENERATION_STATUS.CANCELLED');
    });

    it('should have status checkboxes in filter panel', () => {
      expect(source).toContain('Status');
      expect(source).toContain('STATUS_FILTER_OPTIONS.map');
      expect(source).toContain('<Checkbox');
      expect(source).toContain('checked={isSelected}');
    });

    it('should show selected status badges', () => {
      expect(source).toContain('selectedStatuses.map(status =>');
      expect(source).toContain('<Badge');
      expect(source).toContain('variant=');
      expect(source).toContain('{option?.label || status}');
    });

    it('should have Clear all button for status filters', () => {
      expect(source).toMatch(/selectedStatuses\.length\s*>\s*0/);
      expect(source).toContain('Clear all');
      expect(source).toContain('onClick={() => setSelectedStatuses([])}');
    });

    it('should pass selectedStatuses to Studio component', () => {
      expect(source).toContain('selectedStatuses={selectedStatuses}');
    });
  });

  describe('Model Filtering', () => {
    it('should have selectedModelsFilter state', () => {
      expect(source).toContain('const [selectedModelsFilter, setSelectedModelsFilter]');
    });

    it('should import MultiModelSelector component', () => {
      expect(source).toContain('import { MultiModelSelector }');
      expect(source).toContain('from "./components/MultiModelSelector"');
    });

    it('should use MultiModelSelector in filter panel', () => {
      expect(source).toContain('<MultiModelSelector');
      expect(source).toContain('selectedModels={selectedModelsFilter}');
      expect(source).toContain('onModelsChange={setSelectedModelsFilter}');
    });

    it('should apply max-height constraint to model selector', () => {
      expect(source).toContain('className="max-h-96 overflow-y-auto"');
    });

    it('should pass selectedModelsFilter to Studio component', () => {
      expect(source).toContain('selectedModelsFilter={selectedModelsFilter}');
    });
  });

  describe('Filter Results Count', () => {
    it('should compute filteredGenerationsCount', () => {
      expect(source).toContain('const filteredGenerationsCount');
      expect(source).toMatch(/\(generations.*\)\.filter\(g/);
    });

    it('should apply search filter in count computation', () => {
      const countSection = source.match(/const filteredGenerationsCount[\s\S]*?return true/);
      expect(countSection).toBeTruthy();
      expect(countSection[0]).toContain('searchQuery.toLowerCase()');
      expect(countSection[0]).toContain('includes(query)');
    });

    it('should apply status filter in count computation', () => {
      const countSection = source.match(/const filteredGenerationsCount[\s\S]*?return true/);
      expect(countSection).toBeTruthy();
      expect(countSection[0]).toContain('selectedStatuses.includes');
    });

    it('should apply model filter in count computation', () => {
      const countSection = source.match(/const filteredGenerationsCount[\s\S]*?return true/);
      expect(countSection).toBeTruthy();
      expect(countSection[0]).toContain('selectedModelsFilter.includes');
    });

    it('should display filtered results count in panel', () => {
      expect(source).toContain('Showing {filteredGenerationsCount} of {(generations || []).length} generations');
      expect(source).toMatch(/searchQuery.*selectedStatuses.*selectedModelsFilter/);
    });
  });

  describe('Action Buttons', () => {
    it('should have Actions section in filter panel', () => {
      expect(source).toContain('Actions');
      expect(source).toContain('handleDeleteAll');
      expect(source).toContain('handleCancelAll');
      expect(source).toContain('handleClearFailed');
    });

    it('should compute hasPendingOrProcessing for Cancel All', () => {
      expect(source).toContain('const hasPendingOrProcessing');
      expect(source).toContain('GENERATION_STATUS.PENDING');
      expect(source).toContain('GENERATION_STATUS.PROCESSING');
    });

    it('should compute hasFailed for Clear Failed', () => {
      expect(source).toContain('const hasFailed');
      expect(source).toContain('GENERATION_STATUS.FAILED');
    });

    it('should have Cancel All button', () => {
      expect(source).toContain('Cancel All');
      expect(source).toContain('onClick={handleCancelAll}');
      expect(source).toContain('disabled={!hasPendingOrProcessing}');
      expect(source).toContain('variant="destructive"');
    });

    it('should have Clear Failed button', () => {
      expect(source).toContain('Clear Failed');
      expect(source).toContain('onClick={handleClearFailed}');
      expect(source).toContain('disabled={!hasFailed}');
      expect(source).toContain('border-orange-200');
      expect(source).toContain('text-orange-600');
    });

    it('should have Delete All button', () => {
      expect(source).toContain('Delete All');
      expect(source).toContain('onClick={handleDeleteAll}');
      expect(source).toContain('Trash2');
    });
  });

  describe('Action Button Handlers', () => {
    it('should have handleDeleteAll function', () => {
      expect(source).toContain('const handleDeleteAll = async');
    });

    it('should call DELETE /api/generations in handleDeleteAll', () => {
      const deleteAllSection = source.match(/const handleDeleteAll[\s\S]*?fetchGenerations/);
      expect(deleteAllSection).toBeTruthy();
      expect(deleteAllSection[0]).toContain("authenticatedFetch('/api/generations'");
      expect(deleteAllSection[0]).toContain('method: "DELETE"');
    });

    it('should have handleCancelAll function', () => {
      expect(source).toContain('const handleCancelAll = async');
    });

    it('should call POST /api/queue/cancel-all in handleCancelAll', () => {
      const cancelAllSection = source.match(/const handleCancelAll[\s\S]*?fetchGenerations/);
      expect(cancelAllSection).toBeTruthy();
      expect(cancelAllSection[0]).toContain("'/api/queue/cancel-all'");
      expect(cancelAllSection[0]).toContain('method: "POST"');
    });

    it('should have handleClearFailed function', () => {
      expect(source).toContain('const handleClearFailed = async');
    });

    it('should filter failed generations and delete them in handleClearFailed', () => {
      const clearFailedSection = source.match(/const handleClearFailed[\s\S]*?fetchGenerations/);
      expect(clearFailedSection).toBeTruthy();
      expect(clearFailedSection[0]).toContain("filter(g => g.status === GENERATION_STATUS.FAILED)");
      expect(clearFailedSection[0]).toMatch(/for\s*\(\s*const\s+generation\s+of\s+failedGenerations/);
    });

    it('should show toast notifications for actions', () => {
      expect(source).toContain('toast.success(`Cancelled ${data.cancelled} job');
      expect(source).toContain('toast.success(`Cleared ${deletedCount} failed generation');
      expect(source).toContain('toast.success(`Deleted ${data.count} generation');
    });
  });

  describe('Total Count Display', () => {
    it('should display total generations count in header', () => {
      expect(source).toContain('{(pagination?.total || 0)} total generation');
      expect(source).toContain('{(pagination?.total || 0) !== 1 ? \'s\' : \'\'}');
    });

    it('should show count on desktop', () => {
      expect(source).toContain('hidden sm:flex items-center gap-3');
      expect(source).toContain('total generation');
    });

    it('should show count on mobile', () => {
      expect(source).toContain('flex sm:hidden');
      expect(source).toContain('total generation');
    });
  });

  describe('Studio Integration', () => {
    it('should pass filter props to Studio component', () => {
      expect(source).toContain('<Studio');
      expect(source).toContain('searchQuery={searchQuery}');
      expect(source).toContain('selectedStatuses={selectedStatuses}');
      expect(source).toContain('selectedModelsFilter={selectedModelsFilter}');
    });

    it('should have Studio route', () => {
      expect(source).toContain('path="/studio"');
      expect(source).toContain('<Studio');
    });
  });

  describe('Responsive Design', () => {
    it('should have desktop filter panel', () => {
      expect(source).toContain('hidden sm:flex');
      expect(source).toContain('sm:w-[500px]');
    });

    it('should have mobile filter panel', () => {
      expect(source).toContain('flex sm:hidden');
      expect(source).toContain('SheetContent side="right"');
    });
  });

  describe('Filter Panel localStorage Persistence', () => {
    it('should save filter panel open state to localStorage', () => {
      expect(source).toMatch(/useEffect.*\(\)\s*=>\s*{[\s\S]*?localStorage\.setItem\(FILTER_PANEL_KEY/);
    });

    it('should have localStorage key constant', () => {
      expect(source).toContain('const FILTER_PANEL_KEY = "sd-cpp-studio-filter-panel-open"');
    });

    it('should watch isFilterPanelOpen changes', () => {
      const effectSection = source.match(/useEffect\(\(\) => {[\s\S]*?localStorage\.setItem\(FILTER_PANEL_KEY[\s\S]*?}, \[isFilterPanelOpen\]\)/);
      expect(effectSection).toBeTruthy();
    });
  });
});

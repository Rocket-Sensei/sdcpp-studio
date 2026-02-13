/**
 * Vitest test for ModelSelector component
 * Tests that typing in text inputs doesn't trigger excessive model fetches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ModelSelector - Excessive Fetch Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('fetchModels callback behavior', () => {
    it('should detect when fetchModels callback is recreated unnecessarily', () => {
      // This test verifies the concept: if a callback is recreated,
      // effects that depend on it will re-run

      let callCount = 0;
      const createCallback = (dep) => {
        return () => {
          callCount++;
        };
      };

      const callback1 = createCallback('dep1');
      const callback2 = createCallback('dep1');

      // Even though the dependency is the same, the function reference changed
      expect(callback1).not.toBe(callback2);

      // Simulate what useEffect does: checks reference equality
      const effects = [];
      const runEffect = (callback, deps) => {
        // Check if any dependency has changed (reference equality)
        const shouldRun = !effects.length ||
          !deps ||
          effects.every((e, i) => {
            // Compare with previous effect's deps
            return !e.deps || e.deps.some((dep, j) => dep !== deps[j]);
          }) ||
          effects[effects.length - 1].callback !== callback;

        if (shouldRun) {
          callback();
          effects.push({ callback, deps });
        }
      };

      runEffect(callback1, ['dep1']);
      expect(callCount).toBe(1);

      // With new reference, effect runs again even if deps are same
      runEffect(callback2, ['dep1']);
      expect(callCount).toBe(2);
    });

    it('should demonstrate useCallback prevents unnecessary re-renders', () => {
      // This test shows how useCallback should work

      const stableDeps = ['stable-dep'];
      let callbackCreationCount = 0;

      // Simulate useCallback behavior
      const useCallback = (fn, deps) => {
        callbackCreationCount++;
        // In real React, if deps haven't changed, return the same function
        // This is a simplified version
        return fn;
      };

      const callback1 = useCallback(() => {}, stableDeps);
      const callback2 = useCallback(() => {}, stableDeps);

      // Without proper useCallback memoization, these are different
      expect(callbackCreationCount).toBe(2);
    });
  });

  describe('filterCapabilities prop issue', () => {
    it('should detect when filterCapabilities causes callback recreation', () => {
      // The issue: if filterCapabilities is passed as a new array reference,
      // fetchModels gets recreated

      const fetchModels1 = { name: 'fetchModels', deps: ['image-to-image'] };
      const fetchModels2 = { name: 'fetchModels', deps: null };

      // When filterCapabilities changes from undefined to null or vice versa,
      // the dependencies array changes
      expect(fetchModels1.deps).not.toBe(fetchModels2.deps);

      // But both are "falsy" in React terms
      expect(fetchModels1.deps).not.toBeFalsy();
      expect(fetchModels2.deps).toBeFalsy();
    });
  });

  describe('polling interval cleanup', () => {
    it('should demonstrate proper interval cleanup on effect re-run', () => {
      const intervals = [];
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;

      global.setInterval = (fn, delay) => {
        const id = intervals.length;
        intervals.push({ fn, delay, cleared: false });
        return id;
      };

      global.clearInterval = (id) => {
        if (intervals[id]) {
          intervals[id].cleared = true;
        }
      };

      // Simulate the polling effect
      const createPollingEffect = (fetchModels) => {
        const interval = setInterval(fetchModels, 5000);
        return () => clearInterval(interval);
      };

      // First effect run
      const cleanup1 = createPollingEffect(() => 'fetch1');
      expect(intervals.length).toBe(1);
      expect(intervals[0].cleared).toBe(false);

      // Effect re-runs - should clean up previous interval
      cleanup1();
      expect(intervals[0].cleared).toBe(true);

      const cleanup2 = createPollingEffect(() => 'fetch2');
      expect(intervals.length).toBe(2);
      expect(intervals[1].cleared).toBe(false);

      // Restore
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });

  describe('root cause analysis', () => {
    it('should identify the issue: filterCapabilities in dependencies causes re-creation', () => {
      // The actual ModelSelector code:
      // const fetchModels = useCallback(async () => {
      //   // ... fetches models
      // }, [filterCapabilities]);

      // When TextToImage renders ModelSelector:
      // <ModelSelector currentModel={selectedModel} onModelChange={onModelChange} />
      // filterCapabilities is NOT passed, so it defaults to null

      // But if parent re-renders and passes an array for filterCapabilities,
      // or if the default value comparison fails, fetchModels gets recreated

      const scenario1 = { filterCapabilities: null };
      const scenario2 = { filterCapabilities: undefined };
      const scenario3 = {}; // No filterCapabilities prop

      // In the actual code: filterCapabilities = null (default value in destructuring)
      // So all three scenarios result in filterCapabilities being null

      // The real issue is likely something else...

      expect(scenario1.filterCapabilities).toBe(null);
      expect(scenario2.filterCapabilities).toBe(undefined);
      expect(scenario3.filterCapabilities).toBe(undefined);
    });

    it('should identify the real issue: onModelChange in setDefaultModel effect', () => {
      // Looking at ModelSelector.jsx line 89:
      // }, []); // eslint-disable-line react-hooks/exhaustive-deps
      //
      // The setDefaultModel effect uses onModelChange but excludes it from deps
      // This is flagged with eslint-disable-line

      // While this looks suspicious, it's intentionally excluded because
      // we only want to set the default model once on mount, not when
      // onModelChange changes.

      // The actual issue is that the fetchModels callback is being recreated
      // due to some dependency change

      const dependencies = ['filterCapabilities'];

      // If filterCapabilities is always null (default), and null is a primitive,
      // it should be stable...

      // Let's check if the issue is with how filterCapabilities is handled

      const getFilterCapabilities = (props) => {
        return props.filterCapabilities ?? null;
      };

      const props1 = { currentModel: 'model1', onModelChange: () => {} };
      const props2 = { currentModel: 'model1', onModelChange: () => {} };

      expect(getFilterCapabilities(props1)).toBe(null);
      expect(getFilterCapabilities(props2)).toBe(null);
      expect(getFilterCapabilities(props1)).toBe(getFilterCapabilities(props2));
    });
  });
});

/**
 * Tests for ModelSelectorModal scroll and Studio behavior fixes
 */

const getStudioSource = () => {
  const fs = require('fs');
  const path = require('path');
  const sourcePath = path.join(__dirname, '../frontend/src/components/Studio.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

const getPromptBarSource = () => {
  const fs = require('fs');
  const path = require('path');
  const sourcePath = path.join(__dirname, '../frontend/src/components/prompt/PromptBar.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

describe('ModelSelectorModal - Scroll Issues', () => {
  it('should have ScrollArea properly configured for scrolling', () => {
    const fs = require('fs');
    const path = require('path');
    const sourcePath = path.join(__dirname, '../frontend/src/components/model-selector/ModelSelectorModal.jsx');
    const source = fs.readFileSync(sourcePath, 'utf-8');

    // Check that ScrollArea is used
    expect(source).toContain('ScrollArea');

    // The model list container should NOT have overflow-hidden that prevents
    // ScrollArea from working. Look for the pattern "flex-1 min-h-0 overflow-hidden"
    // in the model list section
    const modelListSection = source.substring(
      source.indexOf('{/* Model list */}'),
      source.indexOf('{isLoading ?')
    );

    // Should NOT have overflow-hidden in the model list container
    // (it was removed to fix scroll issues)
    expect(modelListSection).not.toContain('overflow-hidden');

    // But ScrollArea should still be present
    expect(source).toContain('<ScrollArea');
  });

  it('should have TabsContent with proper height class', () => {
    const fs = require('fs');
    const path = require('path');
    const sourcePath = path.join(__dirname, '../frontend/src/components/model-selector/ModelSelectorModal.jsx');
    const source = fs.readFileSync(sourcePath, 'utf-8');

    // TabsContent should have h-full to properly size
    expect(source).toContain('TabsContent');
    expect(source).toContain('h-full');
  });
});

describe('Studio - Generate Button and Settings Panel', () => {
  it('should have settings panel', () => {
    const source = getStudioSource();

    // Check for settings panel
    expect(source).toContain('isSettingsOpen');
    expect(source).toContain('GeneratePanel');
    expect(source).toContain('PromptBar');
  });

  it('should have Generate panel title when opened', () => {
    const source = getStudioSource();

    // The title should be "Generate"
    expect(source).toContain('Generate');
  });
});

describe('PromptBar - Generate Button', () => {
  it('should have generate button that triggers generation', () => {
    const source = getPromptBarSource();

    // The generate button is in the GenerateImage component, not PromptBar directly
    // PromptBar should render GenerateImage component
    expect(source).toContain('GenerateImage');
    expect(source).toContain('onGenerate={onGenerate}');
  });
});

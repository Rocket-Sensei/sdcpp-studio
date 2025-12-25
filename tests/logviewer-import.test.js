/**
 * Test to verify LogViewer component imports work correctly
 *
 * This test reproduces the import failure that occurs when LogViewer.jsx
 * imports from the wrong path.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LogViewer } from '../frontend/src/components/LogViewer.jsx';

describe('LogViewer Component Import', () => {
  it('should import LogViewer component without errors', () => {
    // This test will fail if the import path in LogViewer.jsx is incorrect
    expect(LogViewer).toBeDefined();
  });

  it('should render LogViewer component with generationId', () => {
    const { container } = render(<LogViewer generationId="test-gen-id" />);

    // Verify the component renders
    expect(container).toBeDefined();
  });
});

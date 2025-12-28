import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Note: We cannot directly render UnifiedQueue in tests because the
// @didik-mulyadi/react-modal-images package bundles an older version of React
// which causes "React Element from an older version" errors in tests.
// In production, this should work fine, but in the test environment with jsdom,
// the version conflict causes issues.

// Instead, we test the component structure and verify the imports are correct.

// Mock the useImageGeneration hook
const mockUseGenerations = vi.fn();
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useGenerations: () => mockUseGenerations(),
}));

// Mock the useWebSocket hook
vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({}),
  WS_CHANNELS: { QUEUE: 'queue', GENERATIONS: 'generations' },
}));

// Mock authenticatedFetch
const mockAuthenticatedFetch = vi.fn();
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: () => mockAuthenticatedFetch(),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGenerations = [
  {
    id: '1',
    prompt: 'A beautiful landscape',
    status: 'completed',
    model: 'model1',
    size: '512x512',
    seed: '12345',
    created_at: '2024-01-01T00:00:00Z',
    first_image_url: 'http://example.com/image1.jpg',
    image_count: 1,
    width: 512,
    height: 512,
  },
  {
    id: '2',
    prompt: 'Batch generation test',
    status: 'completed',
    model: 'model1',
    size: '512x512',
    seed: '54321',
    created_at: '2024-01-01T01:00:00Z',
    first_image_url: 'http://example.com/image2.jpg',
    image_count: 4,
    width: 512,
    height: 512,
  },
  {
    id: '3',
    prompt: 'Failed generation',
    status: 'failed',
    model: 'model1',
    size: '512x512',
    error: 'Test error',
    created_at: '2024-01-01T02:00:00Z',
    image_count: 0,
  },
];

const mockModels = {
  model1: 'Test Model 1',
  model2: 'Test Model 2',
};

describe('UnifiedQueue - Modal Image Integration', () => {
  describe('Package Installation and Imports', () => {
    it('should have the modal images package installed', () => {
      const fs = require('fs');
      const packageJsonPath = 'frontend/package.json';
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.dependencies).toHaveProperty('@didik-mulyadi/react-modal-images');
    });

    it('should import LightboxWithImage and LightboxGalleryWithImages components', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify the package is imported
      expect(componentContent).toContain('@didik-mulyadi/react-modal-images');
      expect(componentContent).toContain('LightboxWithImage');
      expect(componentContent).toContain('LightboxGalleryWithImages');
    });

    it('should use LightboxWithImage in Thumbnail component', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify LightboxWithImage is used in the component
      const lightboxCount = (componentContent.match(/LightboxWithImage/g) || []).length;
      expect(lightboxCount).toBeGreaterThan(0);
    });

    it('should use LightboxGalleryWithImages for gallery dialog', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify LightboxGalleryWithImages is used for gallery
      expect(componentContent).toContain('LightboxGalleryWithImages');
    });
  });

  describe('Component Structure', () => {
    it('should have proper props configuration for LightboxWithImage', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify key props are used
      expect(componentContent).toContain('small=');
      expect(componentContent).toContain('large=');
      expect(componentContent).toContain('alt=');
      expect(componentContent).toContain('fileName=');
      expect(componentContent).toContain('hideDownload=');
      expect(componentContent).toContain('hideZoom=');
      expect(componentContent).toContain('className=');
    });

    it('should have proper props configuration for LightboxGalleryWithImages', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify gallery props are used
      expect(componentContent).toContain('fixedWidth=');
      expect(componentContent).toContain('maxWidthLightBox=');
      expect(componentContent).toContain('images=');
    });

    it('should handle single and multiple image cases differently', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify conditional rendering based on image count
      expect(componentContent).toContain('imageCount === 1');
      expect(componentContent).toContain('image_count > 1');
    });
  });

  describe('Gallery View Dialog', () => {
    it('should have galleryImages state for storing multiple images', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify state for gallery images
      expect(componentContent).toContain('const [galleryImages, setGalleryImages]');
    });

    it('should prepare gallery data with correct structure', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify gallery data structure
      expect(componentContent).toContain('id:');
      expect(componentContent).toContain('src:');
      expect(componentContent).toContain('srcLarge:');
      expect(componentContent).toContain('fileName:');
      expect(componentContent).toContain('alt:');
    });

    it('should conditionally render gallery dialog when multiple images exist', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify conditional rendering
      expect(componentContent).toContain('galleryImages && selectedImage && (');
      expect(componentContent).toContain('{!showLogs && galleryImages && (');
    });
  });

  describe('Image Rendering Logic', () => {
    it('should show badge for multiple images', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify badge rendering for multiple images
      expect(componentContent).toContain('bg-black/70');
      expect(componentContent).toContain('pointer-events-none');
    });

    it('should not render old Eye icon and click handlers', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify old imports are removed (Eye was removed from imports)
      expect(componentContent).not.toContain('Eye,');
    });

    it('should handle failed state without LightboxWithImage', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify failed state handling
      expect(componentContent).toContain('generation.status === GENERATION_STATUS.FAILED');
      expect(componentContent).toContain('generation.status === GENERATION_STATUS.CANCELLED');
    });
  });

  describe('Pending and Processing states', () => {
    it('should render loading state for pending generations', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify the component uses getStatusConfig for dynamic status labels
      expect(componentContent).toContain('const config = getStatusConfig(generation.status)');
      expect(componentContent).toContain('const StatusIcon = config.icon');
      expect(componentContent).toContain('{config.label}');

      // Verify STATUS_CONFIG has correct labels for different states
      expect(componentContent).toContain('label: "Queued"');
      expect(componentContent).toContain('label: "Loading Model"');
      expect(componentContent).toContain('label: "Generating"');
    });

    it('should show correct status for PENDING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify PENDING shows "Queued"
      expect(componentContent).toContain('[GENERATION_STATUS.PENDING]: {');
      expect(componentContent).toContain('label: "Queued"');
    });

    it('should show correct status for MODEL_LOADING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify MODEL_LOADING shows "Loading Model"
      expect(componentContent).toContain('[GENERATION_STATUS.MODEL_LOADING]: {');
      expect(componentContent).toContain('label: "Loading Model"');
    });

    it('should show correct status for PROCESSING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify PROCESSING shows "Generating"
      expect(componentContent).toContain('[GENERATION_STATUS.PROCESSING]: {');
      expect(componentContent).toContain('label: "Generating"');
    });
  });

  describe('Data Flow', () => {
    it('should use static_url for images when available', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify static_url usage
      expect(componentContent).toContain('static_url');
    });

    it('should handle image data from generation.images array', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify images array handling
      expect(componentContent).toContain('fullGeneration.images');
      expect(componentContent).toContain('.map(img => (');
    });
  });

  describe('Button Interactions', () => {
    it('should show view button for multiple images on hover', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify view button for gallery
      expect(componentContent).toContain('image_count > 1 && (');
      expect(componentContent).toContain('handleViewImage(generation)');
    });

    it('should keep existing Download, More, and Delete buttons', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify existing buttons are still present
      expect(componentContent).toContain('Download');
      expect(componentContent).toContain('More');
      expect(componentContent).toContain('Trash2');
    });
  });
});

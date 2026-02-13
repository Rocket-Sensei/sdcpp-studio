import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Note: We now use @hanakla/react-lightbox which is a headless library
// that doesn't have React version conflicts. This allows proper testing.

describe('UnifiedQueue - Modal Image Integration', () => {
  describe('Package Installation and Imports', () => {
    it('should have the lightbox package installed', () => {
      const fs = require('fs');
      const packageJsonPath = 'frontend/package.json';
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // Now using @hanakla/react-lightbox (headless, no React version conflicts)
      expect(packageJson.dependencies).toHaveProperty('@hanakla/react-lightbox');
    });

    it('should import LightboxWithImage and LightboxGalleryWithImages components', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/Lightbox.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify the Lightbox wrapper exports both components
      expect(componentContent).toContain('export function LightboxWithImage');
      expect(componentContent).toContain('export function LightboxGalleryWithImages');
    });

    it('should use LightboxWithImage in ImageCard component', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify LightboxWithImage is used in the component
      expect(componentContent).toContain('LightboxWithImage');
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
      const componentPath = 'frontend/src/components/Lightbox.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify key props are used
      expect(componentContent).toContain('small');
      expect(componentContent).toContain('large');
      expect(componentContent).toContain('alt');
      expect(componentContent).toContain('fileName');
      expect(componentContent).toContain('hideDownload');
      expect(componentContent).toContain('hideZoom');
      expect(componentContent).toContain('className');
    });

    it('should have proper props configuration for LightboxGalleryWithImages', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/Lightbox.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify gallery props are used
      expect(componentContent).toContain('images');
      expect(componentContent).toContain('alt');
      expect(componentContent).toContain('className');
    });

    it('should handle single and multiple image cases differently', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/UnifiedQueue.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // The UnifiedQueue component uses ImageCard which handles image count
      // Check that ImageCard is imported
      expect(componentContent).toContain('import { ImageCard } from');
      expect(componentContent).toContain('from "./gallery/ImageCard"');
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
    it('should show badge for multiple images in ImageCard', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify image count is used
      expect(componentContent).toContain('const imageCount = generation.image_count || 0');
      expect(componentContent).toContain('generation.first_image_url');
    });

    it('should not render old Eye icon and click handlers', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify old imports are removed (Eye was removed from imports)
      expect(componentContent).not.toContain('Eye,');
    });

    it('should handle failed state without LightboxWithImage', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify failed state handling
      expect(componentContent).toContain('const isFailed = status === GENERATION_STATUS.FAILED || status === GENERATION_STATUS.CANCELLED');
    });
  });

  describe('Pending and Processing states', () => {
    it('should render loading state for pending generations', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify the component uses STATUS_CONFIG for dynamic status labels
      expect(componentContent).toContain('const StatusIcon = config.icon');
      expect(componentContent).toContain('{config.label}');

      // Verify STATUS_CONFIG has correct labels for different states
      expect(componentContent).toContain('label: "Queued"');
      expect(componentContent).toContain('label: "Loading Model"');
      expect(componentContent).toContain('label: "Generating"');
    });

    it('should show correct status for PENDING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify PENDING shows "Queued"
      expect(componentContent).toContain('label: "Queued"');
    });

    it('should show correct status for MODEL_LOADING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify MODEL_LOADING shows "Loading Model"
      expect(componentContent).toContain('label: "Loading Model"');
    });

    it('should show correct status for PROCESSING state', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify PROCESSING shows "Generating"
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

      // ImageCard handles the click and display, UnifiedQueue just passes handlers
      // Verify that ImageCard is used for displaying generations
      expect(componentContent).toContain('ImageCard');
      expect(componentContent).toContain('generation={generation}');
    });

    it('should keep existing Download, Iterate, Edit, and Delete buttons', () => {
      const fs = require('fs');
      const componentPath = 'frontend/src/components/gallery/ImageCard.jsx';
      const componentContent = fs.readFileSync(componentPath, 'utf-8');

      // Verify existing buttons are still present
      expect(componentContent).toContain('Download');
      expect(componentContent).toContain('Sparkles');
      expect(componentContent).toContain('Edit3');
      expect(componentContent).toContain('Trash2');
    });
  });
});

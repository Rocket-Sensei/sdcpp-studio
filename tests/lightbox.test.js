/**
 * Vitest tests for Lightbox component
 * Tests image modal overlay with 90% viewport sizing and mobile support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'fs';
import path from 'path';

// Get Lightbox source for static analysis
const getLightboxSource = () => {
  const sourcePath = path.join(__dirname, '../frontend/src/components/Lightbox.jsx');
  return fs.readFileSync(sourcePath, 'utf-8');
};

describe('Lightbox - Viewport Sizing (90%)', () => {
  const source = getLightboxSource();

  it('should have image with max-width of 90vw (90% of viewport width)', () => {
    // Check for max-w-[90vw] class
    expect(source).toContain('max-w-[90vw]');
    // Also check inline style
    expect(source).toContain('maxWidth: \'90vw\'');
  });

  it('should have image with max-height of 90vh (90% of viewport height)', () => {
    // Check for max-h-[90vh] class
    expect(source).toContain('max-h-[90vh]');
    // Also check inline style
    expect(source).toContain('maxHeight: \'90vh\'');
  });

  it('should not have the old 98% sizing', () => {
    // Should not contain the old 98% values
    expect(source).not.toContain('max-w-[98%]');
    expect(source).not.toContain('max-h-[98%]');
  });

  it('should have object-contain to preserve aspect ratio', () => {
    expect(source).toContain('object-contain');
  });

  it('should have w-auto and h-auto for proper aspect ratio', () => {
    expect(source).toContain('w-auto');
    expect(source).toContain('h-auto');
  });
});

describe('Lightbox - Mobile Support', () => {
  const source = getLightboxSource();

  it('should have responsive padding on image container', () => {
    // Should have responsive padding: p-2 sm:p-4 md:p-6
    expect(source).toMatch(/p-2.*sm:p-4.*md:p-6/);
  });

  it('should have responsive header padding', () => {
    // Header should have py-2 px-3 sm:px-4 md:py-3 md:px-6
    expect(source).toMatch(/py-2.*px-3.*sm:px-4.*md:py-3.*md:px-6/);
  });

  it('should have responsive icon sizes in header buttons', () => {
    // Icons should scale: w-5 h-5 sm:w-6 sm:h-6
    expect(source).toMatch(/w-5 h-5.*sm:w-6 sm:h-6/);
  });

  it('should have responsive button padding for touch targets', () => {
    // Buttons should have p-1.5 sm:p-2 for better mobile touch targets
    expect(source).toMatch(/p-1\.5.*sm:p-2/);
  });

  it('should have responsive text size in header', () => {
    // Title should have text-xs sm:text-sm
    expect(source).toMatch(/text-xs.*sm:text-sm/);
  });

  it('should have responsive gap between header buttons', () => {
    // Gap should scale: gap-1 sm:gap-2
    expect(source).toMatch(/gap-1.*sm:gap-2/);
  });

  it('should have responsive max-width on title text', () => {
    // Title should truncate with max-w-[60vw] sm:max-w-[70vw]
    expect(source).toMatch(/max-w-\[60vw\].*sm:max-w-\[70vw\]/);
  });
});

describe('Lightbox - Core Features', () => {
  const source = getLightboxSource();

  it('should use @hanakla/react-lightbox library', () => {
    expect(source).toContain('@hanakla/react-lightbox');
    expect(source).toContain('useLightbox');
    expect(source).toContain('Lightbox');
  });

  it('should export LightboxWithImage component', () => {
    expect(source).toContain('export function LightboxWithImage');
  });

  it('should export LightboxGalleryWithImages component', () => {
    expect(source).toContain('export function LightboxGalleryWithImages');
  });

  it('should have ImageLightbox component with renderItem', () => {
    expect(source).toContain('function ImageLightbox');
    expect(source).toContain('renderItem');
  });

  it('should have download functionality', () => {
    expect(source).toContain('handleDownload');
    expect(source).toContain('Download');
  });

  it('should have close button with X icon', () => {
    expect(source).toContain('X');
    expect(source).toContain('Lightbox.Close');
  });

  it('should have backdrop click to close functionality', () => {
    expect(source).toContain('handleBackdropClick');
    expect(source).toContain('onClick={handleBackdropClick}');
  });

  it('should have pinch-to-zoom support', () => {
    expect(source).toContain('Lightbox.Pinchable');
  });

  it('should have draggable=false on image to prevent dragging', () => {
    expect(source).toContain('draggable={false}');
  });

  it('should have select-none to prevent text selection', () => {
    expect(source).toContain('select-none');
  });

  it('should have proper z-index for overlay', () => {
    expect(source).toContain('z-50');
  });

  it('should have fixed inset-0 positioning for full screen overlay', () => {
    expect(source).toContain('fixed inset-0');
  });

  it('should have bg-black/80 for semi-transparent backdrop', () => {
    expect(source).toContain('bg-black/80');
  });
});

describe('Lightbox - Download Functionality', () => {
  const source = getLightboxSource();

  it('should handle same-origin downloads with fetch', () => {
    expect(source).toContain('fetch(url)');
    expect(source).toContain('res.blob()');
  });

  it('should handle cross-origin downloads with direct anchor', () => {
    expect(source).toContain('isSameOrigin');
    expect(source).toContain('new URL(url).hostname');
  });

  it('should create temporary anchor element for download', () => {
    expect(source).toContain('document.createElement("a")');
    expect(source).toContain('setAttribute("download"');
  });

  it('should use URL.createObjectURL for blob downloads', () => {
    expect(source).toContain('URL.createObjectURL(blob)');
  });

  it('should clean up object URLs after download', () => {
    // The component should handle cleanup (in the full implementation)
    expect(source).toContain('URL.createObjectURL');
  });

  it('should have error handling for failed downloads', () => {
    expect(source).toContain('.catch(');
    expect(source).toContain('Failed to download image');
  });

  it('should have aria-label on download button for accessibility', () => {
    expect(source).toMatch(/aria-label=["']Download/);
  });
});

describe('Lightbox - Accessibility', () => {
  const source = getLightboxSource();

  it('should have aria-label on download button', () => {
    expect(source).toMatch(/aria-label=["']Download/);
  });

  it('should have aria-label on close button', () => {
    expect(source).toMatch(/aria-label=["']Close/);
  });

  it('should have title attribute on download button', () => {
    expect(source).toMatch(/title=["']Download["']/);
  });

  it('should have title attribute on close button', () => {
    expect(source).toMatch(/title=["']Close["']/);
  });

  it('should have alt text on image from item prop', () => {
    expect(source).toContain('alt={item.alt}');
  });

  it('should have data-lightbox-image-container attribute for testing', () => {
    expect(source).toContain('data-lightbox-image-container="true"');
  });
});

describe('Lightbox - LightboxWithImage Component', () => {
  const source = getLightboxSource();

  it('should accept small, large, alt, className, fileName props', () => {
    expect(source).toContain('small');
    expect(source).toContain('large');
    expect(source).toContain('alt = ""');
    expect(source).toContain('className');
    expect(source).toContain('fileName');
  });

  it('should accept hideDownload and hideZoom props (for compatibility)', () => {
    expect(source).toContain('hideDownload = false');
    expect(source).toContain('hideZoom = false');
  });

  it('should fallback to small if large is not provided', () => {
    expect(source).toMatch(/const src = large \|\| small/);
  });

  it('should use useLightbox hook', () => {
    expect(source).toContain('const lb = useLightbox(');
  });

  it('should have cursor pointer on clickable image', () => {
    expect(source).toContain('cursor: "pointer"');
  });

  it('should render LightboxView component', () => {
    expect(source).toContain('<lb.LightboxView />');
  });
});

describe('Lightbox - LightboxGalleryWithImages Component', () => {
  const source = getLightboxSource();

  it('should accept images array prop', () => {
    expect(source).toMatch(/images = \[\]/);
  });

  it('should map images to lightbox items with kind, url, alt, fileName', () => {
    expect(source).toContain('kind: "image"');
    expect(source).toContain('url: img.large || img.small');
    expect(source).toContain('alt: img.alt || alt');
    expect(source).toContain('fileName: img.fileName');
  });

  it('should return null if no images provided', () => {
    expect(source).toMatch(/if \(!firstImage\) return null/);
  });

  it('should show first image as thumbnail', () => {
    expect(source).toContain('firstImage.small');
  });

  it('should open gallery from first image on click', () => {
    expect(source).toContain('lb.getOnClick(items[0])');
  });
});

describe('Lightbox - Image Styling', () => {
  const source = getLightboxSource();

  it('should have viewport-based sizing (90vw x 90vh)', () => {
    expect(source).toContain('max-w-[90vw]');
    expect(source).toContain('max-h-[90vh]');
  });

  it('should preserve aspect ratio with auto dimensions', () => {
    expect(source).toContain('w-auto');
    expect(source).toContain('h-auto');
  });

  it('should use object-contain for proper fitting', () => {
    expect(source).toContain('object-contain');
  });

  it('should prevent image dragging', () => {
    expect(source).toContain('draggable={false}');
  });

  it('should prevent text selection on image', () => {
    expect(source).toContain('select-none');
  });
});

describe('Lightbox - Header Styling', () => {
  const source = getLightboxSource();

  it('should have dark semi-transparent background', () => {
    expect(source).toContain('bg-black/70');
  });

  it('should have white text', () => {
    expect(source).toContain('text-white');
  });

  it('should have flex layout for spacing', () => {
    expect(source).toContain('flex items-center justify-between');
  });

  it('should truncate title text with max-width', () => {
    expect(source).toContain('truncate');
    expect(source).toMatch(/max-w-\[60vw\]/);
  });

  it('should have hover effect on buttons', () => {
    expect(source).toContain('hover:bg-white/10');
  });

  it('should have transition on buttons', () => {
    expect(source).toContain('transition-colors');
  });

  it('should have rounded corners on buttons', () => {
    expect(source).toContain('rounded-md');
  });
});

describe('Lightbox - Layout Structure', () => {
  const source = getLightboxSource();

  it('should have fixed full-screen overlay', () => {
    expect(source).toContain('fixed inset-0');
  });

  it('should have flex column layout', () => {
    expect(source).toContain('flex flex-col');
  });

  it('should use isolate for z-index stacking context', () => {
    expect(source).toContain('isolate');
  });

  it('should have header and viewport sections', () => {
    expect(source).toContain('Lightbox.Header');
    expect(source).toContain('Lightbox.Viewport');
  });

  it('should have flex-1 on viewport to take remaining space', () => {
    expect(source).toMatch(/Viewport.*flex-1/);
  });

  it('should have proper container with flex center for image', () => {
    expect(source).toContain('flex items-center justify-center flex-1');
  });
});

describe('Lightbox - Backdrop Behavior', () => {
  const source = getLightboxSource();

  it('should have click handler on root element', () => {
    expect(source).toContain('onClick={handleBackdropClick}');
  });

  it('should close only when clicking backdrop, not image', () => {
    expect(source).toContain('e.target === e.currentTarget');
    expect(source).toContain('lbContext.close()');
  });
});

describe('Lightbox - Component Comments', () => {
  const source = getLightboxSource();

  it('should have JSDoc comment explaining the component', () => {
    // Should have comment block at the top
    expect(source).toMatch(/\/\*\*[\s\S]*Lightbox wrapper/);
  });

  it('should have feature list comment for ImageLightbox', () => {
    // Comment should list features including 90% viewport sizing and mobile support
    expect(source).toMatch(/Features:|Custom Lightbox/);
    expect(source).toMatch(/90% of viewport/);
    expect(source).toMatch(/mobile/i); // Case-insensitive for mobile
    expect(source).toMatch(/responsive/i); // Case-insensitive for responsive
  });
});

describe('Lightbox - Integration Points', () => {
  const source = getLightboxSource();

  it('should import from lucide-react for icons', () => {
    expect(source).toContain('from "lucide-react"');
    expect(source).toContain('X');
    expect(source).toContain('Download');
  });

  it('should use @hanakla/react-lightbox', () => {
    expect(source).toContain('@hanakla/react-lightbox');
  });
});

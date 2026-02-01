/**
 * Lightbox wrapper for @hanakla/react-lightbox
 *
 * Provides a simple API that matches the old @didik-mulyadi/react-modal-images:
 * - LightboxWithImage: Single image lightbox
 * - LightboxGalleryWithImages: Multiple images lightbox
 */

import { X, Download } from "lucide-react";
import {
  useLightbox,
  Lightbox,
  useLightboxState,
} from "@hanakla/react-lightbox";
import { authenticatedFetch } from "../utils/api";

/**
 * Custom Lightbox UI Component
 *
 * Features:
 * - Image displayed with proper sizing (fits within container with header)
 * - Mobile-responsive header with smaller touch targets
 * - Download functionality with cross-origin support
 * - Backdrop click to close
 * - Pinch-to-zoom support
 */
function ImageLightbox({ items, defaultIndex }) {
  const lbContext = useLightboxState();
  const currentItem = items[lbContext.currentIndex];

  const handleDownload = (e) => {
    const url = currentItem.url;
    const fileName = currentItem.fileName || url.split("/").slice(-1)[1];

    console.log('[Download] Starting download:', { url, fileName });

    const downloadBlob = (blob) => {
      console.log('[Download] Got blob:', { type: blob.type, size: blob.size });
      const blobUrl = URL.createObjectURL(blob);
      console.log('[Download] Created blob URL:', blobUrl);

      const tmpAnchor = document.createElement("a");
      tmpAnchor.setAttribute("download", fileName);
      tmpAnchor.setAttribute("href", blobUrl);
      document.body.appendChild(tmpAnchor);

      console.log('[Download] Clicking anchor...');
      tmpAnchor.click();

      setTimeout(() => {
        document.body.removeChild(tmpAnchor);
        console.log('[Download] Revoking blob URL');
        URL.revokeObjectURL(blobUrl);
      }, 100);
    };

    // Fetch with authentication for same-origin URLs
    console.log('[Download] Fetching with authentication...');
    authenticatedFetch(url)
      .then((res) => {
        console.log('[Download] Response:', { status: res.status, ok: res.ok, headers: res.headers.get('content-type') });
        if (!res.ok) {
          throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
        }
        return res.blob();
      })
      .then((blob) => {
        downloadBlob(blob);
      })
      .catch((err) => {
        console.error("[Download] Failed:", err);
        // Fallback: try opening in new tab
        console.log('[Download] Fallback: opening in new tab');
        const tmpAnchor = document.createElement("a");
        tmpAnchor.setAttribute("href", url);
        tmpAnchor.setAttribute("target", "_blank");
        tmpAnchor.setAttribute("rel", "noopener noreferrer");
        document.body.appendChild(tmpAnchor);
        tmpAnchor.click();
        document.body.removeChild(tmpAnchor);
      });
  };

  const renderItem = (item, index) => {
    if (item.kind === "image") {
      return (
        <Lightbox.Item
          $index={index}
          className="pointer-events-none"
          data-lightbox-image-container="true"
          // Override library's max-height inline style
          style={{ maxHeight: 'none' }}
        >
          <div className="flex items-center justify-center h-full p-4 sm:p-6 md:p-8 pointer-events-auto">
            <Lightbox.Pinchable onRequestClose={lbContext.close}>
              <img
                src={item.url}
                alt={item.alt}
                draggable={false}
                // Use max-w-full and max-h-full to fit within parent container
                // The parent div now properly constrains the image
                className="max-w-full max-h-full w-auto h-auto object-contain select-none"
              />
            </Lightbox.Pinchable>
          </div>
        </Lightbox.Item>
      );
    }
    return null;
  };

  return (
    <Lightbox.Root
      className="fixed inset-0 isolate flex flex-col bg-black/80 z-50"
    >
      {/* Custom backdrop element - handles clicks outside content */}
      <div
        className="absolute inset-0 z-0"
        onClick={lbContext.close}
        aria-label="Close lightbox"
      />

      {/* Header - mobile responsive with proper touch targets */}
      <Lightbox.Header className="relative z-10 flex items-center justify-between w-full py-2 px-3 sm:px-4 md:py-3 md:px-6 bg-black/70 text-white pointer-events-none">
        <span className="text-xs sm:text-sm truncate mr-2 sm:mr-4 max-w-[60vw] sm:max-w-[70vw]">
          {currentItem?.alt || ""}
        </span>
        <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto">
          <button
            onClick={handleDownload}
            className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label="Download image"
            title="Download"
          >
            <Download className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          {/* Lightbox.Close is already a button - just pass className and icon */}
          <Lightbox.Close
            className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label="Close lightbox"
            title="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </Lightbox.Close>
        </div>
      </Lightbox.Header>

      {/* Viewport - flex-1 takes remaining space */}
      <Lightbox.Viewport
        className="relative z-10 flex flex-1 pointer-events-none"
        $renderItem={renderItem}
      />
    </Lightbox.Root>
  );
}

/**
 * Single image lightbox - wraps an image that opens in lightbox on click
 */
export function LightboxWithImage({
  small,
  large,
  alt = "",
  className,
  fileName,
  hideDownload = false,
  hideZoom = false,
}) {
  const src = large || small;
  const lb = useLightbox({
    LightboxComponent: ImageLightbox,
  });

  const item = {
    kind: "image",
    url: src,
    alt,
    fileName,
  };

  return (
    <>
      <img
        src={small}
        alt={alt}
        className={className}
        style={{ cursor: "pointer", maxWidth: "100%", maxHeight: "100%" }}
        onClick={lb.getOnClick(item)}
      />
      <lb.LightboxView />
    </>
  );
}

/**
 * Multiple images lightbox - for galleries
 */
export function LightboxGalleryWithImages({
  images = [],
  alt = "",
  className,
  hideDownload = false,
  hideZoom = false,
}) {
  const lb = useLightbox({
    LightboxComponent: ImageLightbox,
  });

  const items = images.map((img) => ({
    kind: "image",
    url: img.large || img.small,
    alt: img.alt || alt,
    fileName: img.fileName,
  }));

  const firstImage = images[0];

  if (!firstImage) return null;

  return (
    <>
      <img
        src={firstImage.small}
        alt={firstImage.alt || alt}
        className={className}
        style={{ cursor: "pointer", maxWidth: "100%", maxHeight: "100%" }}
        onClick={lb.getOnClick(items[0])}
      />
      <lb.LightboxView />
    </>
  );
}

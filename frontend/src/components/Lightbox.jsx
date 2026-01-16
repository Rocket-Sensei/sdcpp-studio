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

/**
 * Custom Lightbox UI Component
 */
function ImageLightbox({ items, defaultIndex }) {
  const lbContext = useLightboxState();
  const currentItem = items[lbContext.currentIndex];

  const handleDownload = (e) => {
    const url = currentItem.url;
    const fileName = currentItem.fileName || url.split("/").slice(-1)[1];

    const createAnchor = (_href, target = "") => {
      const tmpAnchor = document.createElement("a");
      tmpAnchor.setAttribute("download", fileName);
      tmpAnchor.setAttribute("href", _href);
      tmpAnchor.setAttribute("target", target);
      return tmpAnchor;
    };

    const clickAnchor = (tmpAnchor) => {
      document.body.appendChild(tmpAnchor);
      tmpAnchor.click();
      document.body.removeChild(tmpAnchor);
    };

    const isSameOrigin =
      !url.includes("http") || document.location.hostname === new URL(url).hostname;

    if (!isSameOrigin) {
      clickAnchor(createAnchor(url));
      return;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          clickAnchor(createAnchor(url, "_blank"));
        }
        return res.blob();
      })
      .then((blob) => {
        clickAnchor(createAnchor(URL.createObjectURL(blob), "_blank"));
      })
      .catch((err) => {
        console.error(err);
        console.error("Failed to download image from " + url);
        clickAnchor(createAnchor(url, "_blank"));
      });
  };

  const renderItem = (item, index) => {
    if (item.kind === "image") {
      return (
        <Lightbox.Item
          $index={index}
          className="flex items-center justify-center flex-1 p-5"
          data-lightbox-image-container="true"
        >
          <Lightbox.Pinchable onRequestClose={lbContext.close}>
            <img
              src={item.url}
              alt={item.alt}
              draggable={false}
              className="max-w-[98%] max-h-[98%] object-contain select-none"
            />
          </Lightbox.Pinchable>
        </Lightbox.Item>
      );
    }
    return null;
  };

  const handleBackdropClick = (e) => {
    // Close if click is directly on the backdrop (not on image or controls)
    // e.target is the clicked element, e.currentTarget is the Lightbox.Root
    if (e.target === e.currentTarget) {
      lbContext.close();
    }
  };

  return (
    <Lightbox.Root
      className="fixed inset-0 isolate flex flex-col bg-black/80 z-50"
      onClick={handleBackdropClick}
    >
      {/* Header */}
      <Lightbox.Header className="flex items-center justify-between w-full py-2 px-4 bg-black/70 text-white">
        <span className="text-sm truncate mr-4">{currentItem?.alt || ""}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label="Download"
          >
            <Download className="w-6 h-6" />
          </button>
          {/* Lightbox.Close is already a button - just pass className and icon */}
          <Lightbox.Close className="p-2 text-white hover:bg-white/10 rounded-md transition-colors">
            <X className="w-6 h-6" />
          </Lightbox.Close>
        </div>
      </Lightbox.Header>

      {/* Viewport */}
      <Lightbox.Viewport className="flex flex-1" $renderItem={renderItem} />
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

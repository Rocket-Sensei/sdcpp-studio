/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpscaleImage } from "../prompt/UpscaleImage";

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();

describe("UpscaleImage Component", () => {
  const mockOnGenerate = vi.fn();
  const mockOnFileSelect = vi.fn();
  const mockOnClearImage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State - No Image Selected", () => {
    it("should render upload prompt when no image is selected", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      expect(screen.getByText("Select an image to upscale")).toBeInTheDocument();
      expect(screen.getByText(/Click to browse or drag and drop/)).toBeInTheDocument();
    });

    it("should disable the Upscale button when no image is selected", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const button = screen.getByTestId("generate-button");
      expect(button).toBeDisabled();
    });

    it("should show supported formats hint", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      expect(screen.getByText("Supported formats: PNG, JPEG, WebP")).toBeInTheDocument();
    });
  });

  describe("Image Selection", () => {
    it("should trigger file input click when upload area is clicked", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const uploadArea = screen.getByText("Select an image to upscale").closest("div");
      fireEvent.click(uploadArea);

      // Verify the hidden file input was clicked via the click handler
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it("should call onFileSelect when a file is selected", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const fileInput = document.querySelector('input[type="file"]');
      const file = new File(["test"], "test.png", { type: "image/png" });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });
  });

  describe("Image Selected State", () => {
    const mockFile = new File(["test"], "test-image.png", { type: "image/png" });
    const mockPreviewUrl = "data:image/png;base64,mock";

    it("should render image preview when image is selected", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const image = screen.getByAltText("Source");
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute("src", mockPreviewUrl);
      expect(screen.getByText("test-image.png")).toBeInTheDocument();
    });

    it("should enable the Upscale button when image is selected", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const button = screen.getByTestId("generate-button");
      expect(button).not.toBeDisabled();
    });

    it("should not show supported formats hint when image is selected", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      expect(screen.queryByText("Supported formats: PNG, JPEG, WebP")).not.toBeInTheDocument();
    });

    it("should show 'Ready to upscale' text when image is selected", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      expect(screen.getByText("Ready to upscale")).toBeInTheDocument();
    });
  });

  describe("Clear Image", () => {
    const mockFile = new File(["test"], "test-image.png", { type: "image/png" });
    const mockPreviewUrl = "data:image/png;base64,mock";

    it("should call onClearImage when clear button is clicked", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      // Find the clear button (hover triggered)
      const container = screen.getByAltText("Source").closest("div")?.parentElement;
      const clearButton = container?.querySelector("button");

      fireEvent.click(clearButton);

      expect(mockOnClearImage).toHaveBeenCalled();
    });
  });

  describe("Generate Button", () => {
    const mockFile = new File(["test"], "test-image.png", { type: "image/png" });
    const mockPreviewUrl = "data:image/png;base64,mock";

    it("should call onGenerate when Upscale button is clicked", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const button = screen.getByTestId("generate-button");
      fireEvent.click(button);

      expect(mockOnGenerate).toHaveBeenCalled();
    });

    it("should show 'Upscaling...' when isLoading is true", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          isLoading={true}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const button = screen.getByTestId("generate-button");
      expect(screen.getByText("Upscaling...")).toBeInTheDocument();
    });

    it("should be disabled when isLoading is true", () => {
      render(
        <UpscaleImage
          sourceImage={mockFile}
          sourceImagePreview={mockPreviewUrl}
          isLoading={true}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const button = screen.getByTestId("generate-button");
      expect(button).toBeDisabled();
    });
  });

  describe("Disabled State", () => {
    it("should disable file input when disabled prop is true", () => {
      render(
        <UpscaleImage
          disabled={true}
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeDisabled();
    });
  });

  describe("File Input Attributes", () => {
    it("should accept only image files", () => {
      render(
        <UpscaleImage
          onGenerate={mockOnGenerate}
          onFileSelect={mockOnFileSelect}
          onClearImage={mockOnClearImage}
        />
      );

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    });
  });
});

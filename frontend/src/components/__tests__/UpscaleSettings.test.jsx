/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpscaleSettings } from "../settings/UpscaleSettings";

describe("UpscaleSettings Component", () => {
  const defaultProps = {
    upscaleFactor: 2,
    onUpscaleFactorChange: vi.fn(),
    upscaleResizeMode: 0,
    onUpscaleResizeModeChange: vi.fn(),
    upscaleTargetWidth: 1024,
    onUpscaleTargetWidthChange: vi.fn(),
    upscaleTargetHeight: 1024,
    onUpscaleTargetHeightChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Resize Mode Selection", () => {
    it("should render resize mode options", () => {
      render(<UpscaleSettings {...defaultProps} />);

      expect(screen.getByText("Resize Mode")).toBeInTheDocument();
      expect(screen.getByText("By Factor")).toBeInTheDocument();
      expect(screen.getByText("To Size")).toBeInTheDocument();
    });

    it("should call onUpscaleResizeModeChange when resize mode is clicked", () => {
      render(<UpscaleSettings {...defaultProps} />);

      const toSizeButton = screen.getByText("To Size").closest("button");
      fireEvent.click(toSizeButton);

      expect(defaultProps.onUpscaleResizeModeChange).toHaveBeenCalledWith(1);
    });
  });

  describe("Upscale Factor (By Factor Mode)", () => {
    it("should render upscale factor options when in by-factor mode", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={0} />);

      expect(screen.getByText("Upscale Factor: 2x")).toBeInTheDocument();
      expect(screen.getByText("2x")).toBeInTheDocument();
      expect(screen.getByText("4x")).toBeInTheDocument();
      expect(screen.getByText("8x")).toBeInTheDocument();
    });

    it("should highlight the selected upscale factor", () => {
      render(<UpscaleSettings {...defaultProps} upscaleFactor={4} />);

      expect(screen.getByText("Upscale Factor: 4x")).toBeInTheDocument();
    });

    it("should call onUpscaleFactorChange when factor is clicked", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={0} />);

      const factor4x = screen.getByText("4x").closest("button");
      fireEvent.click(factor4x);

      expect(defaultProps.onUpscaleFactorChange).toHaveBeenCalledWith(4);
    });

    it("should not show upscale factor options when in to-size mode", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={1} />);

      expect(screen.queryByText("Upscale Factor:")).not.toBeInTheDocument();
    });
  });

  describe("Target Size (To Size Mode)", () => {
    it("should render target width and height sliders when in to-size mode", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={1} />);

      expect(screen.getByText(/Target Width:/)).toBeInTheDocument();
      expect(screen.getByText(/Target Height:/)).toBeInTheDocument();

      // Verify sliders are rendered using role=slider
      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(2);
    });

    it("should display correct width value", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={1} upscaleTargetWidth={2048} />);

      expect(screen.getByText(/Target Width: 2048px/)).toBeInTheDocument();
    });

    it("should display correct height value", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={1} upscaleTargetHeight={1536} />);

      expect(screen.getByText(/Target Height: 1536px/)).toBeInTheDocument();
    });

    it("should not show target size sliders when in by-factor mode", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={0} />);

      expect(screen.queryByText(/Target Width:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Target Height:/)).not.toBeInTheDocument();
    });
  });

  describe("Active State Styling", () => {
    it("should apply active styling to selected resize mode", () => {
      render(<UpscaleSettings {...defaultProps} upscaleResizeMode={0} />);

      const byFactorButton = screen.getByText("By Factor").closest("button");
      expect(byFactorButton).toHaveClass("border-primary", "bg-primary/10");
    });

    it("should apply active styling to selected factor", () => {
      render(<UpscaleSettings {...defaultProps} upscaleFactor={4} upscaleResizeMode={0} />);

      const factor4x = screen.getByText("4x").closest("button");
      expect(factor4x).toHaveClass("border-primary", "bg-primary/10");
    });
  });
});

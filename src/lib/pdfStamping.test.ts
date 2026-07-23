import { describe, expect, it } from "vitest";
import {
  clampPosition,
  computeInitialSignatureSize,
  computeInitialStampSize,
  computePdfDrawRect,
} from "./pdfStamping";

describe("computeInitialStampSize", () => {
  it("sizes the stamp to 15% of the overlay width, preserving aspect ratio", () => {
    expect(computeInitialStampSize(300, 120, 1000)).toEqual({ w: 150, h: 60 });
  });
});

describe("computeInitialSignatureSize", () => {
  it("caps width at 35% of overlay width when height allows it", () => {
    // 500x180 image, overlay 1000x800 -> maxW=350, maxH=96
    // width-capped: w=350, h=126 -> exceeds maxH=96, so height-capped instead
    expect(computeInitialSignatureSize(500, 180, 1000, 800)).toEqual({
      w: 500 * (96 / 180),
      h: 96,
    });
  });

  it("caps by width when the image is wide and short enough to fit the height cap", () => {
    // 500x100 image, overlay 1000x800 -> maxW=350, maxH=96
    // width-capped: w=350, h=70 -> fits under maxH=96, so width cap wins
    expect(computeInitialSignatureSize(500, 100, 1000, 800)).toEqual({ w: 350, h: 70 });
  });
});

describe("clampPosition", () => {
  it("leaves position unchanged when fully inside the container", () => {
    expect(clampPosition(10, 10, 50, 50, 200, 200)).toEqual({ x: 10, y: 10 });
  });

  it("clamps negative positions to 0", () => {
    expect(clampPosition(-30, -5, 50, 50, 200, 200)).toEqual({ x: 0, y: 0 });
  });

  it("clamps positions that would push the item past the right/bottom edge", () => {
    expect(clampPosition(190, 190, 50, 50, 200, 200)).toEqual({ x: 150, y: 150 });
  });
});

describe("computePdfDrawRect", () => {
  it("scales x/width directly and flips the y axis (PDF origin is bottom-left)", () => {
    // overlay 1000x800 maps to a PDF page of 500x400 (half scale)
    // item at (100, 50) sized 200x100 in overlay space
    const result = computePdfDrawRect({ x: 100, y: 50, w: 200, h: 100 }, 1000, 800, 500, 400);

    expect(result.x).toBe(50); // 100 * 0.5
    expect(result.width).toBe(100); // 200 * 0.5
    expect(result.height).toBe(50); // 100 * 0.5
    // y = pageHeight - (item.y + item.h) * scaleY = 400 - (50 + 100) * 0.5 = 400 - 75 = 325
    expect(result.y).toBe(325);
  });
});

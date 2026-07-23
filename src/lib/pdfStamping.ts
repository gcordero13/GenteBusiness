export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeInitialStampSize(
  imgWidth: number,
  imgHeight: number,
  overlayWidth: number,
): { w: number; h: number } {
  const w = Math.round(overlayWidth * 0.15);
  const h = Math.round(imgHeight * (w / imgWidth));
  return { w, h };
}

export function computeInitialSignatureSize(
  imgWidth: number,
  imgHeight: number,
  overlayWidth: number,
  overlayHeight: number,
): { w: number; h: number } {
  const maxW = overlayWidth * 0.35;
  const maxH = overlayHeight * 0.12;
  let w = Math.min(imgWidth, maxW);
  let h = imgHeight * (w / imgWidth);
  if (h > maxH) {
    h = maxH;
    w = imgWidth * (h / imgHeight);
  }
  return { w, h };
}

export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(containerWidth - w, x)),
    y: Math.max(0, Math.min(containerHeight - h, y)),
  };
}

export function computePdfDrawRect(
  item: OverlayRect,
  overlayWidth: number,
  overlayHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scaleX = pageWidth / overlayWidth;
  const scaleY = pageHeight / overlayHeight;
  return {
    x: item.x * scaleX,
    y: pageHeight - (item.y + item.h) * scaleY,
    width: item.w * scaleX,
    height: item.h * scaleY,
  };
}

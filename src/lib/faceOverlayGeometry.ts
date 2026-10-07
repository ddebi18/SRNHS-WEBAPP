export interface VideoFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface OverlayBoxStyle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function mapVideoFaceBoxToViewport(
  box: VideoFaceBox,
  viewport: OverlayViewport,
  fit: 'cover' | 'contain',
  mirrorHorizontal = false
): OverlayBoxStyle | null {
  if (
    box.videoWidth <= 0 ||
    box.videoHeight <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }

  const scaleX = viewport.width / box.videoWidth;
  const scaleY = viewport.height / box.videoHeight;
  const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const renderedWidth = box.videoWidth * scale;
  const renderedHeight = box.videoHeight * scale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  const left = ((box.x * scale + offsetX) / viewport.width) * 100;
  const width = ((box.width * scale) / viewport.width) * 100;

  return {
    left: mirrorHorizontal ? 100 - left - width : left,
    top: ((box.y * scale + offsetY) / viewport.height) * 100,
    width,
    height: ((box.height * scale) / viewport.height) * 100,
  };
}

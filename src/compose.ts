import { EVENT } from './config';

/**
 * object-fit: cover と同じ切り抜き範囲を計算する。
 * プレビュー（CSS）と保存画像（Canvas）で同じ見え方にするための共通計算。
 */
function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

export interface ComposeOptions {
  /** プレビューと同じく左右反転して描く（決定事項: 見たまま保存） */
  mirror: boolean;
}

/** カメラ映像の現在フレームと衣装パネルを合成した Canvas を返す */
export function composeFrame(
  video: HTMLVideoElement,
  costume: HTMLImageElement,
  { mirror }: ComposeOptions,
): HTMLCanvasElement {
  const W = EVENT.outputWidth;
  const H = EVENT.outputHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const r = coverRect(video.videoWidth, video.videoHeight, W, H);
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, r.x, r.y, r.w, r.h);
  ctx.restore();

  ctx.drawImage(costume, 0, 0, W, H);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      EVENT.jpegQuality,
    );
  });
}

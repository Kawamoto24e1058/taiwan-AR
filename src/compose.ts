import { EVENT } from './config';
import { coverRect, STAGE_H, STAGE_W, type Transform } from './geometry';

export interface ComposeOptions {
  /** プレビューと同じく左右反転して描く（前面カメラのみ。決定事項: 見たまま保存） */
  mirror: boolean;
  /** 衣装レイヤーの配置 */
  transform: Transform;
}

/** カメラ映像の現在フレームと衣装レイヤーを合成した Canvas を返す */
export function composeFrame(
  video: HTMLVideoElement,
  costume: HTMLImageElement,
  { mirror, transform }: ComposeOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const r = coverRect(video.videoWidth, video.videoHeight);
  ctx.save();
  if (mirror) {
    ctx.translate(STAGE_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, r.x, r.y, r.w, r.h);
  ctx.restore();

  const { k, rot, tx, ty } = transform;
  ctx.setTransform(k * Math.cos(rot), k * Math.sin(rot), -k * Math.sin(rot), k * Math.cos(rot), tx, ty);
  ctx.drawImage(costume, 0, 0, STAGE_W, STAGE_H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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

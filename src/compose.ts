import { EVENT } from './config';
import { coverRect, STAGE_H, STAGE_W } from './geometry';
import { drawCostume, type Bone, type BoneTransforms } from './rig';

export interface ComposeOptions {
  /** プレビューと同じく左右反転して描く（前面カメラのみ。決定事項: 見たまま保存） */
  mirror: boolean;
  /** 衣装の部品ごとの配置 */
  bones: BoneTransforms;
}

/** カメラ映像の現在フレームと衣装レイヤーを合成した Canvas を返す */
export function composeFrame(
  video: HTMLVideoElement,
  parts: { bone: Bone; img: CanvasImageSource }[],
  { mirror, bones }: ComposeOptions,
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

  drawCostume(ctx, parts, bones, STAGE_W, STAGE_H);
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

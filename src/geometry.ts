import { EVENT } from './config';
import type { Costume } from './costumes';

export const STAGE_W = EVENT.outputWidth;
export const STAGE_H = EVENT.outputHeight;

/** 衣装レイヤーの配置: ステージ座標 = k * 衣装画像座標 + (tx, ty) */
export interface Transform {
  k: number;
  /** 回転（ラジアン）。ステージ座標 = R(rot)·k·p + t */
  rot: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Transform = { k: 1, rot: 0, tx: 0, ty: 0 };

/** 首の傾きを衣装にどれだけ反映するか（体ごと大きく傾くと不自然なので弱める） */
const TILT_FACTOR = 0.5;
const MAX_TILT = (20 * Math.PI) / 180;

/** 顔（ステージ座標） */
export interface StageFace {
  cx: number;
  cy: number;
  w: number;
  angle: number;
}

/** object-fit: cover と同じ切り抜き。プレビュー（CSS）と保存画像（Canvas）で共通 */
export function coverRect(srcW: number, srcH: number, dstW = STAGE_W, dstH = STAGE_H) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h, scale };
}

/** 映像の画素座標 → ステージ座標（左右反転表示を考慮） */
export function videoFaceToStage(
  face: { cx: number; cy: number; w: number; angle: number },
  videoW: number,
  videoH: number,
  mirror: boolean,
): StageFace {
  const r = coverRect(videoW, videoH);
  const cx = r.x + face.cx * r.scale;
  return {
    cx: mirror ? STAGE_W - cx : cx,
    cy: r.y + face.cy * r.scale,
    w: face.w * r.scale,
    angle: mirror ? -face.angle : face.angle,
  };
}

/** 顔が検出できたときの衣装の配置 */
export function trackedTransform(costume: Costume, face: StageFace): Transform | null {
  const a = costume.face;
  if (!a) return null;
  const fitScale = a.fitScale ?? 1.1;
  const offsetY = a.offsetY ?? 0;
  const k = (face.w * fitScale) / a.width;
  const rot = Math.max(-MAX_TILT, Math.min(MAX_TILT, face.angle * TILT_FACTOR));
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // 衣装の顔の基準点 A が、検出した顔の中心 F に来るように平行移動を決める
  const ax = k * (cos * a.cx - sin * a.cy);
  const ay = k * (sin * a.cx + cos * a.cy);
  return { k, rot, tx: face.cx - ax, ty: face.cy + offsetY * face.w - ay };
}

/** 顔が検出できない・追従が使えないときの既定配置（顔はめパネルとして使う） */
export function defaultTransform(costume: Costume, facing: 'user' | 'environment'): Transform {
  const a = costume.face;
  if (!a) return IDENTITY;
  // 自撮りは顔が大きく映るので穴を大きめに、背面カメラは全身が入る大きさに
  const targetW = facing === 'user' ? 300 : 170;
  const k = targetW / a.width;
  return { k, rot: 0, tx: STAGE_W / 2 - k * a.cx, ty: (facing === 'user' ? 560 : 360) - k * a.cy };
}

export function lerpTransform(a: Transform, b: Transform, t: number): Transform {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return { k: mix(a.k, b.k), rot: mix(a.rot, b.rot), tx: mix(a.tx, b.tx), ty: mix(a.ty, b.ty) };
}

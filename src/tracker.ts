import type { FaceDetector } from '@mediapipe/tasks-vision';

/**
 * 顔検出（MediaPipe Face Detector, 近距離モデル）。映像は端末内でのみ処理する。
 *
 * 近距離モデルは画像全体を128pxに縮めて処理するため、背面カメラで全身を写すと顔が小さすぎて
 * 目の位置がずれる。そこで (1) 全体から顔のおおよその位置を出し、(2) その周りを切り出して
 * 拡大し、もう一度検出して位置・大きさ・傾きを精密化する。前フレームの位置も (2) に使う。
 */
let detector: FaceDetector | null = null;
let refiner: FaceDetector | null = null;
const cropCanvas = document.createElement('canvas');
const CROP_SIZE = 256;
cropCanvas.width = cropCanvas.height = CROP_SIZE;
const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: false });
let loading: Promise<boolean> | null = null;
let lastVideoTime = -1;
let lastResult: VideoFace | null = null;

/** 映像の画素座標での顔。w は推定の顔の横幅、angle は首の傾き（ラジアン） */
export interface VideoFace {
  cx: number;
  cy: number;
  w: number;
  angle: number;
}

/** 顔の横幅 ≒ 両目の間隔 × この値（一般的な顔の比率からの近似。実機で調整） */
const FACE_WIDTH_PER_EYE_DISTANCE = 2.3;

/** 初回のみ WASM とモデルを読み込む（約3MB）。失敗時は false（手動の顔はめパネルにフォールバック） */
export function initTracker(): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const base = import.meta.env.BASE_URL;
        const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
        const create = (delegate: 'GPU' | 'CPU', runningMode: 'VIDEO' | 'IMAGE') =>
          FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite`, delegate },
            runningMode,
            minDetectionConfidence: 0.5,
          });
        detector = await create('GPU', 'VIDEO').catch(() => create('CPU', 'VIDEO'));
        refiner = await create('GPU', 'IMAGE').catch(() => create('CPU', 'IMAGE')).catch(() => null);
        return true;
      } catch (e) {
        console.warn('face tracker unavailable', e);
        return false;
      }
    })();
  }
  return loading;
}

export function isTrackerReady(): boolean {
  return detector !== null;
}

type Detection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  keypoints: { x: number; y: number }[];
};

/** 検出結果1件を、画素座標の顔に変換する（sx,sy,size: 入力画像が映像のどこを切り出したものか） */
function toFace(d: Detection, sx: number, sy: number, sw: number, sh: number, boxScale: number): VideoFace | null {
  const kp = d.keypoints; // 0:右目 1:左目 2:鼻 3:口 4:右耳 5:左耳（正規化座標）
  if (kp && kp.length >= 4) {
    const [re, le, , mouth] = kp;
    const px = (p: { x: number }) => sx + p.x * sw;
    const py = (p: { y: number }) => sy + p.y * sh;
    const dx = px(le) - px(re);
    const dy = py(le) - py(re);
    return {
      cx: ((px(re) + px(le)) / 2 + px(mouth)) / 2,
      cy: ((py(re) + py(le)) / 2 + py(mouth)) / 2,
      w: Math.hypot(dx, dy) * FACE_WIDTH_PER_EYE_DISTANCE,
      angle: Math.atan2(dy, dx),
    };
  }
  const b = d.boundingBox;
  if (!b) return null;
  return { cx: sx + (b.originX + b.width / 2) * boxScale, cy: sy + (b.originY + b.height / 2) * boxScale, w: b.width * boxScale, angle: 0 };
}

function largest(dets: Detection[], map: (d: Detection) => VideoFace | null): VideoFace | null {
  let best: VideoFace | null = null;
  for (const d of dets) {
    const f = map(d);
    if (f && (!best || f.w > best.w)) best = f;
  }
  return best;
}

/** 顔の周りを切り出して拡大し、再検出する */
function refine(video: HTMLVideoElement, rough: VideoFace): VideoFace | null {
  if (!refiner || !cropCtx) return null;
  const side = Math.max(48, rough.w * 2.6);
  const sx = rough.cx - side / 2;
  const sy = rough.cy - side / 2;
  cropCtx.fillStyle = '#000';
  cropCtx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
  cropCtx.drawImage(video, sx, sy, side, side, 0, 0, CROP_SIZE, CROP_SIZE);
  const { detections } = refiner.detect(cropCanvas);
  // 切り出しの中心に最も近い顔を採用する
  let best: VideoFace | null = null;
  let bestDist = Infinity;
  for (const d of detections as Detection[]) {
    const f = toFace(d, sx, sy, side, side, side / CROP_SIZE);
    if (!f) continue;
    const dist = Math.hypot(f.cx - rough.cx, f.cy - rough.cy);
    if (dist < bestDist) {
      best = f;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 映像の現在フレームから、いちばん大きい顔を返す（映像の画素座標）。
 * 大きさと傾きは顔の枠ではなく目の位置から求める（枠は顔が小さいと実際より大きく出るため）。
 */
export function detectFace(video: HTMLVideoElement): VideoFace | null {
  if (!detector || video.readyState < 2) return null;
  if (video.currentTime === lastVideoTime) return lastResult;
  lastVideoTime = video.currentTime;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const { detections } = detector.detectForVideo(video, performance.now());
  // 全体からの検出が無ければ、前フレームの位置の周りを探す（小さい顔向け）
  const rough = largest(detections as Detection[], (d) => toFace(d, 0, 0, vw, vh, 1)) ?? lastResult;
  const result = rough ? (refine(video, rough) ?? (detections.length ? rough : null)) : null;
  lastResult = result;
  return result;
}

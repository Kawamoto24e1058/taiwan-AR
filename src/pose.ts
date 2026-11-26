import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * 骨格検出（MediaPipe Pose Landmarker lite, 約5.8MB）。映像は端末内でのみ処理する。
 * 顔検出の準備ができた後に裏で読み込む。失敗した場合は顔追従だけで動く。
 */
let landmarker: PoseLandmarker | null = null;
let loading: Promise<boolean> | null = null;
let lastVideoTime = -1;
let lastResult: PoseLandmark[][] = [];
/** 骨格検出1回にかかる時間の平均（ms）と、何フレームに1回検出するか（重い端末では間引く） */
let avgMs = 0;
let frameCount = 0;
const TARGET_MS_PER_FRAME = 25;
const MAX_STRIDE = 4;

/** 正規化座標（0〜1）と、映っている確からしさ */
export interface PoseLandmark {
  x: number;
  y: number;
  visibility: number;
}

/** 使う関節の番号（MediaPipe Pose の定義） */
export const LM = {
  nose: 0,
  shoulderA: 11,
  shoulderB: 12,
  elbowA: 13,
  elbowB: 14,
  hipA: 23,
  hipB: 24,
  kneeA: 25,
  kneeB: 26,
  ankleA: 27,
  ankleB: 28,
} as const;

export function initPose(): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const base = import.meta.env.BASE_URL;
        const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
        const create = (delegate: 'GPU' | 'CPU') =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${base}models/pose_landmarker_lite.task`, delegate },
            runningMode: 'VIDEO',
            numPoses: 2, // 2人まで検出し、顔に近い方を使う
            minPoseDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        landmarker = await create('GPU').catch(() => create('CPU'));
        return true;
      } catch (e) {
        console.warn('pose tracker unavailable', e);
        return false;
      }
    })();
  }
  return loading;
}

/** 骨格検出1回の平均時間（デバッグ表示用） */
export function poseCostMs(): number {
  return avgMs;
}

export function isPoseReady(): boolean {
  return landmarker !== null;
}

/** 映像の現在フレームの骨格（人数分） */
export function detectPoses(video: HTMLVideoElement): PoseLandmark[][] {
  if (!landmarker || video.readyState < 2) return [];
  if (video.currentTime === lastVideoTime) return lastResult;
  lastVideoTime = video.currentTime;
  const stride = Math.min(MAX_STRIDE, Math.max(1, Math.ceil(avgMs / TARGET_MS_PER_FRAME)));
  if (frameCount++ % stride !== 0) return lastResult;
  const t0 = performance.now();
  const res = landmarker.detectForVideo(video, t0);
  const ms = performance.now() - t0;
  avgMs = avgMs === 0 ? ms : avgMs * 0.9 + ms * 0.1;
  lastResult = res.landmarks.map((pose) => pose.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })));
  return lastResult;
}

import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * 骨格検出（MediaPipe Pose Landmarker lite, 約5.8MB）。映像は端末内でのみ処理する。
 * 顔検出の準備ができた後に裏で読み込む。失敗した場合は顔追従だけで動く。
 */
let landmarker: PoseLandmarker | null = null;
let loading: Promise<boolean> | null = null;
let lastVideoTime = -1;
let lastResult: PoseLandmark[][] = [];

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

export function isPoseReady(): boolean {
  return landmarker !== null;
}

/** 映像の現在フレームの骨格（人数分） */
export function detectPoses(video: HTMLVideoElement): PoseLandmark[][] {
  if (!landmarker || video.readyState < 2) return [];
  if (video.currentTime === lastVideoTime) return lastResult;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, performance.now());
  lastResult = res.landmarks.map((pose) => pose.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })));
  return lastResult;
}

export type CameraErrorKind = 'denied' | 'unsupported' | 'other';
export type Facing = 'user' | 'environment';

export class CameraError extends Error {
  constructor(public kind: CameraErrorKind, message: string) {
    super(message);
  }
}

let stream: MediaStream | null = null;

/** カメラを起動して video 要素に流す（user=前面, environment=背面） */
export async function startCamera(video: HTMLVideoElement, facing: Facing): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // HTTP配信、または一部のアプリ内ブラウザ
    throw new CameraError('unsupported', 'getUserMedia not available');
  }
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', String(e));
    }
    throw new CameraError('other', String(e));
  }
  video.srcObject = stream;
  // iOS Safari: playsinline + muted が無いと全画面再生・自動再生不可になる
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
  }
}

export function stopCamera(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

export function isCameraActive(): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
}

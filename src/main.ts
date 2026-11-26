import { applyTranslations, getLang, setLang, t, type Lang, type MsgKey } from './i18n';
import { loadCostumes, loadImage, type Costume } from './costumes';
import { CameraError, isCameraActive, startCamera, stopCamera, type Facing } from './camera';
import { canvasToBlob, composeFrame } from './compose';
import { canShareFile, downloadFile, shareFile, toFile } from './share';
import { isInAppBrowser, redirectLineToExternal } from './browser';
import { detectFace, initTracker, isTrackerReady } from './tracker';
import {
  defaultTransform,
  lerpTransform,
  STAGE_W,
  trackedTransform,
  videoFaceToStage,
  type Transform,
} from './geometry';

type Screen = 'top' | 'select' | 'camera' | 'camera-error' | 'result';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const stage = $<HTMLDivElement>('#stage');
const video = $<HTMLVideoElement>('#video');
const overlay = $<HTMLImageElement>('#costume-overlay');
const guide = $<SVGSVGElement>('#guide');
const guideEllipse = $<SVGEllipseElement>('#guide-ellipse');
const cameraStatus = $<HTMLParagraphElement>('#camera-status');
const cameraHint = $<HTMLParagraphElement>('#camera-hint');
const resultImage = $<HTMLImageElement>('#result-image');
const shareBtn = $<HTMLButtonElement>('#btn-share');

/** 顔を見失ってから「顔を映してください」を出すまでの時間 */
const LOST_FACE_MS = 800;
/** 追従の滑らかさ（0〜1、大きいほど機敏・小さいほど揺れにくい） */
const SMOOTHING = 0.35;

let costumes: Costume[] = [];
let selected: Costume | null = null;
let facing: Facing = 'user';
let current: Transform = { k: 1, rot: 0, tx: 0, ty: 0 };
let lastFaceAt = 0;
let loopId = 0;
let resultFile: File | null = null;
let resultUrl: string | null = null;
let currentScreen: Screen = 'top';

function show(screen: Screen): void {
  currentScreen = screen;
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
  });
  if (screen !== 'camera') {
    stopCamera();
    cancelAnimationFrame(loopId);
  }
  window.scrollTo(0, 0);
}

function setHint(key: MsgKey): void {
  if (cameraHint.dataset.i18n === key) return;
  cameraHint.dataset.i18n = key;
  cameraHint.textContent = t(key);
}

/* ---------- 言語 ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setLang(btn.dataset.lang as Lang);
    renderCostumeList();
  });
});

/* ---------- 画面遷移ボタン ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => show(btn.dataset.go as Screen));
});

$('#btn-start').addEventListener('click', () => {
  // 顔検出の準備（約3MB）はここで裏読みを始めておく
  void initTracker();
  show('select');
});

/* ---------- 衣装選択 ---------- */
function renderCostumeList(): void {
  const list = $<HTMLUListElement>('#costume-list');
  list.replaceChildren(
    ...costumes.map((c) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'costume-item';
      const img = document.createElement('img');
      img.src = `${import.meta.env.BASE_URL}${c.image}`;
      img.alt = '';
      img.loading = 'lazy';
      const name = document.createElement('span');
      name.textContent = c.name[getLang()];
      btn.append(img, name);
      if (c.description) {
        const desc = document.createElement('small');
        desc.textContent = c.description[getLang()];
        btn.append(desc);
      }
      btn.addEventListener('click', () => openCamera(c));
      li.append(btn);
      return li;
    }),
  );
}

/* ---------- 衣装レイヤーの描画 ---------- */
function applyTransform(tr: Transform): void {
  const d = stage.clientWidth / STAGE_W; // ステージ座標 → 表示px
  overlay.style.transform = `translate(${tr.tx * d}px, ${tr.ty * d}px) rotate(${tr.rot}rad) scale(${tr.k})`;
  if (selected) {
    const h = selected.hole;
    guideEllipse.setAttribute('cx', String(tr.k * h.cx + tr.tx));
    guideEllipse.setAttribute('cy', String(tr.k * h.cy + tr.ty));
    guideEllipse.setAttribute('rx', String(tr.k * h.rx));
    guideEllipse.setAttribute('ry', String(tr.k * h.ry));
  }
}

function tick(): void {
  loopId = requestAnimationFrame(tick);
  if (!selected || !video.videoWidth) return;

  if (!selected.face || !isTrackerReady()) {
    // 顔はめパネル（手動）モード
    guide.style.display = '';
    setHint(selected.face ? 'manualMode' : 'alignHint');
    return;
  }

  const detected = detectFace(video);
  const now = performance.now();
  if (detected) {
    const face = videoFaceToStage(detected, video.videoWidth, video.videoHeight, facing === 'user');
    const target = trackedTransform(selected, face);
    if (target) {
      // 見失った直後は飛びつかせ、追従中は滑らかに
      current = now - lastFaceAt > LOST_FACE_MS ? target : lerpTransform(current, target, SMOOTHING);
      applyTransform(current);
    }
    lastFaceAt = now;
    guide.style.display = 'none';
    setHint('alignHint');
  } else if (now - lastFaceAt > LOST_FACE_MS) {
    setHint('faceSearching');
  }
}

/* ---------- カメラ ---------- */
async function openCamera(costume: Costume): Promise<void> {
  selected = costume;
  overlay.src = `${import.meta.env.BASE_URL}${costume.image}`;
  stage.classList.toggle('mirror', facing === 'user');
  cameraStatus.hidden = false;
  show('camera');
  current = defaultTransform(costume, facing);
  lastFaceAt = 0;
  applyTransform(current);
  setHint(costume.face ? 'preparing' : 'alignHint');
  try {
    await startCamera(video, facing);
    cameraStatus.hidden = true;
    if (costume.face) await initTracker();
    cancelAnimationFrame(loopId);
    tick();
  } catch (e) {
    const kind = e instanceof CameraError ? e.kind : 'other';
    $('#camera-error-message').textContent = t(kind === 'denied' ? 'cameraErrorDenied' : 'cameraErrorOther');
    show('camera-error');
  }
}

$('#btn-retry').addEventListener('click', () => selected && openCamera(selected));

$('#btn-flip').addEventListener('click', () => {
  facing = facing === 'user' ? 'environment' : 'user';
  if (selected) void openCamera(selected);
});

// 画面回転・サイズ変更時に表示pxを再計算
window.addEventListener('resize', () => currentScreen === 'camera' && applyTransform(current));

// iOS はタブ復帰時に video が停止していることがある
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || currentScreen !== 'camera' || !selected) return;
  if (isCameraActive()) void video.play().catch(() => undefined);
  else void openCamera(selected);
});

$('#btn-shoot').addEventListener('click', async () => {
  if (!selected || !video.videoWidth) return;
  const costumeImg = await loadImage(selected.image);
  const canvas = composeFrame(video, costumeImg, { mirror: facing === 'user', transform: current });
  const blob = await canvasToBlob(canvas);
  resultFile = toFile(blob);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(blob);
  resultImage.src = resultUrl;
  shareBtn.hidden = !canShareFile(resultFile);
  show('result');
});

/* ---------- 結果 ---------- */
$('#btn-share').addEventListener('click', async () => {
  if (!resultFile) return;
  try {
    await shareFile(resultFile);
  } catch {
    downloadFile(resultFile);
  }
});

$('#btn-save').addEventListener('click', async () => {
  if (!resultFile) return;
  // iOS は <a download> だと新規タブ表示になるため、共有シート（「画像を保存」がある）を優先
  if (canShareFile(resultFile) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await shareFile(resultFile);
      return;
    } catch {
      /* fallthrough */
    }
  }
  downloadFile(resultFile);
});

$('#btn-retake').addEventListener('click', () => selected && openCamera(selected));

/* ---------- 初期化 ---------- */
async function init(): Promise<void> {
  if (redirectLineToExternal()) return;
  $<HTMLElement>('#in-app-warning').hidden = !isInAppBrowser;
  applyTranslations();
  // 先にトップを表示する（衣装データの読み込みを待ってから表示すると、
  // 回線が遅いときに「はじめる」を押した後でトップへ戻されてしまう）
  show('top');
  try {
    costumes = await loadCostumes();
    renderCostumeList();
    // 衣装画像を先読みしておく（会場Wi-Fiが混んでいても撮影時に待たせないため）
    costumes.forEach((c) => void loadImage(c.image).catch(() => undefined));
  } catch (e) {
    console.error(e);
  }
}

void init();

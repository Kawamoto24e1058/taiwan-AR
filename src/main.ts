import { applyTranslations, getLang, setLang, t, type Lang, type MsgKey } from './i18n';
import { loadCostumes, loadImage, type Costume } from './costumes';
import { CameraError, isCameraActive, startCamera, stopCamera, type Facing } from './camera';
import { canvasToBlob, composeFrame } from './compose';
import { canShareFile, downloadFile, shareFile, toFile } from './share';
import { isInAppBrowser, redirectLineToExternal } from './browser';
import { detectFace, initTracker, isTrackerReady } from './tracker';
import { defaultTransform, STAGE_H, STAGE_W, trackedTransform, videoFaceToStage } from './geometry';
import { detectPoses, initPose, isPoseReady } from './pose';
import { drawCostume, lerpBones, pickPose, rigTransforms, uniform, type Bone, type BoneTransforms } from './rig';

type Screen = 'top' | 'select' | 'camera' | 'camera-error' | 'result';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const stage = $<HTMLDivElement>('#stage');
const video = $<HTMLVideoElement>('#video');
const overlay = $<HTMLCanvasElement>('#costume-canvas');
const overlayCtx = overlay.getContext('2d')!;
const guide = $<SVGSVGElement>('#guide');
const guideEllipse = $<SVGEllipseElement>('#guide-ellipse');
const cameraStatus = $<HTMLParagraphElement>('#camera-status');
const cameraHint = $<HTMLParagraphElement>('#camera-hint');
const resultImage = $<HTMLImageElement>('#result-image');
const shareBtn = $<HTMLButtonElement>('#btn-share');
const shootBtn = $<HTMLButtonElement>('#btn-shoot');

/** 顔を見失ってから「顔を映してください」を出すまでの時間 */
const LOST_FACE_MS = 800;
/** 追従の滑らかさ（0〜1、大きいほど機敏・小さいほど揺れにくい） */
const SMOOTHING = 0.35;

let costumes: Costume[] = [];
let selected: Costume | null = null;
let facing: Facing = 'user';
let current: BoneTransforms = uniform({ k: 1, rot: 0, tx: 0, ty: 0 });
/** ?debug 付きで開くと、検出した関節を描く（実機での調整用） */
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugPose: ((i: number) => { x: number; y: number } | null) | null = null;
/** 選択中の衣装の部品画像（下から描く順） */
let parts: { bone: Bone; img: HTMLImageElement }[] = [];
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

/** 衣装を表示するか（顔を検出している間だけ表示する） */
function setCostumeVisible(visible: boolean): void {
  overlay.classList.toggle('hidden', !visible);
  shootBtn.disabled = !visible;
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
/** 衣装の部品画像を読み込む（骨格追従しない衣装は1枚を頭に付ける） */
async function loadParts(costume: Costume): Promise<{ bone: Bone; img: HTMLImageElement }[]> {
  const defs = costume.rig?.parts ?? [{ bone: 'head' as Bone, image: costume.image }];
  return Promise.all(defs.map(async (d) => ({ bone: d.bone, img: await loadImage(d.image) })));
}

function drawDebug(get: (i: number) => { x: number; y: number } | null): void {
  const bones: [number, number][] = [[11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
  overlayCtx.lineWidth = 6;
  overlayCtx.strokeStyle = '#00e5ff';
  for (const [a, b] of bones) {
    const p = get(a);
    const q = get(b);
    if (!p || !q) continue;
    overlayCtx.beginPath();
    overlayCtx.moveTo(p.x, p.y);
    overlayCtx.lineTo(q.x, q.y);
    overlayCtx.stroke();
  }
  overlayCtx.fillStyle = '#ff1744';
  for (let i = 0; i <= 28; i++) {
    const p = get(i);
    if (p) overlayCtx.fillRect(p.x - 7, p.y - 7, 14, 14);
  }
}

function applyTransform(bones: BoneTransforms): void {
  overlayCtx.clearRect(0, 0, STAGE_W, STAGE_H);
  drawCostume(overlayCtx, parts, bones, STAGE_W, STAGE_H);
  if (DEBUG && debugPose) drawDebug(debugPose);
  const tr = bones.head;
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
    // 顔検出が使えない端末・衣装は、顔はめパネル（手動）として常に表示する
    guide.style.display = '';
    setCostumeVisible(true);
    setHint(selected.face ? 'manualMode' : 'alignHint');
    return;
  }
  guide.style.display = 'none';

  const detected = detectFace(video);
  const now = performance.now();
  if (detected) {
    const face = videoFaceToStage(detected, video.videoWidth, video.videoHeight, facing === 'user');
    const head = trackedTransform(selected, face);
    if (head) {
      // 骨格が使えれば、顔に最も近い人の骨格に合わせて部品ごとに動かす
      const pose = selected.rig && isPoseReady()
        ? pickPose(detectPoses(video), face, video.videoWidth, video.videoHeight, facing === 'user')
        : null;
      debugPose = pose;
      if (DEBUG) (window as unknown as { __debug: unknown }).__debug = { pose, current };
      const target = rigTransforms(selected, head, pose);
      // 見失った直後は飛びつかせ、追従中は滑らかに
      current = now - lastFaceAt > LOST_FACE_MS ? target : lerpBones(current, target, SMOOTHING);
      applyTransform(current);
    }
    lastFaceAt = now;
    setCostumeVisible(true);
    setHint('alignHint');
  } else if (now - lastFaceAt > LOST_FACE_MS) {
    // 人が映っていない間は衣装を消し、撮影もできないようにする
    setCostumeVisible(false);
    setHint('faceSearching');
  }
}

/* ---------- カメラ ---------- */
async function openCamera(costume: Costume): Promise<void> {
  selected = costume;
  parts = [];
  overlayCtx.clearRect(0, 0, STAGE_W, STAGE_H);
  const partsReady = loadParts(costume).then((p) => {
    if (selected === costume) parts = p;
  });
  stage.classList.toggle('mirror', facing === 'user');
  cameraStatus.hidden = false;
  show('camera');
  current = uniform(defaultTransform(costume, facing));
  lastFaceAt = 0;
  // 顔追従する衣装は、顔を検出するまで表示しない
  guide.style.display = costume.face ? 'none' : '';
  setCostumeVisible(!costume.face);
  setHint(costume.face ? 'preparing' : 'alignHint');
  try {
    await startCamera(video, facing);
    cameraStatus.hidden = true;
    await partsReady;
    applyTransform(current);
    if (costume.face) await initTracker();
    // 骨格検出（約5.8MB）は裏で読み込み、準備ができ次第使う
    if (costume.rig) void initPose();
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
  if (!selected || !video.videoWidth || shootBtn.disabled) return;
  const canvas = composeFrame(video, parts, { mirror: facing === 'user', bones: current });
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
  await loadCostumeData();
}

/** 衣装データを読み込む。会場Wi-Fiの一時的な失敗に備えて再試行し、だめなら再読み込みボタンを出す */
async function loadCostumeData(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      costumes = await loadCostumes();
      renderCostumeList();
      // 衣装画像を先読みしておく（会場Wi-Fiが混んでいても撮影時に待たせないため）
      costumes.forEach((c) => void loadImage(c.image).catch(() => undefined));
      return;
    } catch (e) {
      console.error(e);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  const list = $<HTMLUListElement>('#costume-list');
  const li = document.createElement('li');
  li.className = 'load-error';
  const msg = document.createElement('p');
  msg.dataset.i18n = 'loadError';
  msg.textContent = t('loadError');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary';
  btn.dataset.i18n = 'reload';
  btn.textContent = t('reload');
  btn.addEventListener('click', () => location.reload());
  li.append(msg, btn);
  list.replaceChildren(li);
}

void init();

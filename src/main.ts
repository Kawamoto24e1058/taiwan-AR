import { applyTranslations, getLang, setLang, t, type Lang } from './i18n';
import { loadCostumes, loadImage, type Costume } from './costumes';
import { CameraError, isCameraActive, startCamera, stopCamera } from './camera';
import { canvasToBlob, composeFrame } from './compose';
import { canShareFile, downloadFile, shareFile, toFile } from './share';
import { isInAppBrowser, redirectLineToExternal } from './browser';

type Screen = 'top' | 'select' | 'camera' | 'camera-error' | 'result';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const video = $<HTMLVideoElement>('#video');
const overlay = $<HTMLImageElement>('#costume-overlay');
const guideEllipse = $<SVGEllipseElement & HTMLElement>('#guide-ellipse');
const cameraStatus = $<HTMLParagraphElement>('#camera-status');
const resultImage = $<HTMLImageElement>('#result-image');
const shareBtn = $<HTMLButtonElement>('#btn-share');

let costumes: Costume[] = [];
let selected: Costume | null = null;
let resultFile: File | null = null;
let resultUrl: string | null = null;
let currentScreen: Screen = 'top';

function show(screen: Screen): void {
  currentScreen = screen;
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
  });
  if (screen !== 'camera') stopCamera();
  window.scrollTo(0, 0);
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

$('#btn-start').addEventListener('click', () => show('select'));

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

/* ---------- カメラ ---------- */
async function openCamera(costume: Costume): Promise<void> {
  selected = costume;
  overlay.src = `${import.meta.env.BASE_URL}${costume.image}`;
  const { cx, cy, rx, ry } = costume.hole;
  guideEllipse.setAttribute('cx', String(cx));
  guideEllipse.setAttribute('cy', String(cy));
  guideEllipse.setAttribute('rx', String(rx));
  guideEllipse.setAttribute('ry', String(ry));
  cameraStatus.hidden = false;
  show('camera');
  try {
    await startCamera(video);
    cameraStatus.hidden = true;
  } catch (e) {
    const kind = e instanceof CameraError ? e.kind : 'other';
    $('#camera-error-message').textContent = t(kind === 'denied' ? 'cameraErrorDenied' : 'cameraErrorOther');
    show('camera-error');
  }
}

$('#btn-retry').addEventListener('click', () => selected && openCamera(selected));

// iOS はタブ復帰時に video が停止していることがある
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || currentScreen !== 'camera' || !selected) return;
  if (isCameraActive()) void video.play().catch(() => undefined);
  else void openCamera(selected);
});

$('#btn-shoot').addEventListener('click', async () => {
  if (!selected || !video.videoWidth) return;
  const costumeImg = await loadImage(selected.image);
  const canvas = composeFrame(video, costumeImg, { mirror: true });
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
  $('#in-app-warning').hidden = !isInAppBrowser;
  applyTranslations();
  try {
    costumes = await loadCostumes();
    renderCostumeList();
    // 衣装画像を先読みしておく（会場Wi-Fiが混んでいても撮影時に待たせないため）
    costumes.forEach((c) => void loadImage(c.image).catch(() => undefined));
  } catch (e) {
    console.error(e);
  }
  show('top');
}

void init();

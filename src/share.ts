import { EVENT } from './config';
import { t } from './i18n';

function fileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `costume-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

export function toFile(blob: Blob): File {
  return new File([blob], fileName(), { type: 'image/jpeg' });
}

/** Web Share API でファイル共有できるか */
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

/** 端末の共有メニューを開く。ユーザーがキャンセルした場合は false */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({
      files: [file],
      text: `${t('shareText')} ${EVENT.hashtags.join(' ')}`,
    });
    return true;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    throw e;
  }
}

/** ダウンロードリンクで保存（Web Share API 非対応端末向け） */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

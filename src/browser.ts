/** アプリ内ブラウザの判定と対策 */
const UA = navigator.userAgent;

export const isLineInApp = /\bLine\//i.test(UA);
export const isInAppBrowser =
  isLineInApp || /Instagram|FBAN|FBAV|Twitter|TikTok|KAKAOTALK|MicroMessenger/i.test(UA);

/**
 * LINE のアプリ内ブラウザは openExternalBrowser=1 を付けると外部ブラウザで開き直せる。
 * 戻り値 true のときはリダイレクト中。
 */
export function redirectLineToExternal(): boolean {
  if (!isLineInApp) return false;
  const url = new URL(location.href);
  if (url.searchParams.get('openExternalBrowser') === '1') return false;
  url.searchParams.set('openExternalBrowser', '1');
  location.replace(url.toString());
  return true;
}

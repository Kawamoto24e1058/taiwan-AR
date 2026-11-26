import ja from './locales/ja.json';
import zhHant from './locales/zh-Hant.json';

export type Lang = 'ja' | 'zh-Hant';
type Dict = typeof ja;
export type MsgKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { ja, 'zh-Hant': zhHant };
const STORAGE_KEY = 'lang';

let current: Lang = detectLang();

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'zh-Hant') return saved;
  } catch {
    /* プライベートモード等で localStorage が使えない場合は無視 */
  }
  return /^zh/i.test(navigator.language) ? 'zh-Hant' : 'ja';
}

export function getLang(): Lang {
  return current;
}

export function t(key: MsgKey): string {
  return DICTS[current][key] ?? DICTS.ja[key];
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  applyTranslations();
}

/** data-i18n 属性を持つ要素の文言を差し替える */
export function applyTranslations(root: ParentNode = document): void {
  document.documentElement.lang = current;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as MsgKey);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
  });
}

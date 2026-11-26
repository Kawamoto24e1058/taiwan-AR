import type { Lang } from './i18n';

export interface Hole {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 衣装画像上の顔の位置（顔追従用）。width は顔の横幅(px) */
export interface FaceAnchor {
  cx: number;
  cy: number;
  width: number;
  /** 検出した顔の幅に対する倍率（既定 1.1） */
  fitScale?: number;
  /** 顔の幅に対する上下のずらし量（既定 0） */
  offsetY?: number;
}

/** 骨格追従用の部品構成。関節の座標は衣装画像（1080x1620）上の位置 */
export interface CostumeRig {
  joints: Record<'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR' | 'kneeL' | 'kneeR' | 'ankleL' | 'ankleR', [number, number]>;
  /** 襟の上端（顔の穴より上に来ないようにする基準。省略時は顔の穴の下端） */
  neck?: [number, number];
  /** 肩幅に対する衣装の大きさの倍率（既定 1） */
  bodyFit?: number;
  /** 描く順（下から）。bone は head / torso / armL / armR / legL / legR */
  parts: { bone: 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR'; image: string }[];
}

export interface Costume {
  id: string;
  image: string;
  name: Record<Lang, string>;
  description: Record<Lang, string> | null;
  /** 手動（顔はめパネル）モードで表示するガイドの楕円 */
  hole: Hole;
  /** 指定があれば顔追従する */
  face?: FaceAnchor;
  /** 指定があれば、骨格に合わせて部品ごとに動かす */
  rig?: CostumeRig;
  published: boolean;
}

/** public/costumes/costumes.json を読み込む（ビルドし直さずに衣装を差し替え・追加できる） */
export async function loadCostumes(): Promise<Costume[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}costumes/costumes.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`costumes.json: ${res.status}`);
  const data = (await res.json()) as { costumes: Costume[] };
  return data.costumes.filter((c) => c.published);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image load failed: ${src}`));
      img.src = `${import.meta.env.BASE_URL}${src}`;
    });
    imageCache.set(src, p);
  }
  return p;
}

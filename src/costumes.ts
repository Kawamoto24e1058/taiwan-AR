import type { Lang } from './i18n';

export interface Hole {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface Costume {
  id: string;
  image: string;
  name: Record<Lang, string>;
  description: Record<Lang, string> | null;
  hole: Hole;
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

import type { Costume } from './costumes';
import { coverRect, STAGE_W, type StageFace, type Transform } from './geometry';
import { LM, type PoseLandmark } from './pose';

export type Bone = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';
export type BoneTransforms = Record<Bone, Transform>;

type Pt = { x: number; y: number };

/** 関節をこの確からしさ以上で、画面内に映っているときだけ使う */
const MIN_VISIBILITY = 0.5;
/** 肩幅から求めた体の大きさが、顔から求めた大きさに対してこの範囲を超えないようにする（横向き対策） */
const BODY_SCALE_CLAMP = [0.75, 1.4] as const;

/** 衣装画像上の点 P が、画面上の点 A に来るように、倍率 k・回転 rot で配置する */
function pinned(P: Pt, A: Pt, k: number, rot: number): Transform {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { k, rot, tx: A.x - k * (c * P.x - s * P.y), ty: A.y - k * (s * P.x + c * P.y) };
}

const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 全部品を同じ配置にする（骨格が使えないとき） */
export function uniform(t: Transform): BoneTransforms {
  return { head: t, torso: t, armL: t, armR: t, legL: t, legR: t };
}

/** 骨格（正規化座標）を画面（ステージ）座標に変換する */
function toStage(pose: PoseLandmark[], vw: number, vh: number, mirror: boolean) {
  const r = coverRect(vw, vh);
  return (i: number): Pt | null => {
    const p = pose[i];
    if (!p || p.visibility < MIN_VISIBILITY || p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null;
    const x = r.x + p.x * vw * r.scale;
    return { x: mirror ? STAGE_W - x : x, y: r.y + p.y * vh * r.scale };
  };
}

/** 顔に最も近い骨格を選ぶ（複数人が映っているとき、頭と体が別人にならないように） */
export function pickPose(
  poses: PoseLandmark[][],
  face: StageFace,
  vw: number,
  vh: number,
  mirror: boolean,
): ((i: number) => Pt | null) | null {
  let best: ((i: number) => Pt | null) | null = null;
  let bestD = face.w * 1.5;
  for (const pose of poses) {
    const get = toStage(pose, vw, vh, mirror);
    const nose = get(LM.nose);
    if (!nose) continue;
    const d = dist(nose, { x: face.cx, y: face.cy });
    if (d < bestD) {
      best = get;
      bestD = d;
    }
  }
  return best;
}

/**
 * 顔の配置（head）と骨格から、部品ごとの配置を求める。
 * 映っていない関節の部品は、上の階層（胴体、さらに頭）の配置に従う。
 */
export function rigTransforms(costume: Costume, head: Transform, get: ((i: number) => Pt | null) | null): BoneTransforms {
  const rig = costume.rig;
  const out = uniform(head);
  if (!rig || !get) return out;
  const j = rig.joints;

  // 胴体: 両肩。画面上で左にある肩を衣装の左（L）に対応させる
  const s1 = get(LM.shoulderA);
  const s2 = get(LM.shoulderB);
  if (!s1 || !s2) return out;
  const pairs = [
    { s: s1, e: get(LM.elbowA) },
    { s: s2, e: get(LM.elbowB) },
  ].sort((a, b) => a.s.x - b.s.x);
  const [L, R] = pairs;
  const cL = { x: j.shoulderL[0], y: j.shoulderL[1] };
  const cR = { x: j.shoulderR[0], y: j.shoulderR[1] };
  const raw = (dist(L.s, R.s) / dist(cL, cR)) * (rig.bodyFit ?? 1);
  const k = Math.min(head.k * BODY_SCALE_CLAMP[1], Math.max(head.k * BODY_SCALE_CLAMP[0], raw));
  const rot = angle(L.s, R.s) - angle(cL, cR);
  out.torso = pinned(mid(cL, cR), mid(L.s, R.s), k, rot);
  // 腕を上げると肩が上がり、襟があごにかぶるので、襟が顔の穴より上に来ないように下げる
  const apply = (t: Transform, x: number, y: number) => ({
    x: t.k * (Math.cos(t.rot) * x - Math.sin(t.rot) * y) + t.tx,
    y: t.k * (Math.sin(t.rot) * x + Math.cos(t.rot) * y) + t.ty,
  });
  const neck = rig.neck ?? [costume.hole.cx, costume.hole.cy + costume.hole.ry];
  const chin = apply(head, costume.hole.cx, costume.hole.cy + costume.hole.ry);
  const collar = apply(out.torso, neck[0], neck[1]);
  const shiftY = Math.max(0, chin.y - collar.y);
  out.torso = { ...out.torso, ty: out.torso.ty + shiftY };
  out.armL = out.armR = out.legL = out.legR = out.torso;

  // 袖: 肩を軸に、上腕（肩→ひじ）の向きに合わせて回転
  const arm = (side: typeof L, cS: number[], cE: number[]) => {
    if (!side.e) return out.torso;
    const P = { x: cS[0], y: cS[1] };
    const anchor = { x: side.s.x, y: side.s.y + shiftY };
    return pinned(P, anchor, k, angle(side.s, side.e) - angle(P, { x: cE[0], y: cE[1] }));
  };
  out.armL = arm(L, j.shoulderL, j.elbowL);
  out.armR = arm(R, j.shoulderR, j.elbowR);

  // 脚絆: ひざを軸に、すね（ひざ→足首）の向きに合わせて回転
  const legs = [
    { kn: get(LM.kneeA), an: get(LM.ankleA) },
    { kn: get(LM.kneeB), an: get(LM.ankleB) },
  ];
  if (legs.every((l) => l.kn && l.an)) {
    legs.sort((a, b) => a.kn!.x - b.kn!.x);
    const leg = (l: (typeof legs)[number], cK: number[], cA: number[]) => {
      const P = { x: cK[0], y: cK[1] };
      return pinned(P, l.kn!, k, angle(l.kn!, l.an!) - angle(P, { x: cA[0], y: cA[1] }));
    };
    out.legL = leg(legs[0], j.kneeL, j.ankleL);
    out.legR = leg(legs[1], j.kneeR, j.ankleR);
  }
  return out;
}

export function lerpBones(a: BoneTransforms, b: BoneTransforms, t: number): BoneTransforms {
  const mix = (x: Transform, y: Transform): Transform => ({
    k: x.k + (y.k - x.k) * t,
    // 角度は ±180° をまたぐときに遠回りしないよう、最短の向きで補間する
    rot: x.rot + Math.atan2(Math.sin(y.rot - x.rot), Math.cos(y.rot - x.rot)) * t,
    tx: x.tx + (y.tx - x.tx) * t,
    ty: x.ty + (y.ty - x.ty) * t,
  });
  return {
    head: mix(a.head, b.head),
    torso: mix(a.torso, b.torso),
    armL: mix(a.armL, b.armL),
    armR: mix(a.armR, b.armR),
    legL: mix(a.legL, b.legL),
    legR: mix(a.legR, b.legR),
  };
}

/** 部品を順に描く（下の部品から。袖は胴体の下、頭飾りは一番上） */
export function drawCostume(
  ctx: CanvasRenderingContext2D,
  parts: { bone: Bone; img: CanvasImageSource }[],
  bones: BoneTransforms,
  w: number,
  h: number,
): void {
  for (const p of parts) {
    const { k, rot, tx, ty } = bones[p.bone];
    ctx.setTransform(k * Math.cos(rot), k * Math.sin(rot), -k * Math.sin(rot), k * Math.cos(rot), tx, ty);
    ctx.drawImage(p.img, 0, 0, w, h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** イベント固有の設定。依頼元から確定情報をもらったら差し替える。 */
export const EVENT = {
  /** TODO: 依頼元に確認（イベント名） */
  name: 'EVENT NAME',
  /** TODO: 依頼元に確認（ハッシュタグ） */
  hashtags: ['#TaiwanCostumeTryOn'],
  /** 出力画像サイズ（2:3） */
  outputWidth: 1080,
  outputHeight: 1620,
  jpegQuality: 0.9,
} as const;

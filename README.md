# 台湾原住民族衣装 バーチャル試着（デジタル顔はめパネル）

QRコードから開くWebアプリ。カメラ映像の顔を検出し、衣装レイヤー（顔の穴が透過）を顔の位置・大きさ・傾きに合わせて重ね、撮影・保存・共有する。顔検出が使えない端末では、顔はめパネル（手動）として動く。

## 開発

```bash
npm install
npm run dev      # --host 付き。実機でカメラを使うには HTTPS が必要（下記）
npm run build    # 型チェック + dist/ 出力
```

実機確認: getUserMedia は HTTPS 必須。`npx cloudflared tunnel --url http://localhost:5173` などで HTTPS の URL を発行して、スマホで開く。

## 構成

| パス | 役割 |
|---|---|
| `public/costumes/costumes.json` | 衣装一覧。**衣装の追加はここに1件足すだけ**（ビルド不要）。`published:false` で非表示 |
| `public/costumes/*.webp` | 衣装パネル画像（1080×1620、顔の穴は透過） |
| `src/locales/*.json` | 日本語・繁体字の文言 |
| `src/config.ts` | イベント名・ハッシュタグ・出力サイズ |
| `src/compose.ts` | 撮影時の合成（プレビューの object-fit: cover と同じ切り抜き） |
| `src/tracker.ts` | 顔検出（MediaPipe Face Detector）。全体検出→顔周辺を拡大して再検出の2段階 |
| `src/geometry.ts` | 顔の位置 → 衣装の配置（拡大・回転・移動）の計算 |
| `public/models/` | 顔検出モデル（約230KB） |
| `public/mediapipe/` | MediaPipe の WASM（`npm run dev/build` 時に node_modules からコピー。git管理外） |
| `scripts/process_costume.py` | AI下絵（白背景）→ 背景と顔を透過した衣装レイヤーに変換 |
| `scripts/make_placeholder.py` | 開発用ダミー衣装の生成 |
| `assets-src/` | 衣装の元画像（下絵） |

## 衣装の追加手順

```bash
python3 scripts/process_costume.py assets-src/<元画像> public/costumes/<名前>.webp <顔の内側の点x,y>
```

出力された `suggested anchor` を `costumes.json` の `face` に転記する（`fitScale` で顔に対する衣装の大きさを調整）。

## 仕様メモ

- 保存画像はプレビューと同じ見た目（前面カメラは左右反転のまま）。
- 顔検出の WASM・モデル（約3MB）は「はじめる」を押した後に読み込む。初回表示は数十KB。
- 顔画像は端末内でのみ処理し、サーバーへ送信しない。
- LINE のアプリ内ブラウザは `?openExternalBrowser=1` を付けて外部ブラウザへリダイレクトする。

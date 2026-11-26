# 台湾原住民族衣装 バーチャル試着（デジタル顔はめパネル）

QRコードから開くWebアプリ。前面カメラ映像に衣装パネル（顔の穴が透過）を重ね、撮影・保存・共有する。

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
| `scripts/make_placeholder.py` | 開発用ダミー衣装の生成 |

## 仕様メモ

- 保存画像はプレビューと同じ左右反転のまま（見たまま保存）。
- 顔画像は端末内でのみ処理し、サーバーへ送信しない。
- LINE のアプリ内ブラウザは `?openExternalBrowser=1` を付けて外部ブラウザへリダイレクトする。

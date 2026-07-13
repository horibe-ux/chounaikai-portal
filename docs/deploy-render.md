# Render 本番デプロイ手順（評価会向け）

このプロジェクトは、Express が API とフロント配信をまとめて担当します。
そのため Render では Web Service を 1 つ作れば本番公開できます。

この手順は Render の free プラン前提です。

## 1. 事前準備

1. GitHub に最新コードを反映する
2. Render で対象リポジトリを接続する

## 2. 新規 Web Service 作成

1. Render ダッシュボードで `New +` → `Blueprint` を選ぶ
2. このリポジトリを選択すると、`render.yaml` が読み込まれる
3. サービス名 `chounaikai-portal` を確認して作成

`render.yaml` では次を設定済みです:

- Build Command: `npm install && npm run build`
- Start Command: `npm --prefix backend run start`
- Health Check: `/api/health`

## 3. 環境変数（必須）

Render の Environment で次を設定します。

1. `JWT_SECRET=<十分に長いランダム文字列>`
2. `GEMINI_API_KEY=<Gemini APIキー>`

注意:

- `GEMINI_API_KEY` 未設定でも動作しますが、AI回答はフォールバックになります
- 評価会で Gemini を使う場合は必ず設定してください
- `NODE_ENV=production` は Render 側で固定しないでください（ビルド時に devDependencies が省略され失敗するため）

## 4. デプロイ確認

1. Deploy 完了後、Render のサービスURLを開く
2. `https://<your-render-domain>/api/health` が `{ "status": "ok" }` を返すことを確認
3. A-001 でログイン確認:

`https://<your-render-domain>/?token=tk8fJ3nQ2xLp`

## 5. 役員配布用URL

本番URLは Render が発行する固定ドメインです。
配布時は次の形で統一します。

- 一般案内: `https://<your-render-domain>/`
- A-001: `https://<your-render-domain>/?token=tk8fJ3nQ2xLp`
- A-002: `https://<your-render-domain>/?token=rW7mZ1vBq9Ky`
- A-003: `https://<your-render-domain>/?token=eT4hN6cXs2Rp`
- A-004: `https://<your-render-domain>/?token=yU9gL0pFw3Mz`
- A-005: `https://<your-render-domain>/?token=qA2sD5jHk8Nb`

## 6. よくある詰まりどころ

1. `Build failed`: ルートで `npm run check` を実行し、先に失敗を潰す
2. `ログイン不可`: `/api/health` を確認後、Environment の `JWT_SECRET` 未設定を疑う
3. `Geminiがfallback`: `GEMINI_API_KEY` 設定漏れを確認する
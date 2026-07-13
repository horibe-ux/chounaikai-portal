# デジタル自治会ポータル - 認証＆名簿連動プロトタイプ

高齢化地域向けデジタル自治会ポータル（PWA想定）のローカル動作プロトタイプです。
QRコード（token付きURL）を読み取ると、名簿データと照合してログインする流れを実装しています。

## 技術スタック
- フロントエンド: React + Vite + TypeScript + Tailwind CSS v4
- バックエンド: Node.js + Express + TypeScript

## ディレクトリ構成
```
chounaikai-portal/
├── backend/
│   ├── src/index.ts        # Expressサーバー本体・ログインAPI
│   ├── data/members.json   # ダミー名簿データ（5世帯）
│   ├── .env                # PORT=3000
│   └── package.json
└── frontend/
    ├── src/App.tsx          # ログイン待機画面 / ログイン結果画面
    ├── src/main.tsx
    ├── .env                 # VITE_API_BASE_URL=http://localhost:3000
    └── package.json
```

## セットアップ手順

### 0. ルートから一括起動（推奨）
```bash
npm install
npm run dev
```

`npm install` でルートに加えて `backend/` と `frontend/` の依存もまとめて入ります。
`npm run dev` でバックエンド（3000）とフロントエンド（5173）を同時に起動できます。

検証だけしたい場合は次を使えます。
```bash
npm run check
```

`npm run check` はバックエンドとフロントエンドのビルドに加えて、バックエンドのテストも実行します。

個別にテストだけ回す場合は次を使えます。
```bash
npm test
```

開発時の API は Vite の `/api` プロキシ経由で自動的に `http://localhost:3000` へ転送されます。
そのため、フロント側 `.env` の `VITE_API_BASE_URL` が誤っていてもローカル開発は動作します。

### 1. バックエンド
```bash
cd backend
npm install
npm run dev
```
→ `http://localhost:3000` で起動します。

> **注記**: `npm run dev` は内部で `tsx watch` を使用しています（TypeScript 7系はts-node/ts-node-devと互換性がないため）。もし `Cannot read properties of undefined (reading 'fileExists')` のようなエラーが出た場合は、`node_modules` と `package-lock.json` を削除して `npm install` をやり直してください。

動作確認:
```bash
curl "http://localhost:3000/api/login?token=tk8fJ3nQ2xLp"
```

### 2. フロントエンド（別ターミナル）
```bash
cd frontend
npm install
npm run dev
```
→ `http://localhost:5173` で起動します。

## 動作確認方法

1. `http://localhost:5173` にアクセス → 「QRコードを読み取ってください」画面が表示される。
2. `http://localhost:5173/?token=tk8fJ3nQ2xLp` にアクセス（QRコード読み取りをURL直打ちで代用）
   → 自動的にバックエンドAPIへ問い合わせ、成功すると
   「こんにちは、田中 太郎さん（中央三丁目自治会）」と大きく表示される。
3. 存在しないトークン（例: `?token=xxxx`）を指定するとエラーメッセージが表示される。

## テスト用トークン一覧（backend/data/members.json）

| token | id | 氏名 | 自治会 | 学校区 | 会費 |
|---|---|---|---|---|---|
| tk8fJ3nQ2xLp | A-001 | 田中 太郎 | 中央三丁目自治会 | 昭和小学校区 | 済 |
| rW7mZ1vBq9Ky | A-002 | 佐藤 花子 | 中央三丁目自治会 | 昭和小学校区 | 未納 |
| eT4hN6cXs2Rp | A-003 | 鈴木 一郎 | 緑ヶ丘二丁目自治会 | みどり中学校区 | 済 |
| yU9gL0pFw3Mz | A-004 | 高橋 美咲 | 緑ヶ丘二丁目自治会 | みどり中学校区 | 済 |
| qA2sD5jHk8Nb | A-005 | 伊藤 健二 | 駅前一丁目自治会 | 昭和小学校区 | 未納 |

## API仕様

### GET /api/login?token=xxxx
トークンをmembers.jsonと照合し、一致すれば世帯情報を返す（token自体はレスポンスに含めない）。

成功時 (200):
```json
{
  "success": true,
  "member": {
    "id": "A-001",
    "name": "田中 太郎",
    "neighborhood_association": "中央三丁目自治会",
    "school_district": "昭和小学校区",
    "payment_status": "済"
  }
}
```

失敗時 (401 / 400):
```json
{ "success": false, "message": "トークンが無効です。QRコードを確認してください。" }
```

### GET /api/circulars?association=xxxx
指定された自治会名に一致する回覧板だけを返す。レスポンスには Gemini 要約の `summary`（3行）が付く。

成功時 (200):
```json
{
  "success": true,
  "circulars": [
    {
      "id": "C-001",
      "neighborhood_association": "中央三丁目自治会",
      "title": "公民館清掃活動とゴミゼロ運動について",
      "content": "...",
      "summary": ["...", "...", "..."]
    }
  ]
}
```

`GEMINI_API_KEY` が未設定の場合は、ローカルの固定ロジックで同じ形の `summary` を返します。

### 環境変数
- `PORT` = バックエンド起動ポート
- `JWT_SECRET` = セッション署名用シークレット
- `GEMINI_API_KEY` = Gemini API 呼び出し用キー（未設定でもローカル要約にフォールバック）

## 今後の拡張候補（このプ
# 外部端末テスト手順（スマホ検証）

このドキュメントは「他の人のスマホ」から検証するための一時公開手順です。

## 1. 事前構成（通信が崩れない設定）

- フロントは開発時に `/api` を同一オリジンで呼びます。
- Vite が `/api` をバックエンドへプロキシします。
- 既定のプロキシ先は `http://localhost:4001` です。
- 必要なら `VITE_PROXY_TARGET` で差し替え可能です。

### 差し替え例（PowerShell）

```powershell
$env:VITE_PROXY_TARGET="https://<backend-ngrok-domain>"
npm run dev:external
```

> 本番ビルド時に外部APIを固定したい場合だけ `VITE_API_BASE_URL` を利用してください。

## 2. 公開方法A（推奨）: フロントだけ ngrok 公開

この方法はスマホ側のURLが1つで済みます。バックエンドはローカルのままでOKです。

### 手順

1. 開発サーバー起動

```powershell
npm run dev:external
```

2. 別ターミナルでフロントを公開

```powershell
npm run tunnel:frontend
```

3. 表示された `https://xxxxx.ngrok-free.app` をスマホで開く

## 2.5 関係者向け運用（ローカルトンネル固定URL）

外部関係者に案内する場合は、次の固定サブドメイン運用を使うと再案内が楽です。

1. 評価用ビルド + APIサーバー起動（Vite開発サーバーは使わない）

```powershell
npm run demo:external
```

2. 別ターミナルで固定サブドメイントンネル起動

```powershell
npm run tunnel:demo:stable
```

3. 関係者向けURL（トークンなし）

```text
https://chounaikai-portal-demo-20260712.loca.lt
```

補足: Vite開発サーバー（`dev:external` + `tunnel:frontend:stable`）は外部回線で `/src/main.tsx` が 408/502 になり、白画面になることがあります。評価時は本手順を推奨します。

4. 初回の localtunnel 警告画面では、表示されたホストIP（例: `58.183.242.62`）を入力して Continue

## 3. 公開方法B: フロント/バック両方 ngrok 公開

### 手順

1. バックエンド公開

```powershell
npm run tunnel:backend
```

2. フロントにバックエンド公開URLを設定して起動

```powershell
$env:VITE_DEV_API_BASE_URL="https://<backend-ngrok-domain>"
npm run dev:external
```

3. フロント公開

```powershell
npm run tunnel:frontend
```

4. フロント ngrok URL をスマホで開く

## 4. ローカルIPのみでの検証（同一Wi-Fi）

```powershell
npm run dev:external
```

起動後にPCのローカルIP（例: `192.168.1.10`）へアクセス:

- `http://192.168.1.10:5173`

## 5. QRコード生成（ターミナル表示）

発行済みURLをターミナルにQR表示できます。

```powershell
npm run qr:url -- "https://<frontend-ngrok-domain>/?token=tk8fJ3nQ2xLp"
```

## 6. 注意点（安全運用）

- 公開はテスト時のみ実施し、終了後に ngrok と開発サーバーを停止する
- ngrok の URL は一時URLなので、毎回変わる可能性がある
- 認証付きURLを配布する場合は、テスト終了後に使い回さない

# モノシリ

撮るだけで、身の回りが教科書になる。

写真に写ったモノを Gemini が見つけ、「どうやってできる？」「なぜリサイクルする？」「いつから使われている？」といった問いを Google 検索で裏付けながら深掘りします。説明は文章だけでなく、流れ図・写真・YouTube 動画・AI が描く図解イラスト・AI 動画・読み上げ・クイズで届けます。調べたモノは絵本風のイラストカードになり、「モノシリ図鑑」に集まります。

- アプリ: https://monoshiri-df26.web.app
- カテゴリ: 教育

## できること

| 画面 | 内容 |
|---|---|
| カメラ | 撮影 / 写真選択 / ドラッグ&ドロップ / 貼り付け / サンプル写真 |
| 見つける | Gemini が写真内のモノを最大6個検出し、Lens 風のマーカーで表示 |
| 知る | 名前・ひとこと・やさしい説明・豆知識と、6つの「問い」。Google 検索の候補チップと Wikipedia 要約付き |
| 深掘り | 検索で裏付けた解説をストリーミング表示。流れ図（Mermaid）、Wikimedia の写真、YouTube、AI 図解イラスト、AI 動画、3択クイズ、参考ページ |
| カード | Nano Banana が描くイラストでカード化。深掘りしたテーマもノートとして保存 |
| 図鑑 | カード一覧・ジャンル絞り込み・検索・カード詳細（裏返し、ノート） |

## 構成

```
web/     Vite 8 + React 19 (React Compiler) + TanStack Router + Tailwind CSS v4 + Motion
server/  Hono on Node.js 24 (Cloud Run) — Vertex AI / Firestore / Cloud Storage
infra/   予算キルスイッチ関数、Hosting と Firestore ルールのデプロイスクリプト
```

```
ブラウザ ──(Firebase 匿名認証の ID トークン)──▶ Cloud Run: monoshiri-api
   │                                          ├─ Vertex AI (global)
   │                                          │   ├ gemini-3.1-flash-lite   物体検出 (box_2d)
   │                                          │   ├ gemini-3.8-flash        解説 + Grounding with Google Search
   │                                          │   ├ gemini-nano-banana-2.1  カードイラスト / 図解
   │                                          │   ├ gemini-3.8-flash-lite-tts 読み上げ
   │                                          │   └ gemini-omni-1.2-flash   AI 動画 (Interactions API)
   │                                          ├─ Firestore   生成結果キャッシュ・利用額メーター
   │                                          ├─ Cloud Storage (非公開)  生成メディア → /media/* で配信
   │                                          ├─ Secret Manager  YouTube Data API キー
   │                                          └─ Wikimedia Commons / Wikipedia / YouTube Data API
   ├─ Firebase Hosting  フロントエンド配信
   ├─ Firebase Auth     匿名ログイン（あとから Google ログインに紐づけ可能）
   └─ Firestore         users/{uid}/cards（本人のみ読み書き）＋ IndexedDB にローカル保存
```

### コストの守り方（合計 ¥300 上限）

1. **予算 ¥300**（クレジット適用前の総額、2026/11/1〜2027/3/31 通算）を Cloud Billing に設定
2. **キルスイッチ**: 予算通知（Pub/Sub）を受けた Cloud Run 関数が、実費 ¥250 到達でプロジェクトの課金を自動で外す（`infra/budget-guard`）
3. **アプリ内メーター**: API サーバーがトークン数から推定額を Firestore に積算し、推定 ¥200 で生成 API を止める
4. **キャッシュ**: 同じモノ・同じ問いの結果は Firestore に保存して全ユーザーで再利用（2回目以降は無料・即表示）
5. AI 動画は合計 2 本まで


## iOS / Android アプリ

Web と同じコード（`web/`）を Capacitor 8 でネイティブアプリにしています。機能・バックエンド・データは Web 版と共通です。

| 最適化 | 内容 |
|---|---|
| Liquid Glass（iOS） | カメラ画面のシャッター・写真選択・図鑑・閉じるボタンを、Web の上に重ねたネイティブ部品で描画。iOS 26 以降は `UIButton.Configuration.glass()` / `.prominentGlass()`、それより前はブラー素材（`ios/App/App/GlassChrome.swift`） |
| 写真選択（iOS） | ネイティブの PHPicker から選び、1600px の JPEG にして Web に渡す |
| 触覚 | 撮影・選択・クイズの正誤・カード保存で Haptics |
| 戻る操作（Android） | 戻るボタンで「深掘り → 解説 → カメラ → アプリを背面へ」と1段ずつ閉じる |
| 外部リンク | 検索候補・出典・YouTube・Wikipedia はアプリ内ブラウザで開く |
| 描画負荷 | Android の WebView では背景ブラーを切る |
| 起動 | フォントとアイコンをアプリ内に同梱し、ネイティブのスプラッシュから即表示。縦画面固定 |
| 通信 | オフラインになったら通知。図鑑は端末内（IndexedDB）から表示 |

```bash
cd web
npm run ios       # ビルド → 同期 → Xcode を開く
npm run android   # ビルド → 同期 → Android Studio を開く（JDK 21 が必要）
```

アイコンを追加したら、`public/fonts/material-symbols-rounded.woff2` を `icon_names` 付きの Google Fonts URL から作り直してください。

### ログイン導入時のデータ連携

いまは端末ごとの匿名アカウントで、カードは Firestore の `users/{uid}/cards` と端末内に保存しています。ログインを追加するときは、各サインイン（Web の Google / Apple、ネイティブのサインインプラグイン）で得た認証情報を `web/src/lib/account.ts` の `connectAccount()` に渡すだけで済みます。

- 匿名アカウントに紐づける（uid が変わらないので、集めたカードがそのまま引き継がれる）
- そのアカウントが別の端末ですでに使われていれば、そちらにサインインし、この端末のカードを統合する（`syncCloud()`）

## 開発

```bash
# API（gcloud でログイン済みの開発者の権限で Vertex AI を呼ぶ。Firestore/Storage はメモリ・ローカルで代替）
cd server && npm install && npm run dev

# Web（web/.env.local に Firebase の Web 設定と VITE_API_BASE=http://localhost:8080 を置く）
cd web && npm install && npm run dev
```

`web/.env.local` の例（値は Firebase コンソールの Web アプリ設定）:

```
VITE_FB_API_KEY=...
VITE_FB_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FB_PROJECT_ID=<project>
VITE_FB_APP_ID=...
VITE_FB_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FB_SENDER_ID=...
VITE_API_BASE=http://localhost:8080
```

## デプロイ

### 自動（Web）

`main` に push すると GitHub Actions（`.github/workflows/deploy-web.yml`）が型チェック → ビルド → Firebase Hosting へのデプロイまで行います。

- 認証は Workload Identity Federation（鍵なし）。このリポジトリの `main` ブランチからだけ、Hosting のデプロイ権限しか持たないサービスアカウントになれます
- Firebase の Web 設定はビルド時に Firebase Management API から取得するので、GitHub に秘密情報を置きません
- API サーバー（Cloud Run）は変更頻度が低いので手動デプロイのままです

### 手動

```bash
# API
cd server && gcloud run deploy monoshiri-api --source=. --region=asia-northeast1 \
  --service-account=monoshiri-api@<project>.iam.gserviceaccount.com \
  --set-env-vars=MEDIA_BUCKET=<project>-media,CAP_JPY=200 --set-secrets=YOUTUBE_API_KEY=youtube-api-key:latest

# Web（web/.env.production.local に VITE_API_BASE=<Cloud Run の URL>）
cd web && npm run build && node ../infra/deploy-hosting.mjs

# Firestore ルール
node infra/deploy-rules.mjs
```

秘密情報（API キーなど）はリポジトリに含めません。Firebase の Web 設定は `.env.local`、YouTube キーは Secret Manager に置いています。

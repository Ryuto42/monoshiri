# モノシリ

撮るだけで、身の回りが教科書になる。

写真に写ったモノを Gemini が見つけ、「どうやってできる？」「なぜリサイクルする？」「いつから使われている？」といった問いを Google 検索で裏付けながら深掘りします。説明は文章だけでなく、流れ図・写真・YouTube 動画・AI が描く図解イラスト・AI 動画・読み上げ・クイズで届けます。調べたモノは絵本風のイラストカードになり、「モノシリ図鑑」に集まります。

> **English summary:** Monoshiri is a learning app that turns everyday objects into lessons. Take a photo and Gemini (on Vertex AI) finds the objects, explains each one with Google Search grounding, and lets you dig into questions such as "how is it made?" with diagrams, photos, videos, read-aloud and quizzes. Explored objects become illustrated cards in your collection. Web + iOS + Android (Capacitor), with a Hono API on Cloud Run. The UI and docs are in Japanese. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

- アプリ: https://monoshiri-df26.web.app
- カテゴリ: 教育（DevFest GDGoC Japan Hackathon 2026）
- ライセンス: [MIT](LICENSE)

## 目次

- [できること](#できること)
- [技術スタック](#技術スタック)
- [しくみ](#しくみ)
- [ディレクトリ構成](#ディレクトリ構成)
- [自分の環境で動かす](#自分の環境で動かす)
- [よく使うコマンド](#よく使うコマンド)
- [iOS / Android アプリ](#ios--android-アプリ)
- [API](#api)
- [データの保存先](#データの保存先)
- [コストの守り方](#コストの守り方)
- [セキュリティ](#セキュリティ)
- [デプロイ](#デプロイ)
- [コントリビュート](#コントリビュート)
- [クレジット](#クレジット)

## できること

| 画面 | 内容 |
|---|---|
| カメラ | 撮影（タップでピント合わせ）/ 写真選択 / ドラッグ&ドロップ / 貼り付け / サンプル写真 |
| 見つける | Gemini が写真内のモノを最大6個検出し、Lens 風のマーカーで表示 |
| 知る | 名前・ひとこと・やさしい説明・豆知識と、6つの「問い」。Google 検索の候補チップと Wikipedia 要約付き |
| 深掘り | 検索で裏付けた解説をストリーミング表示。流れ図、Wikimedia の写真、YouTube、AI 図解イラスト、AI 動画、3択クイズ、参考ページ |
| 読み上げ | 文ごとに分けて音声を作り、読んでいる段落をハイライトしながら再生 |
| カード | Nano Banana が描くイラストでカード化。イラストの完成を待たずに保存でき、できあがると図鑑ボタンから吹き出しで知らせる |
| 図鑑 | カード一覧・ジャンル絞り込み・検索・カード詳細（裏返し、ノート） |
| アカウント | メールアドレス＋パスワード / Google でログイン。ゲストで集めたカードを引き継ぎ、どの端末でも同じ図鑑を開ける。最初のカードと5枚目で登録をすすめる |

操作面では、詳細画面を下にスワイプして閉じられます。戻る操作（ブラウザの戻る、Android の戻るボタン、Esc）は、開いた順に1段ずつ閉じます。

## 技術スタック

| 領域 | 使っているもの |
|---|---|
| フロントエンド | Vite 8、React 19（React Compiler）、TypeScript、TanStack Router、Tailwind CSS v4、Motion、Dexie（IndexedDB）、marked + DOMPurify |
| ネイティブ | Capacitor 8。iOS は Swift 6（Liquid Glass のボタン）、Android は AGP 9.5 / Gradle 9.9 / targetSdk 37 |
| API サーバー | Hono on Node.js 24（TypeScript をそのまま実行）、Cloud Run |
| AI | Vertex AI の Gemini（物体検出・解説・深掘り・クイズ・画像・読み上げ・動画）、Grounding with Google Search |
| データ | Firebase Auth（匿名・メール／パスワード・Google）、Firestore、Cloud Storage（非公開バケット）、Secret Manager |
| 配信・CI | Firebase Hosting、GitHub Actions（Workload Identity Federation で鍵なしデプロイ） |
| 外部データ | Wikimedia Commons、Wikipedia、YouTube Data API |

## しくみ

```
ブラウザ / iOS / Android ──(Firebase Auth の ID トークン)──▶ Cloud Run: monoshiri-api
   │                                          ├─ Vertex AI (global)
   │                                          │   ├ gemini-3.1-flash-lite   物体検出 (box_2d)・クイズ
   │                                          │   ├ gemini-3.8-flash        解説・深掘り + Grounding with Google Search
   │                                          │   ├ gemini-nano-banana-2.1  カードイラスト / 図解
   │                                          │   ├ gemini-3.8-flash-lite-tts 読み上げ
   │                                          │   └ gemini-omni-1.2-flash   AI 動画 (Interactions API)
   │                                          ├─ Firestore   生成結果キャッシュ・利用額メーター
   │                                          ├─ Cloud Storage (非公開)  生成メディア → /media/* で配信
   │                                          ├─ Secret Manager  YouTube Data API キー
   │                                          └─ Wikimedia Commons / Wikipedia / YouTube Data API
   ├─ Firebase Hosting  フロントエンド配信
   ├─ Firebase Auth     ゲスト（匿名）→ メール／Google に紐づけ（uid はそのまま）
   └─ Firestore         users/{uid}/cards（本人のみ・確認済みアカウントのみ）⇄ IndexedDB
```

### 1回の「調べる」の流れ

1. **撮影**: `Viewfinder` がカメラ映像を出し、撮った画像を `lib/image.ts` で縮小して JPEG（base64）にする
2. **検出**: `POST /api/detect` で写っているモノと位置（0〜1000 の座標）を受け取り、`Stage` がマーカーを重ねる
3. **解説**: 選んだモノの切り抜きとラベルを `POST /api/explore` に送る。サーバーは別名キャッシュと解説キャッシュを引き、なければ Gemini + Google 検索で生成して保存する
4. **深掘り**: 問いを選ぶと `POST /api/deep` が SSE で本文を流す。写真・動画は `GET /api/media`、図解・動画・クイズは必要になったときにだけ生成する
5. **カード化**: `POST /api/illustrate` を裏で走らせつつ、カードはすぐ IndexedDB と Firestore に保存する（`lib/illust.ts`）。完成したらカードを更新して吹き出しで知らせる

画面の状態は `lib/flow.ts` の `Flow`（`camera` → `detecting` → `picked` → `exploring` → `explore`、失敗時は `error`）で管理しています。

## ディレクトリ構成

```
.
├─ web/                      フロントエンド（Web と iOS / Android で共通）
│  ├─ src/
│  │  ├─ App.tsx             画面の土台（カメラの上に図鑑を重ねる）
│  │  ├─ router.tsx          ルート定義（/、/zukan、/zukan/$cardId）
│  │  ├─ screens/            Home（カメラと調べる流れ）、ExploreContent、TopicPanel（深掘り）、Zukan、CardDetail、Account（ログイン）
│  │  ├─ components/         CardFace / CardMaker（カード）、Sheet（下から出るパネル）、Speak（読み上げ）、
│  │  │                      LoadingCard、ReadyBubble、SignupNudge、Viewfinder、Stage、Markdown、SearchEntry、ui、theme
│  │  ├─ lib/
│  │  │  ├─ api.ts           API クライアント（ID トークン付き fetch、SSE）
│  │  │  ├─ firebase.ts      Firebase 初期化、ゲストログイン、ログイン状態
│  │  │  ├─ account.ts       登録・ログイン・ログアウト・削除、登録のおすすめ
│  │  │  ├─ cards.ts         カードの保存（IndexedDB ⇄ Firestore 同期）
│  │  │  ├─ illust.ts        イラスト生成ジョブと完成通知
│  │  │  ├─ flow.ts          調べる流れの状態
│  │  │  ├─ native.ts        Capacitor 連携、戻る操作のスタック
│  │  │  ├─ glass.ts         iOS ネイティブボタン（GlassChrome プラグイン）とのやりとり
│  │  └─ styles.css          Tailwind とデザイントークン
│  ├─ public/                サンプル写真、アイコン画像、PWA マニフェスト
│  ├─ ios/                   Xcode プロジェクト（App/App/GlassChrome.swift がネイティブボタン）
│  ├─ android/               Android Studio プロジェクト
│  └─ capacitor.config.ts
├─ server/                   API サーバー
│  └─ src/
│     ├─ index.ts            ルーティング、認証、レート制限、各エンドポイント
│     ├─ ai.ts               Gemini クライアント、プロンプト、利用額の計算
│     ├─ store.ts            Firestore（開発時はメモリ）のキャッシュとメーター
│     ├─ media.ts            Cloud Storage（開発時は .local-media/）、Wikimedia / YouTube
│     └─ config.ts           環境変数・モデル名・単価
├─ infra/
│  ├─ budget-guard/          予算通知で課金を外す Cloud Run 関数
│  ├─ deploy-hosting.mjs     Firebase Hosting へのデプロイ（REST API）
│  ├─ deploy-rules.mjs       Firestore ルールのデプロイ
│  ├─ write-web-env.mjs      Firebase の Web 設定を取得して web/.env.*.local を書く
│  ├─ icons.mjs              使っているアイコンだけのフォントを作る
│  └─ prewarm.mjs            よく撮られるモノの解説を事前生成する
├─ firestore.rules
├─ firebase.json             Hosting の設定とセキュリティヘッダー
└─ .github/workflows/        ci.yml（PR のチェック）、branch-flow.yml（main は dev からだけ）、deploy-web.yml（main への push で Web をデプロイ）
```

## 自分の環境で動かす

AI の呼び出しには Vertex AI を使うため、**自分の Google Cloud プロジェクト（課金有効）**と、ログイン用の **Firebase** が必要です。開発時の API サーバーは Firestore と Cloud Storage の代わりにメモリとローカルフォルダを使うので、用意するのは Vertex AI と Firebase Auth だけです。

### 必要なもの

- Node.js 24 以上
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)（`gcloud`）
- 課金を有効にした Google Cloud プロジェクト（Firebase プロジェクトと同じもの）
- ネイティブアプリも動かす場合: Xcode 26 以上（iOS）、Android Studio と JDK 21（Android）

### 1. プロジェクトを用意する

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud services enable aiplatform.googleapis.com identitytoolkit.googleapis.com firebase.googleapis.com
```

[Firebase コンソール](https://console.firebase.google.com/)で、同じ Google Cloud プロジェクトに Firebase を追加し、次の2つを行います。

- **Authentication → ログイン方法** で「匿名」「メール / パスワード」「Google」を有効にする
- **プロジェクトの設定 → マイアプリ** で Web アプリを1つ登録する

コードにあるモデル名がプロジェクトで使えない場合は、`server/.env` の `MODEL_*` で差し替えられます。予算アラートを Cloud Billing に設定しておくと安心です。

### 2. 取得して依存関係を入れる

```bash
git clone https://github.com/Ryuto42/monoshiri.git
cd monoshiri
(cd server && npm install)
(cd web && npm install)
```

### 3. 設定ファイルを作る

```bash
cp server/.env.example server/.env
# server/.env の GOOGLE_CLOUD_PROJECT を自分のプロジェクト ID にする

PROJECT=<your-project-id> node infra/write-web-env.mjs --local
# → web/.env.local に Firebase の Web 設定と VITE_API_BASE=http://localhost:8080 が書かれる
```

`write-web-env.mjs` が使えない場合は、`web/.env.example` を `web/.env.local` にコピーし、Firebase コンソールの値を入れてください。

### 4. 起動する

```bash
# ターミナル 1: API（http://localhost:8080）
cd server && npm run dev

# ターミナル 2: Web（http://localhost:5173）
cd web && npm run dev
```

ログイン機能を本物のアカウントを使わずに試すときは、Firebase エミュレーター（Java 21 以上が必要）を使います。

```bash
# ターミナル 1: Auth と Firestore のエミュレーター（127.0.0.1:9099 / 8085）
cd web && npm run emulators

# ターミナル 2: エミュレーターのトークンを受け付ける API
cd server && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run dev

# ターミナル 3: エミュレーターにつなぐ Web
cd web && npm run dev:emu
```

確認メールのリンクは送信されず、`http://127.0.0.1:9099/emulator/v1/projects/<project>/oobCodes` に出ます。

開発時の API は `gcloud auth print-access-token` で得たあなたの権限で Vertex AI を呼びます。生成した画像・音声は `server/.local-media/` に保存されます。キャッシュと利用額メーターはメモリ上にあり、サーバーを再起動すると消えます。

カメラが使えない環境では、カメラ画面のサンプル写真か、写真の選択・貼り付けで試せます。

### つまずきやすい点

| 症状 | 原因と対処 |
|---|---|
| API が 401 `unauthenticated` | `server/.env` の `GOOGLE_CLOUD_PROJECT` と、`web/.env.local` の `VITE_FB_PROJECT_ID` が同じプロジェクトか確認する |
| CORS エラー | 開発時に許可しているのは `http://localhost:5173` と `http://127.0.0.1:5173` だけ。別のポートで動かすときは `ALLOWED_ORIGINS` を設定する |
| 500 で `model ... not found` | そのモデルがプロジェクトで使えない。`server/.env` の `MODEL_*` で差し替える |
| 402 `budget` | アプリ内メーターが `CAP_JPY` に達した。開発時はサーバーを再起動すると 0 に戻る |
| 400 `unknown_subject` | 深掘りやイラストを、先に解説（explore）していないモノに対して呼んだ |
| 関連動画が出ない | `YOUTUBE_API_KEY` が未設定（写真と本文はそのまま使える） |

## よく使うコマンド

| 場所 | コマンド | 内容 |
|---|---|---|
| `web/` | `npm run dev` | 開発サーバー |
| `web/` | `npx tsc -b && npx oxlint --deny-warnings src` | 型チェックと lint（CI と同じ） |
| `web/` | `npm run build` | 本番ビルド（`web/dist`） |
| `web/` | `npm run ios` / `npm run android` | ネイティブ用にビルド → 同期 → Xcode / Android Studio を開く |
| `server/` | `npm run dev` | API を開発モードで起動（ファイル変更で再起動） |
| `server/` | `npm run typecheck` | 型チェック |
| ルート | `node infra/icons.mjs` | ソース中のアイコン名を集めてアイコンフォントを作り直す |
| ルート | `node infra/prewarm.mjs [--no-illust] [品名...]` | よく撮られるモノを事前生成する（`API_BASE` で接続先を指定） |

## iOS / Android アプリ

Web と同じコード（`web/`）を Capacitor 8 でネイティブアプリにしています。機能・バックエンド・データは Web 版と共通です。

```bash
cd web
npm run ios       # ビルド → 同期 → Xcode を開く
npm run android   # ビルド → 同期 → Android Studio を開く（JDK 21 が必要）
```

ネイティブ版は `web/.env.production.local` の設定でビルドされます（`VITE_TARGET=native`）。接続先の API は、そのファイルの `VITE_API_BASE` で決まります。

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

### ログイン

ネイティブアプリでも Web 版と同じく、メールアドレスか Google でログインできます。ゲストで集めたカードはそのまま引きつがれます。

## API

`/api/health` 以外は `Authorization: Bearer <Firebase ID トークン>` が必要です。POST は 1 ユーザーあたり 5 分 120 回まで、本文は 4MB までです。

| メソッドとパス | 内容 | キャッシュ | 費用 |
|---|---|---|---|
| `GET /api/health` | 死活確認 | — | なし |
| `GET /api/usage` | 推定利用額と残りの動画本数 | — | なし |
| `POST /api/detect` | 画像からモノと位置を検出（`{ image }`） | なし | 小 |
| `POST /api/explore` | 解説と6つの問い（`{ label, image? }`） | `cache_explore`・`explore_alias` | 中 |
| `POST /api/deep` | 問いの深掘り（SSE: `delta` / `done` / `error`） | `cache_deep` | 中 |
| `POST /api/quiz` | 3択クイズ | `cache_quiz` | 小 |
| `GET /api/media` | Wikimedia の写真と YouTube 動画 | `cache_media` | なし（YouTube の割り当てを使う） |
| `POST /api/illustrate` | カードイラスト | `cache_illust` | 大 |
| `POST /api/diagram` | 図解イラスト | `cache_diagram` | 大 |
| `POST /api/tts` | 読み上げ音声（最大 900 字） | `cache_tts` | 小 |
| `POST /api/video`、`GET /api/video/:id` | AI 動画の開始と状態確認（合計 `VIDEO_LIMIT` 本まで） | `cache_video` | 特大 |
| `GET /media/*` | 生成したメディアの配信（Range 対応） | ブラウザに1年 | なし |

深掘り・クイズ・写真と動画・イラスト・図解・動画は、解説のキャッシュにあるモノ（深掘り・図解・動画・写真と動画は、その解説に含まれる問いも）に対してだけ動きます。

主なエラーは `401 unauthenticated`、`400 unknown_subject`、`402 budget`、`413 too_large`、`429 rate_limited`、`503 busy` です。

## データの保存先

| 場所 | 中身 | 書き込める人 |
|---|---|---|
| Firestore `users/{uid}/cards/{id}` | 集めたカード（写真は除く） | 本人のみ。メール登録はアドレス確認後（`firestore.rules`） |
| localStorage `monoshiri.sync.<uid>` | 同期済みのカード ID（ほかの端末での削除を反映するため） | 端末内 |
| IndexedDB `monoshiri.cards` | カード（写真の縮小版を含む） | 端末内 |
| Firestore `cache_*`、`explore_alias` | 生成結果の共有キャッシュ | API サーバーのみ |
| Firestore `meta/usage`、`meta/counters` | 推定利用額、動画の本数 | API サーバーのみ |
| Firestore `video_jobs` | 動画生成ジョブ | API サーバーのみ |
| Cloud Storage `<project>-media`（非公開） | 生成した画像・音声・動画 | API サーバーのみ（`/media/*` で配信） |

## コストの守り方

本番は合計 ¥300 を上限にしています。

1. **予算 ¥300**（クレジット適用前の総額、2026/11/1〜2027/3/31 通算）を Cloud Billing に設定
2. **キルスイッチ**: 予算通知（Pub/Sub）を受けた Cloud Run 関数が、実費 ¥250 到達でプロジェクトの課金を自動で外す（`infra/budget-guard`）
3. **アプリ内メーター**: API サーバーがトークン数から推定額を Firestore に積算し、推定 ¥200（`CAP_JPY`）で生成 API を止める
4. **キャッシュ**: 同じモノ・同じ問いの結果は Firestore に保存して全ユーザーで再利用（2回目以降は無料・即表示）
5. **事前生成**: よく撮られるモノは `infra/prewarm.mjs` で先に作っておく
6. AI 動画は合計 2 本まで（`VIDEO_LIMIT`）

単価は `server/src/config.ts` の `PRICES`、円換算は `JPY_PER_USD` です。

## セキュリティ

詳しくは [SECURITY.md](SECURITY.md) にあります。要点は次のとおりです。

- 秘密情報はリポジトリに置きません。Firebase の Web 設定は公開前提の値で、`write-web-env.mjs` がビルド時に取得します。YouTube キーは Secret Manager に置き、CI は Workload Identity Federation を使うので鍵ファイルがありません。
- API は Firebase の ID トークンを検証し、ユーザーごとにレート制限します。
- 生成 API は「アプリで調べたモノ」に限定し、共有キャッシュは上書きできないようにしています。
- ゲストはそのまま、メール登録はアドレスの確認後にだけクラウドの図鑑を使えます。他人のアドレスで登録して図鑑を受け取ることはできません。
- Firestore ルールは、カードの項目・型・長さ・ID の形・イラストの URL（`/media/` のみ）・更新時刻（未来は 5 分まで）を検証します。テスト（`web/tests/firestore-rules.test.mjs`）は `cd web && npm run test:rules` で、Firestore エミュレーター上で動き、CI でも走ります。
- パスワードは 10 文字以上で、英字と数字が必須です。メールアドレスに似たもの、よくあるものは断ります。ログインやパスワード再設定のエラーは、アドレスが登録済みかどうかが分からない文面にしています（Firebase のメール列挙保護も有効）。
- API は ID トークンの失効も確かめます（削除・無効化したアカウントやパスワード変更後のトークンは、5 分以内に使えなくなります）。
- ログアウトすると、端末内の図鑑を消します。アカウントを削除するときは、もう一度ログインしてもらってから、クラウドのカードとアカウントを消します。
- 写真は端末の中だけに保存し、クラウドには送りません。
- Hosting は HSTS・`X-Frame-Options: DENY`・`frame-ancestors 'none'` などのヘッダーを付けます。
- 脆弱性は Issue ではなく、GitHub の Private vulnerability reporting で報告してください。

## デプロイ

自分のプロジェクトに出すときの手順です。`<project>` を自分のプロジェクト ID に置き換えてください。

### 1. 準備（初回のみ）

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com firebasehosting.googleapis.com

# Firestore（ネイティブモード）と、生成メディア用の非公開バケット
gcloud firestore databases create --location=asia-northeast1
gcloud storage buckets create gs://<project>-media --location=asia-northeast1 \
  --uniform-bucket-level-access --public-access-prevention

# API 用のサービスアカウント（必要な権限だけ）
gcloud iam service-accounts create monoshiri-api
SA=monoshiri-api@<project>.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding <project> --member=serviceAccount:$SA --role=roles/aiplatform.user
gcloud projects add-iam-policy-binding <project> --member=serviceAccount:$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding <project> --member=serviceAccount:$SA --role=roles/firebaseauth.viewer
gcloud storage buckets add-iam-policy-binding gs://<project>-media --member=serviceAccount:$SA --role=roles/storage.objectAdmin

# YouTube Data API キー（任意）
printf '%s' '<youtube-api-key>' | gcloud secrets create youtube-api-key --data-file=-
gcloud secrets add-iam-policy-binding youtube-api-key --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

### 2. API（Cloud Run）

```bash
cd server && gcloud run deploy monoshiri-api --source=. --region=asia-northeast1 \
  --service-account=monoshiri-api@<project>.iam.gserviceaccount.com --allow-unauthenticated \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=<project>,MEDIA_BUCKET=<project>-media,CAP_JPY=200 \
  --set-secrets=YOUTUBE_API_KEY=youtube-api-key:latest
```

`--allow-unauthenticated` は Cloud Run の入口を開けるだけで、各 API はアプリ側で Firebase の ID トークンを検証します。独自ドメインで Web を配信するときは `ALLOWED_ORIGINS` にそのオリジンを足してください。

### 3. Web（Firebase Hosting）と Firestore ルール

HTML と画面のパスは `no-cache`（毎回サーバーに確認）、ファイル名にハッシュが付く `/assets/*`（JS・CSS・アイコンフォント）は1年キャッシュです。`infra/deploy-hosting.mjs` は、直前の版の index.html から参照されているファイルを1世代残すので、デプロイ直前に開いた画面も壊れません。`CHANNEL=<名前> node infra/deploy-hosting.mjs` で、7日で消えるプレビュー URL に出せます。

```bash
PROJECT=<project> VITE_API_BASE=<Cloud Run の URL> node infra/write-web-env.mjs   # web/.env.production.local を作る
(cd web && npm run build)
PROJECT=<project> node infra/deploy-hosting.mjs
PROJECT=<project> node infra/deploy-rules.mjs
```

### 4. 予算のキルスイッチ（任意）

Cloud Billing で予算と Pub/Sub 通知を作り、`infra/budget-guard` を Cloud Run 関数としてデプロイします（環境変数 `TARGET_PROJECT`、`KILL_AT_JPY`）。関数のサービスアカウントには、対象プロジェクトの課金設定を変更できる権限（`roles/billing.projectManager` など）が必要です。

### 自動デプロイ（GitHub Actions）

- `ci.yml`: プルリクエストと `dev`・`main` への push で、Web の型チェック・lint・ビルド、サーバーの型チェック、Firestore ルールのテストを行います。
- `branch-flow.yml`: `main` へのプルリクエストが `dev` から来ているかを確かめます。作業ブランチ → `dev` → `main` の順にしか入りません。
- `deploy-web.yml`: `main` への push で Web を Firebase Hosting に出します。認証は Workload Identity Federation（鍵なし）で、このリポジトリの `main` からだけ Hosting のデプロイ権限しかないサービスアカウントになれます。fork では動かないようにしています。
- API サーバー（Cloud Run）は変更頻度が低いので手動デプロイです。

## コントリビュート

バグ報告・提案・プルリクエストを歓迎します。開発の流れ、チェック項目、コードの書き方は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。

## クレジット

使っているライブラリ・フォント・データの一覧とライセンスは [docs/credits.md](docs/credits.md) にあります。

コードは [MIT License](LICENSE) で公開しています。サンプル写真・カードイラストなどの生成物は Gemini（Vertex AI）で作ったもので、外部サービス（Google 検索、Wikimedia、YouTube）の内容はそれぞれの規約に従います。

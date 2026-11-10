# 自分の環境で動かす

AI の呼び出しには Vertex AI を使うため、**自分の Google Cloud プロジェクト（課金有効）**と、ログイン用の **Firebase** が必要です。開発時の API サーバーは Firestore と Cloud Storage の代わりにメモリとローカルフォルダを使うので、用意するのは Vertex AI と Firebase Auth だけです。

## 必要なもの

- Node.js 24
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)（`gcloud`）
- 課金を有効にした Google Cloud プロジェクト（Firebase プロジェクトと同じもの）
- ネイティブアプリも動かす場合: Xcode 26 以上（iOS）、Android Studio と JDK 21（Android）
- ログインをエミュレーターで試す場合・ルールのテスト: Java 21 以上

## 1. プロジェクトを用意する

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud services enable aiplatform.googleapis.com identitytoolkit.googleapis.com firebase.googleapis.com vision.googleapis.com
```

[Firebase コンソール](https://console.firebase.google.com/)で、同じ Google Cloud プロジェクトに Firebase を追加し、次の2つを行います。

- **Authentication → ログイン方法** で「匿名」「メール / パスワード」「Google」を有効にする
- **プロジェクトの設定 → マイアプリ** で Web アプリを1つ登録する

コードにあるモデル名がプロジェクトで使えない場合は、`server/.env` の `MODEL_*` で差し替えられます。予算アラートを Cloud Billing に設定しておくと安心です。

## 2. 取得して依存関係を入れる

```bash
git clone https://github.com/Ryuto42/monoshiri.git
cd monoshiri
(cd server && npm install)
(cd web && npm install)
```

## 3. 設定ファイルを作る

```bash
cp server/.env.example server/.env
# server/.env の GOOGLE_CLOUD_PROJECT を自分のプロジェクト ID にする

PROJECT=<your-project-id> node infra/write-web-env.mjs --local
# → web/.env.local に Firebase の Web 設定と VITE_API_BASE=http://localhost:8080 が書かれる
```

`write-web-env.mjs` が使えない場合は、`web/.env.example` を `web/.env.local` にコピーし、Firebase コンソールの値を入れてください。`server/.env.example` には、任意の設定（上限、メール、App Check など）の例もあります。

## 4. 起動する

```bash
cd server && npm run dev   # ターミナル 1: API（http://localhost:8080）
```

```bash
cd web && npm run dev      # ターミナル 2: Web（http://localhost:5173）
```

開発時の API は、`gcloud auth print-access-token` で得たあなたの権限で Vertex AI を呼びます。生成した画像・音声は `server/.local-media/` に保存されます。キャッシュと利用額メーターはメモリ上にあり、サーバーを再起動すると消えます。

カメラが使えない環境では、カメラ画面のサンプル写真か、写真の選択・貼り付けで試せます。

### ログインをエミュレーターで試す

本物のアカウントを使わずにログイン機能を試すときは、Firebase エミュレーター（Java 21 以上が必要）を使います。

```bash
cd web && npm run emulators                                       # ターミナル 1: Auth と Firestore（127.0.0.1:9099 / 8085）
```

```bash
cd server && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run dev  # ターミナル 2: エミュレーターのトークンを受け付ける API
```

```bash
cd web && npm run dev:emu                                         # ターミナル 3: エミュレーターにつなぐ Web
```

確認メールのリンクは送信されず、`http://127.0.0.1:9099/emulator/v1/projects/<project>/oobCodes` に出ます。

## よく使うコマンド

| 場所 | コマンド | 内容 |
|---|---|---|
| `web/` | `npm run dev` | 開発サーバー |
| `web/` | `npx tsc -b && npx oxlint --deny-warnings src` | 型チェックと lint（CI と同じ） |
| `web/` | `npm run build` | 本番ビルド（`web/dist`） |
| `web/` | `npm run ios` / `npm run android` | ネイティブ用にビルド → 同期 → Xcode / Android Studio を開く |
| `web/` | `npm run test:rules` | Firestore ルールのテスト（Java 21 が必要） |
| `server/` | `npm run dev` | API を開発モードで起動（ファイルを変えると再起動） |
| `server/` | `npm run typecheck` | 型チェック |
| `server/` | `npm test` | API のテスト（Google Cloud には接続しない） |
| `server/` | `npm run mail:preview` | 確認・再設定メールの HTML を書き出して見た目を確かめる |
| ルート | `node infra/icons.mjs` | ソース中のアイコン名を集めて、アイコンフォントを作り直す |
| ルート | `node infra/prewarm.mjs [--topics 1] [--no-illust] [--levels std,lower,upper] [品名...]` | よく撮られるモノの解説・イラスト・深掘りを事前に作る（`API_BASE` で接続先を指定。表示される uid を Cloud Run の `ADMIN_UIDS` に入れると、アカウントごとの上限なしで実行できる。実際に費用がかかる） |
| ルート | `node infra/stats.mjs [--days 7]` | 日別の学びの集計を表で見る |

## つまずきやすい点

| 症状 | 原因と対処 |
|---|---|
| API が 401 `unauthenticated` | `server/.env` の `GOOGLE_CLOUD_PROJECT` と、`web/.env.local` の `VITE_FB_PROJECT_ID` が同じプロジェクトか確かめる |
| CORS エラー | 開発時に許可しているのは `http://localhost:5173` と `http://127.0.0.1:5173` だけ。別のポートで動かすときは `ALLOWED_ORIGINS` を設定する（設定すると既定の一覧を置き換える） |
| 500 で `model ... not found` | そのモデルがプロジェクトで使えない。`server/.env` の `MODEL_*` で差し替える |
| 402 `budget` | アプリ内メーターが `CAP_JPY` に達した。開発時はサーバーを再起動すると 0 に戻る |
| 400 `unknown_subject` | 深掘りやイラストを、先に解説（explore）していないモノに対して呼んだ |
| 関連動画が出ない | `YOUTUBE_API_KEY` が未設定（写真と本文はそのまま使える） |

## iOS / Android アプリ

Web と同じコード（`web/`）を Capacitor 8 でネイティブアプリにしています。機能・バックエンド・データは Web 版と共通です。

```bash
cd web && npm run ios       # ビルド → 同期 → Xcode を開く
```

```bash
cd web && npm run android   # ビルド → 同期 → Android Studio を開く（JDK 21 が必要）
```

ネイティブ版は `web/.env.production.local` の設定でビルドされます（`VITE_TARGET=native`）。接続先の API は、そのファイルの `VITE_API_BASE` で決まります。メールアドレスか Google でのログインも Web 版と同じように使え、ゲストで集めたカードはそのまま引き継がれます。

ネイティブ版は WebView で reCAPTCHA が動かないため App Check のトークンを付けられません。App Check の強制中は、確かめられないゲストの新しい生成を、全員で共有する1日の上限（`UNATTESTED_POOL_JPY`、既定 ¥150）の範囲でだけ受け付けます。使い切った日は、ログインすると新しく調べられます。

| 最適化 | 内容 |
|---|---|
| Liquid Glass（iOS） | カメラ画面のシャッター・写真選択・図鑑・閉じるボタンを、Web の上に重ねたネイティブ部品で描く。iOS 26 以降は `UIButton.Configuration.glass()` / `.prominentGlass()`、それより前はブラー素材（`ios/App/App/GlassChrome.swift`） |
| 写真選択（iOS） | ネイティブの PHPicker から選び、1600px の JPEG にして Web に渡す |
| 触覚 | 撮影・選択・クイズの正誤・カードの保存で Haptics |
| 戻る操作（Android） | 戻るボタンで「深掘り → 解説 → カメラ → アプリを背面へ」と1段ずつ閉じる |
| 戻る操作（iOS） | 画面の左端から右へスワイプすると、Android の戻るボタンと同じく1段ずつ閉じる（GlassChrome.swift の端のスワイプ → `edgeback`） |
| 外部リンク | 検索候補・出典・YouTube・Wikipedia はアプリ内ブラウザで開く |
| 描画の負荷 | Android（アプリとブラウザ）では背景のブラーを切る |
| 起動 | フォントとアイコンをアプリ内に同梱し、暗い背景（#120e0b）にアイコンの起動画面からそのまま表示（Android は SplashScreen API、iOS は LaunchScreen）。縦画面に固定 |
| キーボード | WebView は動かさず、入力中のシートだけをキーボードの上に持ち上げる（iOS・Android 共通。Android は SystemBars のキーボード分の余白を外している） |
| 通信 | オフラインになったら知らせる。図鑑は端末内（IndexedDB）から表示 |

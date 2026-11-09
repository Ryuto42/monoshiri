# モノシリ

撮るだけで、身の回りが教科書になる。

写真に写ったモノを Gemini が見つけ、「どうやってできる？」「なぜリサイクルする？」「いつから使われている？」といった問いを Google 検索で裏付けながら深掘りします。説明は文章だけでなく、流れ図・写真・YouTube 動画・AI が描く図解イラスト・AI 動画・読み上げ・クイズで届けます。そのモノが**学校のどの単元で出てくるか**（学習指導要領の 219 単元から）も示します。調べたモノは絵本風のイラストカードになり、「モノシリ図鑑」に集まります。図鑑は、集めたモノの単元を教科・学年ごとにも並べられます。

> **English summary:** Monoshiri is a learning app that turns everyday objects into lessons. Take a photo and Gemini (on Vertex AI) finds the objects, explains each one with Google Search grounding, and lets you dig into questions such as "how is it made?" with diagrams, photos, videos, read-aloud and quizzes. Explored objects become illustrated cards in your collection. Web + iOS + Android (Capacitor), with a Hono API on Cloud Run. The UI and docs are in Japanese. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

- アプリ: https://monoshiri.web.app
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
| カメラ | 撮影（タップでピント合わせ）/ 写真選択 / ドラッグ&ドロップ / 貼り付け。カメラが使えないときはサンプル写真 |
| はじめて | 最初に年齢を入れ（ゲストも必須）、プライバシーポリシーに同意する。13歳未満は保護者の同意も確認する。そのあと案内カードと、撮影画面のボタンを順に照らすチュートリアル |
| 見つける | Gemini が写真内のモノを最大6個検出し、Lens 風のマーカーで表示 |
| 知る | 名前・ひとこと・やさしい説明・豆知識と、6つの「問い」。Google 検索の候補チップと Wikipedia 要約付き |
| 深掘り | 検索で裏付けた解説をストリーミング表示。流れ図、テーマに合う写真（Wikimedia Commons から Gemini が選び、SafeSearch で確認）、YouTube、AI 図解イラスト、AI 動画、3択クイズ、参考ページ |
| 読み上げ | 文ごとに分けて音声を作り、読んでいる段落をハイライトしながら再生 |
| カード | Nano Banana が描くイラストでカード化。イラストの完成を待たずに保存でき、できあがると図鑑ボタンから吹き出しで知らせる |
| 図鑑 | カード一覧・ジャンル絞り込み・検索・カード詳細（裏返し、ノート） |
| アカウント | メールアドレス＋パスワード / Google でログイン。ゲストで集めたカードを引き継ぎ、どの端末でも同じ図鑑を開ける。最初のカードと5枚目、ゲストの上限に達したときに登録をすすめる |
| 年代 | 最初に入れた年齢から「小学校低学年・高学年・中学生・高校生以上」の段階に自動で変換し、段階だけを保存する（年齢は保存しない）。段階ごとに漢字・表現・くわしさを変えた解説・深掘り・クイズを作り、段階ごとにキャッシュする。解説シートのチップから年齢を入れ直して切り替えられ、表示中の解説も作り直す |
| ふりがな | 低学年・高学年向けの文章は Gemini が `漢字《かんじ》` の形で読みを付け、`<ruby>` で表示する。読み上げはふりがなを除いて読む。低学年は文字を大きくし、解説を自動で読み上げる |
| 学校の単元 | 解説したモノを、学習指導要領（小・中は平成29年、高は平成30年告示）から作った 219 単元に Gemini が結び付ける（一覧の id からだけ選ぶ）。「小5 理科『物の溶け方』」のように表示し、段階に応じて「いま習う／もうすぐ習う」を出す。段階から見てもう習った単元は出さない |
| 教科 | 図鑑の「教科」で、集めたカードの単元だけを教科×学年に並べ、単元ごとにカードを中央にそろえて並べる（スマホは2列）。教科のボタンで、ジャンルと同じ動きで切り替わる |
| 学びの記録 | 問いを開いた・クイズに答えた／正解した・カードを保存した、などを**日ごとの合計回数だけ**サーバーで数える（個人とは結び付けない）。`node infra/stats.mjs` で見られる |
| メール | 確認メールとパスワード再設定のメールは、API サーバーが Gmail（SMTP）から送る、アプリと同じ見た目の HTML。リンクはアプリの `/auth/action` を開き、確認やパスワードの再設定をその場で済ませて、自動でアプリにもどる（Firebase の標準のメールは文面とリンク先を変更できないため。SMTP が使えないときは標準のメールで送る） |
| プライバシー | `/privacy` に子どもにも読める「かんたん版」と詳しい版。同意は最初の画面で受け、記録は端末にだけ残す |

操作面では、詳細画面を下にスワイプして閉じられます。戻る操作（ブラウザの戻る、Android の戻るボタン、Esc）は、開いた順に1段ずつ閉じます。

## 技術スタック

| 領域 | 使っているもの |
|---|---|
| フロントエンド | Vite 8、React 19（React Compiler）、TypeScript、TanStack Router、Tailwind CSS v4、Motion、Dexie（IndexedDB）、marked + DOMPurify |
| ネイティブ | Capacitor 8。iOS は Swift 6（Liquid Glass のボタン）、Android は AGP 9.5 / Gradle 9.9 / targetSdk 37 |
| API サーバー | Hono on Node.js 24（TypeScript をそのまま実行）、Cloud Run |
| AI | Vertex AI の Gemini（物体検出・解説・深掘り・クイズ・画像・読み上げ・動画）、Grounding with Google Search |
| データ | Firebase Auth（匿名・メール／パスワード・Google）、Firestore、Cloud Storage（非公開バケット）、Secret Manager |
| 保護 | Firebase App Check（reCAPTCHA Enterprise）、Cloud Vision SafeSearch |
| 監視 | Cloud Monitoring（稼働確認・5xx のアラート）、Cloud Billing の予算通知 |
| テスト | `node --test`（API）、Firestore エミュレーター（ルール） |
| 配信・CI | Firebase Hosting、GitHub Actions（Workload Identity Federation で鍵なしデプロイ） |
| 外部データ | Wikimedia Commons、Wikipedia、YouTube Data API |

## しくみ

```
ブラウザ / iOS / Android ──(Firebase Auth の ID トークン + App Check)──▶ Cloud Run: monoshiri-api
   │                                          ├─ Vertex AI (global)
   │                                          │   ├ gemini-3.1-flash-lite   物体検出 (box_2d)・クイズ・単元の選択
   │                                          │   ├ gemini-3.8-flash        解説・深掘り + Grounding with Google Search
   │                                          │   ├ gemini-nano-banana-2.1  カードイラスト / 図解
   │                                          │   ├ gemini-3.8-flash-lite-tts 読み上げ
   │                                          │   └ gemini-omni-1.2-flash   AI 動画 (Interactions API)
   │                                          ├─ Firestore   生成結果キャッシュ・利用額メーター・日別の学びの集計
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
3. **解説**: 選んだモノの切り抜きとラベルを `POST /api/explore` に送る。サーバーは別名キャッシュと解説キャッシュを引き、なければ切り抜きでモノ名を確かめたうえで、名前だけから Gemini + Google 検索で生成して保存する（全員が見る本文に写真の内容が入らないように）
4. **単元**: 解説を表示すると `POST /api/units` で学校の単元（最大3つ）を受け取り、チップで表示する（年代によらず共通のキャッシュ）
5. **深掘り**: 問いを選ぶと `POST /api/deep` が SSE で本文を流す。写真・動画は `GET /api/media`、図解・動画・クイズは必要になったときにだけ生成する
6. **カード化**: `POST /api/illustrate` を裏で走らせつつ、カードは単元と一緒にすぐ IndexedDB と Firestore に保存する（`lib/illust.ts`）。完成したらカードを更新して吹き出しで知らせる

画面の状態は `lib/flow.ts` の `Flow`（`camera` → `detecting` → `picked` → `exploring` → `explore`、失敗時は `error`）で管理しています。

## ディレクトリ構成

```
.
├─ web/                      フロントエンド（Web と iOS / Android で共通）
│  ├─ src/
│  │  ├─ App.tsx             画面の土台（カメラの上に図鑑を重ねる）
│  │  ├─ router.tsx          ルート定義（/、/zukan、/zukan/$cardId、/account、/privacy、/auth/action）
│  │  ├─ screens/            Home（カメラと調べる流れ）、ExploreContent、TopicPanel（深掘り）、Zukan、ZukanUnits（教科）、
│  │  │                      CardDetail、Account と account/（ログイン・登録・段階）、Privacy、AuthAction（メールのリンク）
│  │  ├─ data/curriculum.json 学習指導要領の単元一覧（server/src/curriculum.json と同じ内容。テストで一致を確認）
│  │  ├─ components/         CardFace / CardMaker（カード）、Sheet（下から出るパネル）、Speak（読み上げ）、
│  │  │                      LoadingCard、ReadyBubble、SignupNudge、Viewfinder、Stage、Markdown、SearchEntry、ui、theme、Logo、Toast、
│  │  │                      LeaveConfirm（カードにせずに離れる前の確認）、MoreSearch（Google 検索など外で調べる）、Phrases（BudouX で文節ごとに折り返す）、
│  │  │                      Onboarding / AgePicker（年齢と同意）、StageChip（段階の切り替え）、Welcome / Tour（案内とチュートリアル）、
│  │  │                      UnitChips（単元）、RubyText（ふりがな）
│  │  ├─ lib/
│  │  │  ├─ api.ts           API クライアント（ID トークン付き fetch、SSE）
│  │  │  ├─ firebase.ts      Firebase 初期化、ゲストログイン、ログイン状態
│  │  │  ├─ account.ts       登録・ログイン・ログアウト・削除、登録のおすすめ
│  │  │  ├─ cards.ts         カードの保存（IndexedDB ⇄ Firestore 同期）
│  │  │  ├─ illust.ts        イラスト生成ジョブと完成通知
│  │  │  ├─ flow.ts          調べる流れの状態
│  │  │  ├─ native.ts        Capacitor 連携、戻る操作のスタック
│  │  │  ├─ glass.ts         iOS ネイティブボタン（GlassChrome プラグイン）とのやりとり
│  │  │  ├─ level.ts         学びの段階（ゲストは端末、ログイン後は Firestore にも保存）
│  │  │  ├─ units.ts         単元の一覧・判定・キャッシュ
│  │  │  ├─ welcome.ts       年齢・同意 → 案内 → チュートリアルの順番と、同意の記録
│  │  │  ├─ ruby.ts          ふりがな（漢字《かんじ》）の変換
│  │  └─ styles.css          Tailwind とデザイントークン
│  ├─ public/                サンプル写真、アイコン画像、PWA マニフェスト
│  ├─ ios/                   Xcode プロジェクト（App/App/GlassChrome.swift がネイティブボタン）
│  ├─ android/               Android Studio プロジェクト
│  └─ capacitor.config.ts
├─ server/                   API サーバー
│  ├─ src/
│  │  ├─ index.ts            起動（createApp() を serve するだけ）
│  │  ├─ app.ts              ミドルウェア・エラー処理・ルートの組み立て
│  │  ├─ auth.ts             ID トークンと App Check の検証、レート制限（検証部分は差し替え可能でテストから使う）
│  │  ├─ http.ts             共通の型・入力の整形・「調べたモノか」の確認
│  │  ├─ routes/             files（/media）、detect、explore、deep（深掘り・クイズ）、media（写真・イラスト・図解）、
│  │  │                      speech（読み上げ）、video、learn（単元・学びの記録・利用状況）、mail（確認・再設定メール）
│  │  ├─ ai.ts               Gemini クライアント、プロンプト、利用額の計算
│  │  ├─ store.ts            Firestore（開発時はメモリ）のキャッシュとメーター
│  │  ├─ stats.ts            日別の学びの集計（stats_daily、個人と結び付けない）
│  │  ├─ mail/               メールの見た目（layout）・文面（templates）・送信（send。Firebase Admin SDK でリンクを作り Gmail から送る）
│  │  ├─ media.ts            Cloud Storage（開発時は .local-media/）、Wikimedia / YouTube
│  │  ├─ curriculum.json     学習指導要領の単元一覧
│  │  └─ config.ts           環境変数・モデル名・単価
│  └─ test/                 node --test の API テスト
├─ infra/
│  ├─ budget-guard/          予算通知で課金を外す Cloud Run 関数
│  ├─ deploy-hosting.mjs     Firebase Hosting へのデプロイ（REST API）
│  ├─ deploy-rules.mjs       Firestore ルールのデプロイ
│  ├─ write-web-env.mjs      Firebase の Web 設定を取得して web/.env.*.local を書く
│  ├─ icons.mjs              使っているアイコンだけのフォントを作る
│  ├─ prewarm.mjs            よく撮られるモノの解説・単元を事前生成する（--levels で段階ごとにも）
│  ├─ stats.mjs              日別の学びの集計を表で見る
│  ├─ setup-appcheck.mjs     reCAPTCHA Enterprise のキーと App Check の登録
│  ├─ setup-monitoring.mjs   稼働確認とアラート（Cloud Monitoring）
│  └─ setup-auth-quota.mjs   新規登録の上限（IP ごと 1 時間 100 件）
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
| `web/` | `npm run test:rules` | Firestore ルールのテスト（Java 21 が必要） |
| `server/` | `npm run dev` | API を開発モードで起動（ファイル変更で再起動） |
| `server/` | `npm run typecheck` | 型チェック |
| `server/` | `npm test` | API のテスト（Google Cloud には接続しない） |
| ルート | `node infra/icons.mjs` | ソース中のアイコン名を集めてアイコンフォントを作り直す |
| ルート | `node infra/prewarm.mjs [--no-illust] [--levels std,lower,upper] [品名...]` | よく撮られるモノを事前生成する（`API_BASE` で接続先を指定。表示される uid を Cloud Run の `ADMIN_UIDS` に入れると、ゲストの上限なしで実行できる） |
| ルート | `node infra/stats.mjs [--days 7]` | 日別の学びの集計を表示する |

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
| 戻る操作（iOS） | 画面の左端から右へスワイプすると、Android の戻るボタンと同じく1段ずつ閉じる（GlassChrome.swift の端のスワイプ → `edgeback`） |
| 外部リンク | 検索候補・出典・YouTube・Wikipedia はアプリ内ブラウザで開く |
| 描画負荷 | Android（アプリとブラウザ）では背景ブラーを切る |
| 起動 | フォントとアイコンをアプリ内に同梱し、暗い背景（#120e0b）にアイコンの起動画面からそのまま表示（Android は SplashScreen API、iOS は LaunchScreen）。縦画面固定 |
| キーボード | WebView は動かさず、入力中のシートだけをキーボードの上に持ち上げる（iOS・Android 共通。Android は SystemBars のキーボード分の余白を外している） |
| 通信 | オフラインになったら通知。図鑑は端末内（IndexedDB）から表示 |

### ログイン

ネイティブアプリでも Web 版と同じく、メールアドレスか Google でログインできます。ゲストで集めたカードはそのまま引きつがれます。

## API

`/api/health` 以外は `Authorization: Bearer <Firebase ID トークン>` が必要です。Web 版は `X-Firebase-AppCheck`（App Check のトークン）も付けます。POST は 1 ユーザーあたり 5 分 120 回、GET は 5 分 300 回、生成の同時実行は 3 つまで、本文は 4MB までです。解説・深掘り・クイズ・写真と動画・図解・動画は `level`（`std`・`lower`・`upper`・`junior`・`senior`）を受け取り、`std` 以外は段階ごとのキャッシュを使います。

| メソッドとパス | 内容 | キャッシュ | 費用 |
|---|---|---|---|
| `GET /api/health` | 死活確認 | — | なし |
| `GET /api/usage` | 推定利用額（全体と自分）と上限、残りの動画本数 | — | なし |
| `GET /api/known` | そのモノの解説がもう誰かに作られているか（キャッシュを読むだけ） | — | なし |
| `POST /api/detect` | SafeSearch で確認してから、画像からモノと位置を検出（`{ image }`）。画像は保存しない | なし | 小 |
| `POST /api/explore` | 解説と6つの問い（`{ label, image?, level? }`）。カードの ID は段階によらず同じ | `cache_explore`・`explore_alias` | 中 |
| `POST /api/deep` | 問いの深掘り（SSE: `delta` / `done` / `error`） | `cache_deep` | 中 |
| `POST /api/quiz` | 3択クイズ（`{ name, topic, level }`。元の文はサーバーが深掘りの本文から取る。出力の形を検証） | `cache_quiz` | 小 |
| `GET /api/media` | テーマに合う写真（Commons から Gemini が選び SafeSearch で確認）と YouTube 動画（セーフサーチ厳格） | `cache_media` | 小 |
| `POST /api/illustrate` | カードイラスト（`{ name }`。英語名はサーバーが解説から取る） | `cache_illust` | 大 |
| `POST /api/diagram` | 図解イラスト（`{ name, topic, level }`。要点はサーバーが深掘りの本文から作る） | `cache_diagram` | 大 |
| `POST /api/tts` | 読み上げ音声（最大 900 字。`ref: { name, topic?, level }` の解説・深掘り本文に含まれる文だけ） | `cache_tts` | 小 |
| `POST /api/units` | 学校の単元（最大3つ、`{ id, why }`。id は curriculum.json のもの） | `cache_units` | 小 |
| `POST /api/events` | 学びのイベント（日ごとの合計回数だけを数える） | — | なし |
| `POST /api/mail/verify` | 自分のアカウントの確認メールを送る（メール／パスワードで未確認のときだけ） | — | なし |
| `POST /api/mail/reset` | パスワード再設定のメールを送る（`{ email }`。登録の有無にかかわらず同じ応答） | — | なし |
| `POST /api/video`、`GET /api/video/:id` | AI 動画の開始と状態確認（合計 `VIDEO_LIMIT` 本まで） | `cache_video` | 特大 |
| `GET /media/*` | 生成したメディアの配信（Range 対応） | ブラウザに1年 | なし |

深掘り・クイズ・写真と動画・イラスト・図解・動画は、解説のキャッシュにあるモノ（深掘り・図解・動画・写真と動画は、その解説に含まれる問いも）に対してだけ動きます。

主なエラーは `401 unauthenticated`、`400 unknown_subject`、`400 unknown_text`（読み上げの文が本文に無い）、`402 budget`（アプリ全体の上限）、`402 user_limit`（そのアカウントの上限）、`403 attest_required`（App Check の強制中に、確認できないゲストが新しく生成しようとした）、`413 too_large`、`422 unsafe_image`（SafeSearch で不適切）、`429 rate_limited`、`429 busy`（同じアカウントの生成が 3 つ実行中）、`400 bad_json`、`502 quiz_failed`、`503 busy` です。深掘り・図解・動画・写真と動画は、どの段階で調べたモノの問いでも使えます（段階を切り替えても、図鑑のカードの問いを開ける）。

## データの保存先

| 場所 | 中身 | 書き込める人 |
|---|---|---|
| Firestore `users/{uid}/cards/{id}` | 集めたカード | 本人のみ。メール登録はアドレス確認後（`firestore.rules`） |
| Firestore `users/{uid}` | 学びの段階（`stage`）だけ。年齢・学年は保存しない | 本人のみ（ログインしたアカウント） |
| localStorage `monoshiri.stage.<uid>` | 学びの段階（ゲストはここだけ） | 端末内 |
| localStorage `monoshiri.sync.<uid>` | 同期済みのカード ID（ほかの端末での削除を反映するため） | 端末内 |
| IndexedDB `monoshiri.cards` | カード | 端末内 |
| Firestore `cache_*`、`explore_alias` | 生成結果の共有キャッシュ | API サーバーのみ |
| Firestore `meta/usage`、`meta/counters` | 推定利用額、動画の本数 | API サーバーのみ |
| Firestore `meter_users/{uid}` | アカウントごとの推定利用額 | API サーバーのみ |
| Firestore `video_jobs` | 動画生成ジョブ | API サーバーのみ |
| Firestore `corrections` | 「ちがうよ」で直した名前（元の名前と直した名前。アカウントとは結び付けない） | API サーバーのみ |
| Firestore `cache_units` | モノごとの単元（年代によらず共通） | API サーバーのみ |
| Firestore `stats_daily/{日付}_{0-9}` | 日別の学びの合計回数（イベント別・段階別・利用者数）。uid は保存しない | API サーバーのみ |
| Cloud Storage `<project>-media`（非公開） | 生成した画像・音声・動画 | API サーバーのみ（`/media/*` で配信） |

## コストの守り方

本番は合計 ¥2,000 を上限にしています。

1. **予算 ¥2,000**（クレジット適用前の総額、2026/11/1 から期限なし）を Cloud Billing に設定。10・20・30・50・80・100% でメールと Pub/Sub に通知
2. **キルスイッチ**: 予算通知（Pub/Sub）を受けた Cloud Run 関数が、実費 ¥1,900 到達でプロジェクトの課金を自動で外す（`infra/budget-guard`、`KILL_AT_JPY`）
3. **アプリ内メーター**: API サーバーがトークン数・Google 検索グラウンディングの検索回数（$14/1,000 件。毎月 5,000 件までの無料枠を超えた分だけ）・SafeSearch の枚数から推定額を Firestore に積算し、推定 ¥1,800（`CAP_JPY`）で生成 API を止める
4. **アカウントごとの上限**: 新しく生成した分の推定額をアカウントごとに積算し、ゲストは ¥50、ログインしたアカウント（Google、または確認済みのメールアドレス）は ¥300 で止める（累計。`USER_CAP_GUEST_JPY`・`USER_CAP_MEMBER_JPY`）。キャッシュ済みの内容は上限に達しても見られる
5. **段階の言い換え**: 別の段階の解説・深掘りがすでにあるモノは、検索せずにその文章を読む人の年代に合わせて言い換えて作る（費用は数十分の一。事実は足さず、問いの題はそのまま）
6. **キャッシュ**: 同じモノ・同じ問いの結果は Firestore に保存して全ユーザーで再利用（2回目以降は無料・即表示。年代の段階ごとに保存）
7. **事前生成**: よく撮られるモノは `infra/prewarm.mjs` で先に作っておく
8. AI 動画は合計 2 本まで（`VIDEO_LIMIT`。トランザクションで数える）
9. **App Check**: 匿名アカウントはいくらでも作れるので、`APPCHECK_ENFORCE=1` のとき、ゲストの新しい生成は App Check で確かめた Web アプリからだけ受け付ける。新規登録も IP ごと 1 時間 100 件まで

単価は `server/src/config.ts` の `PRICES`、円換算は `JPY_PER_USD` です。

## セキュリティ

詳しくは [SECURITY.md](SECURITY.md) にあります。要点は次のとおりです。

- 秘密情報はリポジトリに置きません。Firebase の Web 設定は公開前提の値で、`write-web-env.mjs` がビルド時に取得します。YouTube キーは Secret Manager に置き、CI は Workload Identity Federation を使うので鍵ファイルがありません。
- API は Firebase の ID トークンと App Check のトークンを検証し、ユーザーごとにレート制限します。
- 読み上げも「アプリで調べたモノ」の本文に含まれる文だけを音声にします。
- 生成 API は「アプリで調べたモノ」に限定し、共有キャッシュは上書きできないようにしています。
- ゲストはそのまま、メール登録はアドレスの確認後にだけクラウドの図鑑を使えます。他人のアドレスで登録して図鑑を受け取ることはできません。
- Firestore ルールは、カードの項目・型・長さ・ID の形・イラストの URL（`/media/` のみ）・更新時刻（未来は 5 分まで）を検証します。テスト（`web/tests/firestore-rules.test.mjs`）は `cd web && npm run test:rules` で、Firestore エミュレーター上で動き、CI でも走ります。
- パスワードは 10 文字以上で、英字と数字が必須です。メールアドレスに似たもの、よくあるものは断ります。ログインやパスワード再設定のエラーは、アドレスが登録済みかどうかが分からない文面にしています（Firebase のメール列挙保護も有効）。
- API は ID トークンの失効も確かめます（削除・無効化したアカウントやパスワード変更後のトークンは、5 分以内に使えなくなります）。
- ログアウトすると、端末内の図鑑を消します。アカウントを削除するときは、もう一度ログインしてもらってから、クラウドのカードとアカウントを消します。
- 撮影・選択した写真はどこにも保存しません（端末にもクラウドにも）。検出と解説のときだけ API に送り、処理が終われば捨てます。
- 写真は Cloud Vision の SafeSearch で確認し、不適切なものは検出も解説もしません。深掘りに出す写真も SafeSearch を通したものだけで、YouTube の検索はセーフサーチを厳格にしています。
- アカウントごとに使える生成の額に上限があります（ゲスト ¥50・ログイン ¥300）。
- 学びの記録は日ごとの合計回数だけで、個人とは結び付けません。外部の解析ツールは使っていません。
- 最初に年齢を聞き（保存は段階だけ）、プライバシーポリシーへの同意を受けます。13歳未満は保護者の同意も確認します。
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
# 確認・再設定メールのリンクを作るため（メールを送らないなら不要）
gcloud projects add-iam-policy-binding <project> --member=serviceAccount:$SA --role=roles/firebaseauth.admin
gcloud storage buckets add-iam-policy-binding gs://<project>-media --member=serviceAccount:$SA --role=roles/storage.objectAdmin

# YouTube Data API キー（任意）
printf '%s' '<youtube-api-key>' | gcloud secrets create youtube-api-key --data-file=-
gcloud secrets add-iam-policy-binding youtube-api-key --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

### 2. API（Cloud Run）

```bash
cd server && gcloud run deploy monoshiri-api --source=. --region=asia-northeast1 \
  --service-account=monoshiri-api@<project>.iam.gserviceaccount.com --allow-unauthenticated \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=<project>,MEDIA_BUCKET=<project>-media,CAP_JPY=1800 \
  --set-secrets=YOUTUBE_API_KEY=youtube-api-key:latest
# メールを API から送るとき（Gmail のアプリパスワードを Secret Manager の smtp-password に入れておく）:
#   --update-env-vars=SMTP_USER=<送信に使う Gmail> --update-secrets=SMTP_PASSWORD=smtp-password:latest
# App Check を強制するのは、App Check に対応した Web を公開してから:
#   gcloud run services update monoshiri-api --region=asia-northeast1 --update-env-vars=APPCHECK_ENFORCE=1
```

SafeSearch のため、プロジェクトで Cloud Vision API（`vision.googleapis.com`）を有効にしてください。`--allow-unauthenticated` は Cloud Run の入口を開けるだけで、各 API はアプリ側で Firebase の ID トークンを検証します。独自ドメインで Web を配信するときは `ALLOWED_ORIGINS` にそのオリジンを足してください。

### 3. Web（Firebase Hosting）と Firestore ルール

公開 URL は Hosting のサイト `monoshiri`（https://monoshiri.web.app）です。スクリプトはプロジェクトが `monoshiri-df26` のときこのサイトに出し、ほかのプロジェクトではプロジェクト名のサイトに出します（`SITE=<サイト名>` で変更可）。ログインのポップアップと確認メールもこのドメインで動かすため、`write-web-env.mjs` は `authDomain` を `<サイト>.web.app` にします。自分のプロジェクトで使うときは、Google Cloud の OAuth クライアント（Web client）の承認済みリダイレクト URI に `https://<サイト>.web.app/__/auth/handler` を足してください。

HTML と画面のパスは `no-cache`（毎回サーバーに確認）、ファイル名にハッシュが付く `/assets/*`（JS・CSS・アイコンフォント）は1年キャッシュです。`infra/deploy-hosting.mjs` は、直前の版の index.html から参照されているファイルを1世代残すので、デプロイ直前に開いた画面も壊れません。`CHANNEL=<名前> node infra/deploy-hosting.mjs` で、7日で消えるプレビュー URL に出せます。

```bash
PROJECT=<project> VITE_API_BASE=<Cloud Run の URL> node infra/write-web-env.mjs   # web/.env.production.local を作る
(cd web && npm run build)
PROJECT=<project> node infra/deploy-hosting.mjs
PROJECT=<project> node infra/deploy-rules.mjs
```

メールの見た目は `cd server && npm run mail:preview` で HTML を書き出して確認できます。App Check（reCAPTCHA Enterprise のキー作成と Web アプリの登録）は `PROJECT=<project> node infra/setup-appcheck.mjs`、監視は `node infra/setup-monitoring.mjs` で設定できます（どちらも再実行しても重複しません）。

### 4. 予算のキルスイッチ（任意）

Cloud Billing で予算と Pub/Sub 通知を作り、`infra/budget-guard` を Cloud Run 関数としてデプロイします（環境変数 `TARGET_PROJECT`、`KILL_AT_JPY`）。関数のサービスアカウントには、対象プロジェクトの課金設定を変更できる権限（`roles/billing.projectManager` など）が必要です。

### 自動デプロイ（GitHub Actions）

- `ci.yml`: プルリクエストと `dev`・`main` への push で、Web の型チェック・lint・ビルド、サーバーの型チェックとテスト、Firestore ルールのテストを行います。
- `branch-flow.yml`: `main` へのプルリクエストが `dev` から来ているかを確かめます。作業ブランチ → `dev` → `main` の順にしか入りません。
- `deploy-web.yml`: `main` への push で Web を Firebase Hosting に出します。認証は Workload Identity Federation（鍵なし）で、このリポジトリの `main` からだけ Hosting のデプロイ権限しかないサービスアカウントになれます。fork では動かないようにしています。
- API サーバー（Cloud Run）は変更頻度が低いので手動デプロイです。

## コントリビュート

バグ報告・提案・プルリクエストを歓迎します。開発の流れ、チェック項目、コードの書き方は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。

## クレジット

使っているライブラリ・フォント・データの一覧とライセンスは [docs/credits.md](docs/credits.md) にあります。

コードは [MIT License](LICENSE) で公開しています。サンプル写真・カードイラストなどの生成物は Gemini（Vertex AI）で作ったもので、外部サービス（Google 検索、Wikimedia、YouTube）の内容はそれぞれの規約に従います。

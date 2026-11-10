# API

API サーバー（`server/`、Cloud Run の `monoshiri-api`）のエンドポイントです。全体の流れは [architecture.md](architecture.md) にあります。

## 共通の決まり

- `/api/health` 以外は `Authorization: Bearer <Firebase ID トークン>` が必要です。Web 版は `X-Firebase-AppCheck`（App Check のトークン）も付けます。
- 1ユーザーあたり、POST は5分に120回、GET は5分に300回までです。生成の同時実行は3つまで、本文は 4MB までです。
- 解説・深掘り・クイズ・写真と動画・図解・動画は `level`（`std`・`lower`・`upper`・`junior`・`senior`）を受け取ります。`std` 以外は段階ごとのキャッシュを使います。
- 深掘り・クイズ・写真と動画・イラスト・図解・動画は、解説のキャッシュにあるモノに対してだけ動きます。深掘り・図解・動画・写真と動画は、その解説に含まれる問いに限ります（どの段階で調べたモノの問いでも使えます）。汎用の Gemini の入口として使われないようにするためです。

## エンドポイント

| メソッドとパス | 内容 | キャッシュ | 費用 |
|---|---|---|---|
| `GET /api/health` | 死活確認 | — | なし |
| `GET /api/usage` | 推定利用額（全体と自分）と上限、残りの動画本数 | — | なし |
| `GET /api/known` | そのモノの解説が、もう誰かに作られているか（キャッシュを読むだけ） | — | なし |
| `POST /api/detect` | SafeSearch で確認してから、画像からモノと位置を検出する（`{ image }`）。画像は保存しない | なし | 小 |
| `POST /api/explore/stream` | 解説を2段階で返す（SSE: `quick`＝名前から説明までの前半 / `done`＝完成版 / `error`）。キャッシュ済み・言い換えは `done` を1回だけ | `cache_explore`・`explore_alias` | 中 |
| `POST /api/explore` | 同じ解説を一度に返す（`{ label, image?, from?, level? }`）。図鑑のカードの補足、事前生成（`infra/prewarm.mjs`）、古い版のアプリが使う。カードの ID は段階によらず同じ | `cache_explore`・`explore_alias` | 中 |
| `POST /api/deep` | 問いの深掘り（SSE: `delta` / `done` / `error`） | `cache_deep` | 中 |
| `POST /api/quiz` | 3択クイズ（`{ name, topic, level }`）。元の文はサーバーが深掘りの本文から取る。出力の形を検証する | `cache_quiz` | 小 |
| `GET /api/media` | テーマに合う写真（Commons から Gemini が選び、SafeSearch で確認）と YouTube 動画（セーフサーチ厳格） | `cache_media` | 小 |
| `POST /api/illustrate` | カードのイラスト（`{ name }`）。英語名はサーバーが解説から取る | `cache_illust` | 大 |
| `POST /api/diagram` | 図解イラスト（`{ name, topic, level }`）。要点はサーバーが深掘りの本文から作る | `cache_diagram` | 大 |
| `POST /api/tts` | 読み上げの音声（最大 900 字）。`ref: { name, topic?, level }` の解説・深掘りの本文に含まれる文だけ | `cache_tts` | 小 |
| `POST /api/units` | 学校の単元（最大3つ、`{ id, why }`。id は `curriculum.json` のもの） | `cache_units` | 小 |
| `POST /api/events` | 学びのイベント（日ごとの合計回数だけを数える） | — | なし |
| `POST /api/mail/verify` | 自分のアカウントの確認メールを送る（メール／パスワードで未確認のときだけ） | — | なし |
| `POST /api/mail/reset` | パスワード再設定のメールを送る（`{ email }`）。登録の有無にかかわらず同じ応答を同じ時間で返す | — | なし |
| `POST /api/video`、`GET /api/video/:id` | AI 動画の開始と状態の確認（合計 `VIDEO_LIMIT` 本まで） | `cache_video` | 特大 |
| `GET /media/*` | 生成したメディアの配信（Range 対応） | ブラウザに1年 | なし |

## エラー

本文は `{ "error": "<コード>" }` の形です。SSE では `error` イベントで同じ本文を送ります。

| 状態 | コード | 意味 |
|---|---|---|
| 400 | `bad_json`・`bad_label` | 本文やラベルの形が正しくない |
| 400 | `unknown_subject` | 先に解説（explore）していないモノ、または解説にない問い |
| 400 | `unknown_text` | 読み上げの文が、そのモノの本文にない |
| 401 | `unauthenticated` | ID トークンがない、または正しくない・失効している |
| 402 | `budget` | アプリ全体の上限（`CAP_JPY`）に達した |
| 402 | `user_limit` | そのアカウントの上限に達した |
| 403 | `attest_required` | App Check の強制中に、確認できないゲストが新しく生成しようとし、その日の共有の上限（`UNATTESTED_POOL_JPY`）が足りなかった |
| 413 | `too_large` | 本文が大きすぎる |
| 422 | `unsafe_image` | SafeSearch で不適切と判断した写真 |
| 422 | `not_a_thing` | 解説できるモノではなかった |
| 429 | `rate_limited` | レート制限を超えた |
| 429 | `busy` | 同じアカウントの生成が3つ実行中 |
| 429 | `video_limit`・`mail_limit` | AI 動画の本数、またはメールの送信数の上限 |
| 502 | `quiz_failed`・`video_failed` | クイズや動画の生成に失敗した |
| 503 | `busy`・`mail_unavailable` | サーバーが混んでいる、またはメールを送れない設定（アプリは Firebase の標準のメールに切り替える） |

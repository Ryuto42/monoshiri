# デプロイ

自分のプロジェクトに出すときの手順です。`<project>` を自分のプロジェクト ID に置き換えてください。開発環境の作り方は [development.md](development.md) にあります。

## 1. 準備（初回のみ）

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com firebasehosting.googleapis.com \
  vision.googleapis.com

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
# 確認・再設定メールのリンクを作るため（メールを API から送らないなら不要）
gcloud projects add-iam-policy-binding <project> --member=serviceAccount:$SA --role=roles/firebaseauth.admin
gcloud storage buckets add-iam-policy-binding gs://<project>-media --member=serviceAccount:$SA --role=roles/storage.objectAdmin

# YouTube Data API キー（任意）
printf '%s' '<youtube-api-key>' | gcloud secrets create youtube-api-key --data-file=-
gcloud secrets add-iam-policy-binding youtube-api-key --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

## 2. API（Cloud Run）

```bash
cd server && gcloud run deploy monoshiri-api --source=. --region=asia-northeast1 \
  --service-account=monoshiri-api@<project>.iam.gserviceaccount.com --allow-unauthenticated \
  --max-instances=2 \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=<project>,MEDIA_BUCKET=<project>-media,CAP_JPY=1800 \
  --set-secrets=YOUTUBE_API_KEY=youtube-api-key:latest
```

- `--allow-unauthenticated` は Cloud Run の入口を開けるだけで、各 API はアプリ側で Firebase の ID トークンを検証します。
- レート制限は各インスタンスのメモリで数えるので、台数の上限（`--max-instances=2`）を付けておきます。
- 独自ドメインで Web を配信するときは、`ALLOWED_ORIGINS` にそのオリジンを足してください（設定すると既定の一覧を置き換えます）。

確認・再設定のメールを API から送るときは、Gmail のアプリパスワードを Secret Manager の `smtp-password` に入れてから、次を足します（設定しなければ Firebase の標準のメールで送ります）。

```bash
gcloud run services update monoshiri-api --region=asia-northeast1 \
  --update-env-vars=SMTP_USER=monoshiri.app@gmail.com --update-secrets=SMTP_PASSWORD=smtp-password:latest
```

送信元は、モノシリ用の Gmail `monoshiri.app@gmail.com` にします（プライバシーポリシーにも書いてあります）。アプリパスワードは、このアカウントで2段階認証を有効にしてから作ります。

### プライバシーポリシーを変えたときのお知らせ

大事な変更のときは、メールアドレスを確認済みのアカウントにメールでも知らせます（ゲストはアプリの同意の画面だけ）。

1. `web/src/screens/Privacy.tsx` を書き換え、日付を足す。同意し直してほしい変更なら、`web/src/lib/welcome.ts` の `CONSENT_VERSION` を1つ上げる
2. Web と API を公開する
3. おもに変わったところを、1行に1つずつテキストファイルに書く（例 `changes.txt`）
4. 手元で、本番の Firebase に Google Cloud の認証でつないで実行する（Firebase Authentication を読み、Firestore に書ける権限が要る）

```bash
gcloud auth application-default login
cd server
export SMTP_USER=monoshiri.app@gmail.com
export SMTP_PASSWORD="$(gcloud secrets versions access latest --secret=smtp-password)"
# 送らずに、送る相手の数を数え、mail-preview/policy-<id>.html に見た目を書き出す
npm run notify:policy -- --id 2026-11-20 --date 2026年11月20日 --changes changes.txt --reconsent
# 自分あてに1通だけ送って、見た目を確かめる（記録しない）
npm run notify:policy -- --id 2026-11-20 --date 2026年11月20日 --changes changes.txt --reconsent --test-to <自分のアドレス>
# まだ送っていない人に、最大400通送る
npm run notify:policy -- --id 2026-11-20 --date 2026年11月20日 --changes changes.txt --reconsent --send
```

- Gmail の上限は1日に約500通なので、1回で送るのは最大400通（`--limit`）。残りは、翌日に同じコマンドをもう一度実行すれば、まだ送っていない人にだけ送る
- 送った人は Firestore の `policyNotices/<id>/sent/<uid>` に記録する（送った時刻だけで、アドレスは残さない）。アプリからは読めない
- `--reconsent` は、`CONSENT_VERSION` を上げたときだけ付ける（メールに「同意の画面がもう一度出ます」と書く）
- 失敗が続いたら途中で止まる。アプリパスワードと、その日の送信数を確かめる

App Check を強制するのは、App Check に対応した Web を公開してからにします。

```bash
gcloud run services update monoshiri-api --region=asia-northeast1 --update-env-vars=APPCHECK_ENFORCE=1
```

## 3. Web（Firebase Hosting）と Firestore ルール

```bash
PROJECT=<project> VITE_API_BASE=<Cloud Run の URL> node infra/write-web-env.mjs   # web/.env.production.local を作る
(cd web && npm run build)
PROJECT=<project> node infra/deploy-hosting.mjs
PROJECT=<project> node infra/deploy-rules.mjs
```

- 公開 URL は Hosting のサイト `monoshiri`（https://monoshiri.web.app）です。スクリプトは、プロジェクトが `monoshiri-df26` のときこのサイトに、ほかのプロジェクトではプロジェクト名のサイトに出します（`SITE=<サイト名>` で変えられます）。
- ログインのポップアップと確認メールもこのドメインで動かすため、`write-web-env.mjs` は `authDomain` を `<サイト>.web.app` にします。自分のプロジェクトで使うときは、Google Cloud の OAuth クライアント（Web client）の承認済みリダイレクト URI に `https://<サイト>.web.app/__/auth/handler` を足してください。
- HTML と画面のパスは `no-cache`（毎回サーバーに確認）、ファイル名にハッシュが付く `/assets/*`（JS・CSS・アイコンフォント）は1年キャッシュです。`deploy-hosting.mjs` は、直前の版の index.html が参照するファイルを1世代残すので、デプロイの直前に開いた画面も壊れません。
- `CHANNEL=<名前> node infra/deploy-hosting.mjs` で、7日で消えるプレビュー URL に出せます。

App Check（reCAPTCHA Enterprise のキー作成と Web アプリの登録）は `PROJECT=<project> node infra/setup-appcheck.mjs`、監視は `node infra/setup-monitoring.mjs` で設定できます（どちらも再実行しても重複しません）。新規登録の上限（IP ごと1時間100件）は `node infra/setup-auth-quota.mjs` で設定します。

## 4. 予算のキルスイッチ（任意）

Cloud Billing で予算と Pub/Sub 通知を作り、`infra/budget-guard` を Cloud Run 関数としてデプロイします（環境変数 `TARGET_PROJECT`、`KILL_AT_JPY`）。関数のサービスアカウントには、対象プロジェクトの課金設定を変えられる権限（`roles/billing.projectManager` など）が必要です。しくみは [cost.md](cost.md) にあります。

## 自動デプロイ（GitHub Actions）

| ワークフロー | 動くとき | 内容 |
|---|---|---|
| `ci.yml` | プルリクエスト、`dev`・`main` への push | Web の型チェック・lint・ビルド、サーバーの型チェックとテスト、Firestore ルールのテスト |
| `branch-flow.yml` | `main` へのプルリクエスト | `dev` から来ているかを確かめる（作業ブランチ → `dev` → `main` の順にしか入らない） |
| `deploy-web.yml` | `main` への push | Web を Firebase Hosting に出す。認証は Workload Identity Federation（鍵なし）で、このリポジトリの `main` からだけ、Hosting のデプロイ権限しかないサービスアカウントになれる。fork では動かない |

API サーバー（Cloud Run）と Firestore ルールは、変更の頻度が低いので手動でデプロイします。

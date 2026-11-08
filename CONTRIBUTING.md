# コントリビューションガイド

モノシリへの関心をありがとうございます。バグ報告・改善提案・プルリクエストを歓迎します。

## はじめる前に

- 大きな変更（新しい画面、API の追加、依存ライブラリの追加など）は、先に Issue で相談してください。
- セキュリティの問題は Issue ではなく [SECURITY.md](SECURITY.md) の手順で非公開に報告してください。
- 開発環境の作り方は [README の「自分の環境で動かす」](README.md#自分の環境で動かす) にあります。AI の呼び出しには自分の Google Cloud プロジェクトが必要です。

## 開発の流れ

1. リポジトリを fork し、`main` からブランチを切る（例: `fix/sheet-swipe`、`feat/quiz-timer`）
2. 変更してローカルで確認する
3. 下のチェックを通す
4. プルリクエストを作る（何を・なぜ変えたか、確認した方法、画面の変更ならスクリーンショット）

### プルリクエスト前のチェック

```bash
cd web && npx tsc -b && npx oxlint --deny-warnings src && npx vite build
cd server && npm run typecheck
```

同じチェックが GitHub Actions（`.github/workflows/ci.yml`）でも走ります。

## コードの書き方

- **TypeScript**: 型エラーと oxlint の警告はゼロにします。
- **コメント**: 「なぜそうしたか」が読み取れない箇所にだけ書きます。関数ごとの説明コメントは書きません。
- **UI**: Tailwind CSS v4 のユーティリティと `web/src/styles.css` のトークン（`--color-*` など）を使います。アニメーションは Motion で、ばねの値は `components/theme.ts` の `spring` に合わせます。
- **アイコン**: Material Symbols Rounded を `<Icon name="..." />` で使います。新しいアイコン名を使ったら `node infra/icons.mjs` でフォントを作り直し、`web/public/fonts/material-symbols-rounded.woff2` もコミットしてください。
- **API**: 新しい生成エンドポイントは、次の 3 つを守ってください。
  - Firestore キャッシュを先に引く
  - `ensureBudget()` で費用の上限を確かめる
  - `explored()` で「アプリで調べたモノ」だけに制限する
- **秘密情報**: API キー・サービスアカウントの鍵・個人情報をコミットしないでください。設定は `.env`（git 管理外）に置き、例は `.env.example` に架空の値で書きます。
- **ネイティブ**: `web/ios`・`web/android` を変えた場合は、どの OS で確認したかをプルリクエストに書いてください。

## コミットメッセージ

英語で短く、[Conventional Commits](https://www.conventionalcommits.org/) の形式にします。

```
feat: save cards before illustration finishes
fix: keep sheet open when swipe is short
docs: describe local setup
```

## ライセンス

コントリビュートしたコードは、このリポジトリと同じ [MIT License](LICENSE) で公開されます。

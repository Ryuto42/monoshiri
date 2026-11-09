## 変更内容

<!-- 何を・なぜ変えたか -->

## 確認したこと

- [ ] `cd web && npx tsc -b && npx oxlint --deny-warnings src && npx vite build`
- [ ] `cd server && npm run typecheck && npm test`
- [ ] `firestore.rules` を変えた場合は `cd web && npm run test:rules`
- [ ] 画面の変更は、スマホ幅とデスクトップ幅で確認した（スクリーンショットを添付）
- [ ] `web/ios`・`web/android` を変えた場合は、確認した OS を書いた
- [ ] API キー・個人情報・`.env` を含めていない

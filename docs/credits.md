# 著作物利用一覧（著作物利用シートの下書き）

## ライブラリ

| 名前 | 用途 | ライセンス |
|---|---|---|
| React / React DOM 19 | UI | MIT |
| babel-plugin-react-compiler / @babel/core / @rolldown/plugin-babel | 自動メモ化（React Compiler） | MIT |
| Vite 8 / @vitejs/plugin-react | ビルド | MIT |
| @tanstack/react-router | ルーティング | MIT |
| Tailwind CSS v4 | スタイル | MIT |
| Motion | アニメーション | MIT |
| marked | Markdown 変換 | MIT |
| BudouX（Google） | 日本語の文節で改行する（見出し・説明文の折り返し） | Apache-2.0 |
| DOMPurify | HTML サニタイズ | Apache-2.0 / MPL-2.0 |
| Dexie | IndexedDB | Apache-2.0 |
| Firebase JS SDK | 認証・Firestore | Apache-2.0 |
| Hono / @hono/node-server | API サーバー | MIT |
| @google/genai | Gemini (Vertex AI) | Apache-2.0 |
| firebase-admin | ID トークン検証・Firestore | Apache-2.0 |
| @google-cloud/storage | メディア保存 | Apache-2.0 |
| google-auth-library | 認証 | Apache-2.0 |
| sharp | 画像の WebP 変換 | Apache-2.0 |
| TypeScript / oxlint / @firebase/rules-unit-testing | 型チェック・lint・ルールのテスト（開発時のみ） | Apache-2.0 / MIT / Apache-2.0 |
| Nodemailer | 確認・再設定メールの送信（SMTP） | MIT-0 |
| @google-cloud/billing / functions-framework | 予算キルスイッチ | Apache-2.0 |
| Capacitor 8（core / ios / android / cli） | iOS・Android アプリ化 | MIT |
| @capacitor/app, haptics, status-bar, splash-screen, browser, keyboard, network | ネイティブ機能 | MIT |
| @capgo/capacitor-social-login | ネイティブの Google ログイン | MPL-2.0 |
| @fontsource/zen-maru-gothic | フォント同梱 | SIL Open Font License 1.1 |

## フォント・アイコン

| 名前 | 提供 | ライセンス |
|---|---|---|
| Zen Maru Gothic | Google Fonts（@fontsource 経由で同梱） | SIL Open Font License 1.1 |
| Material Symbols Rounded | Google Fonts（使うアイコンだけを同梱） | Apache-2.0 |
| SF Symbols | iOS 版のネイティブボタン（Apple 提供のシステムアイコン） | Apple の利用条件に従いアプリ内 UI でのみ使用 |

## データ・コンテンツ

| 名前 | 使い方 | 条件 |
|---|---|---|
| Google 検索（Grounding with Google Search） | 解説の裏付け。検索候補チップは規約どおり無加工で表示 | Vertex AI 利用規約 |
| 学習指導要領（文部科学省。小学校・中学校は平成29年告示、高等学校は平成30年告示） | 単元一覧（`curriculum.json`）の単元名と構成の出典。https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm | 告示（著作権法第13条により権利の目的とならない著作物）。単元名の一部は意味を保って短くした |
| reCAPTCHA Enterprise（Firebase App Check） | Web 版の API 呼び出しがアプリからのものかの確認 | Google Cloud 利用規約 |
| Wikimedia Commons | 深掘り画面の写真。作者・ライセンス・出典ページをアプリ内に表示 | 各画像のライセンス（CC BY / CC BY-SA / PD など） |
| Wikipedia（日本語版） | 要約文とサムネイルを表示し、記事へリンク | CC BY-SA 4.0 |
| YouTube | 動画の埋め込み（youtube-nocookie.com） | YouTube 利用規約 / YouTube API サービス利用規約 |
| AI 生成画像・動画・音声 | カードイラスト、図解、サンプル写真、AI 動画、読み上げは Gemini（Vertex AI）で本プロジェクトが生成 | Google Cloud 利用規約 |

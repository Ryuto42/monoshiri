# モノシリのマーク

虫眼鏡を掲げる、おもちのようなキャラ。アプリアイコン・撮影ボタン・ロゴで、同じマークを使う。

## アプリの外で使うもの（このフォルダ）

| ファイル | 使いどころ |
| --- | --- |
| `icon-orange.svg`、`icon-orange-1024.png`、`icon-orange-512.png` | オレンジの正方形に白いマーク。アカウントのアイコン（Google・GitHub・SNS など）、資料。丸く切り抜かれても収まる |
| `mark-orange.svg`、`mark-orange-1024.png` | オレンジのマークだけ（背景は透明）。白い背景の資料に |
| `mark-white.svg`、`mark-white-1024.png` | 白いマークだけ（背景は透明）。オレンジや暗い背景に |

色はオレンジ `#ef6a3a` と白。

## 元のデータと、作り直し方

- **元は `web/assets/mark.svg` の1つだけ**（24×24。外接矩形の長い辺は、Material Symbols と同じ約20）
- アプリの中では、Web は `web/src/components/BrandMark.tsx`、iOS の撮影ボタンは `web/ios/App/App/Assets.xcassets/BrandMark.imageset`
- マークを変えたら `node infra/app-icons.mjs` を実行する。次のファイルがまとめて描き直される（macOS の Google Chrome を使う）
  - このフォルダのファイル
  - ファビコンと PWA のアイコン（`web/public/`）
  - アプリアイコン・起動画面の元（`web/assets/`）
  - iOS のアプリアイコン・起動画面（`web/ios/App/App/Assets.xcassets/`）
  - Android のアイコン・起動画面（`web/android/app/src/main/res/`）
  - iOS の撮影ボタンの画像（`BrandMark.imageset/mark.svg`）

マークは、オレンジの正方形の58%の大きさに置く（Material Symbols と同じくらいの余白）。

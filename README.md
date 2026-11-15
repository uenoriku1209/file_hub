# File Hub

指定したフォルダ内のファイルをアプリ内でプレビューし、ボタン1つで Office アプリや VS Code で編集できる Electron 製デスクトップアプリです。

## 主な機能

| 画面 | できること |
|---|---|
| **Office** | PDF / Word / Excel / PowerPoint / CSV / 画像 / テキストのプレビュー。「Word で編集」などのボタンで既定の Office アプリを起動。「新規作成」で Word・Excel・PowerPoint を作成（画像の挿入、Excel のシート名・シート数、PowerPoint のスライド数・タイトル、Word のページ数を指定可能） |
| **Code** | `.ts` `.tsx` `.cpp` `.py` など各種ソースコードを Markdown のコードブロックとしてハイライト表示（`.md` は整形表示）。「Code Edit」で VS Code を起動 |
| **Terminal** | アプリ内ターミナル（PowerShell / コマンドプロンプト / PowerShell 7 / Git Bash）。複数タブ対応。Code 画面の「ターミナル」ボタンでそのフォルダから開ける |
| **PDF化** | 各ファイルの「PDF化」ボタン、または「一括PDF化」で一覧に表示中のファイル（タグ・検索で絞り込んだもの）をまとめて変換。保存先（同じ場所 / 「PDF」フォルダ / 任意のフォルダ）と、同名ファイルの扱い（別名 / 上書き）を選択可能 |
| 共通 | フォルダツリー、拡張子タグでの絞り込み（複数選択可）、ファイル名検索、サブフォルダを含めた一括検索、並び替え、ライト / ダークモード切替（左下のスイッチ） |

---

## 必要なもの

- **Windows 10 / 11**（.exe を作る場合）
- **Node.js 22 以上**（LTS 推奨）… https://nodejs.org/
- **VS Code**（Code Edit ボタン用）… インストール時に「PATH への追加」にチェック
- Microsoft Office（編集ボタンで開くアプリ）

> ターミナル機能で使う `node-pty` は Windows 用のビルド済みバイナリを同梱しているため、**Visual Studio Build Tools や Python のインストールは不要**です。

---

## 方法A：zip をそのまま使う（おすすめ）

PowerShell で以下を実行します。

```powershell
# 1. zip を展開したフォルダに移動
cd C:\path\to\file-hub

# 2. 依存パッケージをインストール（Electron 本体のダウンロードも行われます）
npm install

# 3. 開発モードで起動して動作確認
npm run dev

# 4. Windows 用インストーラー (.exe) を作成
npm run build:win
```

`dist\FileHub-1.0.0-setup.exe` が作成されます。インストール不要の実行フォルダが欲しい場合は `npm run build:unpack` を実行すると `dist\win-unpacked\FileHub.exe` ができます。

---

## 方法B：`npm create` で作った環境に組み込む

### 1. テンプレートを作成

```powershell
npm create @quick-start/electron@latest file-hub -- --template react-ts
cd file-hub
```

### 2. パッケージを追加

```powershell
# メインプロセスで使うもの（.exe に同梱される）
npm install node-pty@^1.1.0 mammoth exceljs docx pptxgenjs jszip

# 画面側で使うもの（ビルド時にまとめられる）
npm install -D pdfjs-dist react-markdown remark-gfm rehype-highlight highlight.js @xterm/xterm @xterm/addon-fit lucide-react
```

### 3. ファイルを置き換え・追加・削除

zip の中身から、以下をテンプレートにコピーしてください（同名ファイルは上書き）。

**置き換えるファイル**

| ファイル | 変更内容 |
|---|---|
| `package.json` | `scripts` の `postinstall` と `build` を変更（下記） |
| `electron-builder.yml` | node-pty を asar 外に出す設定、アプリ名、Windows インストーラー設定 |
| `eslint.config.mjs` | `resources/**` を除外、ルールを2つ無効化 |
| `tsconfig.node.json` / `tsconfig.web.json` | `include` に `"src/shared/**/*"` を追加 |
| `.gitignore` | `resources/pdfjs` を追加 |
| `src/main/index.ts` | ウィンドウ設定、IPC 登録、テーマ連動 |
| `src/preload/index.ts` / `src/preload/index.d.ts` | 画面に公開する API |
| `src/renderer/index.html` | タイトルと Content-Security-Policy（PDF 表示用に worker / blob を許可） |
| `src/renderer/src/App.tsx` / `src/renderer/src/main.tsx` | 画面全体 |

**追加するファイル / フォルダ**

```
scripts/copy-pdfjs-assets.mjs        … 日本語PDF用のフォントデータを resources/pdfjs にコピー
src/shared/                          … 型定義 (types.ts, api.ts, pdf.ts)
src/main/creators.ts                 … Word / Excel / PowerPoint の新規作成
src/main/fileOps.ts                  … フォルダ一覧・再帰検索・読み込み
src/main/imageSize.ts                … 画像サイズの取得
src/main/ipc.ts                      … 画面との通信
src/main/previews.ts                 … Word / Excel / PowerPoint のプレビュー変換
src/main/terminal.ts                 … ターミナル (node-pty)
src/main/vscode.ts                   … VS Code の起動
src/main/pdfConvert.ts               … PDF 変換 (Office / LibreOffice / 内蔵)
src/renderer/src/assets/app.css      … デザイン（ライト / ダーク）
src/renderer/src/components/         … サイドバー、フォルダツリー、ファイル一覧、新規作成・PDF変換ダイアログ
src/renderer/src/lib/                … 拡張子タグ定義、表示用ユーティリティ、通知、PDF用HTML生成
src/renderer/src/pages/              … Office / Code / Terminal の各画面
src/renderer/src/previews/           … 各ファイル形式のプレビュー
```

**削除するファイル**（テンプレートのサンプル）

```
src/renderer/src/components/Versions.tsx
src/renderer/src/assets/base.css
src/renderer/src/assets/main.css
src/renderer/src/assets/electron.svg
src/renderer/src/assets/wavy-lines.svg
```

### 4. `package.json` の scripts

```jsonc
"build": "node scripts/copy-pdfjs-assets.mjs && npm run typecheck && electron-vite build",
// 元: "install-electron && electron-builder install-app-deps"
"postinstall": "install-electron && node scripts/copy-pdfjs-assets.mjs",
```

`electron-builder install-app-deps` を外しているのは、node-pty をソースから再ビルドしようとして C++ ビルドツールを要求されるのを防ぐためです（ビルド済みバイナリで動きます）。

### 5. `electron-builder.yml` の主な変更点

```yaml
appId: com.filehub.app
productName: File Hub
asarUnpack:
  - resources/**
  - node_modules/node-pty/**   # ← ターミナル用のネイティブモジュールを asar の外に置く
win:
  executableName: FileHub
  target:
    - target: nsis
      arch: [x64]
npmRebuild: false
publish: null
```

### 6. 起動とビルド

```powershell
npm install        # postinstall で PDF 用データがコピーされる
npm run dev        # 開発モード
npm run build:win  # dist\FileHub-1.0.0-setup.exe を作成
```

---

## PDF 変換の仕組み

| ファイル | 変換方法 |
|---|---|
| Word / Excel / PowerPoint / CSV | **Microsoft Office**（インストール済みの Office を裏で起動して書き出し。見た目が最も正確）。Office がない、または失敗した場合は **LibreOffice** を自動で使用 |
| 画像 | アプリ内蔵の機能で A4 1ページに収めて PDF 化（横長の画像は横向き） |
| テキスト / ソースコード / Markdown | アプリ内蔵の機能で PDF 化（コードは色付き・長い行は折り返し、Markdown は整形） |

- Office での変換中、ファイルは**読み取り専用・マクロ無効**で開くため、元のファイルが変更されることはありません。
- PowerPoint などをすでに開いている場合も、そのウィンドウは閉じません。
- Excel はブック内の全シートを、各シートの印刷設定（印刷範囲・改ページ）に従って出力します。
- LibreOffice を使う場合は https://ja.libreoffice.org/ からインストールしてください（既定の場所にあれば自動で見つかります）。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発モードで起動（保存すると画面が自動更新） |
| `npm run build:win` | Windows 用インストーラー (.exe) を作成 |
| `npm run build:unpack` | インストール不要の実行フォルダを作成 |
| `npm run typecheck` | 型チェック |
| `npm run lint` | ESLint |

---

## トラブルシューティング

- **Code Edit を押しても VS Code が開かない**
  VS Code をインストールし直す際に「PATH への追加」にチェックを入れるか、VS Code でコマンドパレット →「Shell Command: Install 'code' command in PATH」を実行してください。通常のインストール先（`%LOCALAPPDATA%\Programs\Microsoft VS Code`）にあれば PATH がなくても起動します。
- **.exe を実行すると「Windows によって PC が保護されました」と表示される**
  コード署名をしていないためです。「詳細情報」→「実行」で起動できます。
- **`npm install` で Electron のダウンロードに失敗する**
  社内プロキシ環境などでは `npm config set proxy` / `https-proxy` を設定してから再実行してください。
- **PDF化で「Microsoft Word での変換に失敗しました」と出る**
  ファイルが他のアプリで編集中だったり、パスワード付きだったりすると変換できません。Office を一度起動して、ライセンス認証や初回設定のダイアログが出ていないかも確認してください。変換方法を「LibreOffice」に切り替えて試すこともできます。
- **Excel の PDF が途中で切れる / ページが多すぎる**
  Excel の「ページレイアウト」で印刷範囲や「1ページに収める」を設定して保存してから変換してください。
- **.doc / .xls / .ppt（旧形式）がプレビューできない**
  旧形式はアプリ内プレビューに対応していません。「〜で編集」ボタンから Office で開けます。
- **PowerPoint のプレビューがレイアウト通りでない**
  テキストと画像を抜き出した簡易表示です。正確な見た目は「PowerPoint で編集」で確認してください。

## カスタマイズのヒント

- 表示する拡張子やタグを増やす … `src/renderer/src/lib/fileTypes.ts` の `OFFICE_CATEGORIES` / `CODE_CATEGORIES`
- 色やデザインを変える … `src/renderer/src/assets/app.css` 冒頭の CSS 変数（`--accent`, `--grad` など）
- アプリのアイコン … `build/icon.ico`（Windows）と `resources/icon.png` を差し替え

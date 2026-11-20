# File Hub

指定したフォルダ内のファイルをアプリ内でプレビューし、ボタン1つで Office アプリや VS Code で編集できる Electron 製デスクトップアプリです。

## 主な機能

| 画面 | できること |
|---|---|
| **Office** | PDF / Word / Excel / PowerPoint / CSV / 画像 / テキストのプレビュー。Word はページ・フォント・表・画像・ヘッダー/フッターまで Word に近い見た目（「テキスト」表示にも切り替え可）、Excel は色・罫線・結合セル・列幅・表示形式つきで、セルを選ぶと数式を表示、PowerPoint は図形・文字・画像を実際の配置どおりにスライドで表示。Office か LibreOffice があれば「PDF で正確に」で印刷イメージどおりに表示（一度作った PDF は使い回す）。「Word で編集」などのボタンで既定の Office アプリを起動。「新規作成」で Word・Excel・PowerPoint を作成（画像の挿入、Excel のシート名・シート数、PowerPoint のスライド数・タイトル、Word のページ数を指定可能） |
| **Code** | `.ts` `.tsx` `.cpp` `.py` など各種ソースコードを Markdown のコードブロックとしてハイライト表示（`.md` は整形表示）。「Code Edit」で VS Code を起動 |
| **ターミナル** | Office / Code 画面のプレビュー欄上部のタブで「ターミナル」に切り替えると、閲覧中のフォルダで作業できる。「追従」オンならフォルダを移動すると自動で `cd`。シェル（PowerShell / コマンドプロンプト / PowerShell 7 / Git Bash）の切替・再起動に対応。画面を切り替えても動き続ける |
| **PDF化** | 各ファイルの「PDF化」ボタン、または「一括PDF化」で一覧に表示中のファイル（タグ・検索で絞り込んだもの）をまとめて変換。保存先（同じ場所 / 「PDF」フォルダ / 任意のフォルダ）と、同名ファイルの扱い（別名 / 上書き）を選択可能 |
| **コマンド** | 左のタブ「コマンド」。よく使うコマンドを「コマンド・内容」で登録して一覧（検索・編集・削除・コピー）。▶ ボタンで直前に開いていた画面のターミナルに入力（Enter は押さないので確認してから実行） |
| **Git** | 右上の Git ボタン（枝分かれのアイコン）で、プレビュー欄が Git 画面に切り替わる（「戻る」でターミナル / プレビューに戻る）。「1. 送るファイルを選ぶ（add）→ 2. 記録する（commit）→ 3. 送る（push）」の順に、いまの操作だけが枠で囲まれ、終わると緑の線が次の段階へ伸びる。プッシュ・プルはターミナルで実行し、合言葉（パスフレーズ）を聞かれたら Git 画面に入力欄が出る。ブランチの切り替え・作成、履歴、リモート URL の変更（SSH → HTTPS 切り替え）にも対応。Git 管理されていないフォルダでは初期設定画面（リポジトリ作成・ブランチ名・.gitignore・初回コミット・リモート登録・プッシュ）を表示 |
| **欄の幅の変更** | フォルダ・ファイル・プレビューの各欄の間のつまみをドラッグして幅を変更。端まで寄せて離す（または欄の右上のボタン）と、その欄は左の Office / Code タブの下にしまわれ、押すと元に戻る（2 つのときは 1:1、3 つそろうと標準の幅） |
| **プロジェクト作成** | Code 画面右上の「プロジェクトを作成」で、表示中のフォルダの中に環境構築済みのプロジェクトを作る（`apps/` を開いていれば `apps/<名前>`）。「アプリ開発（Node.js）」では、このパソコンにある Node（既定のもの＋fnm / nvm / Volta で入れたもの）とパッケージマネージャー（npm / pnpm / yarn / bun）を自動で調べて選択でき、ビルドツールは Vite（React / Vue / Svelte / なし）・Next.js + Turbopack・Electron + Vite・Node.js + TypeScript から選ぶ。`node_modules` の作成と `git init` も選べる。「Python の開発（uv）」では、uv で使える Python のバージョン（インストール済み / 自動ダウンロード）を選んで `uv init` → `.venv`・`uv.lock` まで作る。uv が入っていなければ、winget / Homebrew / Astral 公式インストーラーから選んで、確認のうえインストールできる |
| **パッケージ管理** | `pyproject.toml`（uv）や `package.json` があるフォルダを開くと、プレビュー欄に「パッケージ」タブが出る。パッケージ名を入れて「追加」で `uv add`（Node は `npm install` / `pnpm add` など、lock ファイルから自動判定）を実行し、設定ファイル・lock・`.venv` / `node_modules` をまとめて更新。一覧から削除、`uv sync` / `npm install` で環境を作り直す、「すべて更新」で範囲内の最新にする、も可能。開発用（`--dev` / `-D`）にも対応 |
| **フォルダ作成** | ファイル一覧上部のフォルダ＋ボタンで、表示中のフォルダの中に新しいフォルダを作成 |
| **ファイル操作** | ファイル・フォルダを右クリック（または行の「…」）で、開く・エクスプローラー（Mac は Finder）で表示・名前を変更（F2）・移動・zip に圧縮・パスをコピー・ごみ箱に移動（Delete、Mac は ⌘⌫。ごみ箱から戻せる）。移動は「移動…」で行き先を選ぶか、行をつまんで一覧のフォルダ／フォルダツリーに落とす（同じ名前があれば番号を付ける） |
| **圧縮ファイル** | zip・7z・rar・tar などを一覧に表示。zip は中身をプレビューでき、「展開する」で同じ場所に展開（中身が 1 つのフォルダだけなら二重にしない。Windows で作った日本語名の zip にも対応）。7z・rar は 7-Zip がインストールされていれば展開できる（Mac は標準の機能で zip・tar を展開。7z・rar は `brew install sevenzip` があれば確実） |
| 共通 | フォルダツリー、拡張子タグでの絞り込み（複数選択可）、ファイル名検索、サブフォルダを含めた一括検索、並び替え、ライト / ダークモード切替（左下のスイッチ） |

---

## 必要なもの

- **Windows 10 / 11**（.exe を作る場合）または **macOS**（.dmg を作る場合。Mac 用は Mac 上でビルドする）
- **Node.js 22 以上**（LTS 推奨）… https://nodejs.org/
- **VS Code**（Code Edit ボタン用）… インストール時に「PATH への追加」にチェック
- Microsoft Office（編集ボタンで開くアプリ）
- 任意: **uv**（Python のプロジェクト作成・パッケージ管理）… アプリ内からインストール可能

### macOS で使う場合

- `npm install` → `npm run dev` で起動、`npm run build:mac` で `.dmg` を作れます。
- Finder から起動しても、ターミナルと同じ PATH（Homebrew の `/opt/homebrew/bin`、`~/.local/bin` など）を読み込むので、git・uv・node が見つかります。
- PDF 化は LibreOffice（`/Applications/LibreOffice.app`）を使います（Microsoft Office を使った変換は Windows のみ）。
- 署名していない `.dmg` は初回に「開発元を確認できない」と出ます。アプリを右クリック →「開く」で起動できます。

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
src/shared/                          … 型定義 (types.ts, api.ts, pdf.ts, git.ts)
src/main/creators.ts                 … Word / Excel / PowerPoint の新規作成
src/main/fileOps.ts                  … フォルダ一覧・再帰検索・読み込み
src/main/imageSize.ts                … 画像サイズの取得
src/main/ipc.ts                      … 画面との通信
src/main/previews.ts                 … Word / Excel / PowerPoint のプレビュー変換
src/main/terminal.ts                 … ターミナル (node-pty)
src/main/vscode.ts                   … VS Code の起動
src/main/pdfConvert.ts               … PDF 変換 (Office / LibreOffice / 内蔵)・プレビュー用 PDF
src/main/officeWorker.ts             … Office を開いたまま変換する常駐ワーカー
src/main/fileManage.ts               … ごみ箱・名前の変更・移動・zip の展開/圧縮
src/main/xlsxPreview.ts              … Excel の書式つきプレビュー
src/main/git.ts                      … Git 操作 (状態・コミット・プッシュ・ブランチ・初期設定)
src/main/commands.ts                 … 登録コマンドの保存
src/renderer/src/assets/app.css      … デザイン（ライト / ダーク）
src/renderer/src/components/         … サイドバー、フォルダツリー、ファイル一覧、ターミナル、新規作成・PDF変換ダイアログ
src/renderer/src/lib/                … 拡張子タグ定義、表示用ユーティリティ、通知、PDF用HTML生成
src/renderer/src/pages/              … Office / Code / コマンドの各画面
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
| Word / Excel / PowerPoint / CSV | **Microsoft Office**（インストール済みの Office を裏で起動して書き出し。見た目が最も正確）。Office がない、または失敗した場合は **LibreOffice** を自動で使用。Office は一度起動したら開いたまま次々に変換し（変換画面を開いた時点で先に起動）、90 秒使わなければ自動で終了。LibreOffice は専用の設定を使い回して起動を速くしている |
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

- **Git 画面に「Git がインストールされていません」と出る**
  Windows は https://git-scm.com/ から Git for Windows を、Mac はターミナルで `xcode-select --install` を実行してから、File Hub を再起動してください。
- **プロジェクト作成で uv / node / pnpm が見つからないと出る**
  インストール直後は「再検出」を押してください。それでも見つからない場合は File Hub を再起動してください（PATH を読み直します）。
- **プロジェクト作成が途中で止まる・失敗する**
  初回は雛形やパッケージのダウンロードに数分かかります。ネットワーク（社内プロキシなど）を確認し、ログの最後の行を見てください。失敗して途中までできたフォルダは、削除してから作り直してください。
- **プッシュで「認証に失敗しました」と出る**
  Git for Windows に付属の Git Credential Manager を使うと、初回プッシュ時にブラウザで GitHub にログインできます。うまくいかない場合は、ターミナルタブで一度 `git push` を実行してログインしてください。
- **「GitHub に新規作成」が選べない**
  GitHub CLI（https://cli.github.com/）をインストールし、ターミナルで `gh auth login` を実行してから Git 画面の ↻ を押してください。

## カスタマイズのヒント

- 表示する拡張子やタグを増やす … `src/renderer/src/lib/fileTypes.ts` の `OFFICE_CATEGORIES` / `CODE_CATEGORIES`
- 色やデザインを変える … `src/renderer/src/assets/app.css` 冒頭の CSS 変数（`--accent`, `--grad` など）
- アプリのアイコン … `build/icon.ico`（Windows）と `resources/icon.png` を差し替え

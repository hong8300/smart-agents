# 導入ガイド

Smart Agents を使い始めるまでの手順です。上から順に進めてください。

1. [3 つの CLI をインストールしてログインする（認証情報の設定）](#1-cli-のインストールとログイン認証情報の設定)
2. [ビルドに必要なツールを入れる](#2-ビルドに必要なツール)
3. [アプリをビルドして起動する](#3-アプリのビルドと起動)
4. [初回の確認](#4-初回の確認)

うまくいかないときは [トラブル対処](#5-トラブル対処) を見てください。

---

## 1. CLI のインストールとログイン（認証情報の設定）

Smart Agents 自体は **API キーやパスワードを持ちません**。各 CLI に自分のアカウントでログインしておけば、アプリはその CLI を呼び出すだけです。認証情報は各 CLI が自分で保存・管理しており、アプリが読むことはありません。

| エージェント | CLI | ログインに使うアカウント |
|---|---|---|
| クロ | Claude Code（`claude`） | Claude（Pro / Max などのサブスクリプション） |
| アニー | Antigravity CLI（`agy`） | Google アカウント |
| コデック | OpenAI Codex CLI（`codex`） | ChatGPT アカウント |

使わないエージェントは入れなくてもかまいません（あとで設定から外せます）。

### 1-1. Claude Code（クロ）

**インストール**

[公式サイト](https://claude.com/claude-code) の手順でインストールします。npm でも入れられます。

```bash
npm install -g @anthropic-ai/claude-code
```

**ログイン**

```bash
claude auth login
```

ブラウザが開くので、Claude のアカウントでログインします（`claude` を対話起動してログインしてもかまいません）。

**確認**

```bash
claude auth status
```

`"loggedIn": true` と `"authMethod": "claude.ai"` が出ていれば OK です。

> [!IMPORTANT]
> 環境変数 `ANTHROPIC_API_KEY` を設定していると、サブスクリプションではなく API キー（従量課金）で動くことがあります。サブスクリプションの範囲で使いたい場合は、`authMethod` が `claude.ai` になっていることを確認してください。

### 1-2. OpenAI Codex CLI（コデック）

**インストール**

```bash
npm install -g @openai/codex
# macOS なら Homebrew でも可
brew install --cask codex
```

詳しくは [公式ドキュメント](https://developers.openai.com/codex/cli) を見てください。

**ログイン**

```bash
codex login
```

ブラウザが開くので、ChatGPT のアカウントでログインします。認証情報は `~/.codex/auth.json` に保存されます。

**確認**

```bash
codex login status
```

`Logged in using ChatGPT` と出れば OK です。

> [!NOTE]
> 画像生成には Codex の `image_generation` 機能を使います。最近のバージョンでは最初から有効です。`codex features list | grep image_generation` で `true` になっているかを確認できます。

### 1-3. Antigravity CLI（アニー）

**インストール**

Antigravity CLI を公式の案内に従ってインストールします。インストール後に次を実行すると、PATH が設定されます。

```bash
agy install
```

**ログイン**

ターミナルで `agy` を一度だけ対話起動し、画面の案内に従って Google アカウントでログインします。

```bash
agy
```

**確認**

```bash
agy --version
agy models      # ログインできていればモデルの一覧が出る
```

---

## 2. ビルドに必要なツール

アプリは [Tauri v2](https://v2.tauri.app/) で作られています。ソースからビルドするには次のツールが必要です。

| ツール | macOS | Windows |
|---|---|---|
| Node.js 22 以上 | `brew install node` など | [nodejs.org](https://nodejs.org/) のインストーラー |
| Rust（stable） | [rustup](https://rustup.rs/) | [rustup](https://rustup.rs/)（MSVC ツールチェーン） |
| OS のビルドツール | Xcode Command Line Tools（`xcode-select --install`） | Microsoft C++ Build Tools（「C++ によるデスクトップ開発」）と WebView2 |

OS ごとの詳しい手順は [Tauri の前提ツール](https://v2.tauri.app/start/prerequisites/) を見てください。Linux でもビルドできるはずですが、動作は確認していません。

確認:

```bash
node --version    # v22 以上
cargo --version
```

---

## 3. アプリのビルドと起動

```bash
git clone https://github.com/hong8300/smart-agents.git
cd smart-agents
npm install
```

### 開発モードで起動する

```bash
npm run tauri dev
```

初回は Rust のコンパイルに数分かかります。2 回目からはすぐ起動します。

### アプリとしてビルドする

```bash
npm run tauri build
```

`src-tauri/target/release/bundle/` に次のファイルができます。

| OS | 出力 |
|---|---|
| macOS | `macos/Smart Agents.app`、`dmg/Smart Agents_<版>_<CPU>.dmg` |
| Windows | `msi/*.msi`、`nsis/*-setup.exe` |

macOS では `.app` を「アプリケーション」フォルダへドラッグすれば、ほかのアプリと同じように使えます。Windows ではインストーラーを実行します。Windows 版は Windows 上でビルドしてください。

> [!NOTE]
> このアプリはコード署名をしていません。自分でビルドしたものはそのまま開けます。ほかの人がビルドした `.dmg` を受け取った場合、macOS では「開発元を確認できない」と表示されます。その場合は、アプリを右クリックして「開く」を選ぶか、次を実行してください。
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Smart Agents.app"
> ```

---

## 4. 初回の確認

1. アプリを起動して **設定**（⌘, / Ctrl+,）を開く
2. 左の「エージェント」から **クロ / アニー / コデック** を順に選び、下のほうにある **「接続テスト」** を押す
   - `✓ 2.x.x (Claude Code)` のようにバージョンが出れば OK
   - `✗ コマンド「…」が見つかりません` と出たら、[トラブル対処](#コマンドが見つからない) を見る
3. アニーとコデックは **「モデル一覧を更新」** を押すと、CLI から最新のモデル一覧を取得できる（起動時にも自動で取得します）
4. 使わないエージェントは、右上の **「会話に参加する」** のチェックを外す
5. **保存** を押して閉じ、短いお題（例:「雨の日に家で楽しめることを挙げて」）を送ってみる

3 人の「入力中…」が出て、順番に返事が表示されれば準備完了です。使い方は [使い方ガイド](USER_GUIDE.md) を見てください。

---

## 5. トラブル対処

### コマンドが見つからない

`コマンド「claude」が見つかりません` などと出る場合:

1. ターミナルで CLI の場所を調べる
   - macOS: `which claude`（`agy`・`codex` も同じ）
   - Windows: `where claude`
2. 設定 → 該当エージェント → **コマンド** に、表示されたフルパスを入れる（例: `/opt/homebrew/bin/claude`）
3. 「接続テスト」で確認する

macOS で Finder から起動した場合でも、アプリはログインシェル（zsh など）の PATH を読み込んで CLI を探します。それでも見つからないときは、上の手順でフルパスを指定してください。

### ログインや認証のエラーが出る

吹き出しに「エラーで応答できませんでした」と出て、詳細に認証関連のメッセージがある場合は、ターミナルでログインし直してください。

| CLI | ログイン | 状態の確認 |
|---|---|---|
| claude | `claude auth login` | `claude auth status` |
| codex | `codex login` | `codex login status` |
| agy | `agy`（対話起動してログイン） | `agy models` |

### アニー（agy）の返事が空になる・エラーになる

- `agy models` が動くか確認する（ログインできているか）
- 利用枠が足りないと、詳細に `Your AI credits balance is too low` と出ます。Antigravity 側で残量を確認してください

### 返事が来ない・タイムアウトする

- 設定 →「全般」→ **1 回の応答のタイムアウト（秒）** を増やす（既定 300 秒）
- 画像生成は 1 人あたり 30〜100 秒ほどかかります
- エフォートを下げる（`low` / `medium`）と速くなります

### 会話がすぐに終わる

エージェントが「結論が出た」と判断すると止まります。続けたいときは、通知の **▶ 続ける** を押すか、メッセージを送ってください。

### 画像が出ない

- コデック: `codex features list | grep image_generation` が `true` か確認する
- アニー: `agy models` が動くか確認する
- クロ: Claude には画像生成機能がないので、SVG のイラストを描きます。うまく描けないときは、もう一度頼んでください

### 設定や履歴を初期化したい

アプリを終了してから、データフォルダを削除します。

- macOS: `~/Library/Application Support/dev.hong.smartagents/`
- Windows: `%APPDATA%\dev.hong.smartagents\`

設定だけを戻したいなら `settings.json`、履歴だけを消したいなら `chats.json` と `images/` を削除します。

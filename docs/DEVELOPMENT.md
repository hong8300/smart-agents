# 開発者向け

## 技術スタック

| 層 | 使っているもの |
|---|---|
| デスクトップ | [Tauri v2](https://v2.tauri.app/)（Rust） |
| 画面 | React 19 + TypeScript + Vite、状態管理は zustand、Markdown 表示は react-markdown + remark-gfm |
| エージェント | 各 CLI を子プロセスとして毎ターン起動（`claude -p` / `agy` / `codex exec`） |

## ディレクトリ構成

```
src/                      フロントエンド（React）
  orchestrator.ts         会話の進行（話者の選択、ターン数、停止、返信を順番に表示する処理）
  prompt.ts               プロンプトの組み立て、返信の解析（[[END]] / [[ASK]] / [[REACT]] / @指名 / SVG）、吹き出しの分割
  store.ts                状態管理と保存（zustand）
  defaults.ts             既定の設定とモデル一覧
  sound.ts                効果音（WebAudio で合成）
  avatars.ts              プリセットのアイコン（SVG）
  components/             画面（ChatView、Messages、Composer、SettingsModal など）
src-tauri/src/
  agents.rs               CLI の起動、JSON Lines の解析とストリーミング、停止、生成画像の回収、モデル一覧の取得
  shellpath.rs            ログインシェルの PATH を取得（Finder から起動しても CLI を見つけるため）
  storage.rs              設定と履歴の JSON 保存
docs/                     ドキュメント
app-icon.svg              アプリアイコンの元画像（`npx tauri icon app-icon.svg -o src-tauri/icons`）
```

## 開発の始め方

```bash
npm install
npm run tauri dev        # ホットリロード付きで起動
npx tsc --noEmit         # 型チェック
npm run tauri build      # 配布用ビルド
```

前提ツールは [導入ガイド](SETUP.md#2-ビルドに必要なツール) を見てください。

## 1 ターンの流れ

1. `orchestrator.ts` が次に話すエージェントを決める（お題の直後は全員、その後は `@指名` か順番）
2. `prompt.ts` がプロンプトを組み立てる。参加者の紹介、発言のルール、直近の会話（既定 40 件）を含む
3. Rust の `run_agent` が CLI を起動し、標準入力でプロンプトを渡す
4. CLI の JSON Lines 出力を解析し、本文の追記・途中経過（「ファイルを読んでいます」など）を Tauri の Channel で画面に送る
5. 終わったら最終的な本文、モデル名、生成画像のパスを返す
6. 画面は返信を **チャットごとの表示キュー** に入れ、1 つずつ・吹き出しごとに間を置いて表示する
7. 最大ターン数、`[[END]]`（全員）、`[[ASK]]`、停止のどれかで止まる

会話の文脈は CLI のセッションには持たせず、毎回プロンプトに含めています。3 つの CLI を同じ方法で扱えて、途中でモデルを変えても問題ありません。

## エージェントとの約束事（プロンプト）

| 書き方 | 意味 |
|---|---|
| `@名前` | 次に話す人の指名 |
| `[[END]]`（最後の行） | 結論が出た。同時に話したラウンドでは、全員が出したときだけ終わる |
| `[[ASK]]`（最後の行） | ユーザーへの質問。会話を止めて返事を待つ |
| `[[REACT:😆]]` | 直前の発言への絵文字リアクション |
| ` ```svg ` コードブロック | 画像として表示する（主にクロ用） |
| 空行 | 吹き出しの区切り（LINE 風表示） |

## 各 CLI の呼び出し方

| エージェント | コマンド |
|---|---|
| claude | `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence --strict-mcp-config --settings <claude-settings.json> --model M --effort E --tools ""` |
| agy | `agy --output-format stream-json --disable-slash-commands --model <モデル>-<エフォート>` |
| codex | `codex exec --ignore-user-config --skip-git-repo-check --ephemeral --sandbox read-only -c approval_policy=never --json --color never -C <dir> -m M -c model_reasoning_effort=E -` |

- **claude**: ユーザー設定のフック（完了通知など）が毎ターン動かないよう、`{"disableAllHooks":true}` を書いた `claude-settings.json`（アプリデータ内）を `--settings` で渡します
- **codex**: MCP サーバーや通知の起動を省いて速くするため `--ignore-user-config` を付けます（認証は `~/.codex/auth.json` なので影響しません）
- **agy**: エフォートはモデル ID の末尾（`-low` / `-medium` / `-high`）で指定します。Gemini Pro は high / low のみ、GPT-OSS は medium のみです
- Windows で npm の `.cmd` ラッパー経由になっても壊れないよう、引数にダブルクォートを含めていません
- 停止ボタンを押すと、プロセスグループ（Windows は `taskkill /T`）ごと終了させます

### 安全のための制限

エージェントには、ファイルの書き換えやコマンドの実行をさせません。

| エージェント | 作業フォルダなし | 作業フォルダあり |
|---|---|---|
| claude | ツールなし（`--tools ""`） | `Read` / `Glob` / `Grep` だけを許可 |
| codex | `--sandbox read-only` | 同じ（作業フォルダを `-C` に指定） |
| agy | headless の既定動作（読み取り以外は自動で拒否） | 同じ（作業フォルダで起動） |

作業フォルダを指定しないときは、アプリデータ内の空フォルダ `workspace/` で起動します。

### 生成画像の回収

| エージェント | 回収元 |
|---|---|
| codex | `~/.codex/generated_images/<thread_id>/`（`$CODEX_HOME` があればそちら） |
| agy | `~/.gemini/antigravity-cli/brain/<conversation_id>/`、および本文中の `![](絶対パス)` |
| claude | 本文中の SVG（data URL にして保存） |

見つけた画像はアプリデータの `images/` にコピーし、Tauri の asset プロトコルで表示します。

### モデル一覧の取得

- agy: `agy models` の出力をモデルごと（推論レベル違いをまとめて）に整理
- codex: `codex debug models` の JSON から、非表示でないモデルとその対応エフォートを取得
- claude: 一覧を取得するコマンドがないので、`src/defaults.ts` の固定リストを使う

## データの保存先

| OS | 場所 |
|---|---|
| macOS | `~/Library/Application Support/dev.hong.smartagents/` |
| Windows | `%APPDATA%\dev.hong.smartagents\` |

| ファイル | 内容 |
|---|---|
| `settings.json` | 設定（取得したモデル一覧を含む） |
| `chats.json` | チャット履歴 |
| `images/` | 生成画像 |
| `workspace/` | 作業フォルダ未指定時の実行場所（空） |
| `claude-settings.json` | claude に渡すフック無効化の設定 |

## テスト

```bash
cd src-tauri
cargo test                                            # 単体テスト（CLI 不要）
cargo test -- --ignored --nocapture --test-threads=4  # 実際に 3 つの CLI を呼ぶ結合テスト
```

結合テストには、3 つの CLI のインストールとログインが必要です。各 CLI の利用枠も少し消費します。

| テスト | 内容 |
|---|---|
| `live_claude` / `live_agy` / `live_codex` | 短い挨拶が返ってきて、ストリーミングのイベントが届く |
| `live_file_access` | 作業フォルダの `Cargo.toml` を 3 人とも読める |
| `live_images` | codex と agy の生成画像を回収できる |
| `live_list_models` | agy と codex のモデル一覧を取得できる |
| `live_cancel` | 停止すると数秒以内に終わる |
| `finds_clis_with_minimal_path` | PATH を最小にしても CLI が見つかる（`env -i HOME=$HOME SHELL=/bin/zsh PATH=/usr/bin:/bin <テストバイナリ> --ignored finds_clis` で実行） |

## 動作確認の状況

- macOS（Apple Silicon）: 確認済み
- Windows: Windows 向けの処理（`.cmd` 対応、プロセス停止、コンソール非表示）は入れていますが、未確認です
- Linux: 未確認

//! claude / agy / codex の CLI を非対話モードで起動し、出力（JSON Lines）を解析して
//! フロントエンドへストリーミングする。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{ipc::Channel, AppHandle, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::{shellpath, storage};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

fn default_timeout() -> u64 {
    300
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub run_id: String,
    pub kind: String,
    pub command: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub effort: String,
    pub prompt: String,
    /// 空なら作業フォルダなし（ファイル閲覧ツールも無効）
    #[serde(default)]
    pub work_dir: String,
    #[serde(default = "default_timeout")]
    pub timeout_sec: u64,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    /// 本文の追記
    Delta { text: String },
    /// 表示中の本文を捨てる（ツール使用後に新しいメッセージが始まったときなど）
    Reset,
    /// 「ファイルを読んでいます」などの途中経過
    Status { text: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub text: String,
    pub model: String,
    pub duration_ms: u64,
    /// エージェントが作った画像（アプリデータの images/ にコピーしたもの）の絶対パス
    pub images: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub efforts: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCheck {
    pub ok: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// 実行中プロセスの管理（停止ボタン用）
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct RunRegistry {
    inner: Mutex<Registry>,
}

#[derive(Default)]
struct Registry {
    pids: HashMap<String, u32>,
    cancelled: HashSet<String>,
}

impl RunRegistry {
    /// 起動したプロセスを登録する。登録前に停止要求が来ていたら false
    fn register(&self, run_id: &str, pid: u32) -> bool {
        let mut r = self.inner.lock().unwrap();
        if r.cancelled.contains(run_id) {
            return false;
        }
        r.pids.insert(run_id.to_string(), pid);
        true
    }

    /// 停止要求を記録し、実行中なら pid を返す
    fn cancel(&self, run_id: &str) -> Option<u32> {
        let mut r = self.inner.lock().unwrap();
        r.cancelled.insert(run_id.to_string());
        r.pids.get(run_id).copied()
    }

    /// 終了処理。停止要求されていたかを返す
    fn finish(&self, run_id: &str) -> bool {
        let mut r = self.inner.lock().unwrap();
        r.pids.remove(run_id);
        r.cancelled.remove(run_id)
    }
}

fn kill_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        // 子はプロセスグループのリーダーとして起動しているので、グループごと落とす
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        });
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
}

// ---------------------------------------------------------------------------
// コマンドの組み立て
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Claude,
    Agy,
    Codex,
}

impl Kind {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "claude" => Ok(Kind::Claude),
            "agy" => Ok(Kind::Agy),
            "codex" => Ok(Kind::Codex),
            _ => Err(format!("未知のエージェント種別: {s}")),
        }
    }
}

/// agy はモデル ID に推論レベルが含まれる（例: gemini-3.8-flash-medium）
fn resolve_agy_model(model: &str, effort: &str) -> String {
    let m = model.trim();
    if m.is_empty() {
        return String::new();
    }
    if ["-low", "-medium", "-high"].iter().any(|s| m.ends_with(s)) {
        return m.to_string();
    }
    if m.starts_with("gpt-oss") {
        return format!("{m}-medium");
    }
    let e = match effort {
        "low" | "medium" | "high" => effort,
        "xhigh" | "max" => "high",
        _ => "medium",
    };
    if m.contains("-pro") {
        // Pro は high / low の 2 段階のみ
        return format!("{m}-{}", if e == "high" { "high" } else { "low" });
    }
    format!("{m}-{e}")
}

/// Windows で npm の .cmd ラッパー経由になっても壊れないよう、
/// 引数にダブルクォートを含めない（JSON 設定はファイルで渡す）
fn build_args(kind: Kind, req: &RunRequest, cwd: &Path, file_access: bool, claude_settings: &Path) -> (Vec<String>, String) {
    let model = req.model.trim();
    let effort = req.effort.trim();
    let mut a: Vec<String> = Vec::new();
    let mut push = |xs: &[&str]| a.extend(xs.iter().map(|s| s.to_string()));
    let label;
    match kind {
        Kind::Claude => {
            push(&[
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--no-session-persistence",
                "--strict-mcp-config",
            ]);
            // ユーザー設定のフック（完了通知の音声など）が毎ターン鳴らないようにする
            push(&["--settings", &claude_settings.to_string_lossy()]);
            if !model.is_empty() {
                push(&["--model", model]);
            }
            if !effort.is_empty() {
                push(&["--effort", effort]);
            }
            if file_access {
                push(&["--tools", "Read,Glob,Grep", "--allowedTools", "Read,Glob,Grep"]);
            } else {
                push(&["--tools", ""]);
            }
            label = if model.is_empty() { "claude".into() } else { model.to_string() };
        }
        Kind::Codex => {
            let cwd_s = cwd.to_string_lossy().into_owned();
            push(&[
                "exec",
                // MCP サーバーや通知フックの起動を省いて速くする（認証情報は別ファイルなので影響しない）
                "--ignore-user-config",
                "--skip-git-repo-check",
                "--ephemeral",
                "--sandbox",
                "read-only",
                "-c",
                "approval_policy=never",
                "--json",
                "--color",
                "never",
                "-C",
                &cwd_s,
            ]);
            if !model.is_empty() {
                push(&["-m", model]);
            }
            if !effort.is_empty() {
                let e = format!("model_reasoning_effort={effort}");
                push(&["-c", &e]);
            }
            push(&["-"]);
            label = if model.is_empty() { "codex".into() } else { model.to_string() };
        }
        Kind::Agy => {
            push(&["--output-format", "stream-json", "--disable-slash-commands"]);
            let id = resolve_agy_model(model, effort);
            if !id.is_empty() {
                push(&["--model", &id]);
            }
            label = if id.is_empty() { "agy".into() } else { id };
        }
    }
    (a, label)
}

fn expand_tilde(s: &str) -> PathBuf {
    if let Some(rest) = s.strip_prefix("~/").or_else(|| s.strip_prefix("~\\")) {
        if let Some(h) = shellpath::home_dir() {
            return h.join(rest);
        }
    }
    PathBuf::from(s)
}

fn resolve_program(command: &str, cwd: &Path) -> Result<PathBuf, String> {
    let c = command.trim();
    if c.is_empty() {
        return Err("コマンドが空です。設定でコマンド名かパスを指定してください。".into());
    }
    if c.contains('/') || c.contains('\\') {
        let p = expand_tilde(c);
        return if p.exists() {
            Ok(p)
        } else {
            Err(format!("コマンドが見つかりません: {c}"))
        };
    }
    which::which_in(c, Some(shellpath::augmented_path()), cwd).map_err(|_| {
        format!("コマンド「{c}」が見つかりません。インストールされているか、設定でフルパスを指定してください。")
    })
}

fn new_command(program: &Path, cwd: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.current_dir(cwd)
        .env("PATH", shellpath::augmented_path())
        // Claude Code の中から起動された場合に、入れ子実行とみなされないようにする
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    cmd
}

// ---------------------------------------------------------------------------
// 出力の解析
// ---------------------------------------------------------------------------

type Emit<'a> = &'a (dyn Fn(StreamEvent) + Send + Sync);

#[derive(Default)]
struct ParseState {
    final_text: Option<String>,
    live: String,
    model: Option<String>,
    error: Option<String>,
    agy_step: Option<i64>,
    last_status: String,
    raw: String,
    /// codex の thread_id / agy の conversation_id（生成画像の保存先を探すのに使う）
    session_id: Option<String>,
}

impl ParseState {
    fn delta(&mut self, ch: Emit, text: &str) {
        if text.is_empty() {
            return;
        }
        self.live.push_str(text);
        ch(StreamEvent::Delta { text: text.to_string() });
    }

    fn reset(&mut self, ch: Emit) {
        if !self.live.is_empty() {
            self.live.clear();
            ch(StreamEvent::Reset);
        }
    }

    fn status(&mut self, ch: Emit, text: String) {
        if text != self.last_status {
            self.last_status = text.clone();
            ch(StreamEvent::Status { text });
        }
    }
}

fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn shorten(t: &str, n: usize) -> String {
    let one_line = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > n {
        format!("{}…", one_line.chars().take(n).collect::<String>())
    } else {
        one_line
    }
}

fn claude_tool_status(name: &str, input: &Value) -> String {
    match name {
        "Read" => format!("📄 {} を読んでいます", shorten(s(input, "file_path"), 60)),
        "Grep" => format!("🔍 「{}」を検索しています", shorten(s(input, "pattern"), 40)),
        "Glob" => format!("🔍 {} を探しています", shorten(s(input, "pattern"), 40)),
        _ => format!("🔧 {name} を使っています"),
    }
}

fn handle_claude(v: &Value, st: &mut ParseState, ch: Emit) {
    match s(v, "type") {
        "system" if s(v, "subtype") == "init" => {
            if let Some(m) = v.get("model").and_then(Value::as_str) {
                st.model = Some(m.to_string());
            }
        }
        "stream_event" => {
            let e = &v["event"];
            match s(e, "type") {
                "message_start" => st.reset(ch),
                "content_block_delta" if s(&e["delta"], "type") == "text_delta" => {
                    st.delta(ch, s(&e["delta"], "text"));
                }
                _ => {}
            }
        }
        "assistant" => {
            if let Some(content) = v["message"]["content"].as_array() {
                for c in content {
                    if s(c, "type") == "tool_use" {
                        st.status(ch, claude_tool_status(s(c, "name"), &c["input"]));
                    }
                }
            }
        }
        "result" => {
            let is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(false);
            if is_error || s(v, "subtype") != "success" {
                let msg = match s(v, "result") {
                    "" => format!("claude がエラーを返しました（{}）", s(v, "subtype")),
                    r => r.to_string(),
                };
                st.error = Some(msg);
            } else {
                st.final_text = Some(s(v, "result").to_string());
            }
        }
        _ => {}
    }
}

fn agy_tool_status(tool: &str, su: &Value) -> String {
    let status = match tool {
        "generate_image" => "🎨 画像を作っています",
        "invoke_subagent" => {
            if su.to_string().contains("image") {
                "🎨 画像を作っています"
            } else {
                "🤝 サブエージェントに頼んでいます"
            }
        }
        "view_file" => "📄 ファイルを読んでいます",
        "list_dir" | "find_by_name" => "📁 ファイルを探しています",
        "grep_search" => "🔍 検索しています",
        "search_web" | "read_url_content" => "🌐 Web を調べています",
        "run_command" => "💻 コマンドを実行しています",
        _ => "🔧 ツールを使っています",
    };
    status.to_string()
}

fn handle_agy(v: &Value, st: &mut ParseState, ch: Emit) {
    match s(v, "event") {
        "init" => {
            let m = s(&v["init"], "model");
            if !m.is_empty() {
                st.model = Some(m.to_string());
            }
            let id = s(v, "conversation_id");
            if !id.is_empty() {
                st.session_id = Some(id.to_string());
            }
        }
        "step_update" => {
            let su = &v["step_update"];
            let step_type = s(su, "step_type");
            if step_type == "agent_response" {
                let idx = su.get("step_index").and_then(Value::as_i64);
                if st.agy_step.is_some() && st.agy_step != idx {
                    st.reset(ch);
                }
                st.agy_step = idx;
                st.delta(ch, s(su, "text_delta"));
            } else if step_type != "user_input" && s(su, "state") == "ACTIVE" {
                st.status(ch, agy_tool_status(s(su, "tool_name"), su));
            }
        }
        "result" => {
            let r = &v["result"];
            let id = s(r, "conversation_id");
            if !id.is_empty() {
                st.session_id = Some(id.to_string());
            }
            if s(r, "status") == "SUCCESS" {
                st.final_text = Some(s(r, "response").to_string());
            } else {
                let detail = match s(r, "error") {
                    "" => s(r, "status").to_string(),
                    e => e.to_string(),
                };
                st.error = Some(format!("agy がエラーを返しました: {detail}"));
            }
        }
        "error" => {
            let msg = match v["error"].as_str() {
                Some(m) => m.to_string(),
                None => match s(&v["error"], "message") {
                    "" => v.to_string(),
                    m => m.to_string(),
                },
            };
            st.error = Some(msg);
        }
        _ => {}
    }
}

fn handle_codex(v: &Value, st: &mut ParseState, ch: Emit) {
    let item = &v["item"];
    match s(v, "type") {
        "thread.started" => st.session_id = Some(s(v, "thread_id").to_string()),
        "item.started" => match s(item, "type") {
            "command_execution" => {
                let cmd = s(item, "command");
                // 画像生成は imagegen スキルを読んでから内部ツールで行われ、専用のイベントは出ない
                if cmd.contains("imagegen") {
                    st.status(ch, "🎨 画像を作っています".into());
                } else {
                    st.status(ch, format!("💻 {}", shorten(cmd, 60)));
                }
            }
            "reasoning" => st.status(ch, "💭 考えています".into()),
            "web_search" => st.status(ch, "🌐 Web を検索しています".into()),
            "mcp_tool_call" => st.status(ch, "🔧 ツールを使っています".into()),
            _ => {}
        },
        "item.completed" => match s(item, "type") {
            "agent_message" => {
                // codex は文単位のストリーミングがないので、完成したメッセージごとに差し替える
                let text = s(item, "text").to_string();
                st.reset(ch);
                st.delta(ch, &text);
                st.final_text = Some(text);
            }
            "error" => {
                let m = s(item, "message");
                if !m.contains("configuration") {
                    st.error = Some(m.to_string());
                }
            }
            _ => {}
        },
        "turn.failed" => {
            st.error = Some(match s(&v["error"], "message") {
                "" => v.to_string(),
                m => m.to_string(),
            });
        }
        "error" => st.error = Some(s(v, "message").to_string()),
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// 生成画像の回収
// ---------------------------------------------------------------------------

fn is_image(p: &Path) -> bool {
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif")
}

fn images_in(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            if depth > 0 {
                images_in(&p, depth - 1, out);
            }
        } else if is_image(&p) {
            out.push(p);
        }
    }
}

/// 本文中の `![説明](/絶対パス/画像.png)` を取り出し、本文からは消す
fn take_markdown_images(text: &str) -> (String, Vec<PathBuf>) {
    let mut out = String::new();
    let mut found = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("![") {
        let after = &rest[start..];
        let parsed = after.find("](").and_then(|mid| {
            let close = after[mid + 2..].find(')')? + mid + 2;
            Some((close, after[mid + 2..close].trim().to_string()))
        });
        match parsed {
            Some((close, target)) => {
                let path = PathBuf::from(target.strip_prefix("file://").unwrap_or(&target));
                if path.is_absolute() && path.is_file() && is_image(&path) {
                    out.push_str(&rest[..start]);
                    found.push(path);
                } else {
                    out.push_str(&rest[..start + close + 1]);
                }
                rest = &rest[start + close + 1..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    (out, found)
}

/// CLI が作った画像を探してアプリデータの images/ にコピーする
fn collect_images(kind: Kind, session: Option<&str>, text: &str, images_dir: &Path, run_id: &str) -> (String, Vec<String>) {
    let (text, mut found) = take_markdown_images(text);
    if let (Some(id), Some(home)) = (session.filter(|s| !s.is_empty()), shellpath::home_dir()) {
        match kind {
            Kind::Codex => {
                let codex_home = std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".codex"));
                images_in(&codex_home.join("generated_images").join(id), 1, &mut found);
            }
            Kind::Agy => {
                images_in(&home.join(".gemini").join("antigravity-cli").join("brain").join(id), 1, &mut found);
            }
            Kind::Claude => {}
        }
    }

    let mut seen = HashSet::new();
    let mut copied = Vec::new();
    for src in found {
        let key = src.canonicalize().unwrap_or(src.clone());
        if !seen.insert(key) {
            continue;
        }
        if std::fs::create_dir_all(images_dir).is_err() {
            break;
        }
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png").to_ascii_lowercase();
        let safe_id: String = run_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
        let dst = images_dir.join(format!("{safe_id}-{}.{ext}", copied.len() + 1));
        if std::fs::copy(&src, &dst).is_ok() {
            copied.push(dst.to_string_lossy().into_owned());
        }
    }
    // 画像を取り除いたあとの余分な空行を詰める
    let mut cleaned = text.trim().to_string();
    while cleaned.contains("\n\n\n") {
        cleaned = cleaned.replace("\n\n\n", "\n\n");
    }
    (cleaned, copied)
}

fn tail(text: &str, max_chars: usize) -> String {
    let t = text.trim();
    let n = t.chars().count();
    if n <= max_chars {
        t.to_string()
    } else {
        format!("…{}", t.chars().skip(n - max_chars).collect::<String>())
    }
}

// ---------------------------------------------------------------------------
// Tauri コマンド
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn run_agent(
    app: AppHandle,
    registry: State<'_, RunRegistry>,
    req: RunRequest,
    on_event: Channel<StreamEvent>,
) -> Result<RunResult, String> {
    let workspace = storage::workspace_dir(&app)?;
    let emit = move |ev: StreamEvent| {
        let _ = on_event.send(ev);
    };
    execute(&req, &workspace, &registry, &emit).await
}

/// CLI を 1 回実行して最終的な発言を返す。`workspace` は作業フォルダ未指定時の実行場所
async fn execute(req: &RunRequest, workspace: &Path, registry: &RunRegistry, on_event: Emit<'_>) -> Result<RunResult, String> {
    let kind = Kind::parse(&req.kind)?;

    let work_dir = req.work_dir.trim();
    let file_access = !work_dir.is_empty();
    let cwd = if file_access {
        let p = expand_tilde(work_dir);
        if !p.is_dir() {
            return Err(format!("作業フォルダが見つかりません: {work_dir}"));
        }
        p
    } else {
        workspace.to_path_buf()
    };

    let program = resolve_program(&req.command, &cwd)?;
    let claude_settings = workspace.parent().unwrap_or(workspace).join("claude-settings.json");
    if kind == Kind::Claude && !claude_settings.exists() {
        std::fs::write(&claude_settings, r#"{"disableAllHooks":true}"#).map_err(|e| e.to_string())?;
    }
    let (args, model_label) = build_args(kind, req, &cwd, file_access, &claude_settings);
    let mut cmd = new_command(&program, &cwd);
    cmd.args(&args);

    let started = Instant::now();
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("{} を起動できませんでした: {e}", program.display()))?;
    let pid = child.id().unwrap_or(0);
    if !registry.register(&req.run_id, pid) {
        kill_tree(pid);
        registry.finish(&req.run_id);
        return Err("cancelled".into());
    }

    let mut stdin = child.stdin.take().expect("stdin");
    let prompt = req.prompt.clone();
    tokio::spawn(async move {
        let _ = stdin.write_all(prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    });

    let mut stderr = child.stderr.take().expect("stderr");
    let err_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).into_owned()
    });

    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);
    let mut st = ParseState::default();

    let work = async {
        let mut buf = Vec::new();
        loop {
            buf.clear();
            let n = reader.read_until(b'\n', &mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            let line = String::from_utf8_lossy(&buf);
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Value>(line) {
                Ok(v) => match kind {
                    Kind::Claude => handle_claude(&v, &mut st, on_event),
                    Kind::Agy => handle_agy(&v, &mut st, on_event),
                    Kind::Codex => handle_codex(&v, &mut st, on_event),
                },
                Err(_) => {
                    st.raw.push_str(line);
                    st.raw.push('\n');
                }
            }
        }
        child.wait().await.map_err(|e| e.to_string())
    };

    let timeout = Duration::from_secs(req.timeout_sec.max(10));
    let outcome = tokio::time::timeout(timeout, work).await;
    let cancelled = registry.finish(&req.run_id);

    let exit = match outcome {
        Err(_) => {
            kill_tree(pid);
            return Err(format!("タイムアウトしました（{} 秒）", timeout.as_secs()));
        }
        Ok(Err(e)) => return Err(e),
        Ok(Ok(status)) => status,
    };
    if cancelled {
        return Err("cancelled".into());
    }

    // 孫プロセスが stderr を握ったままでも待ち続けないようにする
    let stderr_text = tokio::time::timeout(Duration::from_secs(2), err_task)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();

    // agy の result.response は途中の発言（「画像を生成しています…」など）も全部つながっているので、
    // 最後の発言だけを使う
    let last_step = (kind == Kind::Agy && !st.live.trim().is_empty()).then(|| st.live.clone());
    let text = last_step
        .or_else(|| st.final_text.clone().filter(|t| !t.trim().is_empty()))
        .unwrap_or_else(|| st.live.clone());

    let images_dir = workspace.parent().unwrap_or(workspace).join("images");
    let (text, images) = collect_images(kind, st.session_id.as_deref(), &text, &images_dir, &req.run_id);

    if text.trim().is_empty() && images.is_empty() {
        let mut parts = Vec::new();
        if let Some(e) = &st.error {
            parts.push(e.clone());
        }
        let extra = tail(&format!("{}{}", st.raw, stderr_text), 1500);
        if !extra.is_empty() {
            parts.push(extra);
        }
        if parts.is_empty() {
            parts.push(format!("応答が空でした（終了コード {:?}）", exit.code()));
        }
        return Err(parts.join("\n\n"));
    }

    Ok(RunResult {
        text: text.trim().to_string(),
        model: st.model.unwrap_or(model_label),
        duration_ms: started.elapsed().as_millis() as u64,
        images,
    })
}

#[tauri::command]
pub fn cancel_run(registry: State<'_, RunRegistry>, run_id: String) {
    if let Some(pid) = registry.cancel(&run_id) {
        kill_tree(pid);
    }
}

async fn capture(command: &str, args: &[&str], secs: u64) -> Result<String, String> {
    let cwd = std::env::temp_dir();
    let program = resolve_program(command, &cwd)?;
    let mut cmd = new_command(&program, &cwd);
    cmd.args(args).stdin(Stdio::null());
    match tokio::time::timeout(Duration::from_secs(secs), cmd.output()).await {
        Ok(Ok(o)) if o.status.success() => Ok(String::from_utf8_lossy(&o.stdout).into_owned()),
        Ok(Ok(o)) => Err(tail(&String::from_utf8_lossy(&o.stderr), 500)),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err(format!("応答がありません（{secs} 秒）")),
    }
}

const EFFORT_SUFFIXES: [&str; 3] = ["low", "medium", "high"];

/// `agy models` の出力（"id<TAB>表示名"）を、推論レベルを除いたモデルごとにまとめる
fn parse_agy_models(out: &str) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> = Vec::new();
    for line in out.lines() {
        let Some((id, label)) = line.split_once('\t') else { continue };
        let (id, label) = (id.trim(), label.trim());
        let (base, effort) = match EFFORT_SUFFIXES.iter().find(|e| id.ends_with(&format!("-{e}"))) {
            Some(e) => (&id[..id.len() - e.len() - 1], Some(e.to_string())),
            None => (id, None),
        };
        let base_label = match label.rfind(" (") {
            Some(i) if label.ends_with(')') => &label[..i],
            _ => label,
        };
        let entry = match models.iter_mut().position(|m| m.id == base) {
            Some(i) => &mut models[i],
            None => {
                models.push(ModelInfo { id: base.to_string(), label: base_label.to_string(), efforts: vec![] });
                models.last_mut().unwrap()
            }
        };
        if let Some(e) = effort {
            entry.efforts.push(e);
        }
    }
    for m in &mut models {
        m.efforts.sort_by_key(|e| EFFORT_SUFFIXES.iter().position(|x| x == e));
    }
    models
}

fn parse_codex_models(out: &str) -> Result<Vec<ModelInfo>, String> {
    let v: Value = serde_json::from_str(out).map_err(|e| e.to_string())?;
    let list = v.get("models").unwrap_or(&v).as_array().cloned().unwrap_or_default();
    Ok(list
        .iter()
        .filter(|m| s(m, "visibility") != "hide" && !s(m, "slug").is_empty())
        .map(|m| ModelInfo {
            id: s(m, "slug").to_string(),
            label: match s(m, "display_name") {
                "" => s(m, "slug").to_string(),
                d => d.to_string(),
            },
            efforts: m["supported_reasoning_levels"]
                .as_array()
                .map(|a| a.iter().map(|e| e.get("effort").and_then(Value::as_str).or(e.as_str()).unwrap_or("").to_string()).filter(|e| !e.is_empty()).collect())
                .unwrap_or_default(),
        })
        .collect())
}

/// CLI に問い合わせて使えるモデルの一覧を返す（claude は一覧コマンドがないので対象外）
#[tauri::command]
pub async fn list_models(kind: String, command: String) -> Result<Vec<ModelInfo>, String> {
    match Kind::parse(&kind)? {
        Kind::Agy => Ok(parse_agy_models(&capture(&command, &["models"], 40).await?)),
        Kind::Codex => parse_codex_models(&capture(&command, &["debug", "models"], 40).await?),
        Kind::Claude => Err("claude はモデル一覧を取得できません".into()),
    }
}

#[tauri::command]
pub async fn check_agent(command: String) -> AgentCheck {
    let cwd = std::env::temp_dir();
    let program = match resolve_program(&command, &cwd) {
        Ok(p) => p,
        Err(e) => {
            return AgentCheck { ok: false, path: None, version: None, error: Some(e) };
        }
    };
    let path = Some(program.to_string_lossy().into_owned());
    let mut cmd = new_command(&program, &cwd);
    cmd.arg("--version").stdin(Stdio::null());
    let out = tokio::time::timeout(Duration::from_secs(20), cmd.output()).await;
    match out {
        Ok(Ok(o)) if o.status.success() => {
            let v = String::from_utf8_lossy(&o.stdout);
            let v = v.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
            AgentCheck { ok: true, path, version: Some(v), error: None }
        }
        Ok(Ok(o)) => AgentCheck {
            ok: false,
            path,
            version: None,
            error: Some(tail(&String::from_utf8_lossy(&o.stderr), 500)),
        },
        Ok(Err(e)) => AgentCheck { ok: false, path, version: None, error: Some(e.to_string()) },
        Err(_) => AgentCheck { ok: false, path, version: None, error: Some("応答がありません（20 秒）".into()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn markdown_images_are_extracted() {
        let dir = std::env::temp_dir().join("smart-agents-test-md");
        std::fs::create_dir_all(&dir).unwrap();
        let img = dir.join("cat.png");
        std::fs::write(&img, b"x").unwrap();
        let text = format!("できました！\n![猫]({})\n\nかわいい ![外部](https://example.com/a.png)", img.display());
        let (rest, found) = take_markdown_images(&text);
        assert_eq!(found, vec![img]);
        assert!(!rest.contains("cat.png"));
        assert!(rest.contains("https://example.com/a.png"));
    }

    #[test]
    fn agy_models_are_grouped() {
        let out = "Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\ngemini-3.1-pro-low\tGemini 3.1 Pro (Low)\nclaude-opus-5-5-low\tClaude Opus 5.5 (Low)\nclaude-opus-5-5-medium\tClaude Opus 5.5 (Medium)\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n";
        let m = parse_agy_models(out);
        assert_eq!(m.len(), 3);
        assert_eq!(m[0].id, "gemini-3.1-pro");
        assert_eq!(m[0].label, "Gemini 3.1 Pro");
        assert_eq!(m[0].efforts, vec!["low", "high"]);
        assert_eq!(m[1].efforts, vec!["low", "medium"]);
        assert_eq!(m[2].id, "gpt-oss-120b");
    }

    #[test]
    fn agy_model_resolution() {
        assert_eq!(resolve_agy_model("gemini-3.8-flash", "high"), "gemini-3.8-flash-high");
        assert_eq!(resolve_agy_model("gemini-3.1-pro", "medium"), "gemini-3.1-pro-low");
        assert_eq!(resolve_agy_model("gpt-oss-120b", "high"), "gpt-oss-120b-medium");
        assert_eq!(resolve_agy_model("claude-opus-5-5-low", "high"), "claude-opus-5-5-low");
        assert_eq!(resolve_agy_model("", "high"), "");
    }

    fn req(kind: &str, model: &str, effort: &str, work_dir: &str, prompt: &str) -> RunRequest {
        RunRequest {
            run_id: format!("test-{kind}"),
            kind: kind.into(),
            command: kind.into(),
            model: model.into(),
            effort: effort.into(),
            prompt: prompt.into(),
            work_dir: work_dir.into(),
            timeout_sec: 180,
        }
    }

    fn test_workspace() -> PathBuf {
        let ws = std::env::temp_dir().join("smart-agents-test").join("workspace");
        std::fs::create_dir_all(&ws).unwrap();
        ws
    }

    async fn run(r: RunRequest) -> (Result<RunResult, String>, Vec<String>) {
        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let ev = events.clone();
        let emit = move |e: StreamEvent| {
            ev.lock().unwrap().push(match e {
                StreamEvent::Delta { text } => format!("delta:{text}"),
                StreamEvent::Reset => "reset".into(),
                StreamEvent::Status { text } => format!("status:{text}"),
            });
        };
        let reg = RunRegistry::default();
        let res = execute(&r, &test_workspace(), &reg, &emit).await;
        let evs = events.lock().unwrap().clone();
        (res, evs)
    }

    const HELLO: &str = "あなたの名前はテストです。日本語で一言だけ挨拶してください。";

    // 実際の CLI を呼ぶテスト: cargo test -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_claude() {
        let (res, evs) = run(req("claude", "sonnet", "low", "", HELLO)).await;
        println!("claude: {res:?}\nevents: {}", evs.len());
        let r = res.unwrap();
        assert!(!r.text.is_empty());
        assert!(evs.iter().any(|e| e.starts_with("delta:")));
    }

    #[tokio::test]
    #[ignore]
    async fn live_agy() {
        let (res, evs) = run(req("agy", "gemini-3.8-flash", "low", "", HELLO)).await;
        println!("agy: {res:?}\nevents: {}", evs.len());
        assert!(!res.unwrap().text.is_empty());
    }

    #[tokio::test]
    #[ignore]
    async fn live_codex() {
        let (res, evs) = run(req("codex", "gpt-6-astra", "low", "", HELLO)).await;
        println!("codex: {res:?}\nevents: {evs:?}");
        assert!(!res.unwrap().text.is_empty());
    }

    #[tokio::test]
    #[ignore]
    async fn live_file_access() {
        let dir = env!("CARGO_MANIFEST_DIR");
        let prompt = "作業フォルダの Cargo.toml を読んで、[package] の name の値だけを答えてください。";
        for kind in ["claude", "agy", "codex"] {
            let model = match kind {
                "claude" => "sonnet",
                "agy" => "gemini-3.8-flash",
                _ => "gpt-6-astra",
            };
            let (res, evs) = run(req(kind, model, "low", dir, prompt)).await;
            let statuses: Vec<_> = evs.iter().filter(|e| e.starts_with("status:")).collect();
            println!("{kind}: {res:?}\n  statuses: {statuses:?}");
            assert!(res.unwrap().text.contains("smart-agents"), "{kind} がファイルを読めていない");
        }
    }

    #[tokio::test]
    #[ignore]
    async fn live_list_models() {
        let agy = list_models("agy".into(), "agy".into()).await.unwrap();
        let codex = list_models("codex".into(), "codex".into()).await.unwrap();
        println!("agy: {agy:?}\ncodex: {codex:?}");
        assert!(agy.iter().any(|m| m.id.starts_with("claude-opus")));
        assert!(codex.len() > 1);
    }

    #[tokio::test]
    #[ignore]
    async fn live_images() {
        let prompt = "小さな黄色い星のイラスト画像を1枚生成して、ひとことだけ添えてください。";
        let (codex, agy) = tokio::join!(
            run(req("codex", "gpt-6-astra", "low", "", prompt)),
            run(req("agy", "gemini-3.8-flash", "low", "", prompt))
        );
        for (name, (res, evs)) in [("codex", codex), ("agy", agy)] {
            let statuses: Vec<_> = evs.iter().filter(|e| e.starts_with("status:")).collect();
            println!("{name}: {res:?}\n  statuses: {statuses:?}");
            let r = res.unwrap();
            assert!(!r.images.is_empty(), "{name} の画像が回収できていない");
            assert!(!r.text.contains(".jpg)") && !r.text.contains(".png)"));
        }
    }

    #[tokio::test]
    #[ignore]
    async fn live_cancel() {
        let reg = RunRegistry::default();
        let r = req("claude", "sonnet", "low", "", "1 から 300 までの数字を、1 行に 1 つずつ全部書いてください。");
        let emit = |_e: StreamEvent| {};
        let started = Instant::now();
        let canceller = async {
            tokio::time::sleep(Duration::from_secs(4)).await;
            if let Some(pid) = reg.cancel(&r.run_id) {
                kill_tree(pid);
            }
        };
        let tmp = test_workspace();
        let (res, _) = tokio::join!(execute(&r, &tmp, &reg, &emit), canceller);
        println!("cancel: {res:?} after {:?}", started.elapsed());
        assert_eq!(res.unwrap_err(), "cancelled");
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}

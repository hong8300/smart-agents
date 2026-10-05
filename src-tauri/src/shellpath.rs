//! GUI アプリとして起動するとシェルの PATH が引き継がれない（特に macOS の Finder 起動）ため、
//! ログインシェルから PATH を取り出し、よく使われるインストール先も足した PATH を作る。

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::OnceLock;

static PATH: OnceLock<String> = OnceLock::new();

#[cfg(windows)]
const SEP: char = ';';
#[cfg(not(windows))]
const SEP: char = ':';

pub fn augmented_path() -> &'static str {
    PATH.get_or_init(build_path)
}

pub fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var_os(key).map(PathBuf::from)
}

fn build_path() -> String {
    let mut entries: Vec<String> = Vec::new();
    if let Some(p) = login_shell_path() {
        entries.extend(p.split(SEP).map(str::to_string));
    }
    if let Ok(p) = std::env::var("PATH") {
        entries.extend(p.split(SEP).map(str::to_string));
    }
    entries.extend(extra_dirs());

    let mut seen = HashSet::new();
    entries
        .into_iter()
        .filter(|e| !e.is_empty() && seen.insert(e.clone()))
        .collect::<Vec<_>>()
        .join(&SEP.to_string())
}

fn extra_dirs() -> Vec<String> {
    let mut dirs = Vec::new();
    let home = home_dir();
    #[cfg(not(windows))]
    {
        if let Some(h) = &home {
            for d in [".local/bin", ".cargo/bin", ".npm-global/bin", ".bun/bin", ".volta/bin"] {
                dirs.push(h.join(d).to_string_lossy().into_owned());
            }
        }
        for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
            dirs.push(d.to_string());
        }
    }
    #[cfg(windows)]
    {
        if let Some(h) = &home {
            for d in [".local\\bin", ".cargo\\bin", ".bun\\bin"] {
                dirs.push(h.join(d).to_string_lossy().into_owned());
            }
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(appdata).join("npm").to_string_lossy().into_owned());
        }
    }
    dirs
}

#[cfg(not(windows))]
fn login_shell_path() -> Option<String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const MARK: &str = "__SMART_AGENTS_PATH__";
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(shell)
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    // シェルの初期化スクリプトが固まっても起動を止めないよう、数秒で見切る
    let deadline = Instant::now() + Duration::from_secs(4);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let out = child.wait_with_output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let start = s.find(MARK)? + MARK.len();
    let end = s[start..].find(MARK)? + start;
    Some(s[start..end].to_string())
}

#[cfg(windows)]
fn login_shell_path() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    // GUI 起動（最小限の PATH）でも CLI が見つかるか。env -i で PATH を絞って実行して確かめる
    #[test]
    #[ignore]
    fn finds_clis_with_minimal_path() {
        let path = super::augmented_path();
        for cmd in ["claude", "agy", "codex"] {
            let found = which::which_in(cmd, Some(path), std::env::temp_dir());
            println!("{cmd}: {found:?}");
            assert!(found.is_ok(), "{cmd} が見つからない");
        }
    }
}

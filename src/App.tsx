import { useEffect } from "react";
import { useStore } from "./store";
import { listModels } from "./api";
import { DEFAULT_SETTINGS, FONT_SIZE } from "./defaults";
import type { AgentKind } from "./types";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { SettingsModal } from "./components/SettingsModal";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const init = useStore((s) => s.init);
  const theme = useStore((s) => s.settings.theme);
  const settingsOpen = useStore((s) => s.settingsOpen);

  useEffect(() => {
    void init();
  }, [init]);

  // 起動時に agy / codex から最新のモデル一覧を取ってくる（失敗したら既定の一覧のまま）
  useEffect(() => {
    if (!loaded) return;
    for (const kind of ["agy", "codex"] as AgentKind[]) {
      const { settings } = useStore.getState();
      listModels(kind, settings.agents[kind].command)
        .then((list) => {
          if (list.length === 0) return;
          const cur = useStore.getState().settings;
          useStore.getState().patchSettings({ modelCatalog: { ...cur.modelCatalog, [kind]: list } });
        })
        .catch(() => {});
    }
  }, [loaded]);

  // ⌘, 設定 / ⌘N 新しいチャット / ⌘+ ⌘- ⌘0 文字の大きさ（Windows は Ctrl）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const { openSettings, selectChat, settings, patchSettings } = useStore.getState();
      const font = (n: number) => patchSettings({ fontSize: Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, n)) });
      if (e.key === "+" || e.key === "=" || e.key === ";") {
        e.preventDefault();
        font(settings.fontSize + 1);
      } else if (e.key === "-") {
        e.preventDefault();
        font(settings.fontSize - 1);
      } else if (e.key === "0") {
        e.preventDefault();
        font(DEFAULT_SETTINGS.fontSize);
      } else if (e.shiftKey) {
        return;
      } else if (e.key === ",") {
        e.preventDefault();
        openSettings(true);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        openSettings(false);
        selectChat(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  if (!loaded) return <div className="loading">読み込み中…</div>;

  return (
    <div className="app">
      <Sidebar />
      <ChatView />
      {settingsOpen && <SettingsModal />}
    </div>
  );
}

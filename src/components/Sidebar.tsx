import { useState } from "react";
import { useStore } from "../store";
import { stopConversation } from "../orchestrator";
import { enabledAgents } from "../prompt";
import { Avatar } from "./Avatar";

export function Sidebar() {
  const chats = useStore((s) => s.chats);
  const currentChatId = useStore((s) => s.currentChatId);
  const running = useStore((s) => s.running);
  const settings = useStore((s) => s.settings);
  const selectChat = useStore((s) => s.selectChat);
  const deleteChat = useStore((s) => s.deleteChat);
  const openSettings = useStore((s) => s.openSettings);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const agents = enabledAgents(settings);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-avatars">
          {agents.map((k) => (
            <Avatar key={k} avatar={settings.agents[k].avatar} color={settings.agents[k].color} size={22} />
          ))}
        </div>
        <span className="brand-name">Smart Agents</span>
      </div>

      <button className="side-btn new-chat" onClick={() => selectChat(null)}>
        <span className="icon">✎</span> 新しいチャット
      </button>

      <div className="side-label">最近の項目</div>
      <nav className="chat-list">
        {sorted.length === 0 && <div className="chat-empty">まだチャットはありません</div>}
        {sorted.map((c) => (
          <div
            key={c.id}
            className={`chat-item ${c.id === currentChatId ? "active" : ""}`}
            onClick={() => {
              setConfirmId(null);
              selectChat(c.id);
            }}
            title={c.title}
          >
            {running[c.id] && <span className="live-dot" title="会話中" />}
            <span className="chat-title">{c.title}</span>
            {confirmId === c.id ? (
              <button
                className="chat-del confirm"
                onClick={(e) => {
                  e.stopPropagation();
                  stopConversation(c.id);
                  deleteChat(c.id);
                  setConfirmId(null);
                }}
              >
                削除する
              </button>
            ) : (
              <button
                className="chat-del"
                title="削除"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(c.id);
                }}
              >
                🗑
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="side-footer">
        <div className="side-me">
          <Avatar avatar={settings.userAvatar} size={28} />
          <span>{settings.userName}</span>
        </div>
        <button className="side-btn settings-btn" onClick={() => openSettings(true)} title="設定">
          ⚙ 設定
        </button>
      </div>
    </aside>
  );
}

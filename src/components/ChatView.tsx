import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { continueConversation, sendUserMessage } from "../orchestrator";
import { enabledAgents } from "../prompt";
import type { ChatMessage } from "../types";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { DisplayMenu } from "./DisplayMenu";
import { Lightbox } from "./Lightbox";
import { LineMessage, LineTyping, SimpleMessage, SimpleTyping } from "./Messages";

const EXAMPLES = [
  { text: "週末に家族で楽しめる日帰り旅行プランを3人で考えて" },
  { text: "個人開発で作ると面白いアプリのアイデアを出し合って、1つに絞って" },
  { text: "「AI と人間の仕事の分担」について賛成・反対に分かれて議論して" },
  { text: "夜空を泳ぐクジラの絵", image: true },
];

function EmptyState() {
  const settings = useStore((s) => s.settings);
  const agents = enabledAgents(settings);
  return (
    <div className="empty">
      <div className="empty-avatars">
        {agents.map((k, i) => (
          <div key={k} className="empty-agent" style={{ animationDelay: `${i * 0.25}s` }}>
            <Avatar avatar={settings.agents[k].avatar} color={settings.agents[k].color} size={64} />
            <span style={{ color: settings.agents[k].color }}>{settings.agents[k].name}</span>
          </div>
        ))}
      </div>
      <h1>今日のお題は？</h1>
      <p className="empty-sub">
        お題を出すと {agents.map((k) => settings.agents[k].name).join("・")} がおしゃべりを始めます。
        <br />
        🎨 を押してから送ると、みんなが一斉に画像を作ります。
      </p>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.text}
            className="example"
            onClick={() => sendUserMessage(null, ex.text, { imageRequest: ex.image })}
          >
            {ex.image ? "🎨 " : ""}
            {ex.text}
          </button>
        ))}
      </div>
    </div>
  );
}

const dayKey = (t: number) => new Date(t).toDateString();
function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "今日";
  if (d.toDateString() === yesterday.toDateString()) return "昨日";
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

/** 同じ人が 5 分以内に続けて話したら、アイコンと名前をまとめる */
function isGrouped(prev: ChatMessage | undefined, m: ChatMessage) {
  if (!prev || prev.role !== m.role || m.role === "system") return false;
  if (dayKey(prev.createdAt) !== dayKey(m.createdAt)) return false;
  if (m.createdAt - prev.createdAt > 5 * 60 * 1000) return false;
  return m.role === "user" || prev.agent === m.agent;
}

export function ChatView() {
  const chat = useStore((s) => s.chats.find((c) => c.id === s.currentChatId) ?? null);
  const run = useStore((s) => (s.currentChatId ? s.running[s.currentChatId] : undefined));
  const typing = useStore((s) => (s.currentChatId ? s.typing[s.currentChatId] : undefined)) ?? [];
  const reveal = useStore((s) => s.reveal);
  const settings = useStore((s) => s.settings);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTop = useRef(0);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // 一番下を見ているときだけ、新しい発言や入力中の表示に追従してスクロールする
  const typingSig = typing.map((t) => `${t.agent}:${t.live.length}:${t.statusText ?? ""}`).join("|");
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat?.messages, typingSig, reveal, settings.fontSize, settings.avatarSize, settings.chatStyle]);

  useEffect(() => {
    stick.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.id]);

  const agents = enabledAgents(settings);
  const lastMsg = chat?.messages[chat.messages.length - 1];
  const line = settings.chatStyle === "line";
  const Msg = line ? LineMessage : SimpleMessage;
  const TypingRow = line ? LineTyping : SimpleTyping;
  const typingNames = typing.map((t) => settings.agents[t.agent].name);

  return (
    <main className={`main ${line ? "line" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">{chat ? chat.title : "新しいチャット"}</div>
          <div className="topbar-sub">
            {typingNames.length > 0 ? (
              <span className="typing-sub">
                {typingNames.join("・")} が入力中
                <span className="dots small">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            ) : (
              `${settings.userName}・${agents.map((k) => settings.agents[k].name).join("・")}（${agents.length + 1}）`
            )}
          </div>
        </div>
        <div className="topbar-right">
          {run && (
            <span className="run-pill">
              <span className="live-dot" />
              {run.turn} / {run.max} ターン
            </span>
          )}
          <div className="participants">
            {agents.map((k) => (
              <Avatar
                key={k}
                avatar={settings.agents[k].avatar}
                color={settings.agents[k].color}
                size={26}
                title={`${settings.agents[k].name}（${settings.agents[k].model || "既定"}）`}
                className={typing.some((t) => t.agent === k) ? "speaking" : ""}
              />
            ))}
          </div>
          <DisplayMenu />
        </div>
      </header>

      <div
        className={`scroll ${line ? "line-bg" : ""}`}
        ref={scrollRef}
        style={
          {
            "--chat-font": `${settings.fontSize}px`,
            "--avatar": `${settings.avatarSize}px`,
          } as React.CSSProperties
        }
        onScroll={(e) => {
          // scroll イベントは遅れて届くので、「上へ戻した」ときだけ追従をやめる
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) stick.current = true;
          else if (el.scrollTop < lastTop.current - 2) stick.current = false;
          lastTop.current = el.scrollTop;
        }}
      >
        {!chat ? (
          <EmptyState />
        ) : (
          <div className={`thread ${line ? "line" : "simple"}`}>
            {chat.messages.map((m, i) => {
              const prev = chat.messages[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
                  <Msg
                    m={m}
                    settings={settings}
                    grouped={!newDay && isGrouped(prev, m)}
                    shown={reveal[m.id]}
                    onOpenImage={setLightbox}
                    onContinue={
                      !run && m === lastMsg && m.role === "system" && (m.notice === "maxTurns" || m.notice === "stopped")
                        ? () => continueConversation(chat.id)
                        : undefined
                    }
                  />
                </Fragment>
              );
            })}
            {typing.map((t) => (
              <TypingRow key={t.agent} t={t} settings={settings} />
            ))}
          </div>
        )}
      </div>

      <Composer chatId={chat?.id ?? null} running={!!run} autoFocus />
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </main>
  );
}

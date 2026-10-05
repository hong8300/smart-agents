import { useEffect, useState } from "react";
import { imageSrc } from "../api";
import type { ChatMessage, Reaction, Settings, Typing } from "../types";
import { Avatar } from "./Avatar";
import { Markdown } from "./Markdown";

export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** 吹き出しの背景: エージェントの色をうっすら混ぜる */
const tint = (color: string) => ({ "--agent": color }) as React.CSSProperties;

interface CommonProps {
  m: ChatMessage;
  settings: Settings;
  /** 同じ人の連続した発言なら、アイコンと名前を省く */
  grouped: boolean;
  /** 順番表示の途中なら、表示済みの吹き出し数 */
  shown?: number;
  onOpenImage: (src: string) => void;
  onContinue?: () => void;
}

function Reactions({ list, settings, align }: { list?: Reaction[]; settings: Settings; align: "left" | "right" }) {
  if (!list?.length) return null;
  return (
    <div className={`reactions ${align}`}>
      {list.map((r) => (
        <span key={r.agent} className="react-chip pop-in" title={`${settings.agents[r.agent].name} のリアクション`}>
          <Avatar avatar={settings.agents[r.agent].avatar} color={settings.agents[r.agent].color} size={16} />
          <span className="react-emoji">{r.emoji}</span>
        </span>
      ))}
    </div>
  );
}

function ImageThumb({ src, onOpen }: { src: string; onOpen: (src: string) => void }) {
  const url = imageSrc(src);
  return (
    <button className="img-thumb" onClick={() => onOpen(src)} title="クリックで拡大">
      <img src={url} alt="生成画像" loading="lazy" />
    </button>
  );
}

function Notice({ m, onContinue, settings }: { m: ChatMessage; onContinue?: () => void; settings: Settings }) {
  return (
    <div className={`notice notice-${m.notice ?? "info"} pop-in`}>
      <span>{m.content}</span>
      {onContinue && (
        <button className="notice-btn" onClick={onContinue}>
          ▶ 続ける（+{settings.maxTurns} ターン）
        </button>
      )}
    </div>
  );
}

function ErrorBody({ m }: { m: ChatMessage }) {
  return (
    <div className="err-body">
      <div className="err-title">⚠️ エラーで応答できませんでした</div>
      <details>
        <summary>詳細</summary>
        <pre>{m.error}</pre>
      </details>
    </div>
  );
}

function Tags({ m }: { m: ChatMessage }) {
  return (
    <>
      {m.flags?.end && <span className="tag tag-end">結論</span>}
      {m.flags?.ask && <span className="tag tag-ask">質問</span>}
    </>
  );
}

// ---------------------------------------------------------------------------
// LINE 風
// ---------------------------------------------------------------------------

export function LineMessage({ m, settings, grouped, shown, onOpenImage, onContinue }: CommonProps) {
  if (m.role === "system") return <Notice m={m} onContinue={onContinue} settings={settings} />;

  if (m.role === "user") {
    const read = m.readBy?.length ?? 0;
    return (
      <div className={`lrow right ${grouped ? "grouped" : ""}`}>
        <div className="lcol right">
          <div className="lline right">
            <div className="lmeta right">
              {read > 0 && <span className="read">既読 {read}</span>}
              <span>{fmtTime(m.createdAt)}</span>
            </div>
            <div className={`bubble me ${grouped ? "" : "tail"} pop-in`}>
              {m.imageRequest && <div className="img-req">🎨 みんなで画像</div>}
              <div className="plain">{m.content}</div>
            </div>
          </div>
          <Reactions list={m.reactions} settings={settings} align="right" />
        </div>
        {settings.showMyAvatar && (
          <div className="lavatar">{!grouped && <Avatar avatar={settings.userAvatar} size={settings.avatarSize} />}</div>
        )}
      </div>
    );
  }

  const agent = settings.agents[m.agent!];
  type B = { kind: "text"; text: string } | { kind: "image"; src: string } | { kind: "error" };
  const bubbles: B[] =
    m.status === "error"
      ? [{ kind: "error" }]
      : [
          ...(m.parts ?? (m.content ? [m.content] : [])).map((text) => ({ kind: "text" as const, text })),
          ...(m.images ?? []).map((src) => ({ kind: "image" as const, src })),
        ];
  const visible = bubbles.slice(0, shown ?? bubbles.length);

  return (
    <div className={`lrow left ${grouped ? "grouped" : ""}`} style={tint(agent.color)}>
      <div className="lavatar">
        {!grouped && <Avatar avatar={agent.avatar} color={agent.color} size={settings.avatarSize} className="pop-in" />}
      </div>
      <div className="lcol">
        {!grouped && (
          <div className="lname">
            <span className="lname-text">{agent.name}</span>
            {m.model && <span className="lmodel">{m.model}</span>}
          </div>
        )}
        {visible.map((b, i) => {
          const isLast = i === visible.length - 1 && visible.length === bubbles.length;
          return (
            <div className="lline" key={i}>
              {b.kind === "image" ? (
                <div className="bubble image pop-in">
                  <ImageThumb src={b.src} onOpen={onOpenImage} />
                </div>
              ) : (
                <div className={`bubble other ${!grouped && i === 0 ? "tail" : ""} ${b.kind === "error" ? "error" : ""} pop-in`}>
                  {b.kind === "error" ? <ErrorBody m={m} /> : <Markdown text={b.text} />}
                </div>
              )}
              {isLast && (
                <div className="lmeta">
                  <Tags m={m} />
                  <span>{fmtTime(m.createdAt)}</span>
                  {b.kind !== "error" && <CopyMini text={m.content} />}
                </div>
              )}
            </div>
          );
        })}
        <Reactions list={m.reactions} settings={settings} align="left" />
      </div>
    </div>
  );
}

function CopyMini({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      className="copy-mini"
      title="コピー"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        })
      }
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}

export function LineTyping({ t, settings }: { t: Typing; settings: Settings }) {
  const agent = settings.agents[t.agent];
  const elapsed = useElapsed(t.startedAt);
  const live = settings.showStreaming && t.live ? t.live.slice(-240) : "";
  return (
    <div className="lrow left typing-row" style={tint(agent.color)}>
      <div className="lavatar">
        <Avatar avatar={agent.avatar} color={agent.color} size={settings.avatarSize} className="speaking pop-in" />
      </div>
      <div className="lcol">
        <div className="lname">
          <span className="lname-text">{agent.name}</span>
          <span className="lmodel">入力中…</span>
        </div>
        <div className="lline">
          <div className="bubble other tail typing-bubble pop-in">
            {live ? (
              <div className="live-text">{live}</div>
            ) : (
              <span className="dots">
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        </div>
        <div className="typing-status">
          {t.statusText ? `${t.statusText} · ` : ""}
          {elapsed} 秒
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// シンプル
// ---------------------------------------------------------------------------

export function SimpleMessage({ m, settings, grouped, shown, onOpenImage, onContinue }: CommonProps) {
  if (m.role === "system") return <Notice m={m} onContinue={onContinue} settings={settings} />;

  if (m.role === "user") {
    return (
      <div className="smsg user">
        <div className="scol right">
          <div className="user-bubble pop-in">
            {m.imageRequest && <div className="img-req">🎨 みんなで画像</div>}
            <div className="plain">{m.content}</div>
          </div>
          <div className="smeta right">
            {(m.readBy?.length ?? 0) > 0 && <span className="read">既読 {m.readBy!.length}</span>}
            <span>{fmtTime(m.createdAt)}</span>
          </div>
          <Reactions list={m.reactions} settings={settings} align="right" />
        </div>
        {settings.showMyAvatar && <Avatar avatar={settings.userAvatar} size={settings.avatarSize} />}
      </div>
    );
  }

  const agent = settings.agents[m.agent!];
  const hasText = !!m.content;
  const n = shown ?? Infinity;
  const imgs = (m.images ?? []).slice(0, Math.max(0, n - (hasText ? 1 : 0)));
  return (
    <div className={`smsg agent ${grouped ? "grouped" : ""}`}>
      <div className="savatar">
        {!grouped && <Avatar avatar={agent.avatar} color={agent.color} size={settings.avatarSize} />}
      </div>
      <div className="scol">
        {!grouped && (
          <div className="shead">
            <span className="sname" style={{ color: agent.color }}>
              {agent.name}
            </span>
            {m.model && <span className="smodel">{m.model}</span>}
            <Tags m={m} />
          </div>
        )}
        {m.status === "error" ? (
          <div className="msg-error">
            <ErrorBody m={m} />
          </div>
        ) : (
          <>
            {hasText && (
              <div className="scontent pop-in">
                <Markdown text={m.content} />
              </div>
            )}
            {imgs.length > 0 && (
              <div className="simages">
                {imgs.map((src) => (
                  <ImageThumb key={src} src={src} onOpen={onOpenImage} />
                ))}
              </div>
            )}
          </>
        )}
        <div className="smeta">
          <span>{fmtTime(m.createdAt)}</span>
          {m.durationMs != null && <span>{(m.durationMs / 1000).toFixed(1)} 秒</span>}
          {grouped && <Tags m={m} />}
          {m.status !== "error" && <CopyMini text={m.content} />}
        </div>
        <Reactions list={m.reactions} settings={settings} align="left" />
      </div>
    </div>
  );
}

export function SimpleTyping({ t, settings }: { t: Typing; settings: Settings }) {
  const agent = settings.agents[t.agent];
  const elapsed = useElapsed(t.startedAt);
  return (
    <div className="smsg agent typing-row">
      <div className="savatar">
        <Avatar avatar={agent.avatar} color={agent.color} size={settings.avatarSize} className="speaking" />
      </div>
      <div className="scol">
        <div className="shead">
          <span className="sname" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span className="smodel">入力中…</span>
        </div>
        {settings.showStreaming && t.live ? (
          <div className="scontent typing">
            <Markdown text={t.live} />
          </div>
        ) : (
          <span className="dots">
            <span />
            <span />
            <span />
          </span>
        )}
        <div className="typing-status">
          {t.statusText ? `${t.statusText} · ` : ""}
          {elapsed} 秒
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { sendUserMessage, stopConversation } from "../orchestrator";

interface Props {
  chatId: string | null;
  running: boolean;
  autoFocus?: boolean;
}

export function Composer({ chatId, running, autoFocus }: Props) {
  const [text, setText] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, chatId]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    sendUserMessage(chatId, t, { imageRequest: imageMode });
    setText("");
    setImageMode(false);
  };

  const setMax = (n: number) => setSettings({ ...settings, maxTurns: Math.min(100, Math.max(1, n)) });
  const folder = settings.workDir.trim().split(/[\\/]/).filter(Boolean).pop();

  return (
    <div className="composer-wrap">
      <div className={`composer ${imageMode ? "image-mode" : ""}`}>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={
            imageMode
              ? "どんな画像をみんなに作ってほしい？（全員が 1 枚ずつ作ります）"
              : running
                ? "割り込んで発言できます（Enter で送信）"
                : "お題を入力…（Enter で送信 / Shift+Enter で改行）"
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 日本語入力の変換確定の Enter では送信しない
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-opts">
            <button
              className={`chip ${imageMode ? "on" : ""}`}
              title="みんなで一斉に画像を作る"
              onClick={() => {
                setImageMode(!imageMode);
                ref.current?.focus();
              }}
            >
              🎨 みんなで画像
            </button>
            <div className="stepper" title="エージェントが話す最大回数（あなたが発言すると数え直します）">
              <span className="stepper-label">最大</span>
              <button onClick={() => setMax(settings.maxTurns - 1)}>−</button>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.maxTurns}
                onChange={(e) => setMax(Number(e.target.value) || 1)}
              />
              <button onClick={() => setMax(settings.maxTurns + 1)}>＋</button>
              <span className="stepper-label">ターン</span>
            </div>
            <button
              className="chip"
              title="お題を出したときの話し始め方"
              onClick={() =>
                setSettings({ ...settings, firstRound: settings.firstRound === "parallel" ? "sequential" : "parallel" })
              }
            >
              {settings.firstRound === "parallel" ? "👥 全員同時に話し始める" : "➡️ 順番に話し始める"}
            </button>
            {folder && (
              <span className="chip static" title={settings.workDir}>
                📁 {folder}
              </span>
            )}
          </div>
          <div className="composer-actions">
            {running && chatId && (
              <button className="stop-btn" onClick={() => stopConversation(chatId)} title="会話を停止">
                ■ 停止
              </button>
            )}
            <button className="send-btn" disabled={!text.trim()} onClick={send} title="送信">
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

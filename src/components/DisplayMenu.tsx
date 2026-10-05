import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { AVATAR_SIZE, FONT_SIZE } from "../defaults";
import type { Settings } from "../types";

type BoolKey = "revealEffect" | "splitBubbles" | "showStreaming" | "sound" | "showMyAvatar";

export const DISPLAY_TOGGLES: { key: BoolKey; label: string }[] = [
  { key: "revealEffect", label: "返信を 1 つずつ出す演出" },
  { key: "splitBubbles", label: "長い発言を吹き出しに分ける" },
  { key: "showStreaming", label: "入力中の文字を見せる" },
  { key: "sound", label: "効果音" },
  { key: "showMyAvatar", label: "わたしのアイコンを表示" },
];

/** 表示まわりの設定（設定画面とヘッダーのメニューで共用） */
export function DisplayControls({ s, onChange }: { s: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <div className="display-controls">
      <div className="dc-row">
        <span className="dc-label">スタイル</span>
        <div className="segmented">
          <button className={s.chatStyle === "line" ? "on" : ""} onClick={() => onChange({ chatStyle: "line" })}>
            💬 LINE 風
          </button>
          <button className={s.chatStyle === "simple" ? "on" : ""} onClick={() => onChange({ chatStyle: "simple" })}>
            📄 シンプル
          </button>
        </div>
      </div>
      <div className="dc-row">
        <span className="dc-label">文字の大きさ</span>
        <input
          type="range"
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          value={s.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        />
        <span className="dc-value">{s.fontSize}px</span>
      </div>
      <div className="dc-row">
        <span className="dc-label">アイコンの大きさ</span>
        <input
          type="range"
          min={AVATAR_SIZE.min}
          max={AVATAR_SIZE.max}
          step={2}
          value={s.avatarSize}
          onChange={(e) => onChange({ avatarSize: Number(e.target.value) })}
        />
        <span className="dc-value">{s.avatarSize}px</span>
      </div>
      {DISPLAY_TOGGLES.map((t) => (
        <label key={t.key} className="dc-toggle">
          <input type="checkbox" checked={s[t.key]} onChange={(e) => onChange({ [t.key]: e.target.checked })} />
          <span>{t.label}</span>
        </label>
      ))}
    </div>
  );
}

export function DisplayMenu() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="display-menu" ref={ref}>
      <button className={`icon-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title="表示の設定（⌘+ / ⌘- で文字の大きさ）">
        Aa
      </button>
      {open && (
        <div className="popover">
          <DisplayControls s={settings} onChange={patchSettings} />
        </div>
      )}
    </div>
  );
}

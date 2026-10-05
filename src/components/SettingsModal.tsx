import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { checkAgent, dataDirPath, listModels, type AgentCheck } from "../api";
import { AGENT_LABEL, ALLOW_DEFAULT_EFFORT, DEFAULT_CATALOG, DEFAULT_SETTINGS } from "../defaults";
import { PRESET_KEYS, fileToAvatar, presetLabel } from "../avatars";
import { AGENT_KINDS, type AgentConfig, type AgentKind, type ModelInfo, type Settings } from "../types";
import { Avatar } from "./Avatar";
import { DisplayControls } from "./DisplayMenu";

type Tab = "general" | AgentKind;

function AvatarPicker({ value, color, onChange }: { value: string; color: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [emoji, setEmoji] = useState(value.startsWith("emoji:") ? value.slice(6) : "");
  return (
    <div className="avatar-picker">
      <Avatar avatar={value} color={color} size={64} />
      <div className="avatar-options">
        <div className="preset-grid">
          {PRESET_KEYS.map((k) => (
            <button
              key={k}
              className={`preset ${value === `preset:${k}` ? "selected" : ""}`}
              title={presetLabel(k)}
              onClick={() => onChange(`preset:${k}`)}
            >
              <Avatar avatar={`preset:${k}`} size={34} />
            </button>
          ))}
        </div>
        <div className="avatar-row">
          <input
            className="emoji-input"
            placeholder="絵文字"
            value={emoji}
            maxLength={4}
            onChange={(e) => {
              setEmoji(e.target.value);
              if (e.target.value.trim()) onChange(`emoji:${e.target.value.trim()}`);
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            画像を選ぶ…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange(await fileToAvatar(f));
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const CUSTOM = "__custom__";

function ModelPicker({
  cfg,
  catalog,
  onChange,
  onCatalog,
}: {
  cfg: AgentConfig;
  catalog: ModelInfo[];
  onChange: (patch: Partial<AgentConfig>) => void;
  onCatalog: (list: ModelInfo[]) => void;
}) {
  const known = catalog.find((m) => m.id === cfg.model);
  const [custom, setCustom] = useState(!known && cfg.model !== "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const efforts = known?.efforts.length ? known.efforts : (DEFAULT_CATALOG[cfg.kind][0]?.efforts ?? []);
  const effortOptions = [...(ALLOW_DEFAULT_EFFORT[cfg.kind] ? [""] : []), ...efforts];
  if (cfg.effort && !effortOptions.includes(cfg.effort)) effortOptions.push(cfg.effort);

  const refresh = async () => {
    setLoading(true);
    setMsg("");
    try {
      const list = await listModels(cfg.kind, cfg.command);
      onCatalog(list);
      setMsg(`${list.length} 件のモデルを取得しました`);
    } catch (e) {
      setMsg(`取得できませんでした: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="grid2">
        <Field label="モデル">
          <select
            value={custom ? CUSTOM : cfg.model}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustom(true);
                return;
              }
              setCustom(false);
              const m = catalog.find((x) => x.id === e.target.value);
              // 新しいモデルで選べないエフォートなら、近いものに合わせる
              const effort =
                m && cfg.effort && !m.efforts.includes(cfg.effort)
                  ? (m.efforts.includes("medium") ? "medium" : (m.efforts[0] ?? ""))
                  : cfg.effort;
              onChange({ model: e.target.value, effort });
            }}
          >
            {ALLOW_DEFAULT_EFFORT[cfg.kind] && <option value="">（CLI の既定）</option>}
            {catalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.label !== m.id ? `  —  ${m.id}` : ""}
              </option>
            ))}
            <option value={CUSTOM}>その他（モデル ID を入力）…</option>
          </select>
        </Field>
        <Field label="エフォート（推論の深さ）">
          <select value={cfg.effort} onChange={(e) => onChange({ effort: e.target.value })}>
            {effortOptions.map((e) => (
              <option key={e} value={e}>
                {e || "（既定）"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {custom && (
        <Field label="モデル ID" hint="CLI にそのまま渡します">
          <input value={cfg.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="例: gpt-6-sol" />
        </Field>
      )}
      <div className="model-hint">
        <span>
          {cfg.kind === "agy"
            ? "agy はモデル ID の末尾（-low / -medium / -high）としてエフォートを渡します。"
            : "エフォートが高いほど丁寧ですが、返事が遅くなります。"}
        </span>
        {cfg.kind !== "claude" && (
          <button className="btn small" onClick={refresh} disabled={loading}>
            {loading ? "取得中…" : "モデル一覧を更新"}
          </button>
        )}
      </div>
      {msg && <div className="field-hint">{msg}</div>}
    </>
  );
}

function AgentForm({
  cfg,
  catalog,
  onChange,
  onCatalog,
}: {
  cfg: AgentConfig;
  catalog: ModelInfo[];
  onChange: (c: AgentConfig) => void;
  onCatalog: (list: ModelInfo[]) => void;
}) {
  const [check, setCheck] = useState<AgentCheck | "loading" | null>(null);
  const set = (patch: Partial<AgentConfig>) => onChange({ ...cfg, ...patch });
  const def = DEFAULT_SETTINGS.agents[cfg.kind];

  return (
    <div className="form">
      <div className="form-title">
        <h2>{cfg.name}</h2>
        <span className="form-sub">{AGENT_LABEL[cfg.kind]}</span>
        <label className="toggle">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span>会話に参加する</span>
        </label>
      </div>

      <div className="grid2">
        <Field label="名前">
          <input value={cfg.name} onChange={(e) => set({ name: e.target.value })} placeholder={def.name} />
        </Field>
        <Field label="テーマカラー">
          <div className="color-row">
            <input type="color" value={cfg.color} onChange={(e) => set({ color: e.target.value })} />
            <code>{cfg.color}</code>
          </div>
        </Field>
      </div>

      <Field label="アイコン">
        <AvatarPicker value={cfg.avatar} color={cfg.color} onChange={(avatar) => set({ avatar })} />
      </Field>

      <ModelPicker cfg={cfg} catalog={catalog} onChange={set} onCatalog={onCatalog} />

      <Field label="性格・追加の指示" hint="プロンプトに「参加者の紹介」として入ります">
        <textarea rows={3} value={cfg.persona} onChange={(e) => set({ persona: e.target.value })} />
      </Field>

      <Field label="コマンド" hint="PATH 上のコマンド名か、フルパス（例: /opt/homebrew/bin/claude）">
        <div className="cmd-row">
          <input value={cfg.command} onChange={(e) => set({ command: e.target.value })} placeholder={def.command} />
          <button
            className="btn"
            onClick={async () => {
              setCheck("loading");
              setCheck(await checkAgent(cfg.command));
            }}
          >
            接続テスト
          </button>
        </div>
      </Field>
      {check === "loading" && <div className="check">確認中…</div>}
      {check && check !== "loading" && (
        <div className={`check ${check.ok ? "ok" : "ng"}`}>
          {check.ok ? `✓ ${check.version}` : `✗ ${check.error}`}
          {check.path && <div className="check-path">{check.path}</div>}
        </div>
      )}
    </div>
  );
}

function GeneralForm({ s, onChange }: { s: Settings; onChange: (s: Settings) => void }) {
  const [dir, setDir] = useState("");
  useEffect(() => {
    dataDirPath().then(setDir).catch(() => {});
  }, []);
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });

  return (
    <div className="form">
      <div className="form-title">
        <h2>全般</h2>
      </div>
      <Field label="わたしの名前">
        <input value={s.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="わたし" />
      </Field>
      <Field label="わたしのアイコン">
        <AvatarPicker value={s.userAvatar} color="#8A94A6" onChange={(userAvatar) => set({ userAvatar })} />
      </Field>

      <div className="grid2">
        <Field label="最大ターン数" hint="あなたが 1 回発言するごとに、エージェントが話す最大回数">
          <input
            type="number"
            min={1}
            max={100}
            value={s.maxTurns}
            onChange={(e) => set({ maxTurns: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </Field>
        <Field label="お題を出したときの話し始め方">
          <select value={s.firstRound} onChange={(e) => set({ firstRound: e.target.value as Settings["firstRound"] })}>
            <option value="parallel">全員が同時に話し始める</option>
            <option value="sequential">1 人ずつ順番に話す</option>
          </select>
        </Field>
      </div>

      <Field
        label="作業フォルダ（任意）"
        hint="指定すると、エージェントがこのフォルダのファイルを読んで会話できます（読み取り専用）"
      >
        <div className="cmd-row">
          <input value={s.workDir} onChange={(e) => set({ workDir: e.target.value })} placeholder="（なし）" />
          <button
            className="btn"
            onClick={async () => {
              const picked = await open({ directory: true, multiple: false });
              if (typeof picked === "string") set({ workDir: picked });
            }}
          >
            選ぶ…
          </button>
          {s.workDir && (
            <button className="btn" onClick={() => set({ workDir: "" })}>
              クリア
            </button>
          )}
        </div>
      </Field>

      <div className="grid2">
        <Field label="1 回の応答のタイムアウト（秒）">
          <input
            type="number"
            min={10}
            value={s.timeoutSec}
            onChange={(e) => set({ timeoutSec: Math.max(10, Number(e.target.value) || 300) })}
          />
        </Field>
        <Field label="エージェントに渡す会話履歴の件数" hint="多いほど文脈を覚えているが遅くなる">
          <input
            type="number"
            min={4}
            max={500}
            value={s.contextLimit}
            onChange={(e) => set({ contextLimit: Math.max(4, Number(e.target.value) || 40) })}
          />
        </Field>
      </div>

      <div className="section-title">表示</div>
      <DisplayControls s={s} onChange={set} />

      <Field label="テーマ">
        <select value={s.theme} onChange={(e) => set({ theme: e.target.value as Settings["theme"] })}>
          <option value="system">システムに合わせる</option>
          <option value="light">ライト</option>
          <option value="dark">ダーク</option>
        </select>
      </Field>

      {dir && <div className="field-hint">保存先: {dir}</div>}
    </div>
  );
}

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const openSettings = useStore((s) => s.openSettings);
  const [draft, setDraft] = useState<Settings>(() => structuredClone(settings));
  const [tab, setTab] = useState<Tab>("general");

  const close = () => openSettings(false);
  const save = () => {
    setSettings(draft);
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-nav">
          <div className="modal-nav-title">設定</div>
          <button className={`nav-item ${tab === "general" ? "active" : ""}`} onClick={() => setTab("general")}>
            <span className="nav-icon">⚙</span> 全般
          </button>
          <div className="nav-label">エージェント</div>
          {AGENT_KINDS.map((k) => (
            <button key={k} className={`nav-item ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
              <Avatar avatar={draft.agents[k].avatar} color={draft.agents[k].color} size={22} />
              <span className={draft.agents[k].enabled ? "" : "muted"}>{draft.agents[k].name || k}</span>
            </button>
          ))}
          <div className="nav-spacer" />
          <button
            className="btn small"
            onClick={() => {
              if (tab === "general") {
                setDraft({ ...structuredClone(DEFAULT_SETTINGS), agents: draft.agents, modelCatalog: draft.modelCatalog });
              } else {
                setDraft({ ...draft, agents: { ...draft.agents, [tab]: structuredClone(DEFAULT_SETTINGS.agents[tab]) } });
              }
            }}
          >
            このページを初期値に戻す
          </button>
        </div>
        <div className="modal-main">
          <div className="modal-content">
            {tab === "general" ? (
              <GeneralForm s={draft} onChange={setDraft} />
            ) : (
              <AgentForm
                key={tab}
                cfg={draft.agents[tab]}
                catalog={draft.modelCatalog[tab]}
                onChange={(c) => setDraft({ ...draft, agents: { ...draft.agents, [tab]: c } })}
                onCatalog={(list) => setDraft({ ...draft, modelCatalog: { ...draft.modelCatalog, [tab]: list } })}
              />
            )}
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={close}>
              キャンセル
            </button>
            <button className="btn primary" onClick={save}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

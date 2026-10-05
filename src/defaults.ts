import type { AgentKind, ModelInfo, Settings } from "./types";

const ALL = ["low", "medium", "high", "xhigh", "max"];
const LMH = ["low", "medium", "high"];

/** モデル一覧の初期値。設定画面の「一覧を更新」や起動時に CLI から取り直す（claude は固定） */
export const DEFAULT_CATALOG: Record<AgentKind, ModelInfo[]> = {
  claude: [
    { id: "sonnet", label: "Sonnet（最新）", efforts: ALL },
    { id: "opus", label: "Opus（最新）", efforts: ALL },
    { id: "fable", label: "Fable（最新）", efforts: ALL },
    { id: "haiku", label: "Haiku（最新）", efforts: ALL },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", efforts: ALL },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", efforts: ALL },
    { id: "claude-fable-5-1", label: "Claude Fable 5.1", efforts: ALL },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", efforts: ALL },
  ],
  agy: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", efforts: LMH },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", efforts: LMH },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", efforts: LMH },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", efforts: ["low", "high"] },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", efforts: LMH },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", efforts: LMH },
    { id: "gpt-oss-120b", label: "GPT-OSS 120B", efforts: ["medium"] },
  ],
  codex: [
    { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: [...ALL, "ultra"] },
    { id: "gpt-6-astra", label: "GPT-6-Astra", efforts: [...ALL, "ultra"] },
    { id: "gpt-6-sol", label: "GPT-6-Sol", efforts: [...ALL, "ultra"] },
    { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ALL },
    { id: "gpt-5.6-sol", label: "GPT-5.6-Sol", efforts: [...ALL, "ultra"] },
    { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", efforts: [...ALL, "ultra"] },
    { id: "gpt-5.6-luna", label: "GPT-5.6-Luna", efforts: ALL },
    { id: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium", "high", "xhigh"] },
  ],
};

export const DEFAULT_SETTINGS: Settings = {
  userName: "わたし",
  userAvatar: "preset:me",
  maxTurns: 9,
  firstRound: "parallel",
  workDir: "",
  timeoutSec: 300,
  contextLimit: 40,
  theme: "system",
  chatStyle: "line",
  avatarSize: 40,
  fontSize: 15,
  revealEffect: true,
  splitBubbles: true,
  showStreaming: false,
  sound: true,
  showMyAvatar: true,
  agents: {
    claude: {
      kind: "claude",
      enabled: true,
      name: "クロ",
      avatar: "preset:kuro",
      color: "#E07A52",
      command: "claude",
      model: "sonnet",
      effort: "medium",
      persona: "落ち着いていて論理的。話を整理してまとめるのが得意。",
    },
    agy: {
      kind: "agy",
      enabled: true,
      name: "アニー",
      avatar: "preset:annie",
      color: "#7B7BF5",
      command: "agy",
      model: "gemini-3.8-flash",
      effort: "medium",
      persona: "明るく好奇心旺盛。新しいアイデアや別の視点を出すのが得意。",
    },
    codex: {
      kind: "codex",
      enabled: true,
      name: "コデック",
      avatar: "preset:codec",
      color: "#10A37F",
      command: "codex",
      model: "gpt-6-astra",
      effort: "medium",
      persona: "実務的で具体的。手順や実装に落とし込むのが得意。",
    },
  },
  modelCatalog: DEFAULT_CATALOG,
};

/** claude と codex はエフォート未指定（CLI の既定）も選べる */
export const ALLOW_DEFAULT_EFFORT: Record<AgentKind, boolean> = { claude: true, agy: false, codex: true };

export const AGENT_LABEL: Record<AgentKind, string> = {
  claude: "Claude Code（claude -p）",
  agy: "Antigravity CLI（agy）",
  codex: "OpenAI Codex CLI（codex exec）",
};

export const FONT_SIZE = { min: 12, max: 22 };
export const AVATAR_SIZE = { min: 24, max: 64 };

/** 古い保存データに新しい項目を補う */
export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return base;
  const agents = { ...base.agents };
  const modelCatalog = { ...base.modelCatalog };
  for (const k of Object.keys(agents) as AgentKind[]) {
    agents[k] = { ...agents[k], ...(saved.agents?.[k] ?? {}), kind: k };
    const cat = saved.modelCatalog?.[k];
    if (cat && cat.length > 0) modelCatalog[k] = cat;
  }
  return { ...base, ...saved, agents, modelCatalog };
}

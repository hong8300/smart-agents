export type AgentKind = "claude" | "agy" | "codex";
export const AGENT_KINDS: AgentKind[] = ["claude", "agy", "codex"];

export interface AgentConfig {
  kind: AgentKind;
  enabled: boolean;
  name: string;
  /** "preset:<key>" / "emoji:<文字>" / data URL */
  avatar: string;
  color: string;
  /** 実行するコマンド名またはフルパス */
  command: string;
  model: string;
  effort: string;
  /** 性格・追加の指示 */
  persona: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  efforts: string[];
}

export type Theme = "system" | "light" | "dark";
export type ChatStyle = "line" | "simple";

export interface Settings {
  userName: string;
  userAvatar: string;
  maxTurns: number;
  /** お題が出たとき全員同時に話すか、順番に話すか */
  firstRound: "parallel" | "sequential";
  /** 空なら作業フォルダなし。指定するとエージェントがそのフォルダのファイルを読める */
  workDir: string;
  timeoutSec: number;
  /** プロンプトに含める直近のメッセージ数 */
  contextLimit: number;
  theme: Theme;

  // ---- 表示 ----
  /** line: 吹き出し（わたしは右、みんなは左） / simple: 吹き出しなし */
  chatStyle: ChatStyle;
  /** チャット内のアイコンの大きさ（px） */
  avatarSize: number;
  /** チャットの文字の大きさ（px） */
  fontSize: number;
  /** 返信を 1 つずつ順番に表示し、入力中の演出を入れる */
  revealEffect: boolean;
  /** 長い発言を段落ごとに複数の吹き出しに分ける */
  splitBubbles: boolean;
  /** 入力中も書きかけの文字を見せる */
  showStreaming: boolean;
  /** 送受信の効果音 */
  sound: boolean;
  /** チャットにわたしのアイコンを表示する */
  showMyAvatar: boolean;

  agents: Record<AgentKind, AgentConfig>;
  /** CLI から取得したモデル一覧（取得前は既定の一覧） */
  modelCatalog: Record<AgentKind, ModelInfo[]>;
}

export type MessageStatus = "done" | "error" | "cancelled";
export type NoticeKind = "maxTurns" | "end" | "ask" | "stopped" | "info";

export interface Reaction {
  agent: AgentKind;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  agent?: AgentKind;
  content: string;
  /** 吹き出しごとに分けた本文（なければ content を 1 つの吹き出しとして扱う） */
  parts?: string[];
  /** 画像（ファイルの絶対パス、または SVG の data URL） */
  images?: string[];
  status: MessageStatus;
  createdAt: number;
  durationMs?: number;
  model?: string;
  error?: string;
  notice?: NoticeKind;
  flags?: { end?: boolean; ask?: boolean };
  reactions?: Reaction[];
  /** わたしの発言を読んだエージェント（既読） */
  readBy?: AgentKind[];
  /** 「みんなで画像を作る」で送った発言 */
  imageRequest?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface RunInfo {
  turn: number;
  max: number;
}

/** 返信を書いている途中のエージェント（画面下部の「入力中」表示） */
export interface Typing {
  agent: AgentKind;
  startedAt: number;
  statusText?: string;
  /** 書きかけの本文（ストリーミング） */
  live: string;
}

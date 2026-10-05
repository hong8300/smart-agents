import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { AgentKind, ModelInfo } from "./types";

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "status"; text: string };

export interface RunRequest {
  runId: string;
  kind: AgentKind;
  command: string;
  model: string;
  effort: string;
  prompt: string;
  workDir: string;
  timeoutSec: number;
}

export interface RunResult {
  text: string;
  model: string;
  durationMs: number;
  /** エージェントが作った画像の絶対パス */
  images: string[];
}

export interface AgentCheck {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export const CANCELLED = "cancelled";

export function runAgent(req: RunRequest, onEvent: (ev: StreamEvent) => void): Promise<RunResult> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<RunResult>("run_agent", { req, onEvent: channel });
}

export function cancelRun(runId: string): Promise<void> {
  return invoke("cancel_run", { runId });
}

export function checkAgent(command: string): Promise<AgentCheck> {
  return invoke("check_agent", { command });
}

export function loadJson<T>(name: string): Promise<T | null> {
  return invoke<string | null>("load_json", { name }).then((s) => (s ? (JSON.parse(s) as T) : null));
}

export function saveJson(name: string, value: unknown): Promise<void> {
  return invoke("save_json", { name, content: JSON.stringify(value) });
}

export function dataDirPath(): Promise<string> {
  return invoke("data_dir_path");
}

export function listModels(kind: AgentKind, command: string): Promise<ModelInfo[]> {
  return invoke("list_models", { kind, command });
}

/** 画像（ファイルパス or data URL）を img の src に使える形にする */
export function imageSrc(image: string): string {
  return image.startsWith("data:") ? image : convertFileSrc(image);
}

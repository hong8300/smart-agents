// 効果音（音声ファイルを使わず WebAudio で合成する）

import type { AgentKind } from "./types";

let ctx: AudioContext | null = null;

const PITCH: Record<AgentKind | "me", number> = { claude: 1, agy: 1.19, codex: 0.89, me: 1.33 };

/** ユーザー操作のタイミングで呼んでおくと、以降の自動再生がブロックされない */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function playPop(who: AgentKind | "me") {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const f = 620 * PITCH[who];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch {
    // 音が出せない環境では何もしない
  }
}

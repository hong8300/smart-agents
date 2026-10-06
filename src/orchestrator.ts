// 会話の進行役。お題が出たらエージェントを順に（または同時に）呼び出し、
// 最大ターン数・終了合図・ユーザーへの質問で止める。
//
// 演出: 返信を書いている間は画面下部に「入力中」を出し、書き終わった返信は
// チャットごとの表示キューに並べて 1 つずつ（吹き出しごとに間を置いて）表示する。

import { CANCELLED, cancelRun, runAgent } from "./api";
import { buildPrompt, enabledAgents, isConversational, parseReply, pickNext, splitParts } from "./prompt";
import { playPop, unlockAudio } from "./sound";
import { uid, useStore } from "./store";
import type { AgentKind, NoticeKind } from "./types";

interface Controller {
  stopped: boolean;
  runIds: Set<string>;
}

const controllers = new Map<string, Controller>();
const revealQueues = new Map<string, Promise<void>>();

const st = () => useStore.getState();
const getChat = (id: string) => st().chats.find((c) => c.id === id);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function notice(chatId: string, kind: NoticeKind, content: string) {
  st().addMessage(chatId, { role: "system", notice: kind, content, status: "done", createdAt: Date.now() });
}

function pop(who: AgentKind | "me") {
  if (st().settings.sound) playPop(who);
}

/** チャットごとに表示を 1 つずつ順番に行う */
function enqueueReveal(chatId: string, job: () => Promise<void>): Promise<void> {
  const prev = revealQueues.get(chatId) ?? Promise.resolve();
  const next = prev.then(job, job);
  revealQueues.set(chatId, next.catch(() => {}));
  return next;
}

export function isRunning(chatId: string) {
  return controllers.has(chatId);
}

/** ユーザーの発言を追加して会話を進める（実行中なら進行中のループが拾う） */
export function sendUserMessage(chatId: string | null, text: string, opts: { imageRequest?: boolean } = {}): string {
  unlockAudio();
  const id = chatId ?? st().createChat(text);
  st().addMessage(id, {
    role: "user",
    content: text,
    status: "done",
    createdAt: Date.now(),
    imageRequest: opts.imageRequest || undefined,
  });
  pop("me");
  void runConversation(id);
  return id;
}

export function continueConversation(chatId: string) {
  unlockAudio();
  void runConversation(chatId);
}

export function stopConversation(chatId: string) {
  const ctl = controllers.get(chatId);
  if (!ctl) return;
  ctl.stopped = true;
  for (const runId of ctl.runIds) void cancelRun(runId);
}

interface TurnResult {
  ok: boolean;
  end?: boolean;
  ask?: boolean;
}

async function runConversation(chatId: string) {
  if (controllers.has(chatId)) return;
  const ctl: Controller = { stopped: false, runIds: new Set() };
  controllers.set(chatId, ctl);

  const lastUserId = () => [...(getChat(chatId)?.messages ?? [])].reverse().find((m) => m.role === "user")?.id;
  let seenUser = lastUserId();
  let turns = 0;
  const failed = new Set<AgentKind>();

  try {
    while (!ctl.stopped) {
      const s = st().settings;
      const chat = getChat(chatId);
      if (!chat) break;
      const max = Math.max(1, s.maxTurns);

      // 実行中にユーザーが発言したら、そこから数え直す
      const u = lastUserId();
      if (u !== seenUser) {
        seenUser = u;
        turns = 0;
        failed.clear();
      }

      const active = enabledAgents(s).filter((k) => !failed.has(k));
      if (active.length === 0) {
        notice(chatId, "info", failed.size ? "応答できるエージェントがいないため止めました。" : "有効なエージェントがいません。設定で有効にしてください。");
        break;
      }
      if (turns >= max) {
        notice(chatId, "maxTurns", `最大ターン数（${max}）に達したので一旦止めました。`);
        break;
      }

      const last = [...chat.messages].reverse().find(isConversational);
      let speakers: AgentKind[];
      let imageRound = false;
      if (!last || last.role === "user") {
        imageRound = !!last?.imageRequest;
        speakers = s.firstRound === "parallel" || imageRound ? active : [active[0]];
      } else {
        // エージェントが 1 人だけなら、自問自答させずにユーザーの返事を待つ
        if (active.length === 1) break;
        speakers = [pickNext(s, last, active)];
      }
      speakers = speakers.slice(0, max - turns);
      const remaining = max - turns;
      st().setRunning(chatId, { turn: turns, max });

      // 同時に話し始めるときも「入力中」が少しずつずれて出るようにする。
      // ターン数は 1 人の返事が終わるたびに増やす（全員分を待たない）
      const results = await Promise.all(
        speakers.map((k, i) =>
          runTurn(chatId, k, ctl, remaining, { imageRound, delay: i * 450 }).finally(() => {
            turns += 1;
            st().setRunning(chatId, { turn: turns, max });
          }),
        ),
      );
      if (ctl.stopped) break;

      results.forEach((r, i) => {
        if (!r.ok) failed.add(speakers[i]);
      });
      const ok = results.filter((r) => r.ok);
      if (ok.some((r) => r.ask)) {
        notice(chatId, "ask", `${s.userName}への質問が来ています。返信すると会話が続きます。`);
        break;
      }
      // 同時に話したラウンドでは、全員が終了合図を出したときだけ終える
      if (ok.length > 0 && ok.every((r) => r.end)) {
        notice(chatId, "end", "みんなが「結論が出た」と判断したので終了しました。");
        break;
      }
    }
    if (ctl.stopped) notice(chatId, "stopped", "会話を停止しました。");
  } finally {
    controllers.delete(chatId);
    st().setRunning(chatId, undefined);
  }
}

/** 吹き出しを出す前の「入力中」の間（文字数に応じて少し長く） */
const typingPause = (part: string | null) => (part == null ? 700 : 450 + Math.min(1300, part.length * 22));

async function runTurn(
  chatId: string,
  kind: AgentKind,
  ctl: Controller,
  remaining: number,
  opts: { imageRound: boolean; delay: number },
): Promise<TurnResult> {
  if (opts.delay) await sleep(opts.delay);
  if (ctl.stopped) return { ok: false };

  const s = st().settings;
  const agent = s.agents[kind];
  const chat = getChat(chatId);
  if (!chat) return { ok: false };

  // リアクションは「この発言を書き始めた時点の直前の発言」に付ける
  const replyTo = [...chat.messages].reverse().find((m) => isConversational(m) && m.agent !== kind)?.id;
  const prompt = buildPrompt(s, chat, kind, remaining, { imageRound: opts.imageRound });
  st().startTyping(chatId, kind);
  st().markRead(chatId, kind);

  let pending = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (pending) {
      st().appendLive(chatId, kind, pending);
      pending = "";
    }
  };

  const runId = uid();
  ctl.runIds.add(runId);
  try {
    const res = await runAgent(
      {
        runId,
        kind,
        command: agent.command,
        model: agent.model,
        effort: agent.effort,
        prompt,
        workDir: s.workDir,
        timeoutSec: s.timeoutSec,
      },
      (ev) => {
        if (ev.type === "delta") {
          pending += ev.text;
          timer ??= setTimeout(flush, 50);
        } else if (ev.type === "reset") {
          clearTimeout(timer);
          timer = undefined;
          pending = "";
          st().updateTyping(chatId, kind, { live: "" });
        } else {
          st().updateTyping(chatId, kind, { statusText: ev.text });
        }
      },
    );
    clearTimeout(timer);

    const cur = st().settings;
    const parsed = parseReply(res.text, cur, kind);
    const images = [...res.images, ...parsed.svgs];
    const parts = cur.splitBubbles ? splitParts(parsed.text) : parsed.text ? [parsed.text] : [];
    // シンプル表示では本文は 1 つにまとめて出す
    const textBubbles = cur.chatStyle === "line" ? parts.length : parsed.text ? 1 : 0;

    await enqueueReveal(chatId, async () => {
      const animate = st().settings.revealEffect && !ctl.stopped;
      const total = textBubbles + images.length;
      const msgId = st().addMessage(chatId, {
        role: "agent",
        agent: kind,
        content: parsed.text,
        parts: parts.length > 1 ? parts : undefined,
        images: images.length ? images : undefined,
        status: "done",
        createdAt: Date.now(),
        durationMs: res.durationMs,
        model: res.model,
        flags: parsed.end || parsed.ask ? { end: parsed.end || undefined, ask: parsed.ask || undefined } : undefined,
      });
      if (parsed.react && replyTo) st().addReaction(chatId, replyTo, { agent: kind, emoji: parsed.react });
      pop(kind);
      if (animate && total > 1) {
        st().setReveal(msgId, 1);
        for (let i = 1; i < total; i++) {
          await sleep(typingPause(i < textBubbles ? (parts[i] ?? "") : null));
          if (ctl.stopped) break;
          st().setReveal(msgId, i + 1);
          pop(kind);
        }
        st().setReveal(msgId, undefined);
      }
      st().stopTyping(chatId, kind);
      if (animate) await sleep(500);
    });
    return { ok: true, end: parsed.end, ask: parsed.ask };
  } catch (e) {
    clearTimeout(timer);
    const err = String(e);
    if (ctl.stopped || err === CANCELLED) {
      st().stopTyping(chatId, kind);
    } else {
      await enqueueReveal(chatId, async () => {
        st().stopTyping(chatId, kind);
        st().addMessage(chatId, { role: "agent", agent: kind, content: "", status: "error", error: err, createdAt: Date.now() });
      });
    }
    return { ok: false };
  } finally {
    ctl.runIds.delete(runId);
  }
}

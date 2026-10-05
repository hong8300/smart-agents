import { AGENT_KINDS, type AgentKind, type Chat, type ChatMessage, type Settings } from "./types";

const ENGINE: Record<AgentKind, string> = {
  claude: "Claude",
  agy: "Antigravity",
  codex: "Codex",
};

/** 画像の作り方（エージェントごとに使える手段が違う） */
const IMAGE_HOWTO: Record<AgentKind, string> = {
  claude:
    "画像が必要なときは、```svg のコードブロックに SVG を 1 つ書く（viewBox 付き、512×512 程度）。チャットには画像として表示される",
  agy: "画像が必要なときは、画像生成ツールで画像を作る。作った画像は自動でチャットに表示されるので、パスやリンクは書かなくてよい",
  codex: "画像が必要なときは、画像生成機能（imagegen）で画像を作る。作った画像は自動でチャットに表示されるので、パスは書かなくてよい",
};

export function enabledAgents(s: Settings): AgentKind[] {
  return AGENT_KINDS.filter((k) => s.agents[k].enabled);
}

export function speakerName(s: Settings, m: ChatMessage): string {
  if (m.role === "user") return s.userName;
  if (m.agent) return s.agents[m.agent].name;
  return "";
}

/** 会話として数える（プロンプトに含める）メッセージ */
export function isConversational(m: ChatMessage): boolean {
  if (m.role === "user") return true;
  return m.role === "agent" && m.status === "done" && (m.content.trim() !== "" || !!m.images?.length);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function transcriptLine(s: Settings, m: ChatMessage): string {
  const imgs = m.images?.length ? `\n（画像を ${m.images.length} 枚投稿しました）` : "";
  return `【${speakerName(s, m)}】\n${m.content.trim()}${imgs}`.trim();
}

export function buildPrompt(
  s: Settings,
  chat: Chat,
  me: AgentKind,
  remaining: number,
  opts: { imageRound?: boolean } = {},
): string {
  const a = s.agents[me];
  const others = enabledAgents(s).filter((k) => k !== me);
  const u = s.userName;

  const history = chat.messages.filter(isConversational);
  const limit = Math.max(4, s.contextLimit);
  const shown = history.slice(-limit);
  const transcript = shown.map((m) => transcriptLine(s, m)).join("\n\n");

  const persona = (txt: string) => (txt.trim() ? `: ${txt.trim()}` : "");
  const line = s.chatStyle === "line";
  const lines = [
    `あなたは「${a.name}」です。人間のユーザー「${u}」と AI エージェントたちの${line ? " LINE のような" : ""}グループチャットに参加しています。`,
    "",
    "## 参加者",
    `- 「${u}」: 人間のユーザー。お題を出す人`,
    `- 「${a.name}」（あなた・中身は ${ENGINE[me]}）${persona(a.persona)}`,
    ...others.map((k) => `- 「${s.agents[k].name}」（中身は ${ENGINE[k]}）${persona(s.agents[k].persona)}`),
    "",
    "## 発言のルール",
    line
      ? "- 日本語で、友だちとチャットしているように自然でくだけた口調で話す。1 つの吹き出しは 1〜3 文の短さにする"
      : "- 日本語で、チャットらしく自然に話す。1 回の発言は短め（目安 150〜400 字）",
    ...(line && s.splitBubbles
      ? ["- 言いたいことが複数あるときは空行で区切る。区切りごとに別の吹き出しとして順に送信される（多くても 3 つまで）"]
      : []),
    "- 詳しい説明やコードが必要なときだけ長くしてよい。Markdown（箇条書き・表・コードブロック）も使える",
    "- 他の参加者の発言を踏まえて、共感・賛成・反論・ツッコミ・質問・具体化などで会話を前に進める。すでに出た内容の繰り返しや、挨拶のやり直しはしない",
    `- 特定の人に話を振るときは「@名前」と書く（例: @${s.agents[others[0] ?? me].name}）。指名された人が次に話す`,
    `- 自分の名前の見出し（「${a.name}:」など）は付けず、本文だけを書く`,
    "- 直前の発言に反応したいときは、発言の先頭に [[REACT:😆]] のように絵文字を 1 つ付けられる（任意。毎回は付けない）",
    `- ${IMAGE_HOWTO[me]}`,
    "- 話し合いの結論が出た、またはお題のタスクが完了したと判断したら、最後の行に [[END]] とだけ書く",
    `- 「${u}」の判断・好み・追加情報がないと先に進めないときだけ、@${u} に質問して最後の行に [[ASK]] とだけ書く`,
    `- このあと全体で残り ${remaining} 回の発言（あなたの今回の発言を含む）で一旦止まる。残りが少ないときは結論・まとめ・次のアクションに向かう`,
    "",
    "## 作業環境",
    s.workDir.trim()
      ? `- 作業フォルダ ${s.workDir.trim()} のファイルを読んで参照できる（読み取り専用）。ファイルの作成・変更やコマンド実行はしない`
      : "- ファイルの作成・変更やコマンド実行はしない（画像の生成は除く）",
    ...(opts.imageRound
      ? [
          "",
          "## 今回は「みんなで画像を作る」お題",
          `- 参加者全員がそれぞれ画像を 1 枚作って投稿する。あなたも必ず画像を 1 枚作り、どんな工夫をしたかをひとこと添える`,
        ]
      : []),
    "",
    "## これまでの会話",
    ...(history.length > shown.length ? ["（古い発言は省略しています）", ""] : []),
    transcript || "（まだ発言はありません）",
    "",
    "## あなたの番",
    `上の会話の続きとして、「${a.name}」の次の発言だけを書いてください。`,
  ];
  return lines.join("\n");
}

export interface ParsedReply {
  text: string;
  end: boolean;
  ask: boolean;
  react?: string;
  /** 本文から取り出した SVG（data URL） */
  svgs: string[];
}

export function parseReply(raw: string, s: Settings, me: AgentKind): ParsedReply {
  let text = raw.trim();
  const end = /\[\[\s*END\s*\]\]/i.test(text);
  const ask = /\[\[\s*ASK\s*\]\]/i.test(text);
  const react = text.match(/\[\[\s*REACT\s*[:：]\s*([^\]\s]{1,8})\s*\]\]/i)?.[1];
  text = text.replace(/\[\[\s*(END|ASK)\s*\]\]/gi, "").replace(/\[\[\s*REACT\s*[:：][^\]]*\]\]/gi, "");

  // SVG はコードブロックごと取り出して画像として扱う
  const svgs: string[] = [];
  const toUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
  text = text.replace(/```(?:svg|xml|html)?\s*\n(\s*<svg[\s\S]*?<\/svg>)\s*\n?```/gi, (_, svg: string) => {
    svgs.push(toUrl(svg));
    return "";
  });
  text = text.replace(/(^|\n)\s*(<svg[\s\S]*?<\/svg>)/gi, (_, pre: string, svg: string) => {
    svgs.push(toUrl(svg));
    return pre;
  });

  text = text.trim();
  // モデルが自分の名前を見出しとして付けてしまった場合は取り除く
  const name = escapeRe(s.agents[me].name);
  text = text.replace(new RegExp(`^(【${name}】|\\*{0,2}${name}\\*{0,2}\\s*[:：])\\s*`), "").trim();
  text = text.replace(/\n{3,}/g, "\n\n");
  return { text, end, ask, react, svgs };
}

/**
 * 発言を吹き出しに分ける。空行で区切るが、コードブロック・箇条書き・表はまとめておく。
 * 吹き出しが多すぎるときは最後にまとめる。
 */
export function splitParts(text: string, max = 4): string[] {
  const t = text.trim();
  if (!t) return [];
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const ln of t.split("\n")) {
    if (/^\s*```/.test(ln)) inFence = !inFence;
    if (!inFence && ln.trim() === "") {
      if (buf.length) blocks.push(buf.join("\n"));
      buf = [];
    } else {
      buf.push(ln);
    }
  }
  if (buf.length) blocks.push(buf.join("\n"));

  const isListish = (b: string) => /^\s*([-*+]|\d+[.)]|\|)/.test(b);
  const merged: string[] = [];
  for (const b of blocks) {
    const prev = merged[merged.length - 1];
    // 箇条書きや表の続き、見出しだけの行は前の吹き出しにつなげる
    const listCont = isListish(b) && isListish(prev?.split("\n").pop() ?? "");
    const afterHeading = !!prev && /^#{1,6}\s/.test(prev) && !prev.includes("\n");
    if (prev && (listCont || afterHeading)) {
      merged[merged.length - 1] = `${prev}\n\n${b}`;
    } else {
      merged.push(b);
    }
  }
  if (merged.length <= max) return merged;
  return [...merged.slice(0, max - 1), merged.slice(max - 1).join("\n\n")];
}

/** 直前の発言者の次に話すエージェントを決める（@指名 → 順番） */
export function pickNext(s: Settings, last: ChatMessage, active: AgentKind[]): AgentKind {
  const content = last.content.replace(/＠/g, "@");
  const mentioned = active
    .filter((k) => k !== last.agent)
    .map((k) => ({ k, idx: content.indexOf(`@${s.agents[k].name}`) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (mentioned.length) return mentioned[0].k;
  const i = last.agent ? active.indexOf(last.agent) : -1;
  return active[(i + 1) % active.length];
}

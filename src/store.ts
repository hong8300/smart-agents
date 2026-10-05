import { create } from "zustand";
import { loadJson, saveJson } from "./api";
import { mergeSettings } from "./defaults";
import type { AgentKind, Chat, ChatMessage, Reaction, RunInfo, Settings, Typing } from "./types";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface AppState {
  loaded: boolean;
  settings: Settings;
  chats: Chat[];
  currentChatId: string | null;
  running: Record<string, RunInfo | undefined>;
  /** チャットごとの「入力中」のエージェント */
  typing: Record<string, Typing[] | undefined>;
  /** 吹き出しを順番に出している途中のメッセージ: 表示済みの吹き出し数 */
  reveal: Record<string, number | undefined>;
  settingsOpen: boolean;

  init: () => Promise<void>;
  setSettings: (s: Settings) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  openSettings: (open: boolean) => void;
  selectChat: (id: string | null) => void;
  createChat: (firstMessage: string) => string;
  deleteChat: (id: string) => void;
  addMessage: (chatId: string, msg: Omit<ChatMessage, "id">) => string;
  updateMessage: (chatId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  addReaction: (chatId: string, msgId: string, r: Reaction) => void;
  markRead: (chatId: string, agent: AgentKind) => void;
  setRunning: (chatId: string, info: RunInfo | undefined) => void;
  startTyping: (chatId: string, agent: AgentKind) => void;
  updateTyping: (chatId: string, agent: AgentKind, patch: Partial<Typing>) => void;
  appendLive: (chatId: string, agent: AgentKind, text: string) => void;
  stopTyping: (chatId: string, agent: AgentKind) => void;
  setReveal: (msgId: string, shown: number | undefined) => void;
}

const makeTitle = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 32 ? `${t.slice(0, 32)}…` : t || "新しいチャット";
};

function patchChat(chats: Chat[], chatId: string, fn: (c: Chat) => Chat): Chat[] {
  return chats.map((c) => (c.id === chatId ? fn(c) : c));
}

export const useStore = create<AppState>((set, get) => {
  const patchTyping = (chatId: string, agent: AgentKind, fn: (t: Typing) => Typing) =>
    set({
      typing: { ...get().typing, [chatId]: (get().typing[chatId] ?? []).map((t) => (t.agent === agent ? fn(t) : t)) },
    });

  return {
    loaded: false,
    settings: mergeSettings(null),
    chats: [],
    currentChatId: null,
    running: {},
    typing: {},
    reveal: {},
    settingsOpen: false,

    init: async () => {
      const [settings, chats] = await Promise.all([
        loadJson<Partial<Settings>>("settings").catch(() => null),
        loadJson<Chat[]>("chats").catch(() => null),
      ]);
      // 旧バージョンの「書きかけ」メッセージは中断扱いにする
      const fixed = (chats ?? []).map((c) => ({
        ...c,
        messages: c.messages
          .map((m) => ((m.status as string) === "streaming" ? { ...m, status: "cancelled" as const } : m))
          .filter((m) => !(m.status === "cancelled" && !m.content)),
      }));
      set({ settings: mergeSettings(settings), chats: fixed, loaded: true });
    },

    setSettings: (settings) => {
      set({ settings });
      saveJson("settings", settings).catch(console.error);
    },

    patchSettings: (patch) => get().setSettings({ ...get().settings, ...patch }),

    openSettings: (settingsOpen) => set({ settingsOpen }),

    selectChat: (currentChatId) => set({ currentChatId }),

    createChat: (firstMessage) => {
      const now = Date.now();
      const chat: Chat = { id: uid(), title: makeTitle(firstMessage), createdAt: now, updatedAt: now, messages: [] };
      set({ chats: [chat, ...get().chats], currentChatId: chat.id });
      return chat.id;
    },

    deleteChat: (id) => {
      set({
        chats: get().chats.filter((c) => c.id !== id),
        currentChatId: get().currentChatId === id ? null : get().currentChatId,
      });
    },

    addMessage: (chatId, msg) => {
      const id = uid();
      set({
        chats: patchChat(get().chats, chatId, (c) => ({
          ...c,
          updatedAt: Date.now(),
          messages: [...c.messages, { ...msg, id }],
        })),
      });
      return id;
    },

    updateMessage: (chatId, msgId, patch) => {
      set({
        chats: patchChat(get().chats, chatId, (c) => ({
          ...c,
          updatedAt: Date.now(),
          messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
        })),
      });
    },

    addReaction: (chatId, msgId, r) => {
      set({
        chats: patchChat(get().chats, chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === msgId
              ? { ...m, reactions: [...(m.reactions ?? []).filter((x) => x.agent !== r.agent), r] }
              : m,
          ),
        })),
      });
    },

    markRead: (chatId, agent) => {
      set({
        chats: patchChat(get().chats, chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.role === "user" && !m.readBy?.includes(agent) ? { ...m, readBy: [...(m.readBy ?? []), agent] } : m,
          ),
        })),
      });
    },

    setRunning: (chatId, info) => set({ running: { ...get().running, [chatId]: info } }),

    startTyping: (chatId, agent) => {
      const list = (get().typing[chatId] ?? []).filter((t) => t.agent !== agent);
      set({ typing: { ...get().typing, [chatId]: [...list, { agent, startedAt: Date.now(), live: "" }] } });
    },

    updateTyping: (chatId, agent, patch) => patchTyping(chatId, agent, (t) => ({ ...t, ...patch })),

    appendLive: (chatId, agent, text) => patchTyping(chatId, agent, (t) => ({ ...t, live: t.live + text })),

    stopTyping: (chatId, agent) =>
      set({ typing: { ...get().typing, [chatId]: (get().typing[chatId] ?? []).filter((t) => t.agent !== agent) } }),

    setReveal: (msgId, shown) => {
      const reveal = { ...get().reveal };
      if (shown == null) delete reveal[msgId];
      else reveal[msgId] = shown;
      set({ reveal });
    },
  };
});

// チャット履歴は変更があったら少し待ってまとめて保存する
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (!state.loaded || state.chats === prev.chats) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveJson("chats", useStore.getState().chats).catch(console.error);
  }, 800);
});

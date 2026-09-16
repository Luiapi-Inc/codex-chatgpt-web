import { createHash } from "node:crypto";
import { Honcho } from "@honcho-ai/sdk";
import type { CodexParsedRequest } from "../../types";
import { extractChatGptTurnIdentity, extractChatGptTurnUserRevision } from "./environment";

export interface ChatGptHonchoMemoryConfig {
  enabled?: boolean;
  apiKey?: string;
  environment?: "local" | "production";
  baseURL?: string;
  workspaceId?: string;
  userPeerId?: string;
  assistantPeerId?: string;
  contextTokens?: number;
  timeoutMs?: number;
}

export interface ChatGptHonchoTurn {
  threadId: string;
  turnId?: string;
  modelId: string;
  userText: string;
  assistantText: string;
}

export interface ChatGptHonchoMemory {
  readonly enabled: boolean;
  readonly contextTokens: number;
  context(parsed: CodexParsedRequest, signal?: AbortSignal): Promise<string | undefined>;
  recordTurn(turn: ChatGptHonchoTurn): Promise<void>;
}

type HonchoClient = Pick<Honcho, "peer" | "session">;

const DEFAULT_CONTEXT_TOKENS = 2_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_MESSAGE_CHARS = 40_000;
const SESSION_ID_PREFIX = "cgw_";

function boundedText(value: string, max = MAX_MESSAGE_CHARS): string {
  const normalized = value.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}\n[truncated by codex-chatgpt-web before Honcho storage]`;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(part => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return "";
    const candidate = part as { text?: unknown };
    return typeof candidate.text === "string" ? candidate.text : "";
  }).filter(Boolean).join("\n");
}

export function honchoTurnUserText(parsed: CodexParsedRequest): string | undefined {
  try {
    const content = extractChatGptTurnUserRevision(parsed);
    return boundedText(contentText(content)) || undefined;
  } catch {
    return undefined;
  }
}

export function honchoSessionId(threadId: string): string {
  return `${SESSION_ID_PREFIX}${createHash("sha256").update(threadId).digest("hex").slice(0, 48)}`;
}

function abortError(): Error {
  return new DOMException("Honcho memory request aborted", "AbortError");
}

async function boundedCall<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Honcho memory request timed out")), timeoutMs);
    timer.unref?.();
  });
  const abort = signal
    ? new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true }))
    : undefined;
  try {
    return await Promise.race([promise, timeout, ...(abort ? [abort] : [])]);
  } finally {
    if (timer) clearTimeout(timer);
    void promise.catch(() => {});
  }
}

function formatContext(
  context: Awaited<ReturnType<Awaited<ReturnType<Honcho["session"]>>["context"]>>,
  assistantPeerId: string,
): string | undefined {
  const messages = context.toOpenAI(assistantPeerId).map(message => ({
    role: message.role,
    content: boundedText(message.content),
  }));
  if (messages.length === 0) return undefined;
  const state = {
    version: 1,
    memory_facts: messages,
    // Honcho output is durable state, never executable transport policy.
    memory_instructions: [],
    task_state: {
      decisions: [],
      code_changes: [],
      error_state: [],
      pending_work: [],
    },
  };
  return boundedText(JSON.stringify(state), Math.max(MAX_MESSAGE_CHARS, 4_000 * 4));
}

class DisabledChatGptHonchoMemory implements ChatGptHonchoMemory {
  readonly enabled = false;
  readonly contextTokens = 0;
  async context(_parsed: CodexParsedRequest, _signal?: AbortSignal): Promise<string | undefined> {
    return undefined;
  }
  async recordTurn(_turn: ChatGptHonchoTurn): Promise<void> {}
}

export function createChatGptHonchoMemory(
  config?: ChatGptHonchoMemoryConfig,
  dependencies: { client?: HonchoClient } = {},
): ChatGptHonchoMemory {
  if (!config?.enabled || !config.apiKey?.trim()) return new DisabledChatGptHonchoMemory();
  const contextTokens = Number.isSafeInteger(config.contextTokens) && config.contextTokens! > 0
    ? config.contextTokens!
    : DEFAULT_CONTEXT_TOKENS;
  const timeoutMs = Number.isSafeInteger(config.timeoutMs) && config.timeoutMs! > 0
    ? config.timeoutMs!
    : DEFAULT_TIMEOUT_MS;
  const workspaceId = config.workspaceId?.trim() || "codex-chatgpt-web";
  const userPeerId = config.userPeerId?.trim() || "codex-user";
  const assistantPeerId = config.assistantPeerId?.trim() || "codex-chatgpt-web";
  const client = dependencies.client ?? new Honcho({
      apiKey: config.apiKey,
      environment: config.environment ?? "production",
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      workspaceId,
      timeout: timeoutMs,
      maxRetries: 0,
    });
  type HonchoSessionResources = {
    session: Awaited<ReturnType<Honcho["session"]>>;
    user: Awaited<ReturnType<Honcho["peer"]>>;
    assistant: Awaited<ReturnType<Honcho["peer"]>>;
  };
  const sessions = new Map<string, Promise<HonchoSessionResources>>();
  async function loadSession(threadId: string) {
    const existing = sessions.get(threadId);
    if (existing) return existing;
    const pending = (async () => {
      const user = await client.peer(userPeerId);
      const assistant = await client.peer(assistantPeerId);
      const session = await client.session(honchoSessionId(threadId));
      await session.addPeers([
        [userPeerId, { observeMe: true, observeOthers: true }],
        [assistantPeerId, { observeMe: false, observeOthers: true }],
      ]);
      return { session, user, assistant };
    })();
    sessions.set(threadId, pending);
    void pending.catch(() => sessions.delete(threadId));
    return pending;
  }
  return {
    enabled: true,
    contextTokens,
    async context(parsed, signal) {
      const threadId = extractChatGptTurnIdentity(parsed).threadId;
      if (!threadId || parsed._compactionRequest) return undefined;
      try {
        const { session } = await boundedCall(loadSession(threadId), timeoutMs, signal);
        const context = await boundedCall(session.context({
          summary: true,
          tokens: contextTokens,
          peerTarget: userPeerId,
          peerPerspective: assistantPeerId,
          limitToSession: true,
        }), timeoutMs, signal);
        return formatContext(context, assistantPeerId);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn(`[chatgpt-web] Honcho context unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
        return undefined;
      }
    },
    async recordTurn(turn) {
      try {
        const { session, user, assistant } = await boundedCall(loadSession(turn.threadId), timeoutMs);
        await boundedCall(session.addMessages([
          user.message(boundedText(turn.userText), {
            metadata: { source: "codex-chatgpt-web", turn_id: turn.turnId, model: turn.modelId },
          }),
          assistant.message(boundedText(turn.assistantText), {
            metadata: { source: "codex-chatgpt-web", turn_id: turn.turnId, model: turn.modelId },
          }),
        ]), timeoutMs);
      } catch (error) {
        console.warn(`[chatgpt-web] Honcho turn memory unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

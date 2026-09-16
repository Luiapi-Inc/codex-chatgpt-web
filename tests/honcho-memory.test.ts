import { expect, test } from "bun:test";
import { createChatGptHonchoMemory, honchoSessionId, honchoTurnUserText } from "../src/adapters/chatgpt-web/honcho-memory";
import type { CodexParsedRequest } from "../src/types";

function parsed(): CodexParsedRequest {
  const turnId = "turn_honcho_test";
  return {
    modelId: "gpt-5.6-sol",
    context: { messages: [{ role: "user", content: "task", timestamp: 1 }] },
    stream: false,
    options: { reasoning: "medium" },
    _rawBody: {
      client_metadata: {
        "x-codex-turn-metadata": JSON.stringify({ thread_id: "thread_honcho_test", turn_id: turnId }),
      },
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Remember this coding task" }],
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      }],
    },
  };
}

test("Honcho memory uses a stable bounded session and records completed turns", async () => {
  const stored: unknown[] = [];
  const session = {
    addPeers: async () => {},
    context: async () => ({
      toOpenAI: () => [{ role: "system", content: "durable summary" }],
    }),
    addMessages: async (messages: unknown[]) => {
      stored.push(...messages);
      return [];
    },
  };
  const peers = new Map<string, { id: string; message: (content: string) => { content: string; peerId: string } }>();
  const client = {
    peer: async (id: string) => {
      const peer = { id, message: (content: string) => ({ content, peerId: id }) };
      peers.set(id, peer);
      return peer;
    },
    session: async (id: string) => {
      expect(id).toBe(honchoSessionId("thread_honcho_test"));
      return session;
    },
  } as never;
  const memory = createChatGptHonchoMemory({
    enabled: true,
    apiKey: "test-key",
    contextTokens: 128,
    timeoutMs: 1_000,
  }, { client });

  expect(honchoTurnUserText(parsed())).toBe("Remember this coding task");
  await expect(memory.context(parsed())).resolves.toContain("durable summary");
  await memory.recordTurn({
    threadId: "thread_honcho_test",
    turnId: "turn_honcho_test",
    modelId: "gpt-5.6-sol",
    userText: "Remember this coding task",
    assistantText: "The task is complete.",
  });
  expect(stored).toHaveLength(2);
  expect(stored.map(value => (value as { content: string }).content)).toEqual([
    "Remember this coding task",
    "The task is complete.",
  ]);
});

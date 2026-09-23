import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import {
  CODEX_IAB_BROWSER_HOST_KIND,
  readCodexIabDomEvidence,
  readCodexIabBrowserHostDescriptor,
  selectCodexIabPage,
} from "../src/codex-iab-browser-host";
import { defaultConfig, providerConfig } from "../src/config";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function descriptorFile(overrides: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "codex-iab-descriptor-"));
  roots.push(root);
  const path = join(root, "codex-iab.json");
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    kind: CODEX_IAB_BROWSER_HOST_KIND,
    codexSessionId: "codex-session-123",
    endpoint: "http://127.0.0.1:53271",
    browser: { id: 1, name: "Codex In-app Browser", type: "iab" },
    tab: { targetId: "chatgpt-target-123", url: "https://chatgpt.com/c/abc" },
    createdAt: new Date().toISOString(),
    ...overrides,
  })}\n`, { mode: 0o600 });
  return path;
}

test("codex-iab descriptor binds Codex session, IAB browser identity, and existing ChatGPT tab", () => {
  const path = descriptorFile();
  expect(readCodexIabBrowserHostDescriptor(path)).toMatchObject({
    kind: CODEX_IAB_BROWSER_HOST_KIND,
    codexSessionId: "codex-session-123",
    endpoint: "http://127.0.0.1:53271",
    browser: { id: 1, name: "Codex In-app Browser", type: "iab" },
    tab: { targetId: "chatgpt-target-123", url: "https://chatgpt.com/c/abc" },
  });
  if (process.platform !== "win32") {
    chmodSync(path, 0o644);
    expect(() => readCodexIabBrowserHostDescriptor(path)).toThrow("unsafe permissions");
  }
});

test("codex-iab descriptor fails closed for non-IAB browser or non-ChatGPT tab", () => {
  expect(() => readCodexIabBrowserHostDescriptor(descriptorFile({
    browser: { id: 1, name: "Chrome", type: "tab" },
  }))).toThrow("Codex-owned IAB");
  expect(() => readCodexIabBrowserHostDescriptor(descriptorFile({
    tab: { targetId: "chatgpt-target-123", url: "https://example.com/" },
  }))).toThrow("chatgpt.com HTTPS URL");
  expect(() => readCodexIabBrowserHostDescriptor(descriptorFile({
    endpoint: "http://0.0.0.0:53271",
  }))).toThrow("127.0.0.1");
  expect(() => readCodexIabBrowserHostDescriptor(descriptorFile({
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  }))).toThrow("stale or from the future");
});

test("codex-iab config is exposed to the ChatGPT provider without switching to launcher", () => {
  const config = defaultConfig("browser-only");
  config.browserHost = "codex-iab";
  config.browserHostDescriptorPath = "/Users/example/.codex-chatgpt-web/runtime/codex-iab.json";
  const provider = providerConfig(config);
  expect(provider.chatgptWeb).toMatchObject({
    browserHost: "codex-iab",
    browserHostDescriptorPath: config.browserHostDescriptorPath,
  });
});

test("codex-iab page selection attaches only to the existing ChatGPT target and does not create pages", async () => {
  let newPageCalled = false;
  let detached = false;
  const page = {
    url: () => "https://chatgpt.com/c/abc",
  } as unknown as Page;
  const context = {
    pages: () => [page],
    newPage: () => { newPageCalled = true; throw new Error("must not create pages"); },
    newCDPSession: async () => ({
      send: async (method: string) => {
        expect(method).toBe("Target.getTargetInfo");
        return { targetInfo: { targetId: "chatgpt-target-123", url: "https://chatgpt.com/c/abc" } };
      },
      detach: async () => { detached = true; },
    }),
  } as unknown as BrowserContext;
  const browser = {
    contexts: () => [context],
  } as unknown as Browser;
  await expect(selectCodexIabPage(browser, readCodexIabBrowserHostDescriptor(descriptorFile()), 50))
    .resolves.toEqual({ context, page });
  expect(newPageCalled).toBe(false);
  expect(detached).toBe(true);
});

test("codex-iab page selection fails closed when the target is absent", async () => {
  const page = { url: () => "https://chatgpt.com/c/abc" } as unknown as Page;
  const context = {
    pages: () => [page],
    newCDPSession: async () => ({
      send: async () => ({ targetInfo: { targetId: "other-target", url: "https://chatgpt.com/c/abc" } }),
      detach: async () => {},
    }),
  } as unknown as BrowserContext;
  const browser = { contexts: () => [context] } as unknown as Browser;
  await expect(selectCodexIabPage(browser, readCodexIabBrowserHostDescriptor(descriptorFile()), 1))
    .rejects.toThrow("did not expose its existing ChatGPT tab");
});

function domConnection(overrides: {
  beforeTargetId?: string;
  afterTargetId?: string;
  afterUrl?: string;
  runtimeUrl?: string;
  exceptionDetails?: unknown;
} = {}) {
  const descriptor = readCodexIabBrowserHostDescriptor(descriptorFile());
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  let targetInfoCount = 0;
  let detached = false;
  const page = {} as Page;
  const context = {
    newCDPSession: async (sessionPage: Page) => {
      expect(sessionPage).toBe(page);
      return {
        send: async (method: string, params?: Record<string, unknown>) => {
          calls.push({ method, params });
          if (method === "Target.getTargetInfo") {
            targetInfoCount += 1;
            const targetId = targetInfoCount === 1
              ? overrides.beforeTargetId ?? descriptor.tab.targetId
              : overrides.afterTargetId ?? descriptor.tab.targetId;
            const url = targetInfoCount === 1
              ? descriptor.tab.url
              : overrides.afterUrl ?? overrides.runtimeUrl ?? descriptor.tab.url;
            return { targetInfo: { targetId, url } };
          }
          if (method === "Runtime.evaluate") {
            return {
              ...(overrides.exceptionDetails ? { exceptionDetails: overrides.exceptionDetails } : {}),
              result: {
                value: {
                  title: "ChatGPT",
                  url: overrides.runtimeUrl ?? descriptor.tab.url,
                  composerAvailable: true,
                  domAccessible: true,
                  sessionMarkers: {
                    pathname: "/c/abc",
                    temporaryChat: false,
                    composerAriaLabel: "แชตกับ ChatGPT",
                    turnContainerCount: 2,
                    rateLimitVisible: false,
                  },
                },
              },
            };
          }
          throw new Error(`unexpected CDP method ${method}`);
        },
        detach: async () => { detached = true; },
      };
    },
  } as unknown as BrowserContext;
  return { connection: { descriptor, context, page }, calls, detached: () => detached };
}

test("codex-iab DOM evidence uses Runtime.evaluate in the bound target", async () => {
  const harness = domConnection();
  const evidence = await readCodexIabDomEvidence(harness.connection);

  expect(evidence).toMatchObject({
    codexSessionId: "codex-session-123",
    browser: { id: 1, name: "Codex In-app Browser", type: "iab" },
    targetId: "chatgpt-target-123",
    title: "ChatGPT",
    url: "https://chatgpt.com/c/abc",
    composerAvailable: true,
    domAccessible: true,
    sessionMarkers: {
      composerAriaLabel: "แชตกับ ChatGPT",
      rateLimitVisible: false,
    },
  });
  expect(harness.calls.map(call => call.method)).toEqual([
    "Target.getTargetInfo",
    "Runtime.evaluate",
    "Target.getTargetInfo",
  ]);
  expect(harness.calls[1].params).toMatchObject({
    returnByValue: true,
    awaitPromise: false,
    userGesture: false,
  });
  expect(harness.detached()).toBe(true);
});

test("codex-iab DOM evidence fails closed when target identity changes or evaluation throws", async () => {
  await expect(readCodexIabDomEvidence(domConnection({ beforeTargetId: "other-target" }).connection))
    .rejects.toThrow("changed before DOM inspection");
  await expect(readCodexIabDomEvidence(domConnection({ afterTargetId: "other-target" }).connection))
    .rejects.toThrow("changed during DOM inspection");
  await expect(readCodexIabDomEvidence(domConnection({ exceptionDetails: { text: "boom" } }).connection))
    .rejects.toThrow("Runtime.evaluate returned an exception");
});

test("codex-iab DOM evidence fails closed outside the bound ChatGPT URL", async () => {
  await expect(readCodexIabDomEvidence(domConnection({
    runtimeUrl: "https://example.com/",
    afterUrl: "https://example.com/",
  }).connection)).rejects.toThrow("did not remain inside the bound ChatGPT target");
  await expect(readCodexIabDomEvidence(domConnection({
    runtimeUrl: "https://chatgpt.com/c/abc",
    afterUrl: "https://chatgpt.com/c/other",
  }).connection)).rejects.toThrow("did not remain inside the bound ChatGPT target");
});

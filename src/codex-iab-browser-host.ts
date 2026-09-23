import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { expandUserPath } from "./config";

export const CODEX_IAB_BROWSER_HOST_KIND = "codex-desktop-iab";
const CODEX_IAB_DESCRIPTOR_MAX_AGE_MS = 5 * 60_000;
const CODEX_IAB_DESCRIPTOR_FUTURE_TOLERANCE_MS = 30_000;

export interface CodexIabBrowserHostDescriptor {
  version: 1;
  kind: typeof CODEX_IAB_BROWSER_HOST_KIND;
  /** Stable Codex Desktop session identity supplied by the owned IAB runtime. */
  codexSessionId: string;
  /** Loopback CDP endpoint scoped to the existing Codex-owned IAB tab/runtime. */
  endpoint: string;
  browser: {
    id: string | number;
    name: "Codex In-app Browser";
    type: "iab";
  };
  tab: {
    /** Existing ChatGPT renderer target id. The adapter must not create a target. */
    targetId: string;
    url?: string;
  };
  createdAt: string;
}

export interface CodexIabBrowserConnection {
  descriptor: CodexIabBrowserHostDescriptor;
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface CodexIabDomEvidence {
  codexSessionId: string;
  browser: CodexIabBrowserHostDescriptor["browser"];
  targetId: string;
  capturedAt: string;
  title: string;
  url: string;
  composerAvailable: boolean;
  domAccessible: true;
  sessionMarkers: Record<string, unknown>;
}

function assertLoopbackEndpoint(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error(`${label} is not a valid URL`); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error(`${label} must use http://127.0.0.1`);
  }
  if (!parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must contain only a loopback host and explicit port`);
  }
  return parsed.origin;
}

function assertNonEmptyIdentity(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,256}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function assertDescriptorShape(value: unknown): CodexIabBrowserHostDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Codex IAB browser descriptor is not an object");
  }
  const descriptor = value as Partial<CodexIabBrowserHostDescriptor>;
  if (descriptor.version !== 1 || descriptor.kind !== CODEX_IAB_BROWSER_HOST_KIND) {
    throw new Error("Codex IAB browser descriptor has an unsupported identity or version");
  }
  const codexSessionId = assertNonEmptyIdentity(descriptor.codexSessionId, "Codex IAB codexSessionId");
  const endpoint = assertLoopbackEndpoint(descriptor.endpoint, "Codex IAB CDP endpoint");
  if (!descriptor.browser || typeof descriptor.browser !== "object") {
    throw new Error("Codex IAB browser descriptor is missing its browser identity");
  }
  const browserId = typeof descriptor.browser.id === "string" || typeof descriptor.browser.id === "number"
    ? descriptor.browser.id
    : undefined;
  if (browserId === undefined || String(browserId).trim().length === 0) {
    throw new Error("Codex IAB browser id is invalid");
  }
  if (descriptor.browser.name !== "Codex In-app Browser" || descriptor.browser.type !== "iab") {
    throw new Error("Codex IAB browser descriptor does not identify the Codex-owned IAB");
  }
  if (!descriptor.tab || typeof descriptor.tab !== "object") {
    throw new Error("Codex IAB browser descriptor is missing its ChatGPT tab identity");
  }
  const targetId = assertNonEmptyIdentity(descriptor.tab.targetId, "Codex IAB ChatGPT tab targetId");
  if (descriptor.tab.url !== undefined) {
    if (typeof descriptor.tab.url !== "string") throw new Error("Codex IAB ChatGPT tab url is invalid");
    let parsed: URL;
    try { parsed = new URL(descriptor.tab.url); }
    catch { throw new Error("Codex IAB ChatGPT tab url is invalid"); }
    if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") {
      throw new Error("Codex IAB ChatGPT tab url must be a chatgpt.com HTTPS URL");
    }
  }
  if (typeof descriptor.createdAt !== "string" || Number.isNaN(Date.parse(descriptor.createdAt))) {
    throw new Error("Codex IAB browser descriptor has an invalid creation time");
  }
  const descriptorAgeMs = Date.now() - Date.parse(descriptor.createdAt);
  if (descriptorAgeMs > CODEX_IAB_DESCRIPTOR_MAX_AGE_MS
    || descriptorAgeMs < -CODEX_IAB_DESCRIPTOR_FUTURE_TOLERANCE_MS) {
    throw new Error("Codex IAB browser descriptor is stale or from the future");
  }
  return {
    version: 1,
    kind: CODEX_IAB_BROWSER_HOST_KIND,
    codexSessionId,
    endpoint,
    browser: {
      id: browserId,
      name: "Codex In-app Browser",
      type: "iab",
    },
    tab: {
      targetId,
      ...(descriptor.tab.url ? { url: descriptor.tab.url } : {}),
    },
    createdAt: descriptor.createdAt,
  };
}

export function readCodexIabBrowserHostDescriptor(configuredPath: string): CodexIabBrowserHostDescriptor {
  const path = resolve(expandUserPath(configuredPath));
  if (!existsSync(path)) throw new Error(`Codex IAB browser host is unavailable: descriptor is missing at ${path}`);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`Codex IAB browser descriptor is not a regular file: ${path}`);
  if (process.platform !== "win32") {
    if ((stat.mode & 0o077) !== 0) throw new Error(`Codex IAB browser descriptor has unsafe permissions: ${path}`);
    const getuid = process.getuid;
    if (typeof getuid === "function" && stat.uid !== getuid()) {
      throw new Error(`Codex IAB browser descriptor is not owned by the current user: ${path}`);
    }
  }
  let decoded: unknown;
  try { decoded = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    throw new Error(`Codex IAB browser descriptor is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return assertDescriptorShape(decoded);
}

async function assertCdpReady(descriptor: CodexIabBrowserHostDescriptor, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${descriptor.endpoint}/json/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.webSocketDebuggerUrl !== "string" || !body.webSocketDebuggerUrl.startsWith("ws://127.0.0.1:")) {
      throw new Error("CDP metadata did not expose a loopback WebSocket endpoint");
    }
  } catch (error) {
    throw new Error(`Codex IAB CDP endpoint is not ready: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function selectCodexIabPage(
  browser: Browser,
  descriptor: CodexIabBrowserHostDescriptor,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<{ context: BrowserContext; page: Page }> {
  if (abortSignal?.aborted) {
    throw new DOMException("Codex IAB browser connection aborted", "AbortError");
  }
  const deadline = Date.now() + timeoutMs;
  do {
    if (abortSignal?.aborted) {
      throw new DOMException("Codex IAB browser connection aborted", "AbortError");
    }
    const candidates = browser.contexts().flatMap(context => context.pages().map(page => ({ context, page })));
    const inspected = await Promise.all(candidates.map(async candidate => {
      const session = await candidate.context.newCDPSession(candidate.page).catch(() => undefined);
      if (!session) return { ...candidate, targetId: undefined, url: undefined };
      try {
        const { targetInfo } = await session.send("Target.getTargetInfo") as {
          targetInfo: { targetId?: string; url?: string; title?: string };
        };
        return { ...candidate, targetId: targetInfo.targetId, url: targetInfo.url };
      } catch {
        return { ...candidate, targetId: undefined, url: undefined };
      } finally {
        await session.detach().catch(() => {});
      }
    }));
    const owned = inspected.filter(candidate => candidate.targetId === descriptor.tab.targetId);
    if (owned.length === 1) {
      const pageUrl = owned[0].url || owned[0].page.url();
      if (!pageUrl.startsWith("https://chatgpt.com/")) {
        throw new Error("Codex IAB target is not the existing ChatGPT tab");
      }
      return { context: owned[0].context, page: owned[0].page };
    }
    if (owned.length > 1) {
      throw new Error(`Codex IAB browser exposed ${owned.length} pages with the same ChatGPT tab identity`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error("Codex IAB browser host did not expose its existing ChatGPT tab");
}

export async function connectCodexIabBrowserHost(
  descriptorPath: string,
  timeoutMs = 20_000,
  abortSignal?: AbortSignal,
): Promise<CodexIabBrowserConnection> {
  if (abortSignal?.aborted) {
    throw new DOMException("Codex IAB browser connection aborted", "AbortError");
  }
  const descriptor = readCodexIabBrowserHostDescriptor(descriptorPath);
  await assertCdpReady(descriptor, Math.min(timeoutMs, 5_000));
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(descriptor.endpoint, { timeout: timeoutMs });
  } catch (error) {
    throw new Error(`Could not connect Playwright to the Codex IAB browser: ${error instanceof Error ? error.message : String(error)}`);
  }
  const closeOnAbort = () => { void browser.close().catch(() => {}); };
  abortSignal?.addEventListener("abort", closeOnAbort, { once: true });
  try {
    if (abortSignal?.aborted) {
      throw new DOMException("Codex IAB browser connection aborted", "AbortError");
    }
    const { context, page } = await selectCodexIabPage(browser, descriptor, timeoutMs, abortSignal);
    return { descriptor, browser, context, page };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  } finally {
    abortSignal?.removeEventListener("abort", closeOnAbort);
  }
}

export async function inspectCodexIabBrowserHost(
  descriptorPath: string,
  options: { timeoutMs?: number } = {},
): Promise<CodexIabDomEvidence> {
  const connection = await connectCodexIabBrowserHost(descriptorPath, options.timeoutMs ?? 20_000);
  try {
    return await readCodexIabDomEvidence(connection);
  } finally {
    await connection.browser.close().catch(() => {});
  }
}

export async function readCodexIabDomEvidence(
  connection: Pick<CodexIabBrowserConnection, "descriptor" | "context" | "page">,
): Promise<CodexIabDomEvidence> {
  const session = await connection.context.newCDPSession(connection.page);
  try {
    const before = await session.send("Target.getTargetInfo") as {
      targetInfo: { targetId?: string; url?: string };
    };
    if (before.targetInfo.targetId !== connection.descriptor.tab.targetId) {
      throw new Error("Codex IAB target identity changed before DOM inspection");
    }
    const evaluated = await session.send("Runtime.evaluate", {
      expression: `(() => {
        const rendered = element => {
          const style = getComputedStyle(element);
          return element.isConnected && style.display !== "none"
            && style.visibility !== "hidden" && style.opacity !== "0";
        };
        const textboxes = [...document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]')];
        const composer = textboxes.find(element => rendered(element) && (
          element.getAttribute("aria-label")?.includes("ChatGPT")
          || element.getAttribute("aria-label")?.includes("แชตกับ ChatGPT")
          || element.getAttribute("data-testid") === "prompt-textarea"
        ));
        const bodyText = document.body?.innerText || "";
        return {
          title: document.title,
          url: location.href,
          composerAvailable: Boolean(composer),
          domAccessible: true,
          sessionMarkers: {
            pathname: location.pathname,
            temporaryChat: new URLSearchParams(location.search).get("temporary-chat") === "true",
            composerAriaLabel: composer?.getAttribute("aria-label") || null,
            turnContainerCount: document.querySelectorAll('[data-message-author-role]').length,
            rateLimitVisible: bodyText.includes("temporarily limited access")
              || bodyText.includes("requests too quickly")
          }
        };
      })()`,
      returnByValue: true,
      awaitPromise: false,
      userGesture: false,
    }) as {
      result?: { value?: unknown };
      exceptionDetails?: unknown;
    };
    if (evaluated.exceptionDetails) {
      throw new Error("Codex IAB Runtime.evaluate returned an exception");
    }
    const state = evaluated.result?.value as Omit<CodexIabDomEvidence, "codexSessionId" | "browser" | "targetId" | "capturedAt"> | undefined;
    if (!state || state.domAccessible !== true || typeof state.url !== "string") {
      throw new Error("Codex IAB Runtime.evaluate returned invalid DOM evidence");
    }
    const after = await session.send("Target.getTargetInfo") as {
      targetInfo: { targetId?: string; url?: string };
    };
    if (after.targetInfo.targetId !== connection.descriptor.tab.targetId) {
      throw new Error("Codex IAB target identity changed during DOM inspection");
    }
    if (!state.url.startsWith("https://chatgpt.com/") || after.targetInfo.url !== state.url) {
      throw new Error("Codex IAB inspection did not remain inside the bound ChatGPT target");
    }
    return {
      codexSessionId: connection.descriptor.codexSessionId,
      browser: connection.descriptor.browser,
      targetId: connection.descriptor.tab.targetId,
      capturedAt: new Date().toISOString(),
      ...state,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

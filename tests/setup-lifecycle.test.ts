import { expect, test } from "bun:test";
import { runtimeOwnedServiceCheck } from "../src/doctor";
import { isRuntimeOwnedBrowserHost, launcherCapabilityProbeRequired, setupProxyIsReady } from "../src/setup";

const config = {
  mode: "browser-only" as const,
  releaseVersion: "0.2.0",
};

test("setup accepts only a matching daemon that is ready for new Codex turns", () => {
  const ready = {
    service: "codex-chatgpt-web",
    status: "ok",
    mode: "browser-only",
    version: "0.2.0",
    accepting_turns: true,
  };

  expect(setupProxyIsReady(ready, config)).toBe(true);
  expect(setupProxyIsReady({ ...ready, accepting_turns: false }, config)).toBe(false);
  expect(setupProxyIsReady({ ...ready, status: "degraded" }, config)).toBe(false);
  expect(setupProxyIsReady({ ...ready, version: "0.1.16" }, config)).toBe(false);
});

test("launcher setup refreshes account capabilities only when missing or explicitly requested", () => {
  const verifiedLauncher = {
    browserHost: "launcher",
    solAvailable: true,
    extraHighAvailable: false, proAvailable: false,
  };

  expect(launcherCapabilityProbeRequired(undefined)).toBe(true);
  expect(launcherCapabilityProbeRequired(verifiedLauncher as never)).toBe(false);
  expect(launcherCapabilityProbeRequired({ ...verifiedLauncher, extraHighAvailable: undefined } as never)).toBe(true);
  expect(launcherCapabilityProbeRequired({
    browserHost: "launcher",
    extraHighAvailable: false, proAvailable: false,
  } as never)).toBe(true);
  expect(launcherCapabilityProbeRequired(verifiedLauncher as never, true)).toBe(true);
  expect(launcherCapabilityProbeRequired({
    ...verifiedLauncher,
    browserInteractionMode: "manual",
  } as never)).toBe(false);
  expect(launcherCapabilityProbeRequired({
    ...verifiedLauncher,
    browserInteractionMode: "manual",
  } as never, false, "automatic")).toBe(true);
});

test("runtime-owned browser hosts exclude terminal managed Chrome ownership", () => {
  expect(isRuntimeOwnedBrowserHost("launcher")).toBe(true);
  expect(isRuntimeOwnedBrowserHost("codex-iab")).toBe(true);
  expect(isRuntimeOwnedBrowserHost("managed-chrome")).toBe(false);
});

test("runtime-owned doctor checks do not require terminal managed services", () => {
  expect(runtimeOwnedServiceCheck(
    "service",
    { installed: false, loaded: false },
    "Codex Desktop",
    "legacy service",
  )).toMatchObject({
    id: "service",
    status: "ok",
    message: "Codex Desktop owns the background runtime",
  });
  expect(runtimeOwnedServiceCheck(
    "tunnel-service",
    { installed: false, loaded: false },
    "Codex Desktop",
    "legacy tunnel",
  )).toMatchObject({
    id: "tunnel-service",
    status: "ok",
    message: "Codex Desktop owns the tunnel runtime",
  });
  expect(runtimeOwnedServiceCheck(
    "service",
    { installed: true, loaded: false },
    "Codex Desktop",
    "legacy service",
  )).toMatchObject({
    id: "service",
    status: "warning",
    message: "legacy service",
  });
});

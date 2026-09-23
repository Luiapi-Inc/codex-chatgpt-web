#!/usr/bin/env bun
/**
 * Fail closed until Codex Desktop supplies a supported runtime handoff.
 *
 * Loopback ports and renderer URLs do not attest browser ownership. This
 * command must not scan endpoints, invent a session identity, or mint a
 * descriptor from caller-provided metadata. A trusted runtime producer must
 * bind the current Codex session, IAB browser, and existing ChatGPT target.
 *
 * Browser policy denials must be resolved by the owning runtime; this script
 * must never provide an alternate connection around those controls.
 */
console.error(
  "BLOCKED_RUNTIME_BINDING: Codex Desktop has not supplied a trusted IAB handoff. "
  + "Endpoint discovery and descriptor generation are disabled. "
  + "No browser connection or message send was attempted.",
);
process.exitCode = 1;

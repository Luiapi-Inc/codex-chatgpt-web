import { expect, test } from "bun:test";
import { transportAcceptanceErrors } from "../src/adapters/chatgpt-web/transport-acceptance";

const claim = {
  requirementId: "REQ-transport-5",
  candidateSha: "candidate-a",
  executionFingerprint: "run-a",
  requiredKinds: ["implementation", "test", "actual_result"],
  evidence: [
    { requirementId: "REQ-transport-5", candidateSha: "candidate-a", executionFingerprint: "run-a", kind: "implementation" },
    { requirementId: "REQ-transport-5", candidateSha: "candidate-a", executionFingerprint: "run-a", kind: "test" },
    { requirementId: "REQ-transport-5", candidateSha: "candidate-a", executionFingerprint: "run-a", kind: "actual_result" },
  ],
};

test("acceptance requires evidence bound to one requirement, candidate, and execution", () => {
  expect(transportAcceptanceErrors(claim)).toEqual([]);
});

test("acceptance rejects stale candidate evidence even when every evidence kind exists", () => {
  const stale = structuredClone(claim);
  stale.evidence = stale.evidence.map(item => ({ ...item, candidateSha: "candidate-b" }));
  expect(transportAcceptanceErrors(stale)).toContain("evidence binding mismatch");
  expect(transportAcceptanceErrors(stale)).toContain("missing bound evidence: actual_result");
});

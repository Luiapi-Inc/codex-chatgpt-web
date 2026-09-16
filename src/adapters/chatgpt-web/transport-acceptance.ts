export const TRANSPORT_ACCEPTANCE_RULE =
  "Requirement -> Source of Truth -> Intended Result -> Current State -> Gap -> Implementation -> Tests -> Actual Result -> Acceptance Evidence";

export interface TransportAcceptanceEvidence {
  requirementId: string;
  candidateSha: string;
  executionFingerprint: string;
  kind: string;
}

export interface TransportAcceptanceClaim {
  requirementId: string;
  candidateSha: string;
  executionFingerprint: string;
  requiredKinds: readonly string[];
  evidence: readonly TransportAcceptanceEvidence[];
}

export function transportAcceptancePolicy(): Record<string, unknown> {
  return {
    required: true,
    candidate_binding: true,
    evidence_required: true,
    rule: TRANSPORT_ACCEPTANCE_RULE,
  };
}

/** Deterministic release check: stale evidence can never prove a different candidate or execution. */
export function transportAcceptanceErrors(claim: TransportAcceptanceClaim): string[] {
  const errors: string[] = [];
  if (!claim.requirementId.trim()) errors.push("requirement_id is required");
  if (!claim.candidateSha.trim()) errors.push("candidate_sha is required");
  if (!claim.executionFingerprint.trim()) errors.push("execution_fingerprint is required");
  const bound = claim.evidence.filter(item => (
    item.requirementId === claim.requirementId
    && item.candidateSha === claim.candidateSha
    && item.executionFingerprint === claim.executionFingerprint
  ));
  const availableKinds = new Set(bound.map(item => item.kind));
  for (const kind of new Set(claim.requiredKinds)) {
    if (!availableKinds.has(kind)) errors.push(`missing bound evidence: ${kind}`);
  }
  if (claim.evidence.length > bound.length) errors.push("evidence binding mismatch");
  return errors;
}

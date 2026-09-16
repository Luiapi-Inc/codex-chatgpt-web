# Linux release evidence — 5.0.7

Candidate: `5.0.7`

Commit: `920ffd9`

Platform: Linux `7.0.0-1012-aws` x86_64 on host `hermes`

Desktop session: X11 (`DISPLAY=:10.0`)

Packaging format: AppImage

Artifact: `launcher/artifacts/codex-web-gpt-5.0.7-linux-x64.AppImage`

Artifact SHA-256: `ed88cf9d22894adb7a47cc7a5ed5f6205d8fa9adb9477c9faa0e8a84f6a2c0f2`

Codex: `codex-cli 0.154.0`

Install path: upgrade/redeploy evidence is present because `5.0.6-linux-x64` and `5.0.6-linux-x64.previous-v5.0.7` remain alongside the installed `5.0.7-linux-x64` runtime.

## Deterministic verification

- Packaging contract: PASS — 12/12 tests.
- Transport acceptance checker: PASS — 2/2 tests, including stale-candidate rejection.
- Artifact SHA-256 rechecked for this candidate: `ed88cf9d22894adb7a47cc7a5ed5f6205d8fa9adb9477c9faa0e8a84f6a2c0f2`.
- Full `bun run verify`: NOT PASSED on this host — 719 pass / 1 skip / 1 fail. The failing test was `native interruption before registration prevents the detached compaction from starting`, which exceeded Bun's default 5-second test timeout during the full suite.
- The same failing test passed in isolation in 381 ms. A whole-file rerun then passed that test in 3.64 s but exposed another heavy Bigger Context compaction case exceeding the same 5-second default timeout. This is recorded as unresolved verification timing evidence; it is not treated as an acceptance pass.
- Earlier candidate evidence remains historical only and does not satisfy candidate-bound acceptance for `920ffd9`.

## Doctor

Latest result during an active Codex turn: `ok: false`.

Passing checks: config, Codex route, service, Responses proxy, tunnel binary, tunnel key, tunnel service, tunnel runtime.

Pending checks:

- `browser-host`: cannot verify the embedded ChatGPT session while that browser is running the current Codex turn.
- `connector`: local checks cannot prove that `Codex Native2` is attached to the ready tunnel.

This result does not satisfy the idle-state browser/session check required by `docs/release-validation.md`.

## Linux interactive release gate

`docs/release-validation.md` requires Linux packaging smoke plus manual account-bound items 2–7 under a supported desktop session.

Current evidence state:

- Packaging smoke: PASS.
- A Full-mode local-tool turn is proven by the current Codex Native2 session.
- Items 2–7 are not all recorded as executed against this candidate.
- Browser automation inventory currently exposes an in-app browser surface with no tab, so the remaining authenticated/manual flows cannot be completed from this turn.
- ChatGPT plan has not been recorded from account-bound release evidence in this candidate artifact.

## Acceptance state

`WAITING_FOR_EVIDENCE`

Resume when the current Codex turn is idle and an authenticated embedded launcher browser is available. Then rerun `bun run doctor --json` and execute/record Linux release-validation items 2–7, including the account plan and any redacted failure Activity log required by `docs/release-validation.md`.

Do not mark stable release acceptance complete until every required Linux item is recorded for this candidate.

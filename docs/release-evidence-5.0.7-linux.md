# Linux release evidence — 5.0.7

Candidate: `5.0.7`

Candidate commit: `016243a28973b234ce32c64bbe620f32061d753f`

Packaged artifact source commit: `016243a28973b234ce32c64bbe620f32061d753f`

Platform: Linux `7.0.0-1012-aws` x86_64 on host `hermes`

Desktop session: X11 (`DISPLAY=:10.0`)

Packaging format: AppImage

Artifact: `launcher/artifacts/codex-web-gpt-5.0.7-linux-x64.AppImage`

Artifact SHA-256: `a0a1cd758ac6195632515e86e32e852d7267513119800bf34a3b4bd89e08d5e4`

Codex: `codex-cli 0.154.0`

Install path: upgrade/redeploy evidence is present because `5.0.6-linux-x64` and `5.0.6-linux-x64.previous-v5.0.7` remain alongside the installed `5.0.7-linux-x64` runtime.

## Deterministic verification

- Full `bun run verify`: PASS on 2026-09-16T21:15:29+07:00 with Bun 1.4.0 on Linux `7.0.0-1012-aws` x86_64. Runtime tests: 720 pass / 1 skip / 0 fail across 53 files. Launcher tests: 309 pass / 0 fail. Version sync, root and launcher dependency audits, root and launcher typechecks, launcher build, runtime bundle build, third-party notice generation, and relocatable runtime smoke also passed.
- The two compaction fixtures that previously exceeded Bun's default five-second timeout passed under their candidate-specific 30-second test budgets. During this full run, `native interruption before registration prevents the detached compaction from starting` completed in 32.79 ms and the Bigger Context canonical-context rebuild completed in 4.31 s.
- Transport acceptance checker: PASS — 2/2 tests within the candidate-bound full verification, including stale-candidate rejection.
- Candidate-bound Linux packaging: PASS on 2026-09-17T06:54:38+07:00. The build ran in an isolated detached worktree at exact SHA `016243a28973b234ce32c64bbe620f32061d753f` with a clean tracked tree, Bun 1.4.0, Linux `7.0.0-1012-aws` x86_64, and root plus launcher dependencies installed with `bun install --frozen-lockfile`.
- The repository's compatible `libnotify` preparation and owned AppImage toolset were used before `bun run app:package` completed successfully.
- Packaging contract: PASS — 12/12 tests against the exact candidate.
- Packaged launcher smoke: PASS — `PACKAGED_LAUNCHER_SMOKE_OK linux/x64` in both the isolated candidate worktree and the integration checkout.
- Candidate-bound AppImage: `185740157` bytes with SHA-256 `a0a1cd758ac6195632515e86e32e852d7267513119800bf34a3b4bd89e08d5e4`.
- Independent review: PASS for the candidate-bound packaging sub-gate from both `qa-agent` and `release-gate-agent`; both reviewers kept overall Linux release acceptance at `WAITING_FOR_EVIDENCE` for the separate doctor and interactive gaps below.
- The first integration-checkout smoke attempt could not copy the AppImage because the host `/tmp` quota was exhausted. Re-running the same artifact with `TMPDIR` on `/home/ubuntu` passed; this was a host scratch-space failure, not an artifact failure.
- The previous `920ffd9` artifact was preserved as `launcher/artifacts/codex-web-gpt-5.0.7-linux-x64.previous-920ffd9.AppImage` with SHA-256 `ed88cf9d22894adb7a47cc7a5ed5f6205d8fa9adb9477c9faa0e8a84f6a2c0f2` for rollback/audit.
- Earlier candidate evidence remains historical only and does not satisfy candidate-bound acceptance for `016243a28973b234ce32c64bbe620f32061d753f`.

## Doctor

Latest result during an active Codex turn on 2026-09-16: failed before a structured report was returned.

Command: `bun run doctor --json`

Actual result: exit 1 after approximately 112 seconds with `spawnSync /home/ubuntu/.codex-chatgpt-web/bin/tunnel-client ETIMEDOUT`.

A direct retry of `tunnel-client runtimes cleanup --json` completed successfully in 0.47 s and reported the `codex-chatgpt-web` runtime `ready`. This proves the timeout was transient, but it does not replace a complete exit-zero idle doctor report.

The earlier passing checks for config, Codex route, service, Responses proxy, tunnel binary, tunnel key, tunnel service, and tunnel runtime are historical and do not override this newer failure.

Still pending after the timeout is resolved:

- `browser-host`: cannot verify the embedded ChatGPT session while that browser is running the current Codex turn.
- `connector`: local checks cannot prove that `Codex Native2` is attached to the ready tunnel.

This result does not satisfy runtime readiness or the idle-state browser/session check required by `docs/release-validation.md`. A redacted Activity log for the timeout and a later exit-zero idle doctor report are required.

## Linux interactive release gate

`docs/release-validation.md` requires Linux packaging smoke plus manual account-bound items 2–7 under a supported desktop session.

Current evidence state:

- Candidate-bound packaging and packaged-launcher smoke: PASS.
- Candidate-bound deterministic verification: PASS for `016243a28973b234ce32c64bbe620f32061d753f`.
- Candidate-bound AppImage packaging/provenance: PASS for `016243a28973b234ce32c64bbe620f32061d753f` with SHA-256 `a0a1cd758ac6195632515e86e32e852d7267513119800bf34a3b4bd89e08d5e4`.
- Idle doctor: NOT PASSED because the latest run ended with `tunnel-client ETIMEDOUT`.
- A Full-mode local-tool turn is proven by the current Codex Native2 session.
- Items 2–7 are not all recorded as executed against this candidate.
- Browser automation inventory currently exposes an in-app browser surface with no tab, so the remaining authenticated/manual flows cannot be completed from this turn.
- ChatGPT plan has not been recorded from account-bound release evidence in this candidate artifact.

## Acceptance state

`WAITING_FOR_EVIDENCE`

When the current Codex turn is idle and an authenticated embedded launcher browser is available, rerun `bun run doctor --json` and execute/record Linux release-validation items 2–7, including the account plan and any redacted failure Activity log required by `docs/release-validation.md`.

Do not mark stable release acceptance complete until every required Linux item is recorded for this candidate.

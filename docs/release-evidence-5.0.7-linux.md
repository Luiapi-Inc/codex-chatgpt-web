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
- Serial integration-checkout rerun on 2026-09-17 at approximately 09:23+07:00: PASS with the same runtime result (720 pass / 1 skip / 0 fail) and launcher result (309 pass / 0 fail), plus version sync, dependency audits, typechecks, launcher build, runtime bundle build, third-party notice generation, and relocatable runtime smoke. The previously observed `Bigger Context fits mixed-density whole records within both token and composer limits` timeout did not reproduce when the full suite ran without another concurrent verification load; it passed in 33.77 s. This rerun is supporting integration evidence only; candidate-bound acceptance remains tied to `016243a28973b234ce32c64bbe620f32061d753f`.
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

Latest idle-state result on 2026-09-17T07:08:44+07:00: PASS (`ok: true`).

Command: `bun run doctor --json`

Passing checks: configuration, authenticated embedded browser host (pid 53670), Codex model route, launcher-owned service, Responses proxy on `127.0.0.1:17841`, pinned tunnel binary, private tunnel key, launcher-owned tunnel service, and healthy/ready tunnel runtime.

The only reported warning was expected: local checks cannot prove that the ChatGPT connector `Codex Native2` is attached to the ready tunnel. That attachment remains part of interactive item 5 rather than an idle doctor failure.

Independent `release-gate-agent` review: PASS for the idle doctor sub-gate; overall Linux acceptance remains `WAITING_FOR_EVIDENCE` for account-bound items 2–7.

Historical failure evidence: an active-turn run on 2026-09-16 exited 1 after approximately 112 seconds with `spawnSync /home/ubuntu/.codex-chatgpt-web/bin/tunnel-client ETIMEDOUT`. A direct retry completed in 0.47 s and reported the runtime ready. The later complete idle-state PASS confirms that timeout was transient.

A fresh doctor run during the active Codex Native2 turn on 2026-09-17 reported `ok: false` only because the embedded browser was already owned by the running Codex turn. Configuration, Codex route, launcher-owned service, Responses proxy, tunnel binary/key/service, and tunnel runtime were all `ok`. This active-turn result does not replace the idle-state PASS above.

## Linux interactive release gate

`docs/release-validation.md` requires Linux packaging smoke plus manual account-bound items 2–7 under a supported desktop session.

Current evidence state:

- Candidate-bound packaging and packaged-launcher smoke: PASS.
- Candidate-bound deterministic verification: PASS for `016243a28973b234ce32c64bbe620f32061d753f`.
- Candidate-bound AppImage packaging/provenance: PASS for `016243a28973b234ce32c64bbe620f32061d753f` with SHA-256 `a0a1cd758ac6195632515e86e32e852d7267513119800bf34a3b4bd89e08d5e4`.
- Idle doctor: PASS on 2026-09-17T07:08:44+07:00 with `ok: true`; the connector attachment warning is assigned to interactive item 5.
- Item 2: PASS. Maintainer evidence from the packaged Launcher shows the embedded ChatGPT browser authenticated in Temporary Chat with a usable composer. This is Launcher evidence, not the Codex In-app Browser.
- Item 3: PASS. Maintainer evidence from the Codex model selector shows the account-visible ChatGPT Web routes `Instant`, `Medium`, `High`, and `Extra High` each present once while native Codex models remain present.
- Item 4: `WAITING_FOR_ACCESS`. A Browser-only turn completed with final answer `BROWSER-ONLY-OK`, but the release contract also requires streamed commentary from that same Browser-only turn. The conversation cache and Codex session records that can bind route + commentary phase + final phase were blocked by the current tool policy when queried from this verification turn. Do not require another maintainer screenshot while that structured evidence remains recoverable from the runtime/session record. Exact missing condition: one same-turn record proving a ChatGPT Web Browser-only route, at least one commentary event, and a completed final answer.
- Item 5: PASS. Maintainer evidence shows the `Codex Native2` ChatGPT connector attached with its tool schema visible and actions allowed; Launcher MCP status reports the Responses proxy, pinned tunnel client, private runtime key, launcher-owned tunnel, and tunnel runtime healthy/ready. The Full-mode local-tool turn executed `pwd` through Codex Native2 and returned `/home/ubuntu/codex-chatgpt-web`. The Launcher state is also consistent with completed MCP verification (`Done` remains the primary action while `Verify runtime` is retained as the re-check action).
- Item 6: not yet accepted. The current session has crossed an automatic Codex compaction boundary, but release acceptance still needs runtime evidence that the compacted continuation completed without a duplicate/orphan browser turn.
- Item 7: not yet accepted. The Zero Risk -> Automatic lifecycle still needs candidate-bound evidence for the single generic Web model after restart, retained-chat next-prompt behavior, MCP compaction before fresh manual chat, copied-prompt request-id contract, and restored account-visible catalog after returning to Automatic.
- ChatGPT plan has not been recorded from account-bound release evidence in this candidate artifact.

## Acceptance state

`WAITING_FOR_EVIDENCE`

Items 2, 3, and 5 are accepted from the packaged-launcher/account-bound evidence already captured. Resume with Item 4 at the exact structured-evidence gap above, then Item 6 and Item 7. Do not repeat already-proven launcher setup or require additional screenshots when runtime/session evidence can prove the remaining condition.

Do not mark stable release acceptance complete until every required Linux item is recorded for this candidate.

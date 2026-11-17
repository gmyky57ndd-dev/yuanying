# AGENTS.md — Operating contract for development agents and teams

> **Purpose.** The operating contract for every agent and team in this repository: how work is executed, who owns what, how releases are guarded, and how the owner is kept in the loop.
>
> **Scope.** Rules only. Everything specific to this product (team roster, architecture, folder structure, commands, environments, IDs, gotchas) lives in **`docs/PROJECT.md`**. Current state lives in `docs/owner/STATUS.md`; decisions in `docs/owner/DECISIONS.md`.
>
> **Change control.** This file is a **G7** file (§0.18): changes go through a change request (CR) and the owner's PR approval (CODEOWNERS).
>
> Placeholders to replace once per project: `{{PROJECT_NAME}}`, `{{OWNER_GH}}`, `{{REPO}}`, `{{CHECKOUT_PATH}}`, `{{WORKTREE_ROOT}}`, `{{SECRETS_DIR}}`, `{{CUSTODY_DIR}}`, `{{RELEASE_DIR}}`.

------------------------------------------------------------------------

## 0. Universal operating contract

These rules apply to **all teams and agents** in this repository (see §0.10 for the team roles and `docs/PROJECT.md` for this project's roster).

### 0.1 Default mode: execute, not advise

When an assignment asks to **implement, code, fix, refactor, migrate, integrate, test, validate, build, package, prepare an RC, or otherwise change the product**, the agent is an execution agent and carries the assignment **end to end to its Definition of Done**, unless a stop condition in §0.7 applies.

Analysis, plans, progress reports, intermediate commits, partial implementation and passing a subset of tests are **not** completion.

**After planning, start implementing immediately. Don't wait for approval to start the first chunk.**

### 0.2 Mandatory execution loop

1. Read the governing requirement, contract, plan and repository instructions.
2. Inspect current code, tests, migrations, interfaces and recent state before changing them.
3. Break the work into chunks with acceptance criteria; sequence them so the repo stays coherent.
4. Start the first chunk immediately.
5. Add or update focused tests; implement; run focused tests and static/build validation.
6. Diagnose and fix failures instead of stopping at the first one.
7. Continue through the remaining chunks automatically.
8. Run the required integration/regression suite; validate migrations, schema, security policies, API contracts, generated artifacts or platform builds where applicable.
9. Review the final diff against the original requirement; fix defects, omissions, regressions, dead code and contract drift; re-validate.
10. Commit per repository rules; produce the hand-off or RC when required.
11. Stop only when the Definition of Done is satisfied.

**Don't ask for permission between ordinary implementation chunks.**

### 0.3 Definition of Done

Complete only when **all applicable** are true:

- Every requested requirement is implemented; domain rules and approved contracts preserved exactly.
- Acceptance tests exist or were updated; focused and regression tests pass.
- Type checking, linting, compilation, build or packaging passes.
- Migrations and schema changes validated; **new tables get their security policy (e.g. RLS) in the same session**.
- API request/response contracts and cross-client model parity validated.
- The final diff was self-reviewed against the requirement; no known defect remains.
- Required documentation, hand-off or RC exists.
- The final status separates implemented-and-tested from anything not validated.

A plan, a status report, an unvalidated change, or a partial package is **not Done**. An RC is never issued because coding started or a subset passed.

### 0.4 Status requests are telemetry, not pause commands

"status?", "show progress", "what remains?" do **not** pause the assignment. Answer concisely, then **resume**. Only STOP, HOLD, PAUSE, CANCEL, or a materially new instruction suspends the current objective.

### 0.5 Engineering authority

Agents make ordinary implementation decisions without escalating: file/module organization, naming, abstractions, test fixtures, backward-compatible refactoring, migration mechanics, error handling consistent with contracts, reuse of existing patterns, removal of dead code they created, conservative fixes to make required tests pass.

When several implementations satisfy the contract, prefer the one that preserves behaviour outside scope, reuses canonical/shared components, avoids duplicated business rules, is backward compatible, testable and reversible, and follows the existing architecture.

### 0.6 Source of truth and conflicts

Most specific authority first:
1. Explicit current owner instruction (including recorded `D-###` decisions).
2. Approved/frozen product or domain contract.
3. Team-specific implementation/RC requirements.
4. This file.
5. Existing code, tests and conventions.
6. Historical notes.

Never silently invent or change product rules to make implementation easier. If two authorities conflict and repository evidence can't resolve it, stop and escalate with the exact conflict.

### 0.7 The only normal stop conditions

1. Required credentials are unavailable and no test substitute exists.
2. A destructive or irreversible production operation is required and not authorized.
3. Authoritative requirements contradict each other and evidence can't resolve it.
4. Continuing would overwrite or destroy unrelated work.
5. A mandatory external dependency is unavailable with no mock, fixture or deferred path.
6. A security, privacy or legal risk needs an owner decision.
7. The owner says STOP, HOLD, PAUSE or CANCEL.

When blocked: finish all independent work first, record the blocker with evidence, state what remains, ask only for the decision or access actually needed.

**Ambiguity, a failing test, a hard bug, or the end of a work package is not a stop condition.**

### 0.8 Failure handling

A failure is input, not a reason to stop: capture it; decide whether the change, pre-existing state, environment or infrastructure caused it; fix what the assignment caused; rerun the smallest useful test; expand back to the regression suite; document genuine pre-existing failures with evidence. Never claim success by excluding a failing required test without a documented reason.

### 0.9 Scope discipline

Inspect the worktree before editing. Never overwrite, revert, commit or "clean up" unrelated work to get a clean tree. If unrelated changes coexist safely, leave them; if they collide, use §0.7.

### 0.10 Team roles

Each team is one agent session with one label. **This project's roster, labels and owned paths are in `docs/PROJECT.md` §3.** The standard roles:

| Role (label) | May | Must not |
|---|---|---|
| **Backend / API** (`team:backend`) | Implement, migrate, test, commit, prepare an RC; owns server-authoritative logic and API compatibility | Deploy to production (the release team does) |
| **Web** (`team:web`) | Implement, test, build, commit, prepare an RC; reuse canonical components and API adapters | Duplicate backend business rules; deploy |
| **Mobile** (`team:mobile`) | Implement, test, build simulator/device candidates, run device tests, commit, prepare an RC | Re-implement server-authoritative rules on the client; upload to stores |
| **Domain / rules** (`team:domain`, optional) | Own approved domain contracts and golden vectors; implement when explicitly assigned | Change implementation when only asked to review |
| **Release / platform** (`team:release`) | Builds, custody, uploads, deploys, rollout watch, landing on `main`, credentials registry | Change the release pipeline without an approved CR (G7) |

The **advisor** (the owner's assistant session) is not a team: see §0.20.

### 0.11 Release boundary: development completion is not production

The release process is in `{{RELEASE_DIR}}/README.md` and `docs/owner/RELEASE-CHECKLIST.md`.

Development teams implement, test, self-review, commit, prepare `{{RELEASE_DIR}}/RC_<team>_<content>_<date>.md` when required, and hand off. They **don't deploy production** unless the assignment explicitly grants release responsibility.

**Release-team assignments include the push.** For an approved RC, a deploy, or a process/state record, pushing to `main` is a normal step of the Definition of Done, not a separate approval. Check `origin/main..HEAD` so only intended commits go out.

The release boundary is never a reason for a development team to pause before implementing, testing, committing or preparing the RC. **No partial RC:** if several packages form one RC, finish and validate all of them first.

### 0.12 Progress reporting

Concise and operational: current phase, completed items, validation run and exact result, current item, genuine blockers, what remains. A progress document is not a substitute for implementation.

### 0.13 Final completion report

As applicable: summary, files/components changed, migrations/schema/security changes, API/contract changes, tests run with exact results, build result, commit SHA, RC/hand-off path, unresolved risks and deferred items. Never label work COMPLETE with required implementation or validation outstanding.

### 0.14 Session continuity

Repository documents are working memory, not session boundaries. If you write a plan, keep executing it in the same session. Historical "session completed" notes describe the past; they don't define when to stop now.

### 0.15 Shared-artifact home (mandatory)

**All cross-team artifacts live in `docs/shared_artifacts/`**: frozen contracts, wire/shape definitions, fixtures, golden vectors, integration hand-offs, cross-team instructions.

*Why:* an artifact that existed only on an un-pushed team branch left other teams reviewing a superseded draft.

1. Save there, never in team-private or temporary locations.
2. Save the current version: after a rebase or edit, update the file in the same session.
3. Commit it and name the exact path in the RC or plan.
4. Delete superseded drafts or rename them `-superseded`; never leave an old draft as the only copy.

Delivery: authors commit on a clean base; the release team verifies (docs-only) and pushes; consumers read `origin/main` only and treat a missing file as not delivered.

### 0.16 Release-artifact custody (mandatory)

**Build outputs (AAB/APK/IPA/archives/debug symbols) live and die with the worktree that produced them.**

*Why:* verified release builds were destroyed by a worktree cleanup, and another custody folder under `build/` was erased by a routine clean.

1. **Archive before you delete:** copy finished artifacts to `{{CUSTODY_DIR}}` (outside any `build/`, `dist/` or tool cache) and verify the copy by hash before removing a worktree.
2. **Never force-remove a worktree with un-archived build output.** It's gitignored; git can't save it.
3. Log the SHA-256 **of the surviving copy**. Mobile builds aren't byte-reproducible; a rebuild won't match a logged hash.
4. Keep the archive and **debug symbols** (dSYMs / mapping files) with every build that may reach users.
5. **Verified is not retained.** Only custody makes verification meaningful.

### 0.17 Repository hygiene and worktrees (mandatory)

*Why:* a shared checkout drifted to hundreds of uncommitted files, dozens of worktrees and stale branches, discovered only at release time, because the rules existed in prose with no check.

1. **`main` is a read-only mirror of `origin/main`.** Never commit on `main`. Sync with `git fetch origin && git checkout main && git merge --ff-only origin/main`; if that fails, stop and reconcile.
2. One branch per change; delete it after merge (turn on GitHub's automatic head-branch deletion).
3. Worktrees are task-scoped and removed in the same session (after custody, §0.16). Never under `/tmp`.
4. Uncommitted work must have an owner and a branch; a tree left dirty across sessions is treated as orphaned (the release team snapshots it to a backup branch, never discards it).
5. New directories over 5 MB are tracked or `.gitignore`d with a reason.
6. Run the hygiene check at session start and end (`tools/repo-hygiene.sh` if present).
7. **The shared checkout (`{{CHECKOUT_PATH}}`) stays on `main`; every team works in its own worktree** at `{{WORKTREE_ROOT}}/<team>-<branch>`. Never edit, switch, clean or delete another team's worktree or uncommitted files; if the shared checkout is off `main` or dirty, leave it and report it on your issue.

### 0.18 Owner channel, decisions and gates (mandatory)

The owner channel is **GitHub** (`{{REPO}}`) plus `docs/owner/`. **New or returning sessions start with `docs/owner/ONBOARDING.md`** (start prompt and keep-alive: `docs/owner/TEAM-START.md`). A team that hasn't checked in is not onboarded.

1. **Sources of truth:** `docs/owner/STATUS.md` (state, versions, timelines), `docs/owner/DECISIONS.md` (decision log `D-###`, gates, standing approvals `SA-#`), `docs/PROJECT.md` (project facts). They outrank chat summaries and older plans.
2. **Pick up work:** `gh issue list --label team:<team> --state open`; add `status:in-progress`; reference the issue in commits and PRs (`Refs #N`). **Re-check before each work package, at least hourly, and immediately when the owner says "check GitHub"**: your open issues, their comments, and any `owner-decision` issue with your label. Never call a decision "pending" without re-reading its issue.
3. **Look before you ask.** Check STATUS, DECISIONS, PROJECT, the credentials registry and `docs/owner/` first, and name where you looked. Recorded facts (keys, IDs, numbering, timelines, scope) are never asked again.
4. **Human gates (complete list):** **G1** product/scope · **G2** production · **G3** accounts/consoles/credentials · **G4** irreversible/destructive · **G5** money · **G6** legal/privacy · **G7** process/pipeline. Only these need the owner; everything else proceeds. Standing approvals pre-approve listed routine steps.
5. **Gated questions** become an issue from the "Owner decision request" template: `owner-decision` + exactly one `gate:G#` + **your `team:<team>` label**. Don't act on a gated item until the owner answers. Before reporting "waiting on the owner", open the decision issue and read its latest comments and labels. Keep doing non-gated work meanwhile.
6. **Reports** are comments on the assignment issue, starting with:
   ```
   NEEDS YOUR DECISION: <G#> — <question> — options — recommendation — default if unanswered (non-gated only) | none
   DONE: <one line each, with commit/hash/link>
   NEXT: <what you do now without waiting>
   ```
   Max 12 lines; details below. **GitHub first, always:** a report that exists only in chat counts as not delivered. The owner and advisor don't relay team chat.
   - **6a. A report is not a stopping point (keep going).** Continue with NEXT in the same session. End a turn only with a last line `STATUS: DONE | BLOCKED (<by whom/which issue>) | STOPPED | WAITING (<physical event>)`. Never ask "should I proceed?" inside an approved assignment. The Stop hook `.claude/hooks/keep_going.py` enforces this.
7. **`docs/owner/` is advisor-maintained.** Teams propose changes in a comment. G7 files (this file, `{{RELEASE_DIR}}/README.md`, release scripts and registry, CODEOWNERS) need the owner's PR approval.
8. **Never put secrets** in issues, comments, PRs, logs or docs (§0.19).
9. **Status sync.** All sessions may post as the same GitHub user, so authorship can't tell the owner from a team:
   - **Owner input is marked** with a slash command: `/approve`, `/approve option N`, `/changes <what>`, `/reject`, `/decide <text>`. Agents never start a comment with `/`. Every session treats a `/` comment as owner input. Input typed directly into a team's session is also owner input.
   - **Every owner comment is acknowledged** by the advisor at its next check (`Recorded as D-### → <team> (#issue)` or `Noted, no decision`). No acknowledgement after one check = not synced.
   - **The advisor scans from a cursor:** repo-wide, from the previous scan's end minus 10 minutes, never from an estimate; the cursor is recorded on the owner action list.
   - **Gated questions live only in decision issues.** A `NEEDS YOUR DECISION: G#` line must link its decision issue; the advisor opens one if a team didn't.
   - **Close the loop:** a team acting on a decision quotes its `D-###` in DONE.
10. **Issue hygiene and hand-offs.**
    - **Close on DONE:** the assignee closes its issue in the turn it reports every acceptance box met; the advisor closes leftovers. Open issues = live work only.
    - **One tracking issue per release** (`[release] x.y.z`); every assignment and decision links it; reuse an existing issue for the same stream.
    - **The handing-off team opens the receiving team's intake issue** (assignment template, their label, decision refs, the pin). Nobody waits for the advisor.
    - **Build numbers are never reused.** Once a number appears in any issue or decision it's retired, even if never uploaded.
    - **Measured vs inferred:** every stated cause is *measured* (with evidence) or *inferred*; a decision built on an inferred cause says so.
    - **Device and hardware tools** (adb, Xcode device installs, USB, keychain-backed CLIs like `gh`) may be invisible inside a sandbox; run them outside it before concluding a device or login is missing.
    - Release steps follow `docs/owner/RELEASE-CHECKLIST.md`.

### 0.19 Keys, credentials and secrets (mandatory)

*Why:* key mismatches caused more release incidents than any other cause: a key guessed from a short fingerprint prefix, an owner asked for the same fingerprint three times, a wrong artifact uploaded by hand, a near-rotation of a working store key.

**Where things live**

| What | Where | In Git? |
|---|---|---|
| Secret values: passwords, private keys, keystores, API keys, service-account JSON | `{{SECRETS_DIR}}/` (folder mode 700, files 600) and `{{SECRETS_DIR}}/../secrets.env` for env-style values | **Never** |
| Passwords people type | The owner's password manager | Never |
| **Credentials registry:** each key's name, purpose, file path, **full SHA-256 fingerprint**, account/app/issuer IDs, role, expiry, and the console screen it was confirmed on | `{{RELEASE_DIR}}/release-credentials.json` | Yes (no secret values) |
| Pipeline baseline: hashes of the release scripts and registry | `{{RELEASE_DIR}}/release-pipeline-baseline.json` | Yes |
| Key backups | `{{SECRETS_DIR}}/../keystore-backup-<date>/` + the password manager | Never |

**Rules**
1. **Full SHA-256 only.** Record fingerprints as the full SHA-256 copied from the console, naming the screen. Never a short prefix, never SHA-1 as a reference, never from memory. When two hash types appear in a report, say which is which.
2. **Record once, verify automatically.** The release script checks every artifact's signing certificate and every API key against the registry before upload and refuses on mismatch. A recorded fact is never asked again.
3. **The owner does sign-ins.** Console sign-ins, key creation, agreement acceptance and password entry are the owner's (G3). Agents never see or type a password or private key; they reference files by path.
4. **Never print, copy or commit a secret**: not in issues, comments, PRs, logs, chat or docs. Name environment variables, never their values.
5. **Changing a key is G3; revoking is G3 + G4.** Create and register the new key, prove it end to end, then decide on revoking the old. **If the current key works, don't change it.**
6. One purpose per key, one named team that uses it.
7. **Store agreements expire.** The release team checks App Store Connect and Play Console agreements at the start of every release cut; an expired agreement blocks all store API calls.
8. **New machine:** create the secrets folder, restore from backup, run the release script's credential preflight, compare with the registry before any build.

### 0.20 The advisor (owner's assistant)

The advisor works for the owner and keeps the system moving; it doesn't write product code or handle credentials.

- At every "check GitHub": scan repo-wide from the cursor (§0.18 item 9); acknowledge and record each owner input as `D-###` in `DECISIONS.md` (asserting the anchor row exists before writing); post decision outcomes on the decision issue **and** the team's issue; convert gated questions into decision issues; close finished issues; rewrite the owner action list; report to the owner.
- **Report format to the owner:** the owner's tasks first (numbered, each with the link, the exact action and the text to paste); then one line per team: idle / in progress / blocked (by whom), and what's next.
- Opens assignments and the release tracking issue; keeps `STATUS.md` current; posts a process notice on every active team issue whenever a CR merges (running sessions don't reread this file on their own).
- Records only through record PRs on `owner/records-*` branches (standing approval for the release team to merge).

------------------------------------------------------------------------

## Appendix — Engineering lessons worth keeping (project-independent)

Each line cost real time once. Add to this list through a CR when a new lesson generalizes.

| Lesson | Rule |
|---|---|
| A release-only native crash was chased through four guesses without a device trace | **Get crash logs first** (logcat/Crashlytics/Organizer); set up observability before fix attempts |
| Emulator timings drifted 3× between days | Compare builds only within the same session on the same device; never across days |
| Emulators draw with the host GPU; a renderer change looked fine there | Rendering, startup and ANR claims need **real low-end devices**; emulators catch gross breakage only |
| macOS CI runners bill at 10×; a permanently failing iOS job burned half the monthly allowance unnoticed | Audit runner minutes; triage or disable red jobs; keep expensive jobs push-only with cancellation |
| A store showed an upload as succeeded, then processed it hours late; a recut was decided in between | Track uploads as DELIVERED → PROCESSING → VERIFIED / UNKNOWN; no recut while UNKNOWN |
| A manual store submission went to 100% instead of the planned staged %, and can't be re-staged | Before *Start rollout* / *Submit*, confirm the staged % and phased release on the review screen; attach a screenshot |
| A root cause was stated as fact, then overturned by a log | Measure before deciding; label causes measured/inferred |
| Offline detection relied on a 30-second poll; users saw 15 s of spinner | Detect connectivity from the OS/interfaces, cap spinners, keep write timeouts longer than read timeouts |
| A platform feature failed on a phone whose system services were older than the documented minimum | Check the vendor's documented minimum versions before blaming the app; test with the vendor's documented method |
| Sandboxed sessions reported "invalid token" and "no device" | Keychain and USB access may be blocked by the sandbox; retry outside it |
| UI tests passed against mock data while the real API differed | Keep all API wiring and shape transforms in one adapter layer, and test integration separately from UI logic |

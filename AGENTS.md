# 元婴 (Yuanying) — Agent & Developer Rules

**Version:** 1.3  
**Status:** Active  
**Audience:** AI coding agents, human developers, tech lead  
**Applies to:** Work in this repository  
**Changelog:** §11

---

## 1. Project context

元婴 is a phone-first AI companion that captures signals (wake, sleep, water, steps, and activity), offers reminders, and retains memory over time.

**One sentence:** *Not a chatbot. Not an assistant. Your second self, growing with you.*

Before implementation, read `AGENTS.md`, `TRACKING.md`, and the relevant code and project documentation. Product documents live under `docs/` — currently `docs/yuanying-prd-v1.1.md.md`, `docs/yuanying-engineering-spec-v2.md.md`, and session documents such as `docs/Dev Response 1014.md` with its appendix. Filenames may change; do not assume a path exists — locate the current source of truth, and ask the tech lead or owner if a required requirement cannot be found. Read `core/identity.md` and `core/voice.md` when work touches the companion's identity or language.

---

## 2. Three non-negotiable principles

If a proposed change conflicts with one of these principles, stop and raise the conflict before implementing it.

### 2.1 Quiet by default
元婴 speaks only when invited or when an interruption is justified. Avoid nagging, flooding, engagement loops, and growth-hacking patterns. Default to silence.

### 2.2 Confirm before action
元婴 may observe, infer, and propose. It must not take consequential action based only on an inferred pattern. Present proposals for confirmation first.

### 2.3 File-based core
Keep identity, values, voice, memory, and configuration in human-readable, version-controlled formats where applicable. Treat Supabase, DeepSeek, and other vendors as replaceable backends; do not make a vendor-specific format the only copy of important information.

---

## 3. Work classification and tracking

Classify work before creating a tracking item or choosing a commit/PR prefix. First search `TRACKING.md` for a related item so existing work is updated rather than duplicated. An existing entry does not, by itself, determine the classification.

| Category | Use when | Tracking action | Commit/PR type |
|---|---|---|---|
| **Bug** | Existing behavior violates an established requirement, or a previously working behavior regressed. | Update the related item, or create a `[BUG]` item if none exists. | `fix` |
| **Feature** | Implements new behavior already specified and approved for scheduling. | Update the planned item; if none exists, obtain owner approval before adding it to active work. | `feat` |
| **Chore (completion)** | Finishes or cleans up an already-started planned change or migration. | Update the existing item; do not create a duplicate. | `chore` |
| **Maintenance/docs** | Work improves maintenance, tooling, or documentation without changing product behavior. | Track it when it is substantial or spans work sessions. | `chore` or `docs` |

### Classification steps

1. Find related entries in `TRACKING.md` and inspect their status, scope, and acceptance criteria.
2. Decide whether the work is a correction, planned behavior, completion of started work, or maintenance (table above).
3. If it is unclear whether the behavior is required or approved, do not invent a requirement. Record the uncertainty and ask the tech lead or owner before expanding scope.
4. Update the relevant tracking entry when work starts, is blocked, enters review, or is verified complete.

**Examples**

- The API still accepts `sit` during the open removal item P0-01: completion of an existing migration, so update P0-01 and use `chore(signal): ...`.
- A duration exceeds the established collection window and no related item exists: bug; create a `[BUG]` tracking entry and use `fix(...)`.
- A reminder settings page is specified and has an existing planned item: feature; update that item and use `feat(settings): ...`. Its existing entry does not make it a chore.

### Historical records

When a migration removes or renames a signal, treat old rows as historical records unless the approved requirements explicitly call for data cleanup. Do not delete, rewrite, or filter historical data as part of unrelated work. Record relevant migration or clean-data cutoff dates in the tracking item.

---

## 4. Development cycle

### 4.1 Select and scope the work

Use `TRACKING.md` as the current status and acceptance-criteria log. Backlog items are unscheduled; do not start them without owner/tech-lead scheduling approval. Follow phase priorities recorded in the tracking log. Do not infer a blanket phase gate from item status: if a task appears to conflict with phase ordering, check the current sprint/phase decision with the tech lead.

Before coding:

- Read the relevant requirements and inspect the current implementation.
- Confirm the task's scope and acceptance criteria from the user request or approved tracking item.
- Check for existing code, migrations, or deployment constraints that affect the change.

### 4.2 Diagnose defects proportionately

For bugs, gather evidence before changing code. Reproduce when practical, document the steps or evidence, and state the root-cause hypothesis. If reproduction is not possible (for example, an intermittent or production-only issue), say so and use available logs, code-path analysis, or a safe diagnostic approach. Do not present an unverified hypothesis as a confirmed cause.

### 4.3 Implement and verify

Make the smallest change that meets the agreed acceptance criteria. Run checks relevant to the changed area and available in the repository; report checks that could not be run. Add or update tests for non-trivial logic when a suitable test path exists. For changes needing device, production, credentialed, or owner-only access, identify that verification explicitly instead of claiming it passed.

For end-to-end behavior, inspect the full path. For reminders, for example, trace trigger → generation → delivery → user response. Verify each layer that the task affects; a working first layer does not establish that the user receives the result.

For user-facing behavior, ask: **“Does this still work when the user is not looking?”** This is a prompt to verify background and delivery behavior where relevant, not a universal requirement that every feature run unattended.

### 4.4 Review, release, and owner verification

Use the repository's delivery path for the changed area:

- **Web/PWA:** the deploy workflow is configured for pushes to `main` (subject to workflow configuration and credentials). Check the current workflow and deployment result; a local build alone is not deployment verification.
- **Android collector:** the Android workflow builds a debug APK on relevant pushes and pull requests. Signed release artifacts use the release workflow and its configured tag/dispatch process. A debug build is not a signed production release.
- **Other areas:** inspect the relevant workflow and project instructions rather than assuming the web or Android path applies.

When implementation and available checks are complete but production, device, or owner verification remains, mark the tracking item **In Review** and record what remains. Mark **Done** only when the item's acceptance criteria are verified in the intended user environment and the tracking entry records the evidence and date. Do not claim deployment, merge, device testing, or owner confirmation that did not occur.

### 4.5 PR and commit scope

Keep each PR focused on one coherent tracking item when the repository uses PRs. Split unrelated tasks; include tightly coupled changes needed to satisfy the same acceptance criteria. Follow repository branch and review practices; do not assume every local task can or should be merged by the agent.

Use conventional commit subjects when committing:

```text
<type>(<scope>): <subject>

<body explaining why, when useful>

Refs: TRACKING.md #[ID]
```

Use `fix` for bugs, `feat` for features, and `chore` for completion/maintenance work. Other useful types include `docs`, `refactor`, and `test`. Do not commit unless the user or the applicable workflow authorizes committing.

### 4.6 Tracking cadence

Update `TRACKING.md` when the state, owner, blocker, acceptance evidence, or next step changes. The file describes a daily 18:00 update cadence, but work should not wait until that time to record a material state change. Keep scheduled sync times only when the team has explicitly arranged them; do not assume an agent or owner is available at a particular hour.

---

## 5. Rules of engagement

### Always

1. Read this file, `TRACKING.md`, and the relevant requirements/code before implementation.
2. Keep scope tied to the request and agreed acceptance criteria.
3. Update tracking on meaningful state changes.
4. Surface errors and blockers; distinguish observed facts from hypotheses.
5. Prefer human-readable, portable formats for durable project information.
6. Ask when a product decision, approval, or missing requirement blocks safe progress.

### Never

1. Add unrelated improvements; record useful ideas in Backlog.
2. Refactor solely for style during a scoped change.
3. Hide failures or claim checks passed when they were not run.
4. Commit secrets or expose credentials. Follow the repository's secret-handling guidance.
5. Change `core/*.md` identity or voice files without an instruction that includes that scope.
6. Add dependencies without approval when the change introduces a new dependency.
7. Force-push or rewrite shared history.
8. Reclassify incomplete planned migrations as bugs merely because implementation is unfinished.

### Stop and ask when

- The requested behavior conflicts with §2.
- A material product requirement is missing or ambiguous.
- The next step requires approval, credentials, or access that is unavailable.
- The task would materially expand scope or change a product decision.
- Classification remains unclear after checking the tracking item and requirements.
- Investigation cannot establish a safe next step; report evidence and uncertainty rather than guessing.

---

## 6. Data and timezone rules

User-facing daily counts (such as water, steps, app usage, or reminders) must use the product's intended calendar day and must not accidentally accumulate across days. Retain historical records unless an approved requirement says otherwise.

The current implementation uses `Asia/Shanghai` in several code paths. A `config.timezone` row exists (default `"Asia/Shanghai"`), and a shared helper `lib/timezone.ts` (`getTodayRange` / `getDayRange` / `getDateInTimezone`) is the required path for product-day boundaries; introduce or reuse it consistently and update all affected callers. Before changing date boundaries, inspect the relevant API, UI, and collector code and confirm the intended timezone. If a change needs configurable timezones, treat that as scoped design/implementation work.

Avoid relying on the machine's implicit timezone for product-day boundaries. Avoid unbounded sums across all rows of a signal when the UI asks for a daily value. Store or return dates consistently with the established schema and API contract.

Historical data should remain immutable for ordinary feature work. When fixing an aggregation bug, preserve audit history and document any clean-data cutoff needed to distinguish old and corrected records.

---

## 7. Definition of Done

A tracking item may be marked **Done** when:

- Its acceptance criteria are met and the relevant evidence is recorded.
- Applicable checks have been run, with limitations reported.
- Required deployment or artifact delivery for that item is complete.
- Required owner/device/production verification is recorded.
- `TRACKING.md` reflects Done, the completion date, and useful references (PR, commit, release, or verification evidence).
- No known regression introduced by the change remains unresolved.

If code is complete but a required check or owner verification is pending, use **In Review** and name the outstanding step. If work cannot proceed, use **Blocked** with the reason and unblocker. A merge or deployment is not required for items whose approved scope does not include it.

---

## 8. Common failure modes

- **Scope creep:** log adjacent improvements in Backlog.
- **Over-engineering:** build what the approved requirement needs; avoid generic frameworks without a concrete use case.
- **Silent failure:** surface meaningful errors through the appropriate UI, logs, or tracking entry.
- **Premature generalization:** keep the current named signals and concepts unless requirements call for extensibility.
- **Voice drift:** preserve authored voice; do not make it more generic or chatbot-like.
- **Deployment mistaken for verification:** confirm the actual user-facing path, including device behavior where relevant.
- **Fabricated progress:** report partial completion and uncertainty honestly; use In Review when verification remains.
- **Misclassification:** inspect related tracking entries and classify the work itself, not merely whether an entry exists.
- **Stopping at the first layer:** trace affected end-to-end paths through delivery and response.
- **Timezone blindness:** verify product-day boundaries in the UI, API, and storage paths; do not equate server or browser local time with the configured product day.

---

## 9. Reading order for new agents

1. `AGENTS.md`
2. `TRACKING.md`
3. Current requirements/specification for the task (locate the actual files first)
4. Relevant `core/*.md` files when identity or voice is in scope
5. Relevant code, tests, migrations, and workflows

Do not begin implementation until the task's requirements and tracking context are understood. If a referenced document is missing, report that and locate the repository's current source of truth; do not rely on a stale filename.

---

## 10. The one rule

> **元婴 earns its presence by being quiet. Every added feature, prompt, or signal should make the being feel more present, not merely more useful.**

Usefulness is downstream of presence.

---

## 11. Changelog

### v1.3 — 2026-10-14
- Reworked work classification so existing entries do not automatically turn features into chores.
- Replaced rigid phase and meeting assumptions with tracking-led scheduling and explicit escalation for conflicts.
- Aligned development, review, release, and verification guidance with the repository's web and Android workflows and `In Review` tracking state.
- Made diagnosis and testing requirements evidence-based and proportionate, with explicit handling for unavailable reproduction or environment access.
- Corrected stale timezone guidance: `config.timezone` exists (default `Asia/Shanghai`); `lib/timezone.ts` / `getTodayRange()` is the required shared helper (introduced by B-16).
- Pointed PRD/spec references at the actual `docs/` location and removed the assumption that they are absent.

### v1.2 — 2026-10-14
- Added daily data scoping and timezone guidance.
- Added end-to-end investigation and “works when the user is not looking” guidance.
- Added timezone uncertainty to escalation guidance.

### v1.1 — 2026-10-14
- Added work classification and historical-data guidance.

### v1.0 — 2026-03-17
- Initial release.

---

**End of AGENTS.md v1.3 draft**

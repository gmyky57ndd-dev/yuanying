# 元婴 (Yuanying) — Agent & Developer Rules

**Version:** 1.10
**Status:** Active  
**Audience:** AI coding agents, human developers, tech lead  
**Applies to:** Work in this repository  
**Changelog:** §11

---

## 1. Project context

元婴 is a phone-first AI companion that captures signals (wake, sleep, water, steps, and activity), offers reminders, and retains memory over time. It is architected as a Core State (memory/signals) that manifests through configurable Interfaces (Fenshen), and uses Agentic Tools to fetch data and take owner-confirmed actions.

**One sentence:** *Not a chatbot. Not an assistant. Your second self, growing with you.*

Before implementation, read `AGENTS.md`, `TRACKING.md`, and the relevant code and project documentation. Product intent lives in `docs/yuanying-prd-v1.1.md.md`; the original engineering spec is `docs/yuanying-engineering-spec-v2.md.md`; numbered engineering specs live in `docs/specs/` and are indexed in `docs/specs/INDEX.md`. Check the current repository for the source of truth; do not assume a cited path still exists. Ask the tech lead or owner if a required product decision cannot be found. Read `core/identity.md`, `core/voice.md`, and `core/values.md` when the task touches the companion's identity, voice, or values.

---

## 2. Three non-negotiable principles

If a proposed change conflicts with one of these principles, stop and raise the conflict before implementing it.

### 2.1 Quiet by default
元婴 speaks only when invited or when an interruption is justified. Avoid nagging, flooding, engagement loops, and growth-hacking patterns. Default to silence.

### 2.2 Confirm before action
元婴 may observe, infer, and propose. It must not take consequential action based only on an inferred pattern. Present proposals for confirmation first.

### 2.3 File-based core
Keep identity, values, voice, memory, and configuration in human-readable, version-controlled formats where applicable. Treat Supabase, DeepSeek, and other vendors as replaceable backends; do not make a vendor-specific format the only copy of important information.

### 2.4 The learning loop

元婴 grows by turning observations into owner-confirmed understanding before that understanding changes its proactive behavior. Features that use signals or inferred patterns to change how 元婴 behaves must preserve this sequence, or explain in their design why a step does not apply:

1. **Capture** — record observations with the context needed to interpret them, such as time, source, and platform.
2. **Aggregate** — summarize observations using the product's intended day and data rules (§6). Keep raw observations distinguishable from derived summaries.
3. **Propose** — present an inferred pattern as a question or proposal, not as established fact. Keep it distinct from confirmed knowledge.
4. **Confirm** — record the owner's confirmation or rejection and any relevant scope. Do not infer confirmation from silence.
5. **Act** — only use confirmed patterns for proactive behavior, and only within the scope the owner approved.

Do not let a pattern-driven behavior skip the proposal and confirmation steps. This loop is a product design constraint, not a requirement to create specific files or storage tables that do not yet exist. Use the repository's current implementation or approved equivalent; do not assume pattern files or a summary subsystem exist.

### 2.5 Self-awareness and tool use

元婴 is an agent, not a passive chatbot waiting for context to be pasted into each exchange. Its runtime instructions include `core/system-manifest.md`, which describes the available interface and capabilities. Keep that manifest accurate; 元婴 must not guess which buttons, routes, or actions exist.

- **Self-awareness:** When answering questions about its UI or capabilities, rely on the system manifest and current implementation. Do not claim a capability that is not documented and implemented.
- **Tools (function calling):** Use available retrieval tools (such as `get_notes`, `get_conversation_records`, and `get_summary`) when a question requires stored history or data that is not present in the current context. Query the appropriate tool before saying the information is unknown or unavailable. Treat tool results as evidence and report lookup failures honestly.
- **External actions:** Tools that send communications, create public issues, make payments, execute code in external environments, or otherwise cause consequential external changes require explicit owner confirmation before execution. Drafting is allowed; inferred intent is not confirmation. Destructive actions must be explicitly scoped and confirmed.

Agents must update `core/system-manifest.md` whenever they add or change a user-facing UI surface, tool, or capability described there.

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

### Historical records are part of 元婴's memory

Signals, summaries, reminders, and pattern history can shape what 元婴 remembers about its owner. Preserve their provenance and handle them deliberately:

- Do not delete historical records as incidental cleanup. Do not rewrite past observations to make a bug appear never to have happened.
- If a bug produced inaccurate values, preserve the original rows where required, correct future processing, and record a clean-data cutoff or transparent correction method in the tracking item.
- Filter or exclude historical data only when required by the product behavior, privacy/data-retention requirements, or an owner-approved decision. Make material exclusions visible and explainable; do not silently hide inconvenient history.
- Change schemas through forward migrations. Do not truncate data as a shortcut.
- Honor approved privacy, retention, and deletion requirements. The memory principle does not override the owner's data rights or an explicit deletion requirement.


### Agents learn too

These rules should improve when experience shows that they missed a recurring failure.

- Read this document's changelog during onboarding and when a relevant rule may have changed.
- When a classification, timezone, verification, or other process mistake reveals a gap, record the facts and impact in the relevant tracking item. If the rules contributed or the issue recurs, propose a focused update for tech-lead review.
- If a rule is unclear, outdated, or contradicted by the repository, surface that conflict instead of silently working around it.

Agents improve by observing outcomes, proposing changes to the process, getting appropriate review, and applying approved changes. Do not change this policy file as a substitute for approval.

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

### 4.7 Cost, exposure, and rollback

Model calls and background work can create cost. A change that increases model-call frequency, polling, retries, or automatic generation must estimate its expected and reasonable worst-case volume, explain the controls (such as caps, deduplication, or backoff), and obtain tech-lead approval before release. Prefer user-initiated work where it meets the requirement; scheduled work must have a clear need and bounded behavior.

Treat deployed API routes as potentially reachable by anyone who knows or discovers their URL unless access controls have been verified. Do not describe a production URL as private merely because it is unadvertised. Before making a route broadly accessible, embedding it, or adding a public demo, review authentication, rate limits, and cost exposure. For unauthenticated routes that can incur material cost or expose private data, address access controls before expanding distribution.

Before an Android collector release, identify how to stop or mitigate a bad version, accounting for devices that continue running older builds. Use a server-side flag only when the existing design supports one and the affected behavior can safely be disabled remotely; otherwise document a practical recovery plan. For web/PWA changes, verify the available hosting rollback path. A rollback plan does not replace release verification.

### 4.8 Specs written for AI agents

Specifications handed to an AI coding agent must be executable without
inference. A spec that omits any of the following is incomplete — stop and
ask rather than guess.

- **Explicit file paths.** Name the exact files and handlers. Say "create
  `app/api/xyz/route.ts` with the following `POST` handler", not "add an
  endpoint."
- **Explicit fallback behavior.** Define what happens when a dependency,
  secret, or condition is missing. Say "if `GITHUB_TOKEN` is absent, copy the
  text to the clipboard instead."
- **Verifiable acceptance.** State the observable result (a DB row, a created
  issue, a copied clipboard, a rendered label), not a vague intention.
- **Tool Contracts.** When writing a tool for an AI agent, the return payload
  must be strict and predictable. If an operation can fail, it must return an
  explicit `success: false` and an `error` string. Never return an ambiguous
  payload that allows the AI to guess or hallucinate the result. When a tool
  fails, the AI must be told it failed so it can report the truth to the user.

Agents cannot act on intent that is not written down. Paths and fallbacks are
part of the requirement, not implementation details.

### 4.9 Engineering Spec (ES) Numbering & Governance

To prevent numbering collisions and maintain a traceable history of
architectural decisions:

1. **Central Index:** All ES documents must be logged in `docs/specs/INDEX.md`.
2. **Sequential Assignment:** The next available ES number must be checked
   against the INDEX before creation. Never guess the number.
3. **One Subject per ES:** Do not append unrelated features to an existing ES.
   Create a new one.
4. **No Orphan ES:** Every ES must have a corresponding entry in `TRACKING.md`.

When adding a new ES:

- Create the file `docs/specs/ES-XXX-title.md`.
- Add a line to `docs/specs/INDEX.md` with the number, title, status, and date.
- Create/update the tracking item.

**Renumbering rule:** if a collision is discovered after publication, rename the
newer/duplicate document, update every reference in `TRACKING.md`, code comments,
and the INDEX, and record the old number in the INDEX note. Never silently reuse
an ES number.

---

## 5. Rules of engagement

### Always

1. Read this file, `TRACKING.md`, and the relevant requirements/code before implementation.
2. Keep scope tied to the request and agreed acceptance criteria.
3. Update tracking on meaningful state changes.
4. Surface errors and blockers; distinguish observed facts from hypotheses.
5. Prefer human-readable, portable formats for durable project information.
6. Ask when a product decision, approval, or missing requirement blocks safe progress.
7. **Implement explicit tools for context retrieval.** When a feature needs to retrieve stored data not already available in its bounded runtime context, prefer a scoped, permission-appropriate tool/API over injecting an unbounded history into every prompt. Document the tool's purpose and limits, and update `core/system-manifest.md` when a tool or user-facing surface is added or changed.
8. **Log signal provenance (ES-011 §3).** Every signal the collector
   sends must include enough metadata for 元婴 to explain it to the
   owner: the value, its source, the collection window, and (where the
   value is aggregated) the aggregation mode. A signal that 元婴 cannot
   explain is not trustworthy. When the owner reports a discrepancy,
   query this metadata before asking the owner to check anything.

### Never

1. Add unrelated improvements; record useful ideas in Backlog.
2. Refactor solely for style during a scoped change.
3. Hide failures or claim checks passed when they were not run.
4. Commit secrets or expose credentials. Never repeat a secret in chat, logs, PRs, issues, build output, error responses, or client code. If a secret is exposed or suspected, report it promptly to the owner and arrange immediate revocation or rotation; if you cannot perform that action, state the blocker. Record the secret type/location, exposure window if known, and remediation status in the tracking item without recording the secret value. Keep credentials in approved local secret files or hosting-provider secret settings; verify the current repository configuration rather than assuming a particular file or provider.
5. Change `core/*.md` identity or voice files without an instruction that includes that scope.
6. Add dependencies without approval. Prefer existing platform and project capabilities; each new package adds maintenance and security cost. If a dependency is justified, explain why in the proposed change and obtain tech-lead approval before adding it.
7. Force-push or rewrite shared history.
8. Reclassify incomplete planned migrations as bugs merely because implementation is unfinished.
9. Add a new capture surface without exhausting existing ones. Every
   interface is a place the product can die — the more surfaces the
   owner must visit, the more likely one gets abandoned. Before adding
   any input UI, ask: can this ride on chat, a single button, or voice?
   If yes, do that. New surfaces exist only when no existing surface
   can carry the input.
10. **Do not give the AI autonomous external actions.** Do not build tools that send communications, make payments, execute code in external environments, or make destructive changes without an explicit human confirmation step. Read-only retrieval tools do not need confirmation.

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

The current implementation uses `Asia/Shanghai` in several code paths. Before changing date boundaries, inspect the relevant API, UI, and collector code and confirm the intended timezone. Do not assume that `config.timezone` or a shared helper such as `getTodayRange()` exists; verify the repository first. If a change needs configurable timezones or a shared timezone utility, treat that as scoped design/implementation work and update all affected callers consistently.

Avoid relying on the machine's implicit timezone for product-day boundaries. Avoid unbounded sums across all rows of a signal when the UI asks for a daily value. Store or return dates consistently with the established schema and API contract.

When adding tests for date, time, or timezone behavior, make time explicit (for example, pass a fixed `now` or use a controlled clock) and do not depend on the developer machine's timezone. Exercise the product timezone and relevant day-boundary cases. Use the repository's available test setup; do not claim timezone coverage unless those cases were actually checked.

Historical data should remain immutable for ordinary feature work. When fixing an aggregation bug, preserve audit history and document any clean-data cutoff needed to distinguish old and corrected records.

---

## 7. Definition of Done

A tracking item may be marked **Done** when:

- Its acceptance criteria are met and the relevant evidence is recorded.
- Applicable checks have been run, with limitations reported.
- Required deployment or artifact delivery for that item is complete.
- Required owner/device/production verification is recorded.
- `TRACKING.md` reflects Done, the completion date, and useful references (PR, commit, release, or verification evidence).
- No regression has been reported by the checks and verification performed; record any unverified areas or known limitations.

If code is complete but a required check or owner verification is pending, use **In Review** and name the outstanding step. If work cannot proceed, use **Blocked** with the reason and unblocker. A merge or deployment is not required for items whose approved scope does not include it.

---

## 8. Common failure modes

- **Scope creep:** log adjacent improvements in Backlog.
- **Over-engineering:** build what the approved requirement needs; avoid generic frameworks without a concrete use case.
- **Silent failure:** surface meaningful errors through the appropriate UI, logs, or tracking entry.
- **Premature generalization:** keep the current named signals and concepts unless requirements call for extensibility.
- **Voice drift:** the 元婴's voice is authored, not emergent. `core/voice.md` records its voice where present. Do not make it generically helpful, add chatbot pleasantries, or alter the authored register without a product decision. If voice needs to change, escalate it as product work.
- **Deployment mistaken for verification:** confirm the actual user-facing path, including device behavior where relevant.
- **Fabricated progress:** report partial completion and uncertainty honestly; use In Review when verification remains.
- **Misclassification:** inspect related tracking entries and classify the work itself, not merely whether an entry exists.
- **Stopping at the first layer:** trace affected end-to-end paths through delivery and response.
- **Timezone blindness:** verify product-day boundaries in the UI, API, and storage paths; do not equate server or browser local time with the configured product day. Tests for these paths must use explicit time and timezone assumptions (§6).
- **Interface proliferation:** every new capture surface is a place the
  owner can abandon the last one. The owner's attention is the scarce
  resource, not the feature count. Before adding any input UI, exhaust
  existing surfaces (chat, one button, voice). If a new surface is truly
  necessary, it must justify why no existing surface can carry the input
  — and the justification goes in the spec, not assumed.
- **Passive AI:** waiting for the owner to paste historical context instead of using an available retrieval tool. When the question requires stored history and an appropriate tool exists, use it before claiming the information is unknown.
- **Blind AI:** adding or changing a UI surface or tool without updating `core/system-manifest.md`. If the runtime manifest does not describe a capability, 元婴 may not know it exists.

---

## 9. Reading order for new agents

1. `AGENTS.md` — rules and current changelog
2. `TRACKING.md` — current status, acceptance criteria, and project history
3. Current requirements/specification for the task (check the repository, including `docs/`, for actual filenames)
4. `core/identity.md`, `core/voice.md`, `core/values.md`, and `core/system-manifest.md` when present and relevant
5. Pattern files such as `core/inferred-patterns.md`, `core/confirmed-patterns.md`, or `core/rejected-patterns.md`, if they exist and are relevant
6. The schema and routes that implement the relevant data flow (inspect actual files; do not assume a `/api/summary/*` route or a summaries table exists)
7. Relevant code, tests, migrations, and workflows

Do not begin implementation until the task's requirements and tracking context are understood. If a referenced document or learning artifact is missing, report that and locate the repository's current source of truth; do not rely on a stale filename.

---

## 10. The one rule

> **元婴 earns its presence by being quiet. Every added feature, prompt, or signal should make the being feel more present, not merely more useful.**

Usefulness is downstream of presence.

This rule applies to 元婴 and to the agents building it:

- Before adding a signal, reminder, or proactive behavior, ask whether it makes 元婴 more present or merely more active. Activity is not a substitute for trust.
- Before adding a notification or alert, verify that it is invited or justified by the agreed product behavior and the quiet-by-default principle.
- Before making a response longer or more eager, consider whether a shorter response better fits the authored voice.

If a change makes 元婴 louder or more frequent without a clear, owner-approved benefit to trust and presence, revisit the design.
---

## 11. Changelog

### v1.10 — 2026-10-20
- Added §4.9 Engineering Spec (ES) Numbering & Governance.
- Created `docs/specs/INDEX.md` as the single source of truth.
- Renamed the duplicate ES-036 tooling spec to **ES-038** and updated
  references.

### v1.9 — 2026-10-19
- Added §12: Data Sovereignty & Backup — capacity baseline, vendor
  independence, and the three-layer backup protocol (ES-031).
- Context: commercial providers can disappear; the database is a cache and
  the owner's local Markdown/Git copy is the source of truth.

### v1.8 — 2026-10-18
- Updated §1 to describe the Core State, configurable Fenshen interfaces, and agentic tools architecture.
- Added §2.5 on runtime self-awareness, retrieval tools, and confirmation before external side effects.
- Updated §5 to prefer scoped retrieval tools and forbid autonomous external actions.
- Added Passive AI and Blind AI failure modes to §8.
- Added `core/system-manifest.md` to the §9 reading order.
- Added the §4.8 **Tool Contracts** rule: tools must return an explicit
  `success: false` and `error` on failure so the AI can report the truth.
- Context: Fenshen, system-manifest self-awareness, and function-calling retrieval tools are now implemented; the manifest is loaded into the runtime prompt.

### v1.7 — 2026-10-17
- Added §4.8: specs written for AI agents require **explicit file paths**,
  **explicit fallback behavior**, and **verifiable acceptance**.
- Context: ES-014/ES-016 specs said "add an endpoint" without the route path
  or a missing-token fallback, which caused avoidable rework.

### v1.6 — 2026-10-16
- Added §5.1 bullet 7 (signal provenance rule, ES-011 §3).
- Context: ES-011 self-diagnostic response — 元婴 must explain any signal
  it holds (value, source, window, aggregation) before asking the owner.

### v1.5 — 2026-10-16
- Added §5.2 bullet 9 (no new capture surfaces without exhausting existing ones)
- Added §8 Interface proliferation failure mode
- Context: ES-008 C-phase UI. Note-taking must ride on existing surfaces,
  not create parallel input paths. Friction is the primary cause of
  abandonment in single-user tools.

### v1.4 — 2026-10-14 (draft)
- Added the learning loop as a product constraint for pattern-driven behavior while avoiding assumptions about unimplemented files or tables.
- Reframed historical data as part of memory, with explicit safeguards for privacy, retention, and deletion requirements.
- Added a process for agents to surface recurring rule gaps for review.
- Added secret exposure handling, dependency rationale, model-cost/access awareness, and platform-aware rollback planning.
- Added timezone-independent guidance for tests that cover date boundaries.
- Expanded authored-voice and “presence” guidance to cover agent decisions.
- Updated the reading order to include learning artifacts only when they exist and to avoid assuming summary routes/tables.
- Context: PM review found that v1.3 improved governance but did not operationalize the project's learning/growth premise. Recommended edits were adapted to match the repository and avoid implying that currently absent pattern files or summary APIs already exist.

### v1.3 — 2026-10-14 (draft)
- Reworked work classification so existing entries do not automatically turn features into chores.
- Replaced rigid phase and meeting assumptions with tracking-led scheduling and explicit escalation for conflicts.
- Aligned development, review, release, and verification guidance with the repository's web and Android workflows and `In Review` tracking state.
- Made diagnosis and testing requirements evidence-based and proportionate, with explicit handling for unavailable reproduction or environment access.
- Corrected stale timezone guidance: the inspected code hardcodes `Asia/Shanghai`; `config.timezone` and `lib/timezone.ts`/`getTodayRange()` were not present.
- Clarified that cited PRD/spec filenames need to be verified in the repository.

### v1.2 — 2026-10-14
- Added daily data scoping and timezone guidance.
- Added end-to-end investigation and “works when the user is not looking” guidance.
- Added timezone uncertainty to escalation guidance.

### v1.1 — 2026-10-14
- Added work classification and historical-data guidance.

### v1.0 — 2026-03-17
- Initial release.

---

## 12. 数据主权与备份 (Data Sovereignty & Backup)

元婴的长期记忆是用户的数字资产，其所有权和控制权绝对属于用户（Owner）。

### 12.1 容量基线 (Capacity Baseline)
- 人类一生（80年）所产生的文本、思考、对话记录，极端高估下约为 40-50 GB（约 100 亿 tokens）。
- 架构决策：我们不需要依赖超大上下文窗口（如 10M+）来一次性读取所有记忆。我们通过分层检索（RAG + 结构化查询），确保无论数据量多大，每次 LLM 调用的上下文都保持在高效范围（< 32k tokens）。

### 12.2 供应商无关性 (Vendor Independence)
- 任何商业供应商（Supabase, Vercel, DeepSeek 等）都可能倒闭或改变服务条款。
- 核心原则：**数据库是缓存，本地 Markdown 是真理。**
- 所有的结构化数据（signals, summaries, notes）必须有定期导出为纯文本（JSONL / Markdown）的机制，并落入用户的 Git 仓库或本地存储。

### 12.3 备份机制 (Backup Protocol)
必须实现三层备份（详见 ES-031）：
1. **Git 核心备份**：`core/` 和 `memory/` 下的所有 Markdown 文件每天自动 commit。
2. **数据库快照**：Supabase 数据每天/每周导出并转存。
3. **本地导出**：用户需能一键导出所有数据为 ZIP，确保离线安全。

---

**End of AGENTS.md v1.10**

```
AGENTS.md


```
```
```markdown
# 元婴 (Yuanying) — Agent & Developer Rules

**Version**: 1.1
**Status**: Active
**Audience**: AI coding agents, human developers, tech lead
**Applies to**: All code, all commits, all PRs in this repository
**Changelog**: §11

---

## 1. What This Project Is

元婴 is a phone-first AI companion that grows with its owner. It captures signals (wake / sleep / water / steps), reminds the owner proactively (water / standup / vitamin), and holds memory across days, weeks, months.

**One sentence**: *Not a chatbot. Not an assistant. Your second self, growing with you.*

**Read first**: `yuanying-prd-v1.1.md` (why) and `yuanying-engineering-spec-v2.md` (what).

---

## 2. Three Non-Negotiable Principles

These override every other consideration. If a task conflicts with any of them, **stop and ask**.

### 2.1 Quiet by default
元婴 speaks only when invited or when it has something that genuinely deserves the interruption. It never nags, never pushes, never floods. Every utterance must earn its place against silence.

**In code**: no unsolicited notifications, no "engagement" loops, no growth-hacking patterns. Default to silence.

### 2.2 Confirm before action
元婴 may observe, infer, and propose. It may not act on an inference until the owner confirms.

**In code**: no autonomous actions based on inferred patterns. Proposals are shown, not executed. `inferred-patterns.md` is read-only for actions until a human or the owner promotes it to `confirmed-patterns.md`.

### 2.3 File-based core
The 元婴's identity, values, voice, memory, and configuration live in human-readable, version-controlled files. The 元婴 does not belong to any platform, any model, or any vendor.

**In code**: `core/*.md` and `memory/*` are the source of truth. Supabase and DeepSeek are replaceable backends. Never let a vendor's proprietary format become the only copy of anything important.

---

## 3. Work Classification (READ BEFORE FILING ANYTHING)

Before you open a PR, file a tracking entry, or start work, classify it correctly. **Misclassification creates duplicate entries, wrong commit prefixes, and wasted discussion.** This is a common failure mode for both humans and agents.

### 3.1 The three categories

| Category | Definition | PR prefix | Tracking entry |
|---|---|---|---|
| **Bug** | Behavior deviates from spec. Expected behavior is already defined and was previously working, or is unambiguously required. | `fix(...)` | New entry under To Do, tagged `[BUG]` |
| **Feature (planned)** | New behavior defined in spec, not yet built. | `feat(...)` | Entry already exists in TRACKING (or is created with owner approval). Update status. |
| **Chore (completion)** | Planned change partially applied. Spec says X, code does Y. | `chore(...)` | Entry already exists. Update status. **Do NOT create a new entry.** |

### 3.2 Decision tree

Ask these questions **in order**. Stop at the first "yes."

```
1. Is there already a tracking entry for this? → Yes → Is it still open? → Yes → Chore (completion). Update the existing entry. → No → Go to question 2. → No → Go to question 2.  
2. Is the current behavior violating the spec? → Yes → Bug. Create a new tracking entry tagged [BUG]. → No → Go to question 3.  
3. Is there a spec section describing the desired behavior? → Yes → Feature (planned). Create an entry only if the owner approves. → No → Escalate. Do not proceed.  
4. Still ambiguous? → Stop. Ask. Do not guess.  
```
### 3.3 Worked examples

**Example A — "API still accepts `sit` after v2 removal"**

- Is there a tracking entry? **Yes — P0-01.**
- Is it still open? **Yes.**
- Classification: **Chore (completion).**
- Action: Verify the existing entry's acceptance criteria. Close it if satisfied. **Do not create a new bug entry.**
- If code changes are needed: `chore(signal): complete sit removal from v2`

**Example B — "Bilibili reports 653 min in a 60-min window"**

- Is there a tracking entry? **No.**
- Is it violating the spec? **Yes — spec says window is 60 minutes.**
- Classification: **Bug.**
- Action: Create `### [B-XX] app_usage duration_min inflation` under To Do. Tag `[BUG]`.
- PR: `fix(android/collector): clamp duration to window length`

**Example C — "Add reminder settings page"**

- Is there a tracking entry? **Yes — P1-05 in TRACKING or spec v2 §6.4.**
- Is it still open? **Yes.**
- Classification: **Feature (planned).**
- PR: `feat(settings): add reminder toggles`

**Example D — "Button color is slightly off from spec"**

- Is there a tracking entry? **No.**
- Is it violating the spec? **Depends — does the spec define the color?**
  - Yes → Bug.
  - No → Cosmetic. Log in Backlog. Do not implement.

### 3.4 Why this matters

Filing `sit`-type items as bugs has three concrete costs:

1. **Duplicate tracking.** P0-01 and a new "[BUG] sit still accepted" entry describe the same work. Which one closes when the work is done? The answer is unclear, and both may linger.
2. **Wrong commit prefix.** `fix:` implies "restore expected behavior." `chore:` implies "complete a planned change." For a migration, `chore:` is correct. Using `fix:` makes `git log` lie about what happened.
3. **Confusion at review time.** Reviewers may question "did we decide to remove `sit`?" when the answer is already in the spec. This wastes a day.

### 3.5 Historical data is not a bug

When a migration removes or renames a signal, **old rows in the database are audit trail, not bugs.**

- Do not delete them.
- Do not migrate them.
- Do not filter them out unless the owner asks.
- Future analyses use `created_at > <migration_date>` as the cutoff.
- Log the migration date in the tracking entry so future queries can filter correctly.

If the spec wanted data cleaned, it would say so explicitly. Absent that instruction, leave history alone.

---

## 4. Development Cycle

### 4.1 Phase gates

Work moves through phases. A phase is closed only when its Definition of Done (see §6) is met and the tech lead signs off.

```
## Phase P0 → Phase P1 → Phase P2 → ... ↓ ↓ ↓ ship ship ship  
```
**No phase skipping.** No starting P1 work while P0 is unfinished. If P0 is blocked, work on P0 or ask; do not start P1.

### 4.2 Daily rhythm

| Time | Event | Owner | Output |
|---|---|---|---|
| 10:00 | Daily sync (15 min) | Tech lead + agent + owner | Yesterday / today / blockers |
| Throughout day | Development | Agent / dev | Commits, PRs |
| 18:00 | Status update | Agent / dev | `TRACKING.md` updated |

`TRACKING.md` is updated **daily at 18:00**. If it's not updated, the day did not happen.

### 4.3 Diagnosis before code

**Never write a fix for a bug you have not reproduced.**

Before fixing a bug:
1. Reproduce the bug (locally or on device)
2. Document the reproduction in the tracking entry
3. State the root cause hypothesis
4. Only then write the fix

If you cannot reproduce, say so. "I cannot reproduce this on my machine" is a valid and valuable report. Guessing at a fix is not.

### 4.4 Verify before Done

A task is done when:
- The change works in the environment the user will use (not just localhost)
- The acceptance criteria in the spec are met
- The tracking log is updated
- **A second person or agent has verified it**, or the owner has personally confirmed

"It compiles" is not done. "It works on my machine" is not done. "Tests pass" is not done. **The owner runs it and it works for them** is done.

### 4.5 One task, one PR

- One feature = one PR
- One bug fix = one PR
- One chore = one PR
- Never mix. Never "while I was in there, I also fixed…"

Small PRs are reviewed faster and reverted cleaner.

### 4.6 Commit conventions

```
## <type>(<scope>): <subject>  
## <body: why, not what>  
## <footer: refs to tracking entry>  
```
text
Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Choose the type based on §3 classification:
- `fix` for Bug
- `feat` for Feature
- `chore` for Chore (completion)

Example (Bug):

```
fix(android/collector): clamp duration to window length  
## queryAndAggregateUsageStats returns cumulative totals on OnePlus ROMs, producing values > 60 min for a 60-min window. Clamping provides a defensive guard while v1.0.6 rewrites the collector to use queryEvents.  
## Refs: TRACKING.md #B-15  
```
text
Example (Chore):

```
chore(signal): complete sit removal from v2  
## The v2 migration removed sit from spec and schema, but the API still accepted it. This finishes the removal. Historical sit rows are retained as audit trail per AGENTS.md §3.5.  
## Refs: TRACKING.md #P0-01  
```
text
---

## 5. Rules of Engagement

### 5.1 Always do

1. **Read the spec** (`yuanying-engineering-spec-v2.md`) before starting any task.
2. **Read the tracking log** (`TRACKING.md`) to see what's in flight.
3. **Classify the work** using §3 before filing or starting anything.
4. **Update `TRACKING.md`** when you start, pause, or finish.
5. **Write tests** for non-trivial logic (schemas, cron, reminder scheduling, permission flows).
6. **Ask when uncertain.** Silent assumptions cost more than questions.
7. **Prefer plaintext** over binary formats for anything that outlives this sprint.

### 5.2 Never do

1. **Never expand scope.** Log improvements in Backlog — do not implement.
2. **Never refactor for style.** Improve only when a task requires it.
3. **Never silently fail.** Every error must surface in the UI, log, or tracking file.
4. **Never commit secrets.** `.env.local` is in `.gitignore`. Report any key you find.
5. **Never touch `core/*.md`** without explicit instruction. These are the 元婴's identity.
6. **Never "improve" the voice.** Tone is authored. No emoji, no exclamation marks, no softening.
7. **Never `git push --force`** to `main` or any branch with open PRs.
8. **Never add a dependency** without logging it and getting approval.
9. **Never reclassify unfinished migrations as bugs.** See §3.

### 5.3 When to stop and ask

Stop immediately and ask when:

- A task seems to require violating any of §2's three principles
- The spec is ambiguous on a meaningful decision
- A change would affect more than the task's stated scope
- A bug's root cause is unclear after 30 minutes of investigation
- An API key, permission, or external service is required that you don't have
- You are unsure which category (§3) a task belongs to
- You are tempted to add a feature "because it would be better"

The cost of asking is a 2-minute message. The cost of not asking is a wasted day.

---

## 6. Definition of Done

A task is Done when all of the following are true:

- [ ] Code is committed, pushed, and merged to `main` (or current working branch)
- [ ] Deployed to Vercel (or built into the APK for Android changes)
- [ ] The user-facing behavior matches the spec's acceptance criteria
- [ ] The owner has run it and confirmed
- [ ] `TRACKING.md` has an entry under Done with a date and PR link
- [ ] No new warnings in build or runtime logs
- [ ] No regression in previously verified behaviors

If any checkbox is false, the task is **In Progress**, not Done.

---

## 7. Common Agent Failure Modes (Read This Twice)

AI agents fail on this project in predictable ways. Watch for these in yourself:

### 7.1 Scope creep via "obvious improvements"
You will see code that could be cleaner. You will think "while I'm here, let me just…" **Stop.** Log it under Backlog. Move on.

### 7.2 Over-engineering
You will want to build a plugin system, a config abstraction, a generic habit framework. **Don't.** The product has one user. Build exactly what the spec says.

### 7.3 Silent failure
You will catch an error and return `{ ok: false }`. The UI will look fine. **Every failure must surface** — alert, log, tracking entry, or all three.

### 7.4 Premature generalization
You will see "wake / sleep / water" and think "generic signals with pluggable types." The spec says three named signals. Build three named signals.

### 7.5 Voice drift
You will edit the 元婴's responses to be warmer or more helpful. **Stop.** Voice is authored. If it needs changing, ask.

### 7.6 Deploy without verification
You will push to `main`, Vercel will deploy, and you will mark Done without testing on the phone. **Stop.** Deployment ≠ working.

### 7.7 Fabricated progress
You will be tempted to write "Done" when you're 90% sure. **Don't.** Mark "In Review." A false Done is worse than an honest In Progress.

### 7.8 Misclassification
You will see a migration that partially landed and think "bug!" **Stop.** Check §3. If a tracking entry already exists and is open, it is a chore, not a bug. Do not duplicate.

---

## 8. Escalation

| Situation | Escalate to | Timeframe |
|---|---|---|
| Ambiguous spec | Tech lead | Before proceeding |
| Blocked by missing access | Owner | Immediately |
| Principle conflict | Owner | Before proceeding |
| Root cause unclear after 30 min | Tech lead | Same day |
| Bug affects production users | Owner + tech lead | Immediately |
| Scope expansion temptation | Tech lead | Before proceeding |
| Unsure about classification | Tech lead | Before filing |

The owner is available daily at 10:00. Outside that window, use async channels and mark items **Blocked** in `TRACKING.md`.

---

## 9. Reading Order for New Agents

Read in this order:

1. **This file** (`AGENTS.md`) — you are here
2. `TRACKING.md` — current state
3. `yuanying-prd-v1.1.md` — why we're building this
4. `yuanying-engineering-spec-v2.md` — what we're building
5. `core/identity.md` — who the 元婴 is
6. The actual code in `app/` and `lib/`

Do not write code until you have read 1–4.

---

## 10. The One Rule

If you remember nothing else:

> **The 元婴 earns its presence by being quiet. Every added feature, prompt, or signal must make the being feel *more* present, not *more* useful.**

Usefulness is downstream of presence. Not the other way around.

---

## 11. Changelog

### v1.1 — 2026-10-14
- Added §3 (Work Classification) — Bug vs Feature vs Chore
- Added §3.5 (Historical data is not a bug)
- Added §5.3 bullet on classification uncertainty
- Added §7.8 (Misclassification failure mode)
- Added escalation row for classification uncertainty
- Renumbered subsequent sections

### v1.0 — 2026-03-17
- Initial release

---

**End of AGENTS.md**

```

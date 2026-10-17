```
ES-006-learning-loop.md

```
```

markdown
# ES-006 — Learning Loop v1

**Status**: Approved
**Category**: Feature (P2)
**Depends on**: ES-005 (summaries, ground rules, voice pass)
**Tracking**: P2-01 through P2-05

---

## 1. Purpose

ES-005 built capture and aggregate (steps 1–2 of the five-step loop).
ES-006 adds steps 3–5: propose, confirm, act. The 元婴 gains opinions
about its owner.

An opinion is not an observation. It is held with uncertainty, spoken
from inside, and retractable without drama.

- Observation: "You skipped 4 workouts this week."
- Opinion: "We skip workouts when the week is hard. Maybe that's not
  the week for it."

---

## 2. Design principles

1. **Voice is "we," not "you."** Not an observer. Not a manager. Another
   version of the same person, noticing together.

2. **Three held opinions at a time, max.** More than three and none of
   them matter. The cap is the design.

3. **Silence is a form of rejection.** Unengaged opinions decay. Nothing
   nags.

4. **Rejected is rejected.** Owner says no → never re-proposed. Ever.

5. **Opinions live where the owner can read them.** Files, not black box.
   Owner can open `held.md` at any time.

---

## 3. Opinion model

**Three held at a time.**

Each held opinion has:
- A short statement (one sentence, "we" voice)
- Evidence (dated observations, not summarized)
- Confidence (0.0–1.0, revised on engagement)
- First observed date
- Last engaged date

**Decay**: 60 days without engagement → `archive.md`. Silent.

**Retraction**: owner says "不对" → `rejected.md` with owner's reason.
Never re-proposed under any framing.

---

## 4. Detectors (v1: one)

Ship one detector. Add more only after this one works.

### Detector 1 — Avoidance via adjacent tasks

**Detects**: owner mentions task X repeatedly (from notes), while logging
activity on adjacent tasks Y and Z (from app_usage, steps, wake patterns)
without progress on X.

**Produces**: at most one candidate opinion per week, only if the pattern
persists for 5+ consecutive days.

**Inputs**:
- `signals` where `name='note'` — topic extraction
- `signals` where `name='app_usage'` — what was actually done
- `signals` where `name='steps'` — physical activity proxy
- Daily `summaries` for aggregation

**Run cadence**: nightly, per AGENTS.md §4.2 (agent batch), not on
request.

**False positive guard**: if the topic appears in a note but no adjacent
activity was logged, do not propose. Adjacent activity is required.

### Deferred to v1.1

- Intention-action gap (mentioned vs. done)
- State-behavior mismatch (sentiment vs. activity)

Do not build these until Detector 1 has been stable for 4 weeks.

---

## 5. Files

```
core/opinions/ ├── held.md # currently held (max 3) ├── confirmed.md # owner agreed — 元婴 speaks from these ├── rejected.md # owner said no — with reason └── archive.md # faded naturally  
```
text
**Format of an entry** (all files use same shape):

```markdown
## O-001 — 我们避开提案，做相邻的任务

- Confidence: 0.6
- First observed: 2026-10-14
- Last engaged: 2026-10-15
- Evidence:
  - 2026-10-12 note: "还在想提案"
  - 2026-10-13 app_usage: Docs 47m, Email 32m, no proposal file
  - 2026-10-14 note: "今天提案要先想一下"
  - 2026-10-15 app_usage: Docs 51m, no proposal file

```
**Not** inferred-patterns.md. The owner's language was "opinions." File names follow the concept.  
  
## 6. Surfacing rules  
Opinions do not auto-surface. They wait for one of:  
  
  

| Trigger                    | Frequency                    |
| -------------------------- | ---------------------------- |
| Weekly digest last line    | Once per week, max           |
| Recurrence in conversation | Once per 30 days per opinion |
| Owner asks                 | Anytime                      |
| Owner reads file           | Anytime                      |
  
After surfacing once, quiet for 30 days unless the owner engages.  
**Weekly digest integration** (extends ES-005 §1.4):  
The digest's last line — currently "有一条我注意到——但我先不说，等你问" — may reference a held opinion if one is due. The line stays a hook, not the statement. Full statement surfaces only when owner asks.  
  
## 7. Confirmation protocol  
  
  

| Response       | Effect                                        |
| -------------- | --------------------------------------------- |
| "对"            | → confirmed.md. 元婴 may speak from it.         |
| "不对"           | → rejected.md with reason. Never re-proposed. |
| "有可能"          | Stays in held.md. Confidence +0.1.            |
| Silence        | Stays in held.md. Confidence −0.05 per week.  |
| 60 days silent | → archive.md.                                 |
  
**Owner reads/hears the opinion once before responding.** No hidden state. No opinions the owner hasn't seen.  
  
## 8. Prompt integration  
Load into system prompt:  
* confirmed.md — always  
* held.md — only when conversation topic matches an opinion's topic  
* rejected.md — never (guard against re-proposal)  
* archive.md — never  
Prompt line (add to lib/yuanying.ts):  
```
text
You hold opinions about the owner, stated as "we."
Speak from confirmed opinions when relevant.
Do not assert held opinions as fact — offer them as questions.
Ground rules (§2 priority 2) override opinions.
Opinions never override priority 1 (confirm before action).

```
  
## 9. Autonomy levels  
  
  

| Level | Behavior | When |
| -------------- | ---------------------------- | ---------------------------------------- |
| ask_first | Opinion surfaces as question | Default |
| act_and_report | Opinion can act, then report | After 4 weeks stable, no false positives |
| act_silently | Never | Never |
  
All opinions start at ask_first. Promotion is per-opinion, not global. One false positive at act_and_report demotes back to ask_first.  
  
## 10. Off-limits topics  
Before shipping, extend core/ground-rules.md with a new section:  
```
markdown
## No opinions about

- (topics the owner does not want the 元婴 to form opinions on)

```
**The detector must filter against this list.** If the topic is off- limits, no opinion is formed even if the pattern is clear. This is not a threshold adjustment — it's a hard filter.  
Until the owner populates this section, the detector runs with an empty filter. This is acceptable for v1 (few opinions expected in early weeks), but should not stay empty past week 4.  
  
## 11. Acceptance criteria  
* □ core/opinions/ folder with four files created  
* □ Detector 1 runs nightly  
* □ Max 3 held opinions enforced (4th oldest fades first)  
* □ Weekly digest may hint once  
* □ Confirmation updates files correctly  
* □ Confirmed opinions loaded into prompt  
* □ Rejected never re-proposed under any framing  
* □ Silent opinions decay to archive after 60 days  
* □ Owner can read held.md anytime  
* □ Voice is "we," not "you"  
* □ Off-limits filter respected  
* □ Priority order enforced (ground rules > opinions; confirm-before-action > all)  
  
## 12. Do not  
* No dashboards, statistics, or "insights" panel  
* No more than 3 held opinions  
* No silent action on opinions  
* No opinions outside topics allowed by ground-rules.md  
* No re-proposing rejected opinions  
* No observing language ("I notice that you...") — always "we"  
* No fixed-point conclusions — held with uncertainty  
* No more than one detector in v1  
  
## 13. Tracking entries  
```
markdown
### [P2-01] Opinions file structure + schema

- Status: To Do
- Category: Feature
- Refs: ES-006 §5
- Owner: @dev

### [P2-02] Detector 1 — avoidance via adjacent tasks

- Status: To Do
- Category: Feature
- Refs: ES-006 §4
- Owner: @dev

### [P2-03] Confirmation protocol + file transitions

- Status: To Do
- Category: Feature
- Refs: ES-006 §7
- Owner: @dev

### [P2-04] Prompt integration — confirmed + held opinions

- Status: To Do
- Category: Feature
- Refs: ES-006 §8
- Owner: @dev

### [P2-05] Off-limits filter from ground rules

- Status: To Do
- Category: Feature
- Refs: ES-006 §10
- Blocked on: owner populating "no opinions about" in ground-rules.md
- Owner: @dev

```
  
## 14. Handoff  
Dev: read this file. Execute in order P2-01 → P2-05. Detector (P2-02) does not ship until file structure (P2-01) and confirmation protocol (P2-03) are in place — otherwise candidates have nowhere to live.  
Owner: nothing blocks dev. When you have topics for the off-limits list, add them to core/ground-rules.md. Until then, filter is empty.  
Do not reply in chat. Update TRACKING.  
  
**End of ES-006.**  

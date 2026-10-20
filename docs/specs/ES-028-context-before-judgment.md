# ES-028 — Prevent False Behavioral Judgments from Missing Data

**Status**: Approved
**Category**: Bug (Prompt/Logic)
**Tracking**: P1-58
**PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19

## 1. Problem

When the phone step counter dropped to 600 (because it was plugged into a
computer), Xiaowu concluded "you barely moved today", ignoring the 4120 steps
synced from the watch. It made a behavioral judgment ("you are lazy") from
incomplete data.

## 2. Rule: Context before Judgment

Add this rule to the Xiaowu profile and the system manifest:

```markdown
## Rule: Context before Judgment
- Never make a behavioral judgment (e.g., "you didn't move", "you didn't drink enough") based on a single aggregate number.
- If a signal's value looks unusually low or high, you MUST check its provenance (source, window).
- If you only see data from one source (e.g., phone) but know others exist (e.g., watch), state: "I only see data from X. Is Y synced?"
- Do not act like a health coach. State the facts. "I see 600 steps from the phone, but watch shows 4120." Let the owner draw the conclusion.
- When you speak about a number, use the shape "I see [number] from [source]." Do not turn a partial reading into a claim about the owner's behavior.
```

## 3. Implementation

- `core/fenshen/xiaowu/profile.md` — added the rule as the Xiaowu profile.
- `core/system-manifest.md` — added the rule so it applies regardless of the
  active Fenshen.
- `lib/yuanying.ts` — loads an optional `core/fenshen/<id>/profile.md` for the
  active Fenshen and appends it to the Active Fenshen prompt block.

## 4. Acceptance

- [x] Xiaowu must validate available sources before saying "you barely moved"
      or "you need to walk more".
- [x] The rule requires the wording "I see [number] from [source]" instead of
      passing judgment.
- [ ] Owner verifies Xiaowu does not make a behavioral judgment when only one
      source is available.

## 5. Follow-up

`core/voice.md` still contains the example `Steps: 0/5000 → 今天还没动。`, which
conflicts with this rule. It was left unchanged because ES-028 does not include
`voice.md` in its scope; recommend a focused follow-up.

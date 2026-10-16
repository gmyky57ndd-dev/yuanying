# ES-011 — 元婴 Self-Diagnostic Response

**Status**: Approved
**Category**: Bug (voice) + Feature (provenance)
**Depends on**: ES-007 §3
**Tracking**: P1-36

---

## 1. Problem

When the owner reports a discrepancy (steps 0 vs Fit 900), 元婴 responds:

- "我没办法直接查同步——我看不到 Fit 那边的数据"
- "你确认一下 Fit 里的步数具体是多少"
- "要我看哪一步?"

Three failures:
1. Did not query its own data first
2. Pushed diagnostics onto the owner
3. Ended with a menu instead of a direction

---

## 2. Rule — query own data before asking owner

Before asking the owner to check anything, 元婴 must:

1. **Query its own signals.** What does it actually have? Values,
   timestamps, sources.
2. **State what it sees.** "我收到的 steps 是 2700，最近一条 [时间]，
   来源 [来源]."
3. **State what it cannot see.** "我看不到 Fit 的内部数据。"
4. **Propose one direction.** Not a menu.

**Voice rule — add to `core/voice.md`:**

```markdown
## When something is wrong

Before asking the owner to do anything:
1. Query your own data. What do you have? Values, timestamps, sources.
2. State what you see.
3. State what you cannot see.
4. Propose one specific direction.

Never:
- Ask the owner to check something you could check yourself
- List generic troubleshooting steps
- End with "要我看哪一步?" — pick one
```

---

## 3. Provenance — collector must log enough for 元婴 to reason

**Rule for all signals (add to AGENTS.md §5.1):**
Every signal the collector sends includes enough metadata for 元婴 to
explain it to the owner: value, source, window, and (where relevant)
aggregation mode.

**Applied to steps:**
the `signals` row for steps must include in `context`:

- `source`: which HealthConnect source (`"fit" | "watch" | "phone" | "merged"`)
- `window_start`, `window_end`
- `aggregation`: `"sum" | "max" | "latest"`
- `raw_value` (before aggregation, if aggregating)

The diagnostic for P1-23 will confirm which of these is currently missing.

---

## 4. Response template

```
[State what I see]
  "我这边收到的 steps 是 2700，来源 [X]，时间 [Y]。"

[State what I cannot see]
  "我看不到 Fit 的原始数据。"

[Propose one direction]
  "可能是 HealthConnect 读的数据源不对。要看我这边的源列表吗?"
```

Not:
- Not a numbered menu
- Not "你确认一下..."
- Not "要我帮你看哪一步?"

---

## 5. Acceptance

- [ ] `core/voice.md` has "When something is wrong" section
- [ ] Collector logs `source`, `window_start`, `window_end`,
      `aggregation` in steps signal context
- [ ] When owner reports a discrepancy, 元婴 queries signals first
- [ ] Response follows §4 template
- [ ] No menu-style responses for diagnostic questions

## 6. Tracking

```markdown
### [P1-36] 元婴 self-diagnostic response
- Status: To Do
- Category: Bug (voice) + Feature (provenance)
- Refs: ES-011
```

**End of ES-011.**

# ES-039 — Daily Summary Tone Enforcement

**Status**: Approved
**Category**: Prompt/Backend
**Tracking**: P2-23
**Refs**: ES-019, ES-027

## 1. Problem

Xiaowu's `ground-rules.md` now says the daily summary should be one or two
human sentences, with numbers only as background, and no unsolicited health
advice. The summary prompt still allowed the old list-shaped output, so the
model could keep emitting dry data lists.

## 2. Fix

Enforce these rules in the daily-summary prompt (exported by
`lib/summary-generator.ts`, injected by `lib/yuanying.ts`):

```markdown
## 强制规则：每日总结 (Daily Summary)
- 必须以一两句“人话”开头，总结昨天的精神或生活状态。
- 数字（步数、水、睡眠时间）只能作为背景穿插在句子中，绝对不能使用带点号的列表（- 喝水：4/6）。
- 不给任何未经请求的健康建议（如“多喝水”、“早点睡”）。
- 先读 notes，notes 是主体；数字是背景。
- 例子："昨天你状态不错，做了不少园艺，还写了关于反馈链路的笔记。水喝得刚好，步数也达标了。"
```

Also keep the ES-027 rules: meaning over QA logs, "we"/"I", draft then ask to
save.

## 3. Implementation

- `lib/summary-generator.ts` — `SUMMARY_TONE_RULES` now includes the ES-039
  enforcement block.
- `lib/yuanying.ts` — injects the rules into `## Daily Summaries`.
- The rules are prompt-level. The existing note/conversation priority is
  unchanged.

## 4. Acceptance

- [x] A daily-summary request does not return a Markdown bullet list.
- [x] Notes are mentioned before numbers.
- [x] Tone is Xiaowu: calm, warm, concise.
- [x] No unsolicited health advice.
- [ ] Production spot-check after deploy.

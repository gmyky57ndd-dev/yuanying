# ES-071 — `add_note` Tool for Seamless Memory Capture

- **Status:** Approved (2026-10-27). **Tracking:** P2-51. Refs: ES-053, ES-002.
- **Problem:** 元婴 could write `core/` files but not the daily note stream, so after
  summarising a day the owner had to copy the text into 记一笔 manually.

## 1. Tool contract

```ts
add_note(content: string) => {
  success: boolean;
  data?: { id: number; date: string; text: string };
  error?: string;
}
```

- **INSERT only.** There is no update or delete path, and none is exposed to the
  model. A wrong note can only be superseded by a new note (AGENTS §3).
- `content` is trimmed, required, and capped at **2000 characters** (same as the
  manual note API).
- Stored as `signals(name='note', type='note')` with:
  - `value = { text, tags: [], feedbackSuggested: false, authored_by: 'yuanying' }`
  - `source = 'yuanying_summary'`
  - `context = { source: 'yuanying_summary', via: 'add_note' }`
- The source marker lets the UI and future queries separate AI-authored notes from
  the owner's own 记一笔 entries.

## 2. Trigger

The prompt instructs 元婴: when the owner says 记下来 / 存进今天的笔记 / 把这段总结
记下来, call `add_note`; never claim a note was saved without the tool result.
Summaries (ES-039/ES-065/ES-074) end by asking whether to keep them — "yes" maps to
this tool.

## 3. Direct execution (reliability)

The model does not reliably choose the tool, so an explicit request ("记进笔记",
"记下来", "存进今天的笔记") is executed **server-side** before generation:
the quoted text (or the previous assistant message when the owner says 这段/刚才)
is inserted, and the model is told the note id so it only confirms.
Duplicates are suppressed twice: a 10 s identical-text check in the tool, and a
same-turn guard that returns the already-saved id when the model also calls the
tool.

## 4. UI

After every chat reply the PWA refreshes `loadNotes()` and `loadSignals()`, so a note
appended by the tool appears in the 今天 timeline immediately (no reload).

## 5. Acceptance

- [x] 元婴 appends a note; the row carries `source='yuanying_summary'` and
      `context.via='add_note'` (production, note 1863).
- [x] The PWA refreshes notes + signals after every reply (timeline updates).
- [x] No update/delete path is exposed; only INSERT.
- [x] >2000 chars returns `success:false` (`note too long`).

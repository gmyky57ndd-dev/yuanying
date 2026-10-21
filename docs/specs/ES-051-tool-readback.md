# ES-051 — Config-Driven Tool Readback (Silent Mode)

**Status**: Approved
**Category**: Feature (Agent Config)
**Tracking**: P3-04
**Refs**: ES-050, ES-044

## 1. Problem

Even with prompt instructions, the model tends to read back raw tool JSON or
long document text. We need a stored configuration switch and backend
enforcement, not model self-restraint.

## 2. Configuration

- New config row: `tool_readback_enabled = false` (migration 021).
- Settings → **详细工具输出 (Verbose Tool Output)** toggle.
- Default **off**: silent mode.

## 3. Backend behavior

- `app/api/chat/route.ts` reads `tool_readback_enabled`.
- Silent mode (`false`):
  - `push_to_dev` → `{success,status,issue_number,url}` (or queued job).
  - `get_notes` → count + short titles, no full note text.
  - `get_conversation_records` → count + titles.
  - `get_summary` → compact numbers only.
  - `get_drive_doc` → note id/file id/title/format/meta, no content.
  - `get_issue` → number/title/state/labels/url/comment count, no body.
  - `web_search` → title + URL only, no snippets.
  - `read_markdown` → path/truncated/total chars, no text.
  - Prompt: “当前处于静默模式。只汇报结论，不要解释过程，不要复述原始 JSON 或长文本。”
- Verbose mode (`true`):
  - Full tool result, but hard-capped at **800 characters** with
    `… [内容已截断]` and `meta.truncated`.
- This normalization is implemented in `lib/tool-result.ts` and unit-tested.

## 4. Frontend

- Assistant messages longer than **150 characters** or **4 lines** collapse by
  default with **展开全文** / **收起**.

## 5. Acceptance

- [x] Config default false.
- [x] Settings toggle persists.
- [x] Silent mode returns normalized summaries.
- [x] Verbose mode truncates >800 chars with a marker.
- [x] Long assistant messages collapse.
- [ ] Owner verifies a real push_to_dev reply is concise, then enables verbose
      and confirms the detailed result appears.

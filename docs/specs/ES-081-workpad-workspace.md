# ES-081 — Workpad: From Chatroom to True Workspace

- **Status:** Done (2026-11-11, merged #98; on-device visual check pending). **Tracking:** P2-64.
- **Numbering:** the morning-plan task moved from ES-081 to **ES-085**.

## 1. Diagnosis

A Workpad was a chatroom: every turn started blank, and a promised multi-step
task was forgotten by the next turn.

## 2. Implementation

### 2.1 Project onboarding

- `project_docs` (already exists) holds `ONBOARDING.md`; the Workpad prompt
  injects the first 2,000 chars of it on **every** turn.
- Open GitHub issues for the project (`label:project:<id>`) are summarised in
  the prompt.

### 2.2 Action ledger

- `workpad_actions(id, project_id, description, status, result_ref, …)`.
- Tool `plan_actions(project_id, actions[])` inserts `pending` rows.
- Tool `complete_action(id, status, result_ref?)` closes a row.
- Turn interception: pending/in-progress rows are injected as
  「未完成动作 … 请继续执行下一项」 so “继续” resumes the list.

### 2.3 Anti-cutoff

- `AGENTS.md` §4.10: >500 chars → `write_local_file` first, then a summary;
  unfinished text ends with `…续`.
- UI folds long assistant messages (展开全文).
- `finishReason=length` is persisted as `metadata.truncated`; the UI offers
  「一键续写」 which sends `[continue]`.
- Backend treats `[continue]` as “continue the previous reply”, with a 3,000
  token budget.

### 2.4 Aggregate status

- Tool `get_project_status(project_id)` returns documents, actions, open goals
  and open GitHub issues in one call.

## 3. Acceptance

- [x] PM enters BWP and the first answer already knows what BWP is (onboarding
      injected, no manual PRD feed). Evidence: `[workpad] bwp onboarding=424`,
      reply = “BWP 是给 1–25 人小团队的数字资产操作系统…”.
- [x] “把这三件事做了” → `plan_actions` inserted 4 pending rows (the model split
      the first item into “read V3 + onboarding”).
- [x] “继续” → pending list injected; the PM executed the list and marked all
      four rows `done`.
- [x] Long output is not silently cut off: 1,472 chars ended mid-sentence with
      `finishReason=length` → `metadata.truncated=true`; `[continue]` resumed at
      the breakpoint (“中间位置也危险…”).

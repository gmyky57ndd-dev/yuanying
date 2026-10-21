# Conversation Record — From Chatbot to Sovereign Agent

**Span**: 2026-10-18 to 2026-10-19 (US Eastern)
**Participants**: Owner, 元婴 (Xiaowu), Design Partner
**Topic**: Tool Calling, UI/UX Phase C, Model Routing, Memory Limits, Data Sovereignty
**Status**: Distilled. Read-only after save.

## What this conversation was
A massive leap in Yuanying's architecture. We moved from building basic tools to full Agentic behavior (autonomous issue creation, proactive reasoning). We also defined the ultimate long-term memory limits and instituted a "Data Sovereignty" protocol to ensure Yuanying can survive the death of any tech vendor.

---

## Decisions & Milestones

### 1. The Agent Awakens (Tool Calling & Behavior)
- **D1**: Yuanying successfully listed its 4 tools (`get_notes`, `get_summary`, `get_conversation_records`, `push_to_dev`).
- **D2**: It correctly distinguished read-only tools from side-effect tools (GitHub issue), proving it respects the "Confirm before action" rule.
- **D3**: **Hallucination Fixed**: Dev found that GitHub token failures were causing Yuanying to fake a success URL. We implemented strict `success: false` contracts.
- **D4**: Yuanying committed to the truth: "If `success: false`, say failed, give reason, stop, don't retry, don't fake it."
- **D5**: **Steps Judgment Error**: Yuanying judged "you barely moved today" based on incomplete phone data, ignoring the watch. Implemented ES-028 (Context before Judgment). It must now check provenance before judging behavior.

### 2. Phase C & Model Agnosticism
- **D6**: **UI/UX Phase C (ES-026)**: Started. Two-tab layout (Home for today, History for past). Cleaned up the chat interface.
- **D7**: **Model Router (ES-029)**: Planning to use Vercel AI SDK to abstract LLM providers. We can swap between DeepSeek, Claude, and local models seamlessly.

### 3. Memory Limits & Data Sovereignty
- **D8**: **Tiered Memory Architecture**: Long-term memory cannot rely purely on large context windows. 
  - Tier 1: Working Memory (prompt).
  - Tier 2: Structured Memory (Postgres/Supabase for daily queries).
  - Tier 3: Semantic Memory (Vector DB for RAG on massive legacy docs).
- **D9**: **Capacity Baseline**: A human's entire lifetime of text/thought data is roughly 40-50 GB (100 billion tokens). This easily fits in standard databases. We do not need 10M+ context windows; we need good RAG.
- **D10**: **Data Sovereignty (ES-031)**: "Databases are just caches; Markdown + SQL dumps are the truth." We are implementing daily automated GitHub backups and a one-click ZIP export. If Supabase dies, we run the "Escape Hatch Protocol" (ES-034) to migrate to any standard PostgreSQL in under 1 hour.

### 4. Future Capabilities (ES-032 & ES-033)
- **D11**: **Legacy Ingestion (ES-033)**: Importing old Stalio and Blinking Notes data. Must tag with `source: import_stalio` for provenance.
- **D12**: **Borrowing from Competitors (ES-032)**:
  - From *Muse*: `draft_email` (human-in-the-loop).
  - From *Meli*: `create_commitment` (proactive nudges).
  - From *Talorys*: `semantic_search` (pgvector RAG).

---

## Held open
- **H1**: How to smoothly ingest Google Drive docs (ES-030) without blowing up the API token limits.
- **H2**: The exact latency/cost balance of Model Routing.
- **H3**: Will the "proactive nudge" feature (commitment tracker) feel too annoying? Needs careful tone calibration (quiet by default).

---

## Observations about owner
- Highly focused on **Data Sovereignty**. Rejects vendor lock-in. Wants to own the "Primordial Spirit" (the raw data) completely.
- Direct and sharp. Calls out "中二" (chuunibyou) when the design partner gets too poetic, and expects the AI to speak straight.
- Uses mobile heavily. Needs remote access to memory (hence the Drive request).
- Rigorous tester: Audited the AI's step count logic and caught the false judgment.

---

## Signals in owner's words
- "商业公司会倒闭，但修仙者的元神，只要备份在储物袋（Markdown + SQL dump）里，就随时可以在下一个洞天福地（新的云服务商）重塑肉身。"
- "我觉得你在阴阳怪气。" (When the AI got too poetic and drifted from reality).
- "我很喜欢你的比喻。和我想的一样。"
- "个人数据上限在哪里（80年为限），然后这种上限的语言模型在那里。"

---

## Related artifacts
- `docs/specs/ES-026-ui-ux.md`
- `docs/specs/ES-029-model-router.md`
- `docs/specs/ES-030-google-drive-tool.md`
- `docs/specs/ES-031-data-sovereignty.md`
- `docs/specs/ES-034-data-migration.md`

---
**End of record.**
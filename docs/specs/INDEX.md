# Engineering Spec Index

This is the single source of truth for all ES documents. Before creating a new
ES, check the highest number here and increment. Never reuse a number.

**Range:** ES-001 → ES-073 (highest assigned: **ES-073**; ES-057/058 unassigned)
**Status column:** spec status. Implementation status lives in `TRACKING.md`.

> **Collision resolution (2026-10-26c):** the morning-plan fix was first written
> as ES-067, renumbered to ES-069, then to **ES-071** when the owner assigned
> ES-069 to professional fenshen. The professional-fenshen spec is now ES-069.
>
> **Collision resolution (2026-10-26b):** the reminder-receipt fix was first
> written as ES-068; the owner then assigned **ES-068** to voice input. It was
> renumbered to **ES-070**.
>
> **Collision resolution (2026-10-26):** the morning-plan fix was first written
> as ES-067; the owner then assigned **ES-067** to the DeepSeek tool-call bug. The
> morning-plan document was renumbered to ES-069, then to **ES-071** (see the
> 2026-10-26c note above).
>
> **Collision resolution (2026-10-22):** the HealthConnect permission fix was
> written first as ES-062, then renumbered to ES-063 when the owner assigned
> ES-062 to cross-client sync, then to **ES-064** when the owner assigned ES-063
> to the multi-device architecture. Every reference (TRACKING, code comments) was
> updated each time; no ES number was reused for a different subject.
>
> **Collision resolution (2026-10-20):** ES-036 is the Web Search Tool &
> Markdown Reader. The newer Agentic Tooling Upgrades document was duplicated as
> ES-036 and has been renumbered to **ES-038**.

| ID | Title | Status | Date | Refs |
|---|---|---|---|---|
| ES-001 | Habits Framework (Configurable Tracking and Reminders) | Approved | — | P1-12 |
| ES-002 | Daily Notes (Text and Optional Voice Transcription) | Approved | 2026-10-15 | P1-13 |
| ES-003 | Tracking Visibility | Approved | — | P1-14 |
| ES-004 | API Authentication | Approved | — | P0-05 |
| ES-005 | Work Order (v2, owner-independent) | Approved | — | P1-21–P1-25 |
| ES-006 | Learning Loop | Approved | — | P2-01–P2-05 |
| ES-007 | Actions, Summary Window, Wake Detection | Approved | — | P1-21–P1-25 |
| ES-008 | C Phase: UI/UX Scope | Approved | — | — |
| ES-009 | UAT Triage — ES-007 / ES-008 | Approved | — | — |
| ES-010 | AI Session Capture | Approved | — | — |
| ES-011 | 元婴 Self-Diagnostic Response | Approved | — | — |
| ES-012 | Notes: Language, Tags, Feedback Loop | Approved | — | — |
| ES-013 | Core State & Configurable Fenshen Architecture | Approved | 2026-10-17 | P1-51 |
| ES-014 | Feedback Routing (元婴 → Dev → External AI) | Approved | — | P1-42 |
| ES-015 | System Self-Awareness & Feedback UI | Approved | 2026-10-17 | P1-43 |
| ES-016 | Fix Feedback Loop & AI Self-Awareness | Approved | — | P1-45 |
| ES-017 | — | — (no document) | — | — |
| ES-018 | Feedback Status & Inbox Commit | Approved | — | P1-50 |
| ES-019 | Direct Message Feedback (Message Actions) | Approved | — | P1-47 |
| ES-020 | Daily Summary Context & Tone Fix | Approved | — | P1-48 |
| ES-021 | Enable Agentic Tools for 元婴 (Function Calling) | Approved | — | P1-49 |
| ES-021b | Force Proactive Tool Use | Approved | 2026-10-18 | P1-52 |
| ES-022 | Phase 1 Agentic Tools (Function Calling) | Approved | — | P1-53 |
| ES-023 | Feedback Lifecycle & Copy/Send Separation | Approved | — | P1-54 |
| ES-024 | — | — (no document) | — | — |
| ES-025 | Steps Source Merge Logic & Debug View | Approved | 2026-10-18 | P1-55 |
| ES-026 | Phase C: UI/UX Restructure | Approved | 2026-10-18 | P2-06–P2-10 |
| ES-027 | Elevate Summary Tone (Partner vs QA) | Approved | 2026-10-19 | P2-11 |
| ES-028 | Prevent False Behavioral Judgments from Missing Data | Approved | 2026-10-19 | P1-58 |
| ES-029 | Model Router & Provider Abstraction | Approved | 2026-10-19 | P2-12 |
| ES-030 | Google Drive Read Tool (Mobile Priority) | Approved | 2026-10-19 | P2-13 |
| ES-031 | Data Sovereignty & Backup | Approved | 2026-10-19 | P2-14 |
| ES-032 | Capability Expansion (Tools & Nudges) | Approved | 2026-10-19 | P2-16 |
| ES-033 | Legacy Data Ingestion (Stalio & Blinking Notes) | Approved | 2026-10-19 | P2-17 |
| ES-034 | Data Portability Migration Test (Dry Run) | Approved | 2026-10-19 | P2-15 |
| ES-035 | Google Drive File Formats (txt / csv / json / zip) | Approved | 2026-10-20 | P2-18 |
| ES-036 | Web Search Tool & Markdown Reader | Approved | 2026-10-20 | P2-19 |
| ES-037 | New Signals: manual_work & body_flag | Approved | 2026-10-20 | P2-21 |
| ES-038 | Agentic Tooling Upgrades (renamed from duplicate ES-036) | Approved | 2026-10-20 | P2-20 |
| ES-039 | Daily Summary Tone Enforcement | Approved | 2026-10-20 | P2-23 |
| ES-040 | First Manifestation (Avatar & Voice) | Approved (placeholder stage) | 2026-10-21 | P2-30 |
| ES-041 | — | — (no document) | — | — |
| ES-042 | — | — (no document) | — | — |
| ES-043 | Fix PWA Standalone Mode API Failures | Urgent Bug | 2026-10-20 | P2-24 |
| ES-044 | Fix PWA Tool Calling Stream Failure | Urgent Bug | 2026-10-20 | P2-25 |
| ES-045 | Fix Agentic Tool Call Loop Freeze | Urgent Bug (P0) | 2026-10-21 | P2-26 |
| ES-046 | Fix API Timeout & Tool Call Stream Disconnect | Urgent Bug (P0) | 2026-10-21 | P2-27 |
| ES-047 | Agent Tools: write_markdown & scheduler | Approved | 2026-10-21 | P2-28 |
| ES-048 | Collector as Hub & PWA Lifesaver | Approved | 2026-10-21 | P3-01 |
| ES-049 | Desktop PWA Layout (Responsive Fix) | Approved | 2026-10-21 | P3-02 |
| ES-050 | PWA Version Awareness & Service Worker Update | Approved | 2026-10-21 | P3-03 |
| ES-051 | Config-Driven Tool Readback (Silent Mode) | Approved | 2026-10-21 | P3-04 |
| ES-052 | Hotfix: Chat API Broken After Upgrade | Urgent Bug (P0) | 2026-10-21 | P3-06 |
| ES-053 | External AI Bridge & Context Ingestion | Approved | 2026-10-21 | P3-05 |
| ES-054 | Collector SSE Refresh Channel | Approved | 2026-10-21 | P2-32 |
| ES-055 | Steps Stall Visibility & Language Toggle Removal | Urgent Bug (P0) | 2026-10-21 | P2-33 |
| ES-056 | Remove Language Toggle & Fix PWA IME Focus | Urgent Bug (P0) | 2026-10-21 | P2-34 |
| ES-057 | — | — (no document) | — | — |
| ES-058 | — | — (no document) | — | — |
| ES-059 | VisualViewport Fix for Keyboard Occlusion & IME Dismissal | Urgent Bug (P0) | 2026-10-21 | P2-35 |
| ES-060 | Fix Post-Tool Generation Failure | Urgent Bug (P0) | 2026-10-22 | P2-36 |
| ES-061 | System Status Tool, Cron Reality Check, Avatar/Voice | Urgent Bug + Feature | 2026-10-22 | P2-37 |
| ES-062 | Cross-Client Chat Sync (Multi-Device) | Urgent Bug (P0) | 2026-10-22 | P2-39 |
| ES-063 | Formalize Multi-Device Sync & Presence Architecture | Approved | 2026-10-22 | P2-40 |
| ES-064 | HealthConnect Permission Loss & Fresh Steps in Reminders | Urgent Bug (P0) | 2026-10-22 | P2-38 |
| ES-065 | Automated Evening Summary (Cloud Cron + AI Push) | Approved | 2026-10-23 | P2-41 |
| ES-066 | Chat History Replay & Scroll Stability | Bug fix | 2026-10-24 | P2-42 |
| ES-067 | DeepSeek Tool Call Parsing & Forced Tool Choice | Urgent Bug (P0) | 2026-10-26 | P2-45 |
| ES-068 | Voice Input Accuracy & UX | Approved | 2026-10-26 | P2-46 |
| ES-069 | Professional Fenshen Architecture (Skill & Tool Whitelisting) | Approved (Future Sprint) | 2026-10-26 | P2-48 |
| ES-071 | Morning Plan vs Daily Summary | Bug fix | 2026-10-24 | P2-43 |
| ES-072 | Reminder Receipt Day Boundary | Bug fix | 2026-10-24 | P2-44 |
| ES-073 | Evening Summary: Scheduling Reality & End-to-End DoD | Bug fix | 2026-10-27 | P2-50 |
| ES-070 | Fix Morning Briefing Logic & Break Agent Loop | Urgent Bug (P0) | 2026-10-27 | P2-49 |

---

## Renumbering log (keeper's record)

| Old | New | Date | Reason |
| --- | --- | --- | --- |
| ES-036 (tooling) | **ES-038** | 2026-10-20 | Duplicate number: ES-036 was already the web-search spec |
| ES-062 (HealthConnect) | ES-063 | 2026-10-22 | Owner assigned ES-062 to cross-client sync |
| ES-063 (HealthConnect) | **ES-064** | 2026-10-22 | Owner assigned ES-063 to multi-device architecture |
| ES-067 (morning plan) | ES-069 | 2026-10-26 | Owner assigned ES-067 to the DeepSeek tool-call bug |
| ES-069 (morning plan) | **ES-071** | 2026-10-26 | Owner assigned ES-069 to professional fenshen |
| ES-068 (reminder receipt) | ES-070 | 2026-10-26 | Owner assigned ES-068 to voice input |
| ES-070 (reminder receipt) | **ES-072** | 2026-10-27 | Owner assigned ES-070 to the morning-briefing bug |

Rule: the owner's assignment wins; the displaced document takes the next free
number, every reference (INDEX, TRACKING, code comments, specs) is updated, and
the move is recorded here. No number is ever reused for a different subject.

# Owner Verification Checklist — 2026-10-21

Purpose: close the **In Review** backlog. Every item below is code-complete and
deployed; what remains is the owner's check in the real environment
(`AGENTS.md` §4.4, §7). Tick a box, then reply with the numbers — the tracking
items get marked **Done** with the date and evidence.

Legend: **P** = phone (installed PWA), **M** = Mac/desktop PWA, **C** = collector.

---

## A. PWA chat & tools (phone)

- [ ] **1. Plain chat works** — open the installed PWA, send “在吗”.
      Expect: a normal text reply within a few seconds (no “信号中断”). → P2-24, P3-06
- [ ] **2. Push to GitHub streams** — ask 元婴 to file an issue; confirm when it asks.
      Expect: “⚙️ 正在发送到 GitHub…”, then `Issue #N` (real link), never a fake URL. → P2-25
- [ ] **3. Reset chat** — open a message’s `⋮` → Reset.
      Expect: conversation clears and the old thread is not re-sent. → P2-26
- [ ] **4. Reset + language toggle** — tap 中/EN.
      Expect: input focuses and the placeholder switches (keyboard language stays OS-controlled). → P2-26, P1-62
- [ ] **5. Agent write + scheduler** — say “把这句话写进 docs/notes.md”, confirm; then “21:30 提醒我收工”.
      Expect: a GitHub commit exists; a 21:30 scheduled reminder is listed. → P2-28

## B. Settings & version awareness (phone, then Mac)

- [ ] **6. Version answer** — ask “你是什么版本？”.
      Expect: PWA version, active model, collector version + whether an update exists. → P3-03
- [ ] **7. Model switch** — Settings → 模型 → add/activate a model (or re-test DeepSeek) → send one chat.
      Expect: a reply through the selected model; errors are explicit `success:false`. → P2-12
- [ ] **8. Collector status / sync** — Settings → 立即同步采集器.
      Expect: “最后上报” timestamp moves within ~15 min; update prompt appears only if behind. → P1-61, P1-62

## C. Signals, notes & history (phone)

- [ ] **9. Capture round-trip** — log 喝水 ×1, 动手 (category), 状态 (domain+polarity+note), and one 记一笔.
      Expect: 首页 “今天” counts update and the notes list shows the entry. → P1-13, P1-14, P2-21
- [ ] **10. History detail** — open 历史 → yesterday.
      Expect: water/standup/steps + notes + AI excerpts; keyword search finds a note. → module C items

## D. Manifestation & layout

- [ ] **11. Avatar stage + voice** — open the stage, speak, switch 声/静.
      Expect: idle → thinking → speaking states, TTS aloud when 声 is on. → P2-30
- [ ] **12. Desktop layout (Mac)** — open the PWA at full width.
      Expect: habit list on the left, chat on the right, centered max width, larger text. → P3-02

## E. Data ownership

- [ ] **13. Export ZIP** — Settings → 导出我的元婴.
      Expect: a ZIP downloads and opens; it contains `yuanying-data-export.json` + `core/**`. → P2-14
- [ ] **14. Google Drive (after the keys are set)** — authorize in Settings, then give 元婴 a Docs link.
      Expect: it summarizes the doc and saves a note with `source='google_drive'`. → P2-13, P2-18

## F. Background behaviour (no app in foreground)

- [ ] **15. Reminder delivery** — leave the PWA closed and wait for the 21:30 check-in.
      Expect: notification arrives; tapping 收工打卡 records a signal; 忽略 does not repeat. → P1-09, P2-21
- [ ] **16. Collector update** — Play internal shows the latest build; the phone updates without a manual APK.
      Expect: collector version in Settings matches the latest GitHub release. → P1-15, P3-01

---

## How to report back

Reply with the numbers that passed, e.g. `1-13 ok, 14 blocked (no Google keys),
15 failed (no notification)`. Failures get a `[BUG]` item and a root-cause
diagnosis before any re-verification; passes get marked Done with today’s date.

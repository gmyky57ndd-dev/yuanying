PM Feedback — 2026-10-14  
  
**Session**: Ad-hoc chat review of v1.0.8 collector + v1 PWA  
**Participants**: Owner (PM), 元婴 (AI)  
**Context**: Post-deploy review, second day of daily use  
**Status**: Decisions frozen  
**Learning-loop role**: Capture (owner signals about product direction)  
  
---  
  
## 1. Session trigger  
  
Owner reviewed the deployed PWA and collector after ~24 hours of use.  
Feedback surfaced during review of:  
- Screenshot 1: PWA home with chat summary bubble  
- Screenshot 2: PWA settings page with reminder toggles  
  
---  
  
## 2. Observations from owner  
  
### 2.1 UX  
  
- The interface is confusing and lacks aesthetics.  
- *Owner reasoning*: this is day 2 of the product. Aesthetic polish is premature.  
- *Owner decision*: defer major UX overhaul to Phase v2 (avatar + config phase).  
- *What is NOT deferred*: the specific confusion between "what is tracked" and "what has a reminder." That gap must be closed now.  
  
### 2.2 Habits / tracking  
  
- Do not copy Stelio's implementation or feature surface.  
- Do not build Stelio parity.  
- Do borrow Stelio's **loop / type / pattern** as the minimum needed for growth and learning.  
- Add reminder frequency support (per-day intervals), not only fixed times.  
  - Examples given: "standup every 90 minutes", "water every hour".  
  - These are illustrative, not mandatory defaults.  
- The collector must be configurable so that adding or editing tracking items does **not** require code change or deploy.  
  
### 2.3 Daily notes  
  
- Add a "记一笔" button — same idea as Blink's notes.  
- Owner's daily notes (text and voice) should be saved and analyzed alongside activity data.  
- v1: text only. No audio file storage. Voice is transcribed at input time.  
  
### 2.4 Data consistency  
  
- Owner noticed: buttons showed `wake` active and `water ×1`, while the summary bubble reported `起床: 未记录` and `喝水: 0/6`.  
- Two sources, two answers. One is wrong.  
- Must be resolved before any UX work on home screen.  
  
### 2.5 Voice behavior  
  
- 元婴 stated: *"昨晚 00:33 到 02:38 有一串 app_usage。十九次。没睡。"*  
- Owner flagged this as diagnosis, not observation.  
- Violates learning-loop step 3 (propose, don't conclude).  
  
---  
  
## 3. Decisions  
  
| # | Decision | Rationale |  
|---|---|---|  
| D1 | UX overhaul deferred to Phase v2 (avatar + config) | Too early; grows with the product |  
| D2 | Fix tracking-vs-reminder visibility now | Specific, high-value confusion |  
| D3 | Configurable habits table (minimal), no Stelio parity | Enable growth without over-engineering |  
| D4 | Reminder rules support both fixed times and per-day intervals | Matches real user rhythm |  
| D5 | No deploy required to add/edit a habit | Collector reads from server config |  
| D6 | Daily notes v1 = text only, voice transcribed at input | Privacy + simplicity |  
| D7 | Notes are signals, analyzed with other activity | Integrate into summary |  
| D8 | Button/summary inconsistency is a bug, P0 | Trust + correctness |  
| D9 | 元婴 voice must observe, not diagnose | §2.4 learning-loop compliance |  
  
---  
  
## 4. Deferred (explicitly, so nobody wonders)  
  
- Full visual redesign → Phase v2  
- Avatar animation → Phase v2  
- Configurable theming → Phase v2  
- Onboarding flow → Phase v2  
- Audio file storage → not planned  
- Stelio feature parity → not planned  
- Streaks, calendars, statistics UI → not planned for v1  
  
Deferred items are recorded here so they don't get re-proposed. If the owner wants to revisit, they open a new PM doc.  
  
---  
  
## 5. Signals to the 元婴 (learning-loop input)  
  
These are not decisions about the product. They are signals about **the owner**. The 元婴 should be able to read PM docs and learn.  
  
- Owner prefers *shape* over *implementation* when borrowing ideas. ("Borrow the pattern, not the code.")  
- Owner defers aesthetic work when the underlying behavior is still unsettled.  
- Owner distinguishes "the product is incomplete" from "the product is on day 2" — patience for growth is a stated value.  
- Owner notices when the 元婴 skips its own rules. The 元婴 should expect this kind of scrutiny and hold itself to the same standard.  
- Owner uses screenshots + short prose as their natural feedback format. PM docs should fit that rhythm, not fight it.  
  
---  
  
## 6. Produced artifacts  
  
| Artifact | Path | Purpose |  
|---|---|---|  
| ES-001 Habits framework | `docs/specs/ES-001-habits-framework.md` | Engineering spec for configurable habits |  
| ES-002 Daily notes | `docs/specs/ES-002-daily-notes.md` | Engineering spec for notes |  
| ES-003 Tracking visibility | `docs/specs/ES-003-tracking-visibility.md` | Engineering spec for tracking/reminder panel |  
| Tracking updates | `TRACKING.md` | P1-12, P1-13, P1-14, B-17, B-18 |  
  
---  
  
## 7. Follow-ups  
  
- Owner reviews ES-001/002/003  
- Tech lead assigns B-17 (button/summary consistency) as first PR  
- Tech lead updates `core/voice.md` for B-18 (observe, don't diagnose)  
- Next PM session: after ES-001/002/003 land or after Phase v2 begins  
  
---  
  
**End of PM doc.**  

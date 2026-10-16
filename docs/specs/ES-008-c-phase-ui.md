# ES-008 — C Phase: UI/UX Scope

**Status**: Approved (spec locked; implementation starts tomorrow)
**Category**: Feature (UI)
**Depends on**: ES-007
**Tracking**: P1-26 through P1-29

---

## 1. Purpose

C is the experience upgrade. Structure, not aesthetics. Aesthetic polish
is a second C pass.

Two surfaces on mobile:
1. **Home** — today only
2. **History** — everything else, on demand

No third tab. No settings inside home. No dashboards.

---

## 1.6 Principle — no new capture surfaces

Every new input UI is a place the owner can abandon. The 元婴 must not
accumulate capture surfaces (notes app, habit app, journal, tags,
categories). Friction is the primary cause of abandonment in single-user
tools.

**Rule**: input rides on existing surfaces — chat, a single button, or
voice. A new surface is justified only when no existing surface can
carry the input, and the justification must be written into the spec.

**Applied to ES-008**:
- Note-taking rides on the existing "记一笔" button. No new app, no new
  tab for notes alone.
- History is a tab within the same surface, not a separate product.
- No user-facing categorization. See §2.3.

---

## 2.1 Home — today only

The main screen shows:

1. **Today's activities** — a vertical list, live and tappable
   - wake, sleep, water (with count), steps, vitamins
   - Each row tappable: tap water → +1, tap vitamin → log
   - The "今天/昨天" panel from ES-007 §1 is the header
   - Reminders integrated, not separate

2. **Conversation with 元婴** — the chat
   - Today's only
   - Yesterday's scrolls off, retrievable in History

**Layout**:
- Activities pinned at top (2-3 rows visible)
- Chat fills the rest
- "记一笔" button always accessible (floating or header)

**No**:
- Historical data on home
- Settings on home (moved to a menu)
- Charts, statistics, streaks

---

## 2.2 History — everything else

Second tab. List of days, newest first.

- Tap a day → full view:
  - All signals with timestamps
  - All notes with text
  - Reminders fired + responses
  - Conversation log for that day
  - Summary in prose
- Search: by date, by keyword (in notes)

**Cloud-first**:
- Home shows only today
- History loads on demand from Supabase
- Nothing cached on phone except current view

---

## 2.3 Notes — user writes free text, 元婴 derives structure

The owner is working on multiple projects, has many favorite things to
do, and many random thoughts. The temptation is to add `project` and
`kind` fields. Resist it.

**Rule**: the user writes free text. The 元婴 derives structure. The
user never categorizes. The 元婴 never asks the user to categorize.

**Implementation**:
- Note input is a text field (with optional mic). No dropdowns. No tags.
  No required fields.
- 元婴 extracts topic, project, and intent from the content when needed
  for recall. These are stored as 元婴-side metadata — never surfaced
  to the user as required input.
- When 元婴 gets categorization wrong, it self-corrects on next encounter.
  It does not ask the user to fix it.
- Editing past notes is out of scope (per ES-002). Re-categorization is
  not a user action.
- Recall: "上次我们聊到提案的那个问题" — 元婴 retrieves by inferred
  topic, not by user-applied tag.

**Why this is stronger than tags**: tags require the owner to *decide*
at capture time. Decisions at capture time cause the capture to be
skipped. The whole point of the 元婴 is to reduce decisions, not add
them.

**Interaction with ES-006**: 元婴-extracted topics from notes are the
input to Detector 1 (avoidance via adjacent tasks). Free-text capture
and learned structure are the same mechanism — not two competing models.

---

## 2.4 Visual direction (deferred)

Not in scope for this phase. Existing palette (stone), single green
accent. Polish is a second C pass, after structure is right.

---

## 2.5 Out of scope

- Avatar animation — later C
- Laptop companion — later C
- Model router — later C
- Onboarding flow — later C
- Themes, dark/light toggle — later C

---

## 3. Acceptance criteria

- [ ] Home shows only today's activities + chat
- [ ] No historical data on home
- [ ] History tab shows day list, tappable to detail view
- [ ] Detail view shows signals, notes, reminders, chat, prose summary
- [ ] Search by date and keyword works
- [ ] "记一笔" is one tap from home
- [ ] Note input has no dropdowns, no tags, no required fields
- [ ] No new capture surfaces introduced
- [ ] Settings moved off home
- [ ] No charts, no statistics

---

## 4. Tracking entries

```markdown
### [P1-26] Home redesign — activities + chat only
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.1

### [P1-27] History tab — day list + detail
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.2

### [P1-28] Note capture — free text, no metadata
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.3

### [P1-29] Move settings off home
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.1
```

**End of ES-008.**

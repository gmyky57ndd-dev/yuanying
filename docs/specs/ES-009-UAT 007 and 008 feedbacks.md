# UAT Triage — ES-007 / ES-008  
## What works  
History tab, upgrade link, day-level summary list, notes capture.  
## Triage  
  
  

| # | Issue | Type |
| - | -------------------------------------------------------------------------- | ------------------------------- |
| 1 | Previous chats persist in today's tab | Bug |
| 2 | Notes added but not expandable/viewable | Bug |
| 3 | Steps 0 on home vs 2809 yesterday | Bug (B-21 still open) |
| 4 | 提醒 0/12 still shown — ES-007 §4 was to unify counter | Bug (partial impl) |
| 5 | "昨天" panel on home | Spec change — home = today only |
| 6 | History cluttered with 应用 rows | Spec change — group, don't list |
| 7 | Requirement: home = today's raw activities + chat; history = day summaries | Spec addition |
  
## ES-009 — Home scope + History detail  
**Ref**: docs/specs/ES-009-home-scope.md **Category**: Bug + spec clarification **Refines**: ES-007 §1, ES-008 §2.1, §2.2  
## §1 Home = today only, no exceptions  
**Remove the "昨天" panel from home.** ES-007 §1's pre-18:00 label is wrong once history exists. Home is today. If today is empty (e.g., 06:00), show an empty state, not yesterday's data.  
**Chat is scoped to today.** Open PWA → chat begins with today's first exchange. Yesterday and earlier live in History. The home chat view never scrolls back past 00:00 local.  
**Home layout (revised ES-008 §2.1):**  
```
text
[avatar]
[wake] [sleep] [water ×N]
步数 [N] / 5000

记一笔                         笔记 [N]
─────
今天 (raw activity stream, tappable)
  · 07:26 起床
  · 08:18 喝水
  · 11:26 笔记 "…"
  · (app_usage rolled up, see §2)

─────
Chat (today only)
[input]
```
```


```
**No **自动 2 · 手动 6 · 提醒 15** line on home.** That is summary data. It belongs in History. Home shows raw activity only.  
## §2 History = day summaries, all formats  
The list view (screenshot 2) is correct. Keep it.  
The detail view (screenshot 3) is where the clutter is. Fix:  
**Group **app_usage** rows.** Do not list each one. Roll up per contiguous session:  
```
text
活动
  07:26  起床
  08:14–09:14  应用会话 (约 1h, 5 应用)
  08:18  喝水
  11:14  喝水
  11:26  笔记 "Need to be able to retrieve the notes"
  12:16–13:47  应用会话 (约 1.5h, 12 应用)
  ...

```
Tapping a session expands to show individual apps.  
**Steps rows: hide zero-value reports.** Only show steps entries where value changed or day total is final. Three consecutive 步数 0 at 12:56/13:04/13:06 is noise.  
**Fix **提醒 0/12**.** Per ES-007 §4, this should not exist as a separate counter. Replace with:  
```
text
概要
  起床 07:26 · 入睡 --:-- · 喝水 3/6 · 起身 0/8 · 维生素 --
```
```


```
Habit counts, not reminder-fired counts. 提醒 only appears in an "audit" subsection if the owner expands, never in the top summary.  
## §3 Notes expandable  
Tap a note row → expands inline to full text. Long text wraps. No separate view. Tap again to collapse.  
If notes are only shown as 笔记 N on home with no way to read them, the note-taking feature is functionally dead. Fix is required in this pass.  
## §4 Out of scope  
* Aesthetic polish  
* Chat history search (comes later)  
* Any new capture surface  
## §5 Acceptance  
* □ Home shows today only; no "昨天" label; empty state if no activity  
* □ Chat view does not scroll before 00:00 local  
* □ No 自动 X · 手动 X · 提醒 X line on home  
* □ History detail groups app_usage into sessions, expandable  
* □ Steps rows with value 0 and no change are hidden  
* □ Summary top line shows habit counts (喝水 3/6), not reminder counts  
* □ Notes tap → expand inline  
* □ Steps 0 on home matches yesterday's 2809 discrepancy — B-21 investigated  
## §6 Tracking  
```
markdown
###
```
```
 [P1-30] Home = today only, remove 昨天 panel

```
```
###
```
```
 [P1-31] Chat scoped to today

```
```
###
```
```
 [P1-32] Notes expandable inline

```
```
###
```
```
 [P1-33] History app_usage grouping

```
```
###
```
```
 [P1-34] Summary counter unification (ES-007 §4 completion)

```

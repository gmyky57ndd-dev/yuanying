# PM Inbox — Dev Consumption

Owner feedback saved with **Save to Inbox** lands here as:

```
docs/pm/inbox/YYYY-MM-DD-<noteId>.md
```

Each file is committed through the GitHub Contents API by
`POST /api/integrations/inbox`. The same action sets the note's
`feedback_status` to `inbox`.

## Dev process

1. On the next pull, list new files in this directory. The team's target review
   time is **10:00 daily** when that cadence is in use.
2. Read and triage each file. Link the resulting work in `TRACKING.md` when it
   becomes a tracked item.
3. After handling the file, move it to `docs/pm/inbox/archive/` (preferred) or
   prefix the filename with `[已处理]`.
4. Do not delete inbox history as routine cleanup. Historical files are part
   of the feedback record.

## Status meaning

`inbox` means the file was committed and Dev will see it on the next pull. It
does not mean Dev has already read or fixed it. When the work is done, the
owner (or Dev via the API) marks the note `resolved` in the Feedback tab.

For the full state machine, see `docs/feedback-lifecycle.md`.

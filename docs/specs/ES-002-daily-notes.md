# ES-002 — Daily Notes (Text and Optional Voice Transcription)

**Status:** Draft — pending owner approval  
**Category:** Feature  
**Tracking:** Proposed P1-13 — confirm assignment in `TRACKING.md` before approval  
**Depends on:** B-16 (In Review; owner timezone verification pending), P1-11 (In Review; daily summary v1)

---

## 1. Goal and scope

Let the owner record a short freeform note for the current product day and allow 元婴 to reference those notes in the daily summary or chat when relevant.

V1 stores text only. Optional speech input transcribes on the device/browser; the owner reviews and edits the transcript before saving. Audio is not uploaded or stored by this feature.

**Out of scope:** audio storage, mood tagging, rich text, images, attachments, editing past notes, and a full notebook/search experience.

## 2. Data model

Store notes as `signals` rows using the existing `type='note'` capability and a dedicated `name='note'` value. The current database type constraint allows `note`, but the signal-name constraint and `/api/signal` route currently accept only wake, sleep, and water. Add the new name through a forward migration and explicit server-side validation; do not assume it is already accepted.

Proposed record:

```json
{
  "name": "note",
  "type": "note",
  "value": { "text": "..." },
  "source": "manual",
  "context": { "input": "text" }
}
```

For voice transcription, `context.input` may be `voice`; only the final owner-reviewed text is sent to the server. Enforce a 2,000-character maximum server-side, define the counting method consistently, trim surrounding whitespace, and reject empty/whitespace-only notes. Do not include raw note content in server logs or error responses.

Use UTC `created_at` storage and the configured product timezone for daily queries via the shared timezone utilities. The owner must be able to understand which day a note belongs to.

## 3. PWA interaction

Add a “记一笔” entry point on the home screen. It opens a text editor with Save and Cancel. Optional microphone input uses browser speech recognition where supported:

1. Explain/request microphone permission through the browser's normal permission flow.
2. Show the transcript in the editable text field.
3. Let the owner review and change the text.
4. Save only the final text; do not transmit or retain audio.
5. If transcription is unsupported or fails, leave text entry available and explain the failure.

The home view may show today's note count. Tapping it opens a read-only list of today's notes. No past-note editing is included in v1; any deletion or retention behavior must follow the product's approved privacy/data-retention rules.

## 4. Summary and chat integration

Extend the existing `SummaryData` and `summaries` pipeline; do not create a second summary endpoint. The current routes are `GET /api/summary/today` and `POST /api/summary/generate`.

Proposed summary field:

```typescript
notes: {
  count: number;
  items: Array<{ at: string; text: string }>;
}
```

Return the total count and at most 10 recent note excerpts, each truncated to at most 200 characters. Define whether truncation is by Unicode code point and preserve the original stored text. The system prompt should include only a bounded subset (proposed: up to five excerpts) and label the text as owner-provided content, not instructions to the model. Do not fabricate notes or treat note content as permission to take action.

## 5. Acceptance criteria

- [ ] `note` is accepted by the signal API and database after a forward migration.
- [ ] Empty notes and notes over the agreed 2,000-character limit are rejected server-side.
- [ ] Text entry works even when voice recognition is unsupported or denied.
- [ ] Voice transcript is editable before save; audio is never sent to or stored by the server.
- [ ] Today's note count and read-only note list use the configured product day.
- [ ] Summary returns total count and a bounded, truncated set of recent note excerpts.
- [ ] Chat can answer questions about notes from the bounded summary data without fabricating content or following note-embedded instructions.
- [ ] Date-boundary and validation behavior are covered by available tests.

## 6. Approval questions

1. Should voice transcription be included in v1, given browser support varies, or should v1 ship text-only first?
2. Should notes be included in the chat system prompt by default, or only loaded when the owner asks about notes?
3. What note deletion/retention controls are required for owner data rights?
4. Confirm P1-13 assignment and whether this feature is scheduled after P1-11 verification.

## 7. Non-goals

Do not store audio, add media/attachments, edit past notes, build a notebook interface, or add mood labels in v1.

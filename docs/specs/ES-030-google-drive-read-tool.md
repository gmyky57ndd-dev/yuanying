# ES-030 — Google Drive Read Tool (Mobile Priority)

**Status**: Approved
**Category**: Feature (Integration / Tool)
**Tracking**: P2-13
**Refs**: Issue #18
**PR**: pending

## 1. Why this is prioritized

The owner is frequently mobile. Passing local `.md` files through a desktop
folder is not a valid workaround for importing legacy documents (such as
Google Docs) while on the phone. 元婴 needs a read-only tool that fetches a
Drive document directly.

## 2. Scope

- Google OAuth 2.0 with the minimum scope `drive.readonly`.
- A `get_drive_doc(file_id)` chat tool.
- Export Google Docs as `text/plain` via `files.export`.
- Save imported text as a note with provenance `google_drive` and the
  `file_id`.
- Read-only: no writing, deleting, or sharing Drive files.

## 3. Storage

The repository has no separate `notes` table. Notes are stored in `signals`
with `name = 'note'` (see `app/api/note/route.ts`). ES-030 follows that
existing model:

```text
signals
  name    = 'note'
  type    = 'note'
  source  = 'google_drive'
  value   = { text, tags: [], feedbackSuggested: false, imported: true,
              drive_title, drive_url }
  context = { provider: 'google_drive', file_id, file_url, mime_type,
              imported_at, truncated }
```

`source = 'google_drive'` is added to the signals source constraint by
`supabase/migrations/018_google_drive.sql`.

Imports are idempotent: if a note already exists for the same `file_id`, the
existing note is returned with `already: true` instead of creating a duplicate.

## 4. OAuth

Files:

- `supabase/migrations/018_google_drive.sql` — adds the source and
  `google_oauth_tokens` (singleton row `id = 'default'`). Tokens are
  server-side only.
- `lib/google-drive.ts` — authorization URL, code exchange, token refresh,
  status, disconnect, file export, and note import.
- `app/api/integrations/google-drive/authorize/route.ts` — redirects to
  Google with a random `state` stored in an httpOnly cookie.
- `app/api/integrations/google-drive/callback/route.ts` — verifies `state`,
  exchanges the code, stores tokens, and redirects to
  `/settings?drive=connected`.
- `app/api/integrations/google-drive/route.ts` — `GET` status, `DELETE`
  disconnect.
- `middleware.ts` — the callback is public because Google redirects without
  the PWA session cookie; the OAuth `state` cookie is the CSRF guard.

Environment variables (server-side):

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://<domain>/api/integrations/google-drive/callback
```

If `GOOGLE_REDIRECT_URI` is unset, the route derives it from the request
origin. The Google Cloud OAuth client must list the same redirect URI.

## 5. Settings UI

File: `app/settings/page.tsx`.

Adds a **Google Drive（只读）** section:

- `configured: false` → explains that the server env vars are missing.
- `connected: false` → **授权 Google Drive** link to the authorize route.
- `connected: true` → shows the connection date and a **断开** button.
- Callback results are shown as a short message
  (`connected` / `denied` / `invalid_state` / `not_configured` / `error`).

## 6. Chat Tool

File: `app/api/chat/route.ts`.

Tool definition:

```ts
get_drive_doc: tool({
  description:
    'Read a Google Drive document by file ID or URL ...',
  parameters: z.object({
    file_id: z.string().describe('Google Drive file ID or a full Drive URL'),
  }),
  execute: async ({ file_id }) =>
    runToolSafely('get_drive_doc', { file_id }),
})
```

`runTool` calls `importDriveDoc(file_id)`.

`importDriveDoc`:

1. Parses `file_id` from an ID or a URL (`/file/d/...`, `/document/d/...`,
   `?id=...`).
2. Refreshes the access token when it is within 60 seconds of expiry, using
   the stored refresh token.
3. Returns the existing note when the same `file_id` was already imported.
4. Fetches metadata (`id`, `name`, `mimeType`, `webViewLink`).
5. Exports Google Docs as `text/plain` via
   `files.export?mimeType=text/plain`; reads other `text/*` files with
   `alt=media`.
6. Saves the note and returns up to 12,000 characters to the model (the stored
   note keeps up to 200,000 characters).

## 7. Failure behavior

- Drive not configured → the authorize route redirects to
  `/settings?drive=not_configured`.
- Not connected → the tool returns `{ success: false, error: "Google Drive is
  not connected. Authorize it in Settings first." }`.
- Unsupported file type (Sheets, PDF, binary, folder) → explicit error; only
  Google Docs and text files are supported in this pass.
- Revoked/expired refresh token → explicit reconnect message.
- Google API error → the tool returns the API error message; the model must
  not claim the import succeeded.
- Duplicate import → returns the existing note, no new row.

## 8. Acceptance

- [ ] Owner can authorize Google Drive via Settings on the phone.
- [ ] 元婴 can read a provided Drive link (for example
      `https://drive.google.com/file/d/1yFAtaqyaQo8224mVjb8m2939ESqxTKTt/view`)
      and summarize its contents in chat.
- [ ] The imported text is saved as a note with `source = 'google_drive'` and
      `context.file_id`.
- [ ] Read-only boundary is preserved: no write, delete, or share calls.

## 9. Setup checklist (owner)

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud.
2. Add the authorized redirect URI
   `https://<domain>/api/integrations/google-drive/callback`.
3. Enable the Google Drive API for the project.
4. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`
   to Vercel and `.env.local`.
5. If the OAuth consent screen is in testing mode, add the owner's Google
   account as a test user.
6. Open Settings on the phone → **授权 Google Drive**.
7. Send a Drive link in chat and ask 元婴 to read it.

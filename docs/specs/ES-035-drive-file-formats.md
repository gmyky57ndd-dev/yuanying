# ES-035 — Google Drive File Formats (txt / csv / json / zip)

**Status**: Approved
**Category**: Feature (Tool)
**Tracking**: P2-18
**Refs**: Issue #28, ES-030

## 1. Problem

`get_drive_doc` only handled Google Docs and plain text. CSV, JSON, and ZIP
files failed or were unreadable. Issue #28 asks for structured reads and a
clear format response instead of a silent failure.

## 2. Supported formats

| Format | Behavior |
|---|---|
| Google Doc | Export as `text/plain` |
| `txt` / `md` / `text/*` | Read raw text |
| `csv` | Parse headers + rows, preview the first 50 rows, report total rows |
| `json` | Parse and pretty-print; invalid JSON is an explicit error |
| `zip` | List entries; read readable `txt/md/csv/json` entries |

Out of scope: images, PDF, XLSX, and other binary files. They return an
explicit unsupported-format error.

## 3. Limits and safety

- Max download: **20 MB**.
- Text returned to the model: **12,000 chars**; stored note: **200,000 chars**.
- CSV preview: **50 rows** (cell preview capped at 500 chars).
- ZIP: **50 entries**, **5 MB per file**, **15 MB total uncompressed text**.
- ZIP paths are never written to disk. Paths containing `..`, absolute paths,
  Windows drive paths, or NUL bytes are marked unsafe and skipped.
- Truncation is explicit in the tool result (`truncated: true`) and in the
  stored note's `context.truncated`.
- Duplicate imports by `file_id` still return the existing note.

## 4. Storage

Notes remain in `signals` (`name='note'`):

```text
source = 'google_drive'
value  = { text, drive_title, drive_url, drive_format, drive_details, ... }
context = { file_id, file_url, mime_type, file_size, format,
            imported_at, truncated }
```

`drive_format` is one of `gdoc`, `text`, `csv`, `json`, `zip`.

## 5. Implementation

- `lib/drive-parsers.ts` — pure CSV/JSON/path/mime helpers.
- `lib/google-drive.ts` — download, format routing, CSV/JSON/ZIP handling,
  read-only limits, note save.
- `app/api/chat/route.ts` — updated `get_drive_doc` description.
- `core/system-manifest.md` — documents supported formats and the
  unsupported-format response.
- `docs/specs/ES-030-google-drive-read-tool.md` — original Drive tool.

## 6. Acceptance

- [x] CSV: parse a real legacy export (`entries.csv`, 602 rows) → headers,
      50-row preview, `truncated: true`.
- [x] JSON: parse and pretty-print a sample object; invalid JSON returns an
      explicit error.
- [x] ZIP: read a real Drive zip (`Blinking Habit & Entries Export (CSV)`,
      2 entries) → list files and read `entries.csv`/`routines.csv` content.
- [x] Download/entry/size limits and truncation reporting.
- [x] ZIP path traversal guard (`..`, absolute, drive-letter, NUL).
- [x] `tsc`, lint, and production build pass.
- [ ] Owner tests their own CSV/JSON/ZIP on the phone after deploy.

## 7. Notes

- The Drive account had no standalone CSV/JSON test file, so CSV/JSON parsing
  was verified with the real legacy CSV inside the zip and a representative
  JSON object. ZIP was verified end-to-end through the production tool.
- PDFs, Sheets, and images remain unsupported by design.

## 8. Issue #31 — `*/*` MIME fallback

Some Drive uploads return `mimeType: "*/*"` (for example
`stalio_export_csv_1792519528276.zip`, file id
`1o5WgYgzSmtjq9sU-eQHIWR8Nt0gAjXvQ`). The file was a ZIP, not a CSV, and the
strict MIME classifier rejected it.

Fix:

- If `mimeType` is empty, `*/*`, or `application/octet-stream`, infer the type
  from the filename extension (`.csv` / `.json` / `.zip` / `.md` / `.txt`).
- Log `drive file { id, name, mimeType, size }` for diagnosis (no content).
- Store both `context.mime_type` (raw) and `context.effective_mime_type`.
- Unsupported-format errors include the raw MIME and filename.

Verified: the file above now classifies as `zip`, lists `entries.csv` /
`routines.csv`, and returns CSV content.

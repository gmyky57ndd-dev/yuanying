# DSH read-only SQLite access (2026-11-18)

## Purpose

DSH needs the local KB index for #106 (FTS5 verification). The workspace
terminal runs inside `~/yuanying/workspace/<project>`, so the KB was previously
unreachable and `sqlite3` was not allowlisted.

## Grant

Approval `#14` (`project=yuanying`, status `approved`) permits read-only
SQLite access for #106.

Terminal command allowlist now accepts:

```text
sqlite3 -version
sqlite3 -readonly <db> ".tables"
sqlite3 -readonly <db> ".schema [table]"
sqlite3 -readonly <db> "SELECT|PRAGMA|WITH ..."
```

Allowed DB paths only:

- `~/yuanying/local_kb/index/sqlite.db`
- `~/yuanying/local_kb/index.db` (legacy path; may not exist)

## Guardrails

- `-readonly` is mandatory (except `-version`).
- Path must resolve to one of the exact allowed DB paths.
- SQL must be a single statement starting with `SELECT`, `PRAGMA`, or `WITH`,
  or a `.tables`/`.schema` dot command.
- `;` followed by another statement is rejected.
- `sqlite3` is still behind `run_terminal_command` and an approved
  `approval_id`; no shell is used.
- No write/delete/attach commands are allowed; the SQLite read-only connection
  is a second guard.

## Verified

- DSH ran:
  `sqlite3 -readonly /Users/alexzhang/yuanying/local_kb/index/sqlite.db ".tables"`
  and returned the 14 KB tables (`kb_docs`, `kb_chunks`, `kb_fts`,
  `kb_chunks_fts`, FTS shadow tables).

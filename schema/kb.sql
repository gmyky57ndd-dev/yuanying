-- ES-075 / ES-079: local-first knowledge base schema (SQLite).
-- The live database lives at ~/yuanying/local_kb/index/sqlite.db and is NEVER
-- committed (it contains private conversations; the repo is public).
-- Rebuild with: python3 scripts/local_rag_server.py --reindex

create table if not exists kb_docs (
  id text primary key,
  path text unique not null,
  source text,
  model text,
  title text,
  tags text,
  summary text,
  created_at text,
  sha256 text,          -- normalised body hash (dedupe fingerprint)
  indexed_at text
);

create virtual table if not exists kb_fts using fts5(
  path, title, summary, body, tokenize='unicode61'
);

create table if not exists kb_chunks (
  id text primary key,          -- sha256(doc_path:index)[:16]
  doc_path text not null,
  chunk_index integer not null,
  text text not null,
  model text,                   -- embedding model, e.g. bge-m3
  dim integer,                  -- vector dimension (1024)
  embedding blob,               -- JSON array of floats
  updated_at text
);

create virtual table if not exists kb_chunks_fts using fts5(
  chunk_id, text, tokenize='unicode61'
);

create index if not exists idx_kb_chunks_doc on kb_chunks (doc_path);
create index if not exists idx_kb_docs_sha on kb_docs (sha256);

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Phase 2: local-first mirror. The SQLite file lives on the Mac (never in
 * Supabase) and is written best-effort alongside the cloud rows. Reads still
 * use Supabase until the repository layer lands.
 */
const DB_DIR = process.env.YUANYING_DB_DIR || path.join(os.homedir(), 'yuanying');
export const LOCAL_DB_PATH = process.env.YUANYING_DB_PATH || path.join(DB_DIR, 'yuanying.db');

let db: DatabaseSync | null = null;

const SCHEMA = `
create table if not exists config (
  key text primary key,
  value text,
  updated_at text
);
create table if not exists messages (
  id integer primary key autoincrement,
  remote_id text unique,
  role text not null,
  content text not null,
  session_id text,
  device_id text,
  project_id text,
  responder_fenshen_id text,
  metadata text,
  created_at text
);
create table if not exists signals (
  id integer primary key autoincrement,
  remote_id text unique,
  name text not null,
  value text,
  context text,
  source text,
  feedback_status text,
  resolved_at text,
  created_at text
);
create table if not exists projects (
  id text primary key,
  name text,
  description text,
  status text,
  created_at text
);
create table if not exists project_docs (
  project_id text not null,
  name text not null,
  content text,
  updated_at text,
  primary key (project_id, name)
);
create table if not exists goals (
  id integer primary key,
  project_id text,
  title text,
  status text,
  due_date text,
  created_at text,
  completed_at text
);
create table if not exists workpad_actions (
  id integer primary key,
  project_id text,
  description text,
  status text,
  result_ref text,
  created_at text,
  updated_at text
);
create table if not exists approvals (
  id integer primary key,
  project_id text,
  title text,
  description text,
  adr text,
  status text,
  created_by text,
  approved_by text,
  issue_url text,
  created_at text,
  updated_at text,
  approved_at text
);
create table if not exists fenshen (
  id text primary key,
  display_name text,
  prompt_md text,
  avatar_url text,
  kind text,
  tools_whitelist text,
  model_name text,
  has_all_tools integer,
  enabled integer
);
create table if not exists project_fenshen_map (
  project_id text not null,
  fenshen_id text not null,
  is_lead integer,
  primary key (project_id, fenshen_id)
);
`;

export function getLocalDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  db = new DatabaseSync(LOCAL_DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

export function localDbInfo() {
  const d = getLocalDb();
  const count = (table: string) =>
    (d.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
  return {
    path: LOCAL_DB_PATH,
    messages: count('messages'),
    signals: count('signals'),
    config: count('config'),
    approvals: count('approvals'),
  };
}

#!/usr/bin/env node
// Phase 2: mirror Supabase rows into the local SQLite file.
// Usage: node --env-file=.env.local scripts/sqlite-backfill.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const dbPath =
  process.env.YUANYING_DB_PATH ||
  path.join(process.env.YUANYING_DB_DIR || path.join(os.homedir(), 'yuanying'), 'yuanying.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
create table if not exists config (key text primary key, value text, updated_at text);
create table if not exists messages (id integer primary key autoincrement, remote_id text unique, role text not null, content text not null, session_id text, device_id text, project_id text, responder_fenshen_id text, metadata text, created_at text);
create table if not exists signals (id integer primary key autoincrement, remote_id text unique, name text not null, value text, context text, source text, feedback_status text, resolved_at text, created_at text);
create table if not exists projects (id text primary key, name text, description text, status text, created_at text);
create table if not exists project_docs (project_id text not null, name text not null, content text, updated_at text, primary key (project_id, name));
create table if not exists goals (id integer primary key, project_id text, title text, status text, due_date text, created_at text, completed_at text);
create table if not exists workpad_actions (id integer primary key, project_id text, description text, status text, result_ref text, created_at text, updated_at text);
create table if not exists approvals (id integer primary key, project_id text, title text, description text, adr text, status text, created_by text, approved_by text, issue_url text, created_at text, updated_at text, approved_at text);
create table if not exists fenshen (id text primary key, display_name text, prompt_md text, avatar_url text, kind text, tools_whitelist text, model_name text, has_all_tools integer, enabled integer);
create table if not exists project_fenshen_map (project_id text not null, fenshen_id text not null, is_lead integer, primary key (project_id, fenshen_id));
`);

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const j = v => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));
const iso = v => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const b = v => (v == null ? null : v ? 1 : 0);

async function sync(table, sql, params, rows) {
  const stmt = db.prepare(sql);
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(...params(r));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const n = db.prepare(`select count(*) n from ${table}`).get().n;
  console.log(`${table}: ${n}`);
}

const cfg = await client.query('select key, value, updated_at from config');
await sync(
  'config',
  'insert into config (key,value,updated_at) values (?,?,?) on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at',
  r => [r.key, j(r.value), iso(r.updated_at)],
  cfg.rows
);

const msgs = await client.query(
  'select id, role, content, session_id, device_id, project_id, responder_fenshen_id, metadata, created_at from messages order by id'
);
await sync(
  'messages',
  'insert into messages (remote_id,role,content,session_id,device_id,project_id,responder_fenshen_id,metadata,created_at) values (?,?,?,?,?,?,?,?,?) on conflict(remote_id) do update set content=excluded.content',
  r => [String(r.id), r.role, r.content, r.session_id, r.device_id, r.project_id, r.responder_fenshen_id, j(r.metadata), iso(r.created_at)],
  msgs.rows
);

const sigs = await client.query(
  'select id, name, value, context, source, feedback_status, resolved_at, created_at from signals order by id'
);
await sync(
  'signals',
  'insert into signals (remote_id,name,value,context,source,feedback_status,resolved_at,created_at) values (?,?,?,?,?,?,?,?) on conflict(remote_id) do update set value=excluded.value, context=excluded.context',
  r => [String(r.id), r.name, j(r.value), j(r.context), r.source, r.feedback_status, iso(r.resolved_at), iso(r.created_at)],
  sigs.rows
);

const projects = await client.query('select id,name,description,status,created_at from projects');
await sync(
  'projects',
  'insert into projects (id,name,description,status,created_at) values (?,?,?,?,?) on conflict(id) do update set name=excluded.name, description=excluded.description',
  r => [r.id, r.name, r.description, r.status, iso(r.created_at)],
  projects.rows
);

const docs = await client.query('select project_id,name,content,updated_at from project_docs');
await sync(
  'project_docs',
  'insert into project_docs (project_id,name,content,updated_at) values (?,?,?,?) on conflict(project_id,name) do update set content=excluded.content, updated_at=excluded.updated_at',
  r => [r.project_id, r.name, r.content, iso(r.updated_at)],
  docs.rows
);

const goals = await client.query('select id,project_id,title,status,due_date,created_at,completed_at from goals');
await sync(
  'goals',
  'insert into goals (id,project_id,title,status,due_date,created_at,completed_at) values (?,?,?,?,?,?,?) on conflict(id) do update set title=excluded.title, status=excluded.status',
  r => [r.id, r.project_id, r.title, r.status, iso(r.due_date), iso(r.created_at), iso(r.completed_at)],
  goals.rows
);

const actions = await client.query('select id,project_id,description,status,result_ref,created_at,updated_at from workpad_actions');
await sync(
  'workpad_actions',
  'insert into workpad_actions (id,project_id,description,status,result_ref,created_at,updated_at) values (?,?,?,?,?,?,?) on conflict(id) do update set description=excluded.description, status=excluded.status',
  r => [r.id, r.project_id, r.description, r.status, r.result_ref, iso(r.created_at), iso(r.updated_at)],
  actions.rows
);

const approvals = await client.query('select id,project_id,title,description,adr,status,created_by,approved_by,issue_url,created_at,updated_at,approved_at from approvals');
await sync(
  'approvals',
  'insert into approvals (id,project_id,title,description,adr,status,created_by,approved_by,issue_url,created_at,updated_at,approved_at) values (?,?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set title=excluded.title, status=excluded.status, adr=excluded.adr',
  r => [r.id, r.project_id, r.title, r.description, r.adr, r.status, r.created_by, r.approved_by, r.issue_url, iso(r.created_at), iso(r.updated_at), iso(r.approved_at)],
  approvals.rows
);

const fenshen = await client.query('select id,display_name,prompt_md,avatar_url,kind,tools_whitelist,model_name,has_all_tools,enabled from fenshen');
await sync(
  'fenshen',
  'insert into fenshen (id,display_name,prompt_md,avatar_url,kind,tools_whitelist,model_name,has_all_tools,enabled) values (?,?,?,?,?,?,?,?,?) on conflict(id) do update set display_name=excluded.display_name, prompt_md=excluded.prompt_md, enabled=excluded.enabled',
  r => [r.id, r.display_name, r.prompt_md, r.avatar_url, r.kind, j(r.tools_whitelist), r.model_name, b(r.has_all_tools), b(r.enabled)],
  fenshen.rows
);

const map = await client.query('select project_id,fenshen_id,is_lead from project_fenshen_map');
await sync(
  'project_fenshen_map',
  'insert into project_fenshen_map (project_id,fenshen_id,is_lead) values (?,?,?) on conflict(project_id,fenshen_id) do update set is_lead=excluded.is_lead',
  r => [r.project_id, r.fenshen_id, b(r.is_lead)],
  map.rows
);

await client.end();
console.log(`local db: ${dbPath} (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB)`);
db.close();

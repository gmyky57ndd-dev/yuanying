import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const docPath = process.argv[2];
if (!docPath) {
  console.error('usage: node scripts/seed_project_docs.mjs <file.md> [project] [name]');
  process.exit(2);
}
const project = process.argv[3] || 'bwp';
const name = process.argv[4] || path.basename(docPath);
const content = fs.readFileSync(docPath, 'utf8');
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(
  `insert into project_docs (project_id, name, content) values ($1,$2,$3)
   on conflict (project_id, name) do update set content = excluded.content, updated_at = now()`,
  [project, name, content]
);
console.log(`seeded ${project}/${name} (${content.length} chars)`);
await c.end();

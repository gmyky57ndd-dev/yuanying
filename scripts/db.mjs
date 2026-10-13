import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    'SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example).'
  );
  process.exit(1);
}

const arg = process.argv[2];

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  if (arg === '--reset') {
    await client.query('truncate table messages restart identity cascade');
    await client.query('truncate table signals restart identity cascade');
    await client.query('truncate table activity_logs restart identity cascade');
    await client.query(
      "update config set value='true'::jsonb where key='activity_collection_enabled'"
    );
    console.log('reset: messages / signals / activity_logs cleared, config restored');
  } else if (arg) {
    const sql = readFileSync(arg, 'utf-8');
    await client.query(sql);
    console.log('applied:', arg);
  } else {
    console.log('usage: node scripts/db.mjs <file.sql> | --reset');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}

#!/usr/bin/env node
// #130: anchor the ledger to existing GitHub issues and add the missing #129 row.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const repo = process.env.GITHUB_REPO || 'gmyky57ndd-dev/yuanying';
const map = [
  [13, 102], // tool whitelist
  [15, 104], // Desktop Hub
  [16, 105], // Librarian
  [17, 106], // FTS5
  [18, 107], // approval
  [12, 128], // playbook (already done)
  [14, 119], // collector device verification
  [19, 108], // events logger
];
for (const [actionId, issue] of map) {
  const url = `https://github.com/${repo}/issues/${issue}`;
  await c.query(
    'update workpad_actions set github_issue_number=$1, github_issue_url=$2, result_ref=coalesce(result_ref,$2) where id=$3',
    [issue, url, actionId]
  );
}
// #129: the @ routing bug that was missing from the ledger.
const issue129 = `https://github.com/${repo}/issues/129`;
const existing = await c.query('select id from workpad_actions where github_issue_number=129');
if (existing.rowCount === 0) {
  await c.query(
    `insert into workpad_actions
      (project_id, description, status, github_issue_number, github_issue_url, result_ref)
     values ('yuanying', $1, 'pending', 129, $2, $2)`,
    ['群聊 @分身 仍不路由：#127 修复后 @AI 架构师 / @拓维 两条消息均无回应', issue129]
  );
}
console.log('reconciled', map.length, 'actions + #129');
await c.end();

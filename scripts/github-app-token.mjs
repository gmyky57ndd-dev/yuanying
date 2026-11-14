#!/usr/bin/env node
// Verify GitHub App installation and print scoped token metadata (never the token).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_ID = process.env.GITHUB_APP_ID || '5761017';
const keyPaths = [
  path.join(os.homedir(), 'Library/Application Support/com.yuanying.desktop/github-app.pem'),
  path.join(os.homedir(), '.yuanying/github-app.pem'),
];
const key = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') || keyPaths.map(p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null).find(Boolean);
if (!key) {
  console.error('private key not found; put it at ' + keyPaths[0] + ' (chmod 600)');
  process.exit(1);
}
const b64 = v => Buffer.from(v).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const now = Math.floor(Date.now()/1000);
const h = b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
const p = b64(JSON.stringify({iat:now-60,exp:now+540,iss:APP_ID}));
const sign = crypto.createSign('RSA-SHA256'); sign.update(`${h}.${p}`);
const jwt = `${h}.${p}.${sign.sign(key,'base64url')}`;
const gh = async (url, init={}) => {
  const r = await fetch('https://api.github.com'+url,{...init,headers:{Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'yuanying-github-app',...(init.headers||{})}});
  const t = await r.text(); const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j?.message ?? t}`);
  return j;
};
const repo = process.env.GITHUB_APP_REPO || 'gmyky57ndd-dev/Yuanying-Bot';
const role = process.env.GITHUB_APP_ROLE || 'dsh';
const perms = role === 'qa' ? {metadata:'read',contents:'read',issues:'write',pull_requests:'read'} : {metadata:'read',contents:'write',issues:'write',pull_requests:'write'};
try {
  const inst = await gh(`/repos/${repo}/installation`);
  console.log('installation', inst.id, 'repo', repo);
  const tok = await gh(`/app/installations/${inst.id}/access_tokens`,{method:'POST',body:JSON.stringify({repositories:[repo.split('/')[1]],permissions:perms})});
  console.log('token ok, expires', tok.expires_at, 'permissions', JSON.stringify(tok.permissions));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

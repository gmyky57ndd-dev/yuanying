# GitHub App — Yuanying-Workpad-Bot

**App:** `Yuanying-Workpad-Bot`
**Owner:** `@gmyky57ndd-dev`
**App ID:** `5761017`
**Client ID:** `Iv23liFv6YmHrm16hq1v`
**Repo:** `gmyky57ndd-dev/Yuanying-Bot` (private is fine)

## Why

ADR-005 requires per-fenshen GitHub permissions instead of one global PAT.
The App issues short-lived installation tokens scoped to:
- repository (`Yuanying-Bot`, later `yuanying` if approved)
- role permissions (contents/issues/PR/actions)

## Owner setup (one-time)

1. **Install the App** on `Yuanying-Bot`:
   <https://github.com/apps/Yuanying-Workpad-Bot> → Install → select repository.
   The URL after install contains the installation ID (`/installations/<id>`).
2. **Generate a private key**:
   App settings → Private keys → Generate a private key.
3. Store it **outside the repo**, mode 0600:
   `~/Library/Application Support/com.yuanying.desktop/github-app.pem`
4. Record the installation ID:
   `GITHUB_APP_INSTALLATION_ID=<id>` (or let the broker discover via
   `GET /repos/{owner}/{repo}/installation`).

Do not paste the private key into chat or commit it.

## Verify

```bash
node --env-file=.env.local scripts/github-app-token.mjs
```

Expected:

```
installation <id> repo gmyky57ndd-dev/Yuanying-Bot
token ok, expires ... permissions {...}
```

## Broker

`lib/github-app.ts`:
- signs an App JWT (RS256) with the local key;
- discovers installation per repo;
- requests `POST /app/installations/{id}/access_tokens` with repo + role permissions;
- caches tokens until expiry.

Role matrix:

| Role | Contents | Issues | PRs | Actions |
|---|---|---|---|---|
| xiaowu | read | write | read | — |
| ai_pm | read | write | read | — |
| ai_architect | read | write | read | — |
| dsh | write | write | write | — |
| qa | read | write | read | — |
| devops | read | — | — | read |
| librarian | read | — | — | — |

## Status

- App exists (ID 5761017), installed on `Yuanying-Bot`
  (installation **181996170**).
- Private key stored at
  `~/Library/Application Support/com.yuanying.desktop/github-app.pem` (0600).
- Verified token exchange (2026-11-14):

```
installation 181996170 repo gmyky57ndd-dev/Yuanying-Bot
token ok, expires ... permissions {"contents":"write","issues":"write",
"metadata":"read","pull_requests":"write"}
```

- Existing tools still use the global `GITHUB_TOKEN`. The App is **not yet
  installed on `yuanying`**, so per-role tokens cannot write the main repo yet.
- Install the App on `yuanying` (or authorize using `Yuanying-Bot` as the
  sandbox) before wiring per-role tokens into tools.

## Client ID vs App ID

Installation tokens need the **App ID + private key** (JWT). Client ID /
client secret are for OAuth user flows, not installation tokens; keeping both
is fine.

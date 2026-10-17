# Runbook — 元婴 Self-Upgrade (Web + Collector)

**Refs:** `TRACKING.md` #P1-15, `AGENTS.md` §4.4 (review/release), §4.7 (rollback)
**Status of automation:** Web = automated. Collector = build+release automated; Play upload manual (until a service account is added).

元婴 ships on two planes. This is the end-to-end procedure to release a change and to recover from a bad one.

---

## 1. Web / PWA (Vercel)

**Trigger:** any push to `main` (excluding `collector/**`, docs, tracking).

Two independent paths deploy production:
1. **Vercel ↔ GitHub Git integration** — primary; deploys on push automatically.
2. **`.github/workflows/deploy.yml`** — fallback; runs `vercel deploy --prod` using the `VERCEL_TOKEN` secret.

### One-time: dedicated token (required for durability)
The CLI OAuth token rotates. Create a **no-expiration** token at
https://vercel.com/account/tokens and set it as the repo secret:

```bash
gh secret set VERCEL_TOKEN -R gmyky57ndd-dev/yuanying -b "<token>"
# VERCEL_ORG_ID / VERCEL_PROJECT_ID are already set.
```
Until then, both paths may work, but the fallback (2) can fail when the token rotates.

### Verify a web deploy
- GitHub → Actions → **Deploy Web (Vercel)** is green, **and/or**
  Vercel dashboard shows a new Production deployment.
- Smoke: `curl -s -o /dev/null -w '%{http_code}\n' https://yuanying-rust.vercel.app/api/auth/status` → `200`.

### Rollback (web)
- Vercel dashboard → **Deployments** → previous good build → **Promote to Production**;
  or CLI: `vercel rollback`.
- The service worker (network-first navigations) picks up the change on next open.

---

## 2. Android collector (Play)

**Trigger:** a version bump + tag.

### Release steps
1. Bump `versionCode`/`versionName` in `collector/android/app/build.gradle`.
2. Commit, then tag and push:
   ```bash
   git commit -am "chore(release): collector vX.Y.Z"
   git tag vX.Y.Z && git push origin main vX.Y.Z
   ```
3. `.github/workflows/android-release.yml` builds a **signed AAB** (keystore from
   secrets) and publishes a **GitHub Release** with the `.aab` + `.apk`. Confirm it
   is green and download the artifact.
4. **Upload the `.aab` to Play Console** → Internal testing (or the chosen track).
   - Current: **manual**.
   - Optional automation (see §4): attach the AAB to Play via the Developer API.

Play App Signing re-signs the app; **uninstall any sideloaded build first** so the
signature matches. After the first Play install, updates arrive via Play.

### Rollback (collector)
- Play Console → **halt rollout** / roll back to the previous release.
- Devices on the newer build keep running until they update; make bad behavior
  remotely safe where a flag exists (`config.activity_collection_enabled`,
  `config.reminders_enabled`, `config.quiet_window`).
- There is **no** in-app self-updater (removed for Play); Play owns updates.

---

## 3. Secrets inventory (names only — never print values)

| Secret | Where | Used by |
|---|---|---|
| `VERCEL_TOKEN` | GitHub Actions | `deploy.yml` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub Actions | `deploy.yml` |
| `ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` | GitHub Actions | `android-release.yml` |
| `API_TOKEN`, `OWNER_PASSWORD`, `SESSION_SECRET`, `IP_SALT`, `AUTH_ENFORCE` | Vercel | `middleware.ts`, `/api/auth/*` |
| `DEEPSEEK_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel | app runtime |
| `CRON_SECRET` | Vercel | `/api/cron/*` (legacy; collector now generates reminders) |

Rotation: update the secret in its store; redeploy (web) or rebuild+release (collector). Never commit `.env.local`.

> **Local service-account key (never commit):** the Play deployer JSON lives
> outside this repo at `../.secrets/yuanying-511715-5ca683a5ef5c.json`.
> It is used only for local diagnostics; CI uses the
> `PLAY_SERVICE_ACCOUNT_JSON` secret.

---

## 4. Automated Play upload

The release workflow already contains a gated **Upload to Google Play (internal)** step
(`r0adkll/upload-google-play`), enabled once the repo secret
`PLAY_SERVICE_ACCOUNT_JSON` exists (it has been set). It uploads
`com.orbace.yuanying` to the **internal** track and **publishes it** (`status: completed`).

> **Important:** the upload must be `status: completed`, **not** `draft`. A draft is
> never rolled out, so internal testers stay on the last completed version. This caused
> the 2026-10-16 report that the store list was still on **1.0.9** while later builds
> (1.0.12–1.0.17) sat as drafts.

### One-time Play Console / Cloud prerequisites (owner)

The service account is `play-store-deployer@yuanying-511715.iam.gserviceaccount.com`
(Cloud project `yuanying-511715`, number `761958009862`). To make the upload succeed:

1. **Enable the Android Publisher API** on the Cloud project:
   https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=761958009862
   (or `gcloud services enable androidpublisher.googleapis.com --project yuanying-511715`).
   *Current failure:* `Google Play Android Developer API has not been used in project 761958009862 ... or it is disabled`.
2. **Link the Cloud project** in Play Console → **Setup → API access** (if not already linked).
3. **Invite the service account** in Play Console → **Users and permissions** →
   add `play-store-deployer@yuanying-511715.iam.gserviceaccount.com` with at least
   **Release to testing tracks** (Admin is simplest for a single-owner app).

### After enabling

Re-run the release (bump + tag, or **Actions → Android Release → Run workflow** with the
version). The Play step will upload the draft to the internal track; the GitHub Release is
independent and already published each time.

### Manual fallback

If the API/permissions aren't ready, the AAB from the GitHub Release is uploaded by hand
(see §2, step 4).

---

## 5. Monitoring

- **Web:** GitHub Actions `Deploy Web (Vercel)` runs + Vercel deployment status.
- **Collector:** Actions `Android Release` (tags) + `Android Collector` (debug on push).
- **Runtime:** `auth_events` (auth cutover), Supabase tables for data health.

A red workflow is the primary signal that self-upgrade is broken.

---

## 6. Failure modes → action

| Symptom | Cause | Action |
|---|---|---|
| `deploy.yml` fails "token not valid" | CLI OAuth token rotated | Set the dedicated `VERCEL_TOKEN` (§1) |
| PWA serves stale JS | old SW cache | SW v2 is network-first; hard-reload / reinstall |
| Collector not updating on phones | Play rollout not published / not on a track | Upload AAB, publish to the track |
| `AUTH_ENFORCE=true` but PWA/collector 401 | credentials not shipping | Set `AUTH_ENFORCE=false`, fix client, retry (see ES-004 runbook) |

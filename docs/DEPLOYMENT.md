# Deployment

## Prereqs

- Run the database setup/maintenance scripts in `scripts/SCRIPTS.md` before starting the server.

## PM2 (recommended)

```bash
npm install
pm2 start config/pm2/ecosystem.config.js --env production
pm2 save
```

Optional (one-off without ecosystem file):

```bash
pm2 start src/server.js --name info330
pm2 save
```

Common:

```bash
pm2 logs info330
pm2 restart info330 --update-env
pm2 list
```

Restart PM2 after code or env changes.

## Environment

- Ensure `.env` exists on the server.

## Verify

```bash
curl -s http://localhost:3000/status
```

Example:

```json
{"ok":true,"gitSha":"<commit>","deployedBy":"<alias>","deployedAt":"<iso_timestamp>","deployedAtPt":"<pt_timestamp>","statsDbSource":"session|healthcheck",...}
```

Lightweight check:

```bash
curl -s http://localhost:3000/health
```

Example:

```json
{"ok":true}
```

Notes:
- Uses session DB if the request includes the session cookie; otherwise uses the healthcheck user (`HEALTHCHECK_DB_USER`/`HEALTHCHECK_DB_PASS`).
- `GIT_SHA` overrides `gitSha`.
- `/health` is a lightweight alias that returns only `{"ok": true|false}`.

### Status fields (summary)
- Identity: `gitSha` (commit hash), `deployedBy` (deployer alias), `deployedAt` (process start ISO), `deployedAtPt` (same time in PT)
- DB selection: `statsDbSource` (session vs healthcheck), `statsDbUser`/`statsDatabase` (credentials + DB used for stats),
  `sessionDbUser`/`sessionDatabase` (logged-in user/DB), `currentDatabase` (what the stats connection is actually on)
- DB load: `dbConnectionsCurrentDb` (current DB connections), `dbConnectionsTotal` (server-wide total),
  `dbConnectionsMax` (server limit), `dbConnectionsPct` (string percent of max)
- DB sessions: `dbSessionsCurrentDb` (total sessions in current DB), `dbSessionsByState` (idle/active/etc breakdown)
- Pool: `poolTotalCount`, `poolIdleCount`, `poolWaitingCount` (app pool size, idle, and waiters)
- Errors: `dbStatsError`, `dbActivityError` (permissions/visibility or catalog access issues)

### Debug quick hits
- `statsDbSource=healthcheck` means you’re not seeing the student DB.
- High `dbConnectionsPct` or `poolWaitingCount` suggests connection pressure.
- Missing stats + `dbStatsError`/`dbActivityError` indicates permissions.

## Notes

- If you move the server entry file, update `config/pm2/ecosystem.config.js`.

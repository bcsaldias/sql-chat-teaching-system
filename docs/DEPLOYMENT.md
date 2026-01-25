# Deployment

## PM2 (recommended)

From the project root:

```bash
npm install
pm2 start src/server.js --name info330
pm2 save
```

Or, use the ecosystem config:

```bash
pm2 start config/pm2/ecosystem.config.js
pm2 save
```

Note: the ecosystem config sets `watch: false` (recommended for production). Enable watch only for local dev.

Common commands:

```bash
pm2 logs info330
pm2 restart info330
pm2 stop info330
pm2 delete info330
pm2 list
pm2 show info330
```

When you update `src/server.js` or `src/utils.js`, restart the process to pick up changes:

```bash
pm2 restart info330
```

If you want PM2 to start on boot, follow the output of:

```bash
pm2 startup
```

## Environment

- Ensure `.env` is present on the server.
- If you change environment variables, restart the process:

```bash
pm2 restart info330
```

## Verify

```bash
curl -s http://localhost:3000/health
```

Expected:

```json
{"ok":true,"gitSha":"<commit>","deployedBy":"<alias>","deployedAt":"<iso_timestamp>","deployedAtPt":"<pt_timestamp>","statsDbSource":"session|healthcheck","statsDbUser":"<db_user>","statsDatabase":"<db_name>","sessionDbUser":"<db_user|null>","sessionDatabase":"<db_name|null>","currentDatabase":"<db_name>","dbConnectionsCurrentDb":3,"dbConnectionsTotal":42,"dbConnectionsMax":100,"dbConnectionsPct":"42.0%","dbSessionsCurrentDb":12,"dbSessionsByState":{"active":2,"idle":10},"poolTotalCount":4,"poolIdleCount":2,"poolWaitingCount":0}
```

This endpoint runs a `SELECT 1` against the database. If it returns `{"ok":false}`, the DB check failed.
You can override the healthcheck credentials via `HEALTHCHECK_DB_USER` and `HEALTHCHECK_DB_PASS`
(defaults to `demo` / `demo`).

If available, the response includes `gitSha`. You can also set `GIT_SHA` in the environment
to override it. The `deployedBy` field comes from `DEPLOYED_BY`, and `deployedAt` is captured
when the server process starts (pm2 start/restart). `deployedAtPt` is the same timestamp
formatted in Pacific Time.

Connection fields:
- `statsDbSource`: `session` when a logged-in user is present, otherwise `healthcheck`.
- `statsDbUser`: db user used for stats queries.
- `statsDatabase`: mapped database for the stats user.
- `sessionDbUser`: logged-in db user (null if not logged in).
- `sessionDatabase`: mapped database for the session user (null if not logged in).
- `currentDatabase`: result of `current_database()` for the stats connection.
- `dbConnectionsCurrentDb`: current connections to this database.
- `dbConnectionsTotal`: total connections across all databases on the server.
- `dbConnectionsMax`: server-wide connection limit.
- `dbConnectionsPct`: total connections as a % of max (string with `%`, null if unavailable).
- `dbSessionsCurrentDb`: total sessions in `pg_stat_activity` for the current database.
- `dbSessionsByState`: per-state session counts for the current database.
- If stats queries are blocked for the healthcheck user, the response includes
  `dbStatsError` and omits the counts. If `pg_stat_activity` is blocked,
  `dbActivityError` is included and the session counts are omitted.

Pool fields:
- `poolTotalCount`: total connections in the app pool for the stats user.
- `poolIdleCount`: idle connections in the pool.
- `poolWaitingCount`: queued requests waiting for a pool connection.

## Debugging student issues (why these fields exist)
These health fields are included so you can debug problems from the **student’s perspective**
without logging in as them or SSHing into the DB.

What to look for:
- **Student says “works for you, not for us”**  
  Check `statsDbSource` and `statsDbUser`. If it says `session`, stats are coming from the
  student’s logged‑in DB user; if `healthcheck`, you’re not seeing their DB.
- **“We’re in the wrong DB” / data missing**  
  Compare `sessionDbUser` / `sessionDatabase` with `currentDatabase`. A mismatch means you’re
  not reading the same DB the student is using.
- **Login/connection failures**  
  If `/health` is `ok:false`, DB connectivity is broken for the stats user.  
  If `dbStatsError` exists, the stats user can’t read `pg_stat_database` (permissions).
- **App feels slow / requests hanging**  
  Look at `poolWaitingCount` (non‑zero means pool starvation) and `dbConnectionsPct`
  (near 100% means the server is at its max connections).
- **“Too many connections” / quota reached**  
  Check `dbConnectionsTotal` vs `dbConnectionsMax` and `dbConnectionsPct`.
- **Sessions stuck or not closing**  
  Use `dbSessionsByState` (lots of `idle` or `idle in transaction` indicates leaks or long sessions).
  `dbSessionsCurrentDb` shows total sessions for the current DB.

## Notes

- If you move the server entry file, update the PM2 start command accordingly.

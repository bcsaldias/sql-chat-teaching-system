# Deployment and Architecture (Instructor Handoff)

## Why isolation is per-database

Each group gets a separate PostgreSQL database (not just a separate schema). This avoids cross-group catalog visibility in pgAdmin and simplifies the student mental model.

Tradeoff: more roles/databases to manage and more total DB connections. Tune pool sizes and monitor connection usage in production.

## Repository map

- `src/server.js`: Express app and API routes
- `src/utils.js`: SQL contract, default/solution SQL, DB user -> DB mapping
- `src/instructor.js`: instructor-only routes and progress logging
- `src/populate_db.js`: seed/import routes for CSV-driven data population
- `public/`: frontend pages (`index.html`, `instructor.html`, `populate_db.html`) and JS/CSS
- `scripts/`: admin SQL/shell utilities for provisioning and monitoring
- `config/pm2/ecosystem.config.js`: PM2 runtime config
- `config/nginx/site.conf`: Nginx reverse proxy config template
- `data/populate_db/`: default CSV seed files for `/populate_db`
- `submissions/`: SQL snapshots and progress logs

## Key document index

Key markdown docs for instructors:

- `HANDOFF.md` (this file)
- [`../README.md`](../README.md): project overview and root entry point
- [`uw-ischool/MULTI_ENVIRONMENT_DEPLOYMENT.md`](uw-ischool/MULTI_ENVIRONMENT_DEPLOYMENT.md): UW iSchool-specific pattern for adding one faculty/course environment at a time on one server
- [`DEPLOYMENT.md`](DEPLOYMENT.md): supplementary PM2 operations, health/status verification, status field meanings
- [`SETTINGS.md`](SETTINGS.md): SQL contract alignment rules between server/client
- [`EXTENDING.md`](EXTENDING.md): how to add SQL Lab items, API routes, instructor features
- [`POPULATE_DB.md`](POPULATE_DB.md): populate tool behavior, CSV format, mapping rules
- [`GRADING.md`](GRADING.md): grading-oriented checks and milestone-specific notes
- [`TODO.md`](TODO.md): internal backlog notes
- [`../scripts/SCRIPTS.md`](../scripts/SCRIPTS.md): supplementary admin script catalog and ad hoc execution examples

## Prerequisites (new instructor)

- Node.js 18+ and npm
- PostgreSQL connectivity to your course DB host
- `psql` client (for running setup scripts)
- PostgreSQL role with enough privileges to create roles/databases for course setup
- PM2 (required for recommended server deployment)
- Nginx (required for recommended HTTPS student-facing deployment)
- Valid TLS certificate and private key for your server hostname

## Server setup for a new term (student-facing)

### 1) Install dependencies

```bash
npm install
```

### 2) Define admin DB connection variables

Set these in your shell before running provisioning scripts:

```bash
export PGHOST=your-db-host
export PGPORT=your-db-port
export PGUSER=your-admin-user
```

You can also inline values directly in each `psql` command instead of exporting.

### 3) Provision roles/databases (admin step)

Run the core setup scripts (details in [`../scripts/SCRIPTS.md`](../scripts/SCRIPTS.md)):

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/db_setup.sql
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/setting_demo.sql
```

Optional hardening pass:

```bash
PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" ./scripts/lock_schemas.sh
```

### 4) Update DB mapping if your cohort naming changed

This app uses a static username-to-database mapping in `src/utils.js` (`PGDATABASES_MAPPING`).

If your group usernames/database names differ from the current `grpXX_section` pattern, update that mapping before running the app.

- Every DB username used by the app must exist in `PGDATABASES_MAPPING`.
- Unmapped DB users can cause DB selection/login/status failures.
- If you will use demo mode, ensure `demo` is also mapped.

### 5) Configure environment

Create `.env` from `.env.example`, then edit it:

```bash
cp .env.example .env
```

Generate strong secrets (example):

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # INSTRUCTOR_TOKEN
```

Minimum values to set for a new deployment:

- `PGHOST`
- `PGPORT`
- `PORT` (default `3000`; must match your reverse-proxy upstream)
- `NODE_ENV=production`
- `SESSION_SECRET` (new random value)
- `HEALTHCHECK_DB_USER`
- `HEALTHCHECK_DB_PASS`
- `INSTRUCTOR_TOKEN` (new random value if you use instructor endpoints)
- `REAL_DEMO_PASSWORD` (required if you will use `ALLOW_SUPERUSER_MODE=true`)

Important:

- Rotate all secrets/tokens/passwords for your deployment.
- Keep `ALLOW_SUPERUSER_MODE=false` during normal student-facing operation.
- `SQL_SUBMISSIONS_DIR` and `SQL_PROGRESS_LOG` can stay at defaults unless you need custom paths.

Demo mode (optional):

- Provision the demo DB first (run [`../scripts/setting_demo.sql`](../scripts/setting_demo.sql) and load demo tables/query definitions, e.g., from `../solutions/demo_solution_channel_name_pk`).
- Keep `demo` access instructor-only; use it only for intentional live demos.
- Superuser solution mode is triggered by `ALLOW_SUPERUSER_MODE=true` and logged-in DB user `demo`.
- If app login uses DB credentials `demo/demo` in superuser mode, the app authenticates to PostgreSQL with `REAL_DEMO_PASSWORD` and executes `SOLUTION_SQL` from [`../src/utils.js`](../src/utils.js).
- Set the actual PostgreSQL password for role `demo` to `REAL_DEMO_PASSWORD` (not `demo`) so direct pgAdmin/psql login with `demo/demo` fails.
- If `ALLOW_SUPERUSER_MODE=true` but `REAL_DEMO_PASSWORD` is missing/incorrect, demo login requests will fail DB authentication.

### 6) Start app on the server (PM2)

```bash
pm2 start config/pm2/ecosystem.config.js --env production
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` so PM2 restarts on server reboot.

### 7) Configure Nginx + HTTPS

Use `config/nginx/site.conf` as a template:

- set your server hostname
- install a valid TLS certificate for that hostname (for example, Let's Encrypt)
- set `ssl_certificate` and `ssl_certificate_key` paths
- proxy traffic to `http://127.0.0.1:3000`
- enable HTTP -> HTTPS redirect
- allow inbound `80/443` in firewall/security groups
- keep port `3000` private (only Nginx should be public)

Then validate and reload:

```bash
nginx -t
sudo systemctl reload nginx
```

Students should use your HTTPS URL (for example: `https://<your-hostname>`).

## Runtime verification and day-to-day operations

After initial start, use [`DEPLOYMENT.md`](DEPLOYMENT.md) for:

- PM2 day-to-day commands (`logs`, `restart`, `save`, `list`)
- internal `/health` and `/status` checks
- public health/status checks through Nginx
- `/status` field meanings and debug guidance

## Post-deploy smoke test (student-facing)

Run this once after each deploy/restart:

1. Open `https://<your-hostname>` and confirm the login page loads without console/network errors.
2. Log in with a known group DB account and confirm the main app shell loads.
3. Verify the same group credentials can connect via pgAdmin (or `psql`) and via the web app login.
4. Open SQL Lab and run a safe read-only query template; confirm the request succeeds and UI updates.
5. Open `/populate_db` and confirm the page loads, default CSVs are visible, and preview works.
6. Open `/instructor` and confirm instructor data loads when `INSTRUCTOR_TOKEN` is provided.
7. Call `https://<your-hostname>/status` and verify `ok: true` plus expected DB stats fields.
8. Check PM2 logs for startup/runtime errors:

```bash
pm2 logs info330 --lines 100
```

## Optional local development run

If you are testing or prototyping changes locally (not student-facing):

```bash
npm start
```

Open `http://localhost:3000`.

## Instructor workflow quick start

1. Start app.
2. Log in with a group DB user on the main page.
3. Use SQL Lab to validate query contract progress.
4. Use `/instructor` for instructor views (requires `INSTRUCTOR_TOKEN`).
5. Use `/populate_db` to seed sample data when needed.

Related docs:

- SQL contract and error tagging: [`SETTINGS.md`](SETTINGS.md)
- Extension patterns: [`EXTENDING.md`](EXTENDING.md)
- Populate tool details: [`POPULATE_DB.md`](POPULATE_DB.md)
- Grading-oriented checks: [`GRADING.md`](GRADING.md)

## Common operations

For SQL contract changes, follow [`EXTENDING.md`](EXTENDING.md) (includes the contract checker workflow).
For PM2 runtime commands and health checks, use [`DEPLOYMENT.md`](DEPLOYMENT.md).
For DB monitoring/admin scripts, use [`../scripts/SCRIPTS.md`](../scripts/SCRIPTS.md).

## Common pitfalls

- Login succeeds but app features fail: usually schema/query contract mismatch, missing constraints, or wrong database.
- `status` endpoints fail DB stats: healthcheck user/password in `.env` are wrong or user lacks access.
- Unexpected demo behavior: `ALLOW_SUPERUSER_MODE` enabled when it should be disabled.
- New term users cannot log in: `PGDATABASES_MAPPING` not updated for new cohort naming.

## Notes on config files

- PM2 config: `config/pm2/ecosystem.config.js`
- Nginx reverse proxy template: `config/nginx/site.conf`

Adjust Nginx hostnames and certificate paths for your environment.

## Version context

Last course context in this repo:

- INFO 330, Winter 2026
- 60 groups (sections `ba`, `bb`, `ca`, `cb`) plus `demo` and `test0`

Treat this as a baseline and update naming, credentials, and mapping for future terms.

## Course customization

Some UI copy, documentation, and links in this repo still reference UW / INFO 330.
Before reusing this project for another course or institution, search the repo for
course-specific terms such as `INFO 330`, `UW`, `University of Washington`,
`Information School`, `belencsf`, and `@uw.edu`, then update branding, links, and
contact information as needed.

## Instructor-ready checklist

Use this before opening the project to students.

### Core readiness (server deployment)

- [ ] `npm install` completed with no errors.
- [ ] DB provisioning scripts ran successfully: `scripts/db_setup.sql`, `scripts/setting_demo.sql`, optional `scripts/lock_schemas.sh`.
- [ ] `src/utils.js` `PGDATABASES_MAPPING` matches this term's group usernames/database names.
- [ ] `.env` configured for this term (`PGHOST`, `PGPORT`, rotated `SESSION_SECRET`, valid `HEALTHCHECK_DB_USER`/`HEALTHCHECK_DB_PASS`, rotated `INSTRUCTOR_TOKEN`, `ALLOW_SUPERUSER_MODE=false`).
- [ ] `ALLOW_SUPERUSER_MODE=false` re-confirmed immediately before opening student access.
- [ ] Adjust `sanityChecks` in `src/server.js` at [L987](../src/server.js#L987) to match milestone expectations.
- [ ] Internal health endpoints pass on the server (`http://localhost:3000/health`, `http://localhost:3000/status`).
- [ ] Public health endpoints pass via Nginx/TLS (`https://<your-hostname>/health`, `https://<your-hostname>/status`).
- [ ] Post-deploy smoke test completed on the public URL.
- [ ] Instructor login flow works with a real group DB user/password.
- [ ] Verified a real group account can connect from a DB client (pgAdmin/`psql`) and from the web app.
- [ ] SQL Lab loads and can save/run templates.
- [ ] `/populate_db` page loads and can preview default CSVs.
- [ ] `/instructor` page is accessible with `INSTRUCTOR_TOKEN`.
- [ ] Demo behavior verified intentionally (only if needed for class demos).
- [ ] Public student handout link is current and shared with students.

### Server readiness (PM2 + Nginx + TLS)

- [ ] PM2 started from config file: `pm2 start config/pm2/ecosystem.config.js --env production`.
- [ ] PM2 process `info330` is online and logs are clean (`pm2 logs info330`).
- [ ] PM2 persistence configured (`pm2 save` and `pm2 startup` run for reboot survival).
- [ ] Nginx site config adapted from `config/nginx/site.conf` with correct hostname and certificate paths.
- [ ] TLS certificate is valid (not expired), matches the hostname, and key/cert paths resolve correctly.
- [ ] Firewall/security groups allow inbound `80/443` and do not expose `3000` publicly.
- [ ] Nginx upstream targets local app port (`127.0.0.1:3000`) only.
- [ ] `nginx -t` passes and Nginx reload succeeds.
- [ ] HTTPS is active and HTTP redirects to HTTPS.
- [ ] Reverse proxy works end-to-end (`https://<your-hostname>/health` returns `{"ok":true}`).
- [ ] Server deployment checks in `DEPLOYMENT.md` have been run.

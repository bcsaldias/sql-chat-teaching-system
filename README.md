# INFO 330 Project App (Winter 2026)

Author: Belén Saldías (bcsaldias)

I use this repo as the starter app + instructor tooling for the INFO 330 project. Students connect using their **group database username/password** on the login page, and then implement the SQL required by the project so the UI features work.

## Repo map

- `server.js` — Express server + API routes
- `utils.js` — helpers (SQL lab items, schema introspection, etc.)
- `public/` — front-end (`index.html`, `app.js`, `styles.css`)
- `scripts/`
  - `db_setup.sql` — initial DB/role/database setup (instructor/admin use)
  - `setting_demo.sql` — demo-mode configuration (instructor/admin use)
  - `lock_schemas.sh` — locking/protecting schemas (instructor/admin use)

## Student handout
Project description for students:
- https://docs.google.com/document/d/1upYG42Qma86mFbseEzACk7b-XjN6ToJfg_MIDR6ffxE/edit?tab=t.0

## Instructor quick start (my flow)

### 1) Configure `.env`
I create a `.env` file in the repo root (already present on the server). Typical values:

- `PGHOST=is-info330.ischool.uw.edu`
- `PGPORT=5433`
- `SESSION_SECRET=...`
- `PORT=3000`
- `SUPERUSER_MODE=false` (I only turn this on for specific demos/tests)

> Students do **not** set `PGHOST`/`PGPORT` in their browser. They only enter their DB username/password on the login page.

### 2) Install + run
From the repo root:

- `npm install`
- `pm2 start server.js --name info330`
- `pm2 logs info330`

If I change code and want a clean restart:
- `pm2 restart info330`

Then I open:
- `http://localhost:3000`

## Demo accounts / teaching flow

### `demo` (show the “working” app)
I use `demo` when I want to show the intended behavior quickly (i.e., everything working). This is useful for live demos and sanity checks.

### `test0` (show what breaks without required SQL)
I use `test0` when I want to demonstrate that the UI depends on the database work (missing tables/constraints/queries => features fail). This helps motivate the checklist.

## Running instructor scripts

### `scripts/db_setup.sql`
I run this when I’m doing initial environment/DB provisioning (roles/databases/permissions). This is **instructor/admin-only**.

### `scripts/setting_demo.sql`
I run this when I’m setting up or resetting demo behavior for the course (instructor/admin-only).


## Common gotchas I watch for

- **“Login works but nothing loads”**  
  Usually means students created tables in the wrong schema/database, or they’re missing required constraints (FKs, PKs, CHECKs), or their column names don’t match what the app expects.

- **Confusing `SUPERUSER_MODE`**  
  I keep it `false` for normal operation. I only enable it when I explicitly want to test against the “solution/ground truth” behavior.

## Versions
- INFO 330 — Winter 2026 (iSchool)

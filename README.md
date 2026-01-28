# INFO 330 Project App (Winter 2026)

Author: Belén Saldías (bcsaldias)

I use this repo as the starter app + instructor tooling for the INFO 330 project. Students connect using their **group database username/password** on the login page, and then implement the SQL required by the project so the UI features work.

## Different DB vs different schemas (isolation)
I originally tried separate schemas per group, but pgAdmin (which we use for the class) still exposes other schemas via the public catalog. Even with GRANTs locked down, students could still **see names** they didn’t own, which is confusing in a teaching context.
To avoid cross‑group visibility, each group now gets its **own database**. This is heavier (more roles/databases to manage) but gives clearer isolation and simpler mental models for students (“your whole DB is yours”).
If you run this at larger scale, watch your Postgres `max_connections` and use small per‑group pools to avoid connection storms.

## Repo map

- `src/server.js` — Express server + API routes
- `src/utils.js` — helpers (SQL lab items, schema introspection, etc.)
- `public/` — front-end (`index.html`, `app.js`, `styles.css`)
- `scripts/` — instructor/admin utilities for DB ecosystem setup (see `SCRIPTS.md`)
- `config/pm2/ecosystem.config.js` — PM2 process config
- `docs/DEPLOYMENT.md` — deployment notes (PM2, env)

## Docs (start here)
- `docs/SETTINGS.md` — SQL contract + error tagging rules
- `docs/EXTENDING.md` — how to add SQL keys, routes, and UI wiring
- `docs/DEPLOYMENT.md` — deployment notes (PM2, env)

## Client-side constraints (deterrents)
These are UI-level deterrents (not security guarantees):

- SQL Lab: copy/cut blocked inside the panel.
- SQL Lab: right-click/context menu disabled.
- SQL Lab: static instructions/chips/required/meta text are non-selectable (textareas remain editable).
- SQL Lab: printing disabled (Ctrl/Cmd+P blocked; File → Print shows a “Printing disabled in SQL Lab” page).
- Chat tab: right-click/context menu disabled.

## Quick start (local)

### 1) Configure `.env`
Create a `.env` file in the repo root. Typical values:

- `PGHOST=is-info330.ischool.uw.edu`
- `PGPORT=5433`
- `SESSION_SECRET=...`
- `PORT=3000`
- `ALLOW_SUPERUSER_MODE=false`
- `PG_POOL_MAX=3`
- `PG_POOL_IDLE_MS=30000`
- `PG_POOL_CONN_MS=5000`

### 2) Install + run
From the repo root:

- `npm install`
- `npm start` (or `node src/server.js`)

Then open:
- `http://localhost:3000`

## Student handout
Project description for students:
- https://docs.google.com/document/d/1upYG42Qma86mFbseEzACk7b-XjN6ToJfg_MIDR6ffxE/edit?tab=t.0

## Instructor quick start (my flow)

### 1) Configure `.env`
I create a `.env` file in the repo root (already present on the server). Use the same values as in **Quick start (local)**. I only turn `ALLOW_SUPERUSER_MODE` on for specific demos/tests.

> Students do **not** set `PGHOST`/`PGPORT` in their browser. They only enter their DB username/password on the login page.

### 2) Install + run
From the repo root:

- `npm install`
- `pm2 start src/server.js --name info330`
- `pm2 logs info330`

If I change code and want a clean restart:
- `pm2 restart info330`

Then I open:
- `http://localhost:3000`

## Demo accounts / teaching flow
- `demo`: shows the intended behavior quickly (everything working).
- `test0`: shows what breaks without required SQL (useful for demos).

## Instructor tooling (brief)
- SQL Lab status, error hints, and progress logging are covered in `docs/SETTINGS.md`.
- Extending the instructor dashboard is covered in `docs/EXTENDING.md`.


## Feature flags and env toggles

- **`ALLOW_SUPERUSER_MODE`**: When `true`, logging into the DB as `demo` causes the server to run **solution SQL** (from `src/utils.js`) instead of student templates. Useful for demos.


## Running instructor scripts

### `scripts/db_setup.sql`
I run this when I’m doing initial environment/DB provisioning (roles/databases/permissions). This is **instructor/admin-only**.

### `scripts/setting_demo.sql`
I run this when I’m setting up or resetting demo behavior for the course (instructor/admin-only).


## Common gotchas I watch for

- **“Login works but nothing loads”**  
  Usually means students created tables in the wrong **database**, or they’re missing required constraints (FKs, PKs, CHECKs), or their column names don’t match what the app expects.

- **`ALLOW_SUPERUSER_MODE`**
  I keep it `false` for normal operation. I only enable it when I explicitly want to test against the “solution/ground truth” behavior, and it only works with the db `demo`.

## Versions
- INFO 330 — Winter 2026 (iSchool)

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
- `scripts/`
  - `db_setup.sql` — initial DB/role/database setup (instructor/admin use)
  - `setting_demo.sql` — demo-mode configuration (instructor/admin use)
  - `lock_schemas.sh` — locking/protecting schemas (instructor/admin use)
- `config/pm2/ecosystem.config.js` — PM2 process config
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

### `demo` (show the “working” app)
I use `demo` when I want to show the intended behavior quickly (i.e., everything working). This is useful for live demos and sanity checks.

### `test0` (show what breaks without required SQL)
I use `test0` when I want to demonstrate that the UI depends on the database work (missing tables/constraints/queries => features fail). This helps motivate the checklist.

## Instructor error‑trigger scenarios (SQL Lab keys)
Use these to reliably produce failures and see how the UI flags them. Each scenario shows which SQL Lab item should flip to **fail** (red dot), and where the error message surfaces in the UI.

- **Group DB login (not a SQL Lab key)**: Enter a wrong DB username/password on the first login screen. Error appears under the login form.
- **`user_register`**: Click **Register** with a username that already exists (or with broken `users` table). Error appears under the chat-user auth form.
- **`user_login`**: Click **Log in** with a bad password (or broken `user_login` query). Error appears under the chat-user auth form.
- **`update_password`**: Open **Reset password** and submit with a wrong current password (or broken `update_password` query). Error appears inside the reset modal.
- **`channels_list`**: Log in as a chat user (or refresh channels). Error appears near the channels list and the sidebar empties.
- **`channel_join`**: Click **Join** on any channel. Error appears near the channels list.
- **`channel_leave`**: Click **Leave** on any joined channel. Error appears near the channels list.
- **`channel_create`**: Click **Create channel**, submit the modal. Error appears in the modal.
- **`member_check`**: Open a channel you should be a member of (or break the query / membership rows). Error appears near the channel list and the messages panel stays hidden.
- **`messages_list`**: Open a joined channel after `member_check` passes (or break the query). Error appears near the composer/message area.
- **`message_post`**: Click **Send** with a non‑empty message. Error appears near the composer; an optimistic bubble is removed on failure.
- **`channel_members_list`**: Click the “X members” badge next to the active channel description (only shows if `channels_list` returns `user_count`). Error appears in the members modal.
- **`/api/test_schema`**: Click **Test Schema** in SQL Lab. Errors show next to the button if required tables/columns/types are missing.

Tip: the SQL Lab “Last input” box shows the exact parameter values used ($1, $2, …) for each failed query, which is a fast way to confirm the mismatch.

## SQL Lab tips, flags, and UI cues

- **Status flags (per query)**: Each SQL Lab item has a status dot with three states: *Not tested*, *Pass*, *Fail*. Status updates happen when the app calls the corresponding API route.
- **Last input / Last error / Tip**: The SQL Lab item shows the most recent parameters, error message, and (for inserts) a tip. Insert keys (`user_register`, `channel_join`, `channel_create`, `message_post`) show: “Insert succeeded. Open pgAdmin and run a SELECT to verify.”
- **Expected output hints**: Many items display “Expected columns” chips and (sometimes) a required SQL snippet to keep students aligned with column names/types.
- **Progress bar**: Counts passed items vs total SQL Lab items and fills the bar accordingly.
- **Confetti**: Triggers only when **all** SQL Lab items are pass in the same user journey. Resets if any item fails or is reset.
- **SQL save behavior**: SQL is auto‑saved when switching from SQL Lab → Chat. If a template fails validation, the app keeps you on the SQL tab and shows a “SQL save failed” message.
- **Reset buttons**: “Reset to SQL defaults” restores starter templates. “Reset SQL lab status” clears pass/fail flags, last input/error/tip, and resets confetti/progress.
- **SQL template guardrails** (server‑side validation):
  - One statement only (no extra `;`)
  - Must start with `SELECT`, `INSERT`, `DELETE`, `UPDATE`, or `WITH`
  - No `*` except inside `COUNT(*)`
  - No `--` comments
  - No `DROP`, `ALTER`, or `CREATE`
- **Local storage signals**: SQL Lab stores last input/error/tip, last save time, and editor heights in `localStorage` so instructors can refresh without losing diagnostics.
- **Message load trace**: `/api/messages` returns `sqlKey` / `sqlTrace` on failure so the UI can flag `member_check` vs `messages_list` correctly.

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

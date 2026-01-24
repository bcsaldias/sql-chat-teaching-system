# Scripts

Instructor/admin utilities for provisioning and monitoring the INFO 330 project databases.

## Contents

- `db_setup.sql` — creates `project_admin`, group roles, databases, and DB-level lockdown.
- `setting_demo.sql` — creates/resets the `demo` role and `__project_demo_app` with locked-down access.
- `lock_schemas.sh` — iterates through group DBs and locks the `public` schema per group.
- `monitor_usage.sql` — handy queries for active/idle connections and long-running sessions.

## Typical usage

Run SQL files with `psql` as a superuser or admin:

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/db_setup.sql
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/setting_demo.sql
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/monitor_usage.sql
```

`lock_schemas.sh` uses `PGUSER`, `PGHOST`, and `PGPORT` env vars (defaults are set inside the script). Example:

```bash
PGHOST=is-info330.ischool.uw.edu PGPORT=5433 PGUSER=postgres ./scripts/lock_schemas.sh
```

## Notes / cautions

- These scripts are intended for instructor/admin use only.
- `monitor_usage.sql` includes optional termination/restart snippets — use with care.

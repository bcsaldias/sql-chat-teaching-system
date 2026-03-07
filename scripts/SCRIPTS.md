# Scripts

Instructor/admin utilities for provisioning and monitoring the INFO 330 project databases.
This file supplements [`../docs/HANDOFF.md`](../docs/HANDOFF.md). Use
[`../docs/HANDOFF.md`](../docs/HANDOFF.md) for the canonical first-run setup order,
and use this file as a script catalog plus ad hoc reference.

## Catalog

- `db_setup.sql` — creates `project_admin`, group roles, databases, and DB-level lockdown.
- `setting_demo.sql` — creates/resets the `demo` role and `__project_demo_app` with locked-down access.
- `lock_schemas.sh` — iterates through group DBs and locks the `public` schema per group.
- `monitor_usage.sql` — handy queries for active/idle connections and long-running sessions.

## First-run provisioning

For the canonical new-term setup sequence and exact provisioning commands, see
[`../docs/HANDOFF.md`](../docs/HANDOFF.md).

## Ad hoc usage

`lock_schemas.sh` uses `PGUSER`, `PGHOST`, and `PGPORT` env vars (defaults are set inside the script). Example:

```bash
PGHOST=is-info330.ischool.uw.edu PGPORT=5433 PGUSER=postgres ./scripts/lock_schemas.sh
```

`monitor_usage.sql` is useful for live DB inspection:

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -f scripts/monitor_usage.sql
```

## Notes / cautions

- These scripts are intended for instructor/admin use only.
- `monitor_usage.sql` includes optional termination/restart snippets — use with care.

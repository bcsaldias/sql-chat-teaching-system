# Grading Notes

This file supplements [`HANDOFF.md`](HANDOFF.md) and focuses only on grading-specific
checks and course-timing adjustments. Use [`HANDOFF.md`](HANDOFF.md) for deployment
and instructor operations, and use [`SETTINGS.md`](SETTINGS.md) /
[`EXTENDING.md`](EXTENDING.md) for SQL contract changes.

## sanityChecks

This section captures quick, low-risk checks we add to the grading workflow to confirm database schema and query shape before running deeper tests. The goal is to catch missing tables/columns early with a fast, non-destructive query.

### Running Sanity Checks

The sanity checks are implemented in the server code at [src/server.js](../src/server.js).

In the grading workflow, run these checks first to verify schema integrity before proceeding to deeper tests. Set `SANITY_CHECK_MILESTONE` in `.env`, then restart the app so `/api/test_schema` matches the currently released milestone.

Recommended values:

- `SANITY_CHECK_MILESTONE=1`: skip milestone 2+ schema sanity checks
- `SANITY_CHECK_MILESTONE=2`: require `users`, `channels`, and `channel_members`
- `SANITY_CHECK_MILESTONE=3`: also require the messages table plus resolvable user/channel keys, either as direct foreign keys to `users` and `channels` or through a composite foreign key to `channel_members`

Default behavior is milestone `2` if the env var is unset or invalid.

These sanity checks only verify the presence of required tables, columns, and referential constraints. Other column names can still vary through the alias-based schema detection in the server.

## CTE sequencing (channels_list)

Before the course teaches CTEs, keep `SQL_CONTRACT.channels_list.firstWords` set to `["select"]` so the frontend expects a `SELECT` start. Once CTEs are covered in lecture, update it to `["with", "select"]` to allow `WITH` queries.

## superuser

in .env set after milestone 1:
```
+ALLOW_SUPERUSER_MODE=false
```

# Settings Alignment Guide

This file is the source-of-truth reference for SQL contract and alignment rules.
Use it when changing SQL templates, SQL lab items, or related endpoints. Use
[`EXTENDING.md`](EXTENDING.md) for the step-by-step code-change workflow and
[`HANDOFF.md`](HANDOFF.md) for deployment and instructor operations.

## SQL contract (source of truth)
- **Location**: `src/utils.js` → `SQL_CONTRACT` defines required first words + expected columns.
- **Defaults**: `DEFAULT_SQL` is generated from `SQL_CONTRACT` (first word list → default verb).
- **Server enforcement**: `src/server.js` reads `SQL_CONTRACT` in `validateSqlTemplate` (first word) and `assertExpectedCols` (columns). All template queries should go through `runSql`.
- **Client UI skeleton**: `public/app.js` → `SQL_LAB_ITEMS` holds text, grouping, and layout. Keys must match `SQL_CONTRACT`.
- **Client UI requirements**: `/api/sql_templates` returns `{ templates, contract }`, and `applySqlContract()` merges contract fields into `SQL_LAB_ITEMS` so “Expected columns” render. Tradeoff: the UI depends on this contract payload.
- **Client status hooks**: wherever the query runs in `public/app.js`, call `recordSqlInput`, `flagQueryStatus`, and `recordSqlError` with the same key.

## Schema checks vs. SQL contract
- **Schema checks** live in `/api/test_schema` (`src/server.js`). They verify *tables/columns exist* in the database and can be flexible via alias lists.
- **SQL contract** checks the *query output* (column names/types) returned by student SQL. This is what keeps the UI stable.
- **Pedagogical rule of thumb**: allow flexible schema names if you want, but require students to alias query outputs to the contract names (e.g., `SELECT channel_name AS name`).

## App-facing identity assumptions
- User-facing auth and membership flows are keyed by `username`.
- Channel-facing routes pass `channel_id` through the browser -> server -> SQL path, and the server adapts incoming `channel_id` values to the detected channel primary-key type. Supported schemas may therefore use either text or numeric channel keys.
- Students may use surrogate user IDs internally, but their SQL must still satisfy the app's username-based contract.

## SQL validation constraints
- Server enforces: `MAX_SQL_TEMPLATE_LEN`, allowed first words, no `*` outside `COUNT(*)`, no `--` comments, no `DROP/ALTER/CREATE`.
- Client should mirror: `MAX_SQL_LEN`/`SQL_LEN_WARN` match server max; UI hints reflect server restrictions; consider exposing max via `/api/sql_templates` to avoid drift.
- CTE note: templates that start with `WITH` are currently rejected when a key has an explicit first‑word list (even if the CTE leads to the expected verb). To allow CTEs, update `validateSqlTemplate` to accept `WITH` and then validate the next verb matches the contract.

## SQL error tagging (for UI guidance)
- **Server**: include `sqlError`/`sqlKey` in `dbError` responses for SQL-template failures.
  - Use `runSql` and `sqlErrorExtra` where applicable.
- **Client**: `api()` reads `sqlError`; `maybeAddSqlTraceHint()` uses it to show “Go to SQL tab…” only for SQL errors.
- **Meaning of `sqlError === false`**: explicitly marks a failure as *not* caused by a SQL template (ex: auth, membership, validation). The UI should avoid showing SQL Lab guidance even if `sqlKey/sqlTrace` exist.
- **Why (student-facing)**: prevents confusing guidance on auth/validation mistakes while still pointing students to the SQL Lab when their query is the cause.
- **Why this matters for beginners**: first-time coders anchor on the first error they see; if it points to the wrong place, they lose time and confidence. Tagging SQL errors keeps feedback accurate and reduces random trial-and-error.

## Extending checklist
See [`EXTENDING.md`](EXTENDING.md) for the step-by-step checklist when adding new
SQL Lab items or API routes. This doc focuses on the contract rules and alignment
requirements.

# How to Extend This Project

This app is simple to run, but extensions work best when you follow the shared "contract" between server, client, and SQL templates. The steps below keep everything aligned.

## Quick mental model
- The SQL Lab keys are the glue. The same key appears in `src/utils.js`, `public/app.js`, and `src/server.js`.
- The contract details (first words, expected columns, validation rules) live in `docs/SETTINGS.md`.

## Related docs worth skimming
- `docs/SETTINGS.md` for the full contract + error-tagging rules.
- `docs/DEPLOYMENT.md` for environment setup and runtime notes.
- `README.md` for quick start and instructor tooling overview.

## File map (where to look first)
- `src/server.js`: API routes, `runSql`, SQL template endpoints, schema test route.
- `src/utils.js`: `SQL_CONTRACT`, `SOLUTION_SQL`, schema introspection helpers.
- `public/app.js`: SQL Lab UI, status tracking, error hints, and client calls.
- `public/instructor.*` + `src/instructor.js`: instructor dashboard + progress logging.

## Add a new SQL Lab item + API route
1. Add a key in `src/utils.js` -> `SQL_CONTRACT` (first word, expected columns).
2. Add a solution SQL in `src/utils.js` -> `SOLUTION_SQL`.
3. Add a SQL Lab item in `public/app.js` -> `SQL_LAB_ITEMS` (same key).
4. Add or update an API route in `src/server.js` and call `runSql(req, client, "<key>", params)`.
5. Ensure API errors include `sqlError`/`sqlKey` (use `runSql` + `sqlErrorExtra` in `dbError`).
6. In the UI code path that triggers the query, call:
   - `recordSqlInput("<key>", params)`
   - `flagQueryStatus("<key>", true/false)`
   - `recordSqlError("<key>", msg)` on failure
7. Make sure `/api/sql_templates` is loaded so `applySqlContract()` hydrates expected columns in the UI.

## If you change schema expectations
1. Update `/api/test_schema` in `src/server.js` so the checks match the new required tables/columns.
2. If channel/user IDs change types or names, update schema introspection in `src/utils.js`
   (`loadChannelMembershipKeys`, `parseChannelId`) so IDs are parsed correctly.
3. Revisit any SQL templates that depend on column names or PK/FK structure.

## Add a new UI feature (not a SQL template)
1. Decide if it needs a new API route or can reuse existing data.
2. If adding a route, follow the same pattern: `dbRoute(...)`, `dbError(...)`, and return clear errors.
3. Keep user-facing errors short and direct (novice-friendly).

## Add a new API route (template)
Use this as a starting point and customize the name, params, and SQL key:

```js
app.post("/api/example", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  const { some_param } = req.body || {};
  if (!some_param) return res.status(400).json({ error: "some_param is required." });

  const { dbUser, dbPass } = req.session;
  const result = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "example_key", [some_param]);
    return r.rows;
  });

  res.json({ ok: true, result });
}, (e) => dbError("Request failed.", String(e.message || e), 400, sqlErrorExtra("example_key", e))));
```

## Add an instructor feature
1. Add routes in `src/instructor.js`.
2. Guard with `requireInstructor` and the `INSTRUCTOR_TOKEN` env var.
3. Add UI in `public/instructor.html` and JS in `public/instructor.js`.

## Env + data locations you might touch
- `.env`: `ALLOW_SUPERUSER_MODE`, `INSTRUCTOR_TOKEN`, `SQL_PROGRESS_LOG`, pool sizes, etc.
- `submissions/`: SQL snapshots and progress logs (JSONL).

## Common pitfalls
- Mismatched SQL Lab keys between server/client/contract.
- Skipping `runSql` (loses expected-column checks + `sqlError` tagging).
- Forgetting to call `recordSqlInput/flagQueryStatus/recordSqlError` in the UI path.
- Not loading `/api/sql_templates` before rendering SQL Lab (missing expected columns).
- Changing PK/FK types without updating `parseChannelId` + schema introspection.

## Safe defaults for beginners
- Prefer clear, constrained SQL contracts over flexible ones.
- Always tag SQL errors so the UI can guide students to the right place.
- Keep required columns stable so students can match expected output.

## Suggested quick test
1. Run the app, log in, and open SQL Lab.
2. Trigger the new API route from the UI.
3. Confirm the SQL item flips pass/fail and the error hint shows only when appropriate.

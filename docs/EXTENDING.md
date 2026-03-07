# How to Extend This Project

This file is the step-by-step workflow for extending the app. Use
[`SETTINGS.md`](SETTINGS.md) for the source-of-truth contract/alignment rules and
[`HANDOFF.md`](HANDOFF.md) for deployment and instructor operations.

## Start here
- Contract rules: [`SETTINGS.md`](SETTINGS.md)
- Entry points: `src/server.js`, `public/app.js`, `src/utils.js`
- Deployment/runtime: [`HANDOFF.md`](HANDOFF.md), [`DEPLOYMENT.md`](DEPLOYMENT.md)

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
3. Review the schema alias lists in `src/server.js` (`CHANNEL_NAME_ALIASES`, `CHANNEL_DESC_ALIASES`, `USER_PASSWORD_ALIASES`)
   and update them as needed for your cohort/deployment.
4. Revisit any SQL templates that depend on column names or PK/FK structure.

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

## Wiring rules (don’t skip)
- Keys must match across `SQL_CONTRACT`, `SQL_LAB_ITEMS`, and API routes.
- Use `runSql(..., "<key>")` on the server and `recordSqlInput/flagQueryStatus/recordSqlError` on the client.
- Use explicit string literals so the checker can see them.
- Load `/api/sql_templates` so `applySqlContract()` hydrates expected columns.

## Safe defaults for beginners
- Keep contracts constrained, errors tagged, and columns stable.

## Suggested quick test
1. Run the app, log in, and open SQL Lab.
2. Trigger the new API route from the UI.
3. Confirm the SQL item flips pass/fail and the error hint shows only when appropriate.
4. Run the contract checker: `npm run check:contract`.

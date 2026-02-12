
### sanityChecks

This section captures quick, low-risk checks we add to the grading workflow to confirm database schema and query shape before running deeper tests. The goal is to catch missing tables/columns early with a fast, non-destructive query.

Add the following only for milestone 3. Place them before the other sanity check queries and keep the rest unchanged.

    - `select body, created_at from chat_inbox limit 0;`,
    - `select ${userFkCol}, ${chatFkCol}, body, created_at from chat_inbox limit 0;`,

### CTE sequencing (channels_list)

Before the course teaches CTEs, keep `SQL_CONTRACT.channels_list.firstWords` set to `["select"]` so the frontend expects a `SELECT` start. Once CTEs are covered in lecture, update it to `["with", "select"]` to allow `WITH` queries.

### superuser

in .env set after milestone 1:
```
+ALLOW_SUPERUSER_MODE=false
```

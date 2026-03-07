# INFO 330 Project App (Instructor Handoff)

This repository contains the INFO 330 SQL-powered chat app, plus instructor tooling for provisioning group databases, monitoring usage, and grading support.

Students log in with their group database username/password in the app UI. The app behavior depends on the SQL and schema they implement in their own group database.

## Project context

Most apps people use every day (TikTok, Discord, Slack, Facebook Messenger, iMessage) feel like "frontend apps." Underneath, they rely on a database that: stores messages reliably (data persists, even if the app reloads), prevents bad data (constraints, foreign keys, check rules), and returns results in the exact format the app expects (column names, types, and ordering matter).

In this project, students build the database backend using only SQL. A pre-built web app connects to each group's schema and works only if SQL objects are correct. Before milestone work begins, verify each group can connect to their database from both a DB client (pgAdmin/`psql`) and the web app.

    Important: Neither the database schema nor the SQL queries that drive frontend data views (for example, loading channels and messages) are pre-implemented; those are student deliverables.

What success looks like: students can open the app, sign up, log in, join channels, post messages, and see those messages appear correctly because the database is doing the work.

What we provide:

- A working web app that reads and posts messages to each group's database schema.
- One private database per group, along with group login credentials.
- Two client environments for connecting to the same database: the INFO 330 SQL Chat App and pgAdmin.

## App Agnostic to Schema
- The working web app frontend is **completely agnostic** to the database schema. It only *probes* the schema when students click the `Test Schema` button to run initial [sanity checks](src/server.js#L987) (see [`Schema ERD`](#schema-erd) for details).
  - This button only checks for the presence of referential constraints between tables, since other column names are flexible. (See [GRADING.md](docs/GRADING.md) for sanity check details and grading workflow.)
- In the [`SQL Lab tab`](#sql-lab-tab), the system only validates that query results have the expected column names, regardless of how the student achieves this. It does not check for query accuracy or business logic correctness—only the 'shape' of the returned table.
  - Students can validate query accuracy by interacting with the app, as errors will manifest in broken features (e.g., failed logins or missing messages).
  - Instructors should still manually verify the accuracy of student queries.

## Schema ERD

Reference ERD for the baseline chat schema:

<p align="center">
  <img src="public/assets/basic_erd_opt0.png" alt="Basic ERD" />
</p>

This ERD is a baseline teaching model, not a rigid requirement. The schema is intentionally flexible and can use natural keys (for example, channel name as PK) or surrogate keys (for example, `channel_id`/`user_id`), based on course coverage and instructor priorities.

Students may use supported column-name variants and should alias query outputs to SQL Lab contract names (for example, `SELECT channel_name AS name`).

Implementation scope for students:

- The frontend includes a lightweight sanity check via the `Test Schema` button (the schema-check step). Instructors can adjust this step as scaffolding evolves. Adjust `Test Schema` in `src/server.js` at [L987](src/server.js#L987) to match milestone expectations.
- `Test Schema` validates baseline structure only: core tables, key columns, and required foreign-key relationships must be discoverable (including supported alias names), and basic `SELECT ... LIMIT 0` probes must execute successfully.
- `Test Schema` does not validate full query semantics, business logic, or end-to-end UI behavior.
- Code references: backend route [`GET /api/test_schema` in `src/server.js`](src/server.js#L936), frontend trigger [`testSchemaBtn` click handler in `public/app.js`](public/app.js#L389), and button markup [`Test Schema` in `public/index.html`](public/index.html#L217).
- Beyond that check, students are expected to support only the SQL behavior defined in SQL Lab (query contract and required outputs).
- Students are not required to implement features beyond what SQL Lab and the app contract exercise; adding unsupported schema/features is discouraged.

## SQL Lab Tab

The SQL Lab tab is where students iteratively implement, test, and save the SQL queries that power core app behavior. It serves as the contract surface between backend SQL work and frontend functionality, so students should use it as the primary place to validate required outputs before moving on.
<p align="center">
  <img src="public/assets/sql-lab-tab-example.png" alt="SQL Lab tab example" width="700" />
</p>

When students achieve **11/11** passing queries, their complete SQL implementation is automatically saved to the server's `submissions/` directory *for review and monitoring*. These might not be students' final versions, since some queries will pass the test but be incorrect. Therefore, instructors should still ask students to submit what they decide is their final version for grading.

## Recommended Student Scaffolding

This project can be scaffolded in milestones. One example handout is below.

Recommended scaffolding:

- **Milestone 1**: Write down user-facing app requirements, being explicit about the columns used and expected output columns, with a focus on data flow. Complete the ERD and data dictionary so students can envision the data flow.
- **Milestone 2**: Full implementation and simple inserts for `users`, `channels`, and `channel_members`.
  - Milestone 2 `Test Schema` scope: only three tables checked.
    
    <p align="center">
      <img src="public/assets/check-schema-flag.png" alt="Test Schema" width="320" />
    </p>
- **Milestone 3**: Full implementation and simple inserts for `messages` (can also be named `chat_inbox`). Include index implementations.
  - Milestone 3 `Test Schema` scope: all four tables checked.
- **Milestone 4**: Full implementation of the SQL Lab tab. Remind students to go back to Milestone 1, where they explained what is needed. Then clean up columns that students realize are not part of the intended data flow (fixing mistakes from Milestone 1).
  - Milestone 4 progress can be tracked at `/instructor` using the instructor token.
  - Instructor dashboard preview (Milestone 4 tracking):
      ![Instructor dashboard preview](public/assets/instructor-dashboard.png)
- **Milestone 5**: DB population and business queries, including updates to some column types to meet new data-load requirements.
- **Milestone 6**: Reflection.

## Student Handout

Share the student-facing project details with your class.

**Handout Versions**:

| Version | Term and Context | Course | Instructor | Students | Link | Notes |
|---------|---|---|---|---|---|---|
| V0 | Winter 2026, University of Washington | INFO 330 B | belencsf@uw.edu | 65 | <a href="https://docs.google.com/document/d/1upYG42Qma86mFbseEzACk7b-XjN6ToJfg_MIDR6ffxE" target="_blank" rel="noopener noreferrer">Handout</a> | Initial release
| V0 | Winter 2026, University of Washington | INFO 330 C | belencsf@uw.edu | 65 | 〃 | Initial release



## Instructor Docs

Detailed instructor setup, deployment steps, architecture notes, and readiness
checklists now live in [`docs/HANDOFF.md`](docs/HANDOFF.md).

Quick links:

- [`docs/HANDOFF.md`](docs/HANDOFF.md): full handoff runbook, architecture notes, and instructor checklist
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): PM2 deployment and health/status reference
- [`scripts/SCRIPTS.md`](scripts/SCRIPTS.md): admin SQL/shell scripts for DB provisioning and monitoring
- [`docs/SETTINGS.md`](docs/SETTINGS.md): SQL contract alignment rules
- [`docs/EXTENDING.md`](docs/EXTENDING.md): adding SQL Lab items, routes, and instructor features
- [`docs/POPULATE_DB.md`](docs/POPULATE_DB.md): populate/import tool behavior
- [`docs/GRADING.md`](docs/GRADING.md): grading workflow and milestone notes
- [`docs/DOCKER_OPTION.md`](docs/DOCKER_OPTION.md): isolated note on a future Docker path

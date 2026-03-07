# Populate DB

This tool seeds a group database with sample data from CSVs. It is available at `/populate_db` after you log in with a group database username and password.
This file is feature-specific reference for `/populate_db`; use
[`HANDOFF.md`](HANDOFF.md) for deployment and instructor workflow.

## Where it lives
- Server routes: `src/populate_db.js` (registered in `src/server.js`)
- UI: `public/populate_db.html` + `public/populate_db.js`
- Default CSVs: `data/populate_db/users.csv`, `data/populate_db/channels.csv`, `data/populate_db/members.csv`, `data/populate_db/messages.csv`

## Quick usage
1. Log in to the app with a group database username/password.
2. Visit `/populate_db`.
3. Use the default CSVs or upload your own.
4. Click the schema suggestions button to auto-fill DB column mappings.
5. Confirm whether your schema uses IDs or names for users and channels.
6. Preview, then run.

## Defaults and mapping
Default table names and CSV headers are below. The UI lets you edit any of these.

| Entity | Default table | Required CSV headers | Notes |
| --- | --- | --- | --- |
| Users | `users` | `username`, `password` | `user_id` required if user PK mode is `id`. |
| Channels | `channels` | `channel_name` | `channel_id` required if channel FK mode is `id`. `channel_description` is optional. |
| Members | `channel_members` | `username`, `channel_name` | `channel_id` replaces `channel_name` in id mode. |
| Messages | `chat_inbox` (default) or `messages` | `username`, `channel_name`, `message_body` | `channel_id` replaces `channel_name` in id mode. `message_created_at` is optional. |

Schema suggestions use existing column names, common aliases, and detected foreign keys to pre-fill the DB column mapping.

## CSV requirements
- Each CSV must include a header row.
- Max file size is 2 MB per CSV.
- Use UTF-8 and comma-separated values.

## Options and behavior
- Password hashing is on by default and uses SHA-512. Values that already look like SHA-512 hex are left as-is.
- Inserts happen inside a transaction.
- `users`, `channels`, and `channel_members` use `ON CONFLICT DO NOTHING`.
- Messages always insert, so re-running will duplicate messages (applies to `chat_inbox` or `messages`).
- If you populate again within 60 seconds, the UI asks for confirmation.
- When inserting into id columns, the sequence is bumped to the max value after the insert.

## Environment overrides
You can override the default CSV paths:
- `POPULATE_DB_USERS_CSV`
- `POPULATE_DB_CHANNELS_CSV`
- `POPULATE_DB_MEMBERS_CSV`
- `POPULATE_DB_MESSAGES_CSV`

## Troubleshooting notes
- If the preview says a CSV column is missing, update the CSV header or the mapping fields to match.
- If schema suggestions are blank, verify the table names and that tables exist in the logged-in database.

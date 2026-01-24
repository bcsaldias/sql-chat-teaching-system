const SOLUTION_SQL = {
    "user_login": "SELECT password FROM users WHERE username = $1;",
    "user_register": "INSERT INTO users(username, password) VALUES ($1, $2);",
    "update_password": "UPDATE users SET password = $2 WHERE username = $1 AND password = $3;",
    "channels_list": `SELECT
 c.name as id,
 c.name as name,
 c.description as description,
 (cm.username IS NOT NULL) AS is_member,
 (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel = c.name) AS user_count
FROM channels c
LEFT JOIN channel_members cm
 ON cm.channel = c.name
AND cm.username = $1
ORDER BY c.name;`,
    "channel_join": "INSERT INTO channel_members(username, channel) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
    "channel_leave": "DELETE FROM channel_members WHERE username = $1 AND channel = $2;",
    "member_check": "SELECT true FROM channel_members WHERE username = $1 AND channel = $2;",
    "messages_list": `SELECT
username, body, created_at
FROM chat_inbox
WHERE channel_id = $1
ORDER BY created_at DESC
LIMIT 50;`,
    "message_post": "INSERT INTO chat_inbox(username, channel_id, body) VALUES ($1, $2, $3);",
    "channel_members_list": "SELECT username FROM channel_members WHERE channel = $1 ORDER BY username;",
    "channel_create": "INSERT INTO channels(name, description) VALUES ($1, $2);"
};

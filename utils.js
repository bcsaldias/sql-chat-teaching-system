// =====================================================
// SQL LAB SUPPORT (ADDED)
// =====================================================

// Default SQL templates (match your current server.js exactly)
const DEFAULT_SQL = {
    user_login: "SELECT '';",
    user_register: "INSERT '';",
    channels_list: "SELECT '';",
    channel_join: "INSERT '';",
    channel_leave: "DELETE '';",
    member_check: "SELECT '';",
    messages_list: "SELECT '';",
    message_post: "INSERT '';",
    channel_members_list: "SELECT '';",
    channel_create: "INSERT '';",
    update_password: "UPDATE '';"
};

const SOLUTION_SQL = {
    "user_login": "SELECT password FROM users WHERE username = $1;",
    "user_register": "INSERT INTO users(username, password) VALUES ($1, $2);",
    "update_password": "UPDATE users SET password = $2 WHERE username = $1 AND password = $3;",
    "channels_list": `SELECT
 c.id,
 c.name,
 c.description,
 (cm.username IS NOT NULL) AS is_member,
 (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) AS user_count
FROM channels c
LEFT JOIN channel_members cm
 ON cm.channel_id = c.id
AND cm.username = $1
ORDER BY c.name;`,
    "channel_join": "INSERT INTO channel_members(username, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
    "channel_leave": "DELETE FROM channel_members WHERE username = $1 AND channel_id = $2;",
    "member_check": "SELECT true FROM channel_members WHERE username = $1 AND channel_id = $2;",
    "messages_list": `SELECT username, body, created_at
FROM chat_inbox
WHERE channel_id = $1
ORDER BY created_at DESC
LIMIT 50;`,
    "message_post": "INSERT INTO chat_inbox(username, channel_id, body) VALUES ($1, $2, $3);",
    "channel_members_list": "SELECT username FROM channel_members WHERE channel_id = $1 ORDER BY username;",
    "channel_create": "INSERT INTO channels(name, description) VALUES ($1, $2);"
};

//     required:
// `SELECT username, body, created_at
// FROM chat_recent_messages
// WHERE channel_id = $1
// ORDER BY created_at DESC
// LIMIT 50;`
// required: "SELECT chat_post_message($1, $2, $3) AS message_id;"



const PGDATABASES_MAPPING = {
    "grp01_ba": "__project_grp01_ba_app",
    "grp02_ba": "__project_grp02_ba_app",
    "grp03_ba": "__project_grp03_ba_app",
    "grp04_ba": "__project_grp04_ba_app",
    "grp05_ba": "__project_grp05_ba_app",
    "grp06_ba": "__project_grp06_ba_app",
    "grp07_ba": "__project_grp07_ba_app",
    "grp08_ba": "__project_grp08_ba_app",
    "grp09_ba": "__project_grp09_ba_app",
    "grp10_ba": "__project_grp10_ba_app",
    "grp11_ba": "__project_grp11_ba_app",
    "grp12_ba": "__project_grp12_ba_app",
    "grp13_ba": "__project_grp13_ba_app",
    "grp14_ba": "__project_grp14_ba_app",
    "grp15_ba": "__project_grp15_ba_app",

    "grp16_bb": "__project_grp16_bb_app",
    "grp17_bb": "__project_grp17_bb_app",
    "grp18_bb": "__project_grp18_bb_app",
    "grp19_bb": "__project_grp19_bb_app",
    "grp20_bb": "__project_grp20_bb_app",
    "grp21_bb": "__project_grp21_bb_app",
    "grp22_bb": "__project_grp22_bb_app",
    "grp23_bb": "__project_grp23_bb_app",
    "grp24_bb": "__project_grp24_bb_app",
    "grp25_bb": "__project_grp25_bb_app",
    "grp26_bb": "__project_grp26_bb_app",
    "grp27_bb": "__project_grp27_bb_app",
    "grp28_bb": "__project_grp28_bb_app",
    "grp29_bb": "__project_grp29_bb_app",
    "grp30_bb": "__project_grp30_bb_app",

    "grp31_ca": "__project_grp31_ca_app",
    "grp32_ca": "__project_grp32_ca_app",
    "grp33_ca": "__project_grp33_ca_app",
    "grp34_ca": "__project_grp34_ca_app",
    "grp35_ca": "__project_grp35_ca_app",
    "grp36_ca": "__project_grp36_ca_app",
    "grp37_ca": "__project_grp37_ca_app",
    "grp38_ca": "__project_grp38_ca_app",
    "grp39_ca": "__project_grp39_ca_app",
    "grp40_ca": "__project_grp40_ca_app",
    "grp41_ca": "__project_grp41_ca_app",
    "grp42_ca": "__project_grp42_ca_app",
    "grp43_ca": "__project_grp43_ca_app",
    "grp44_ca": "__project_grp44_ca_app",
    "grp45_ca": "__project_grp45_ca_app",

    "grp46_cb": "__project_grp46_cb_app",
    "grp47_cb": "__project_grp47_cb_app",
    "grp48_cb": "__project_grp48_cb_app",
    "grp49_cb": "__project_grp49_cb_app",
    "grp50_cb": "__project_grp50_cb_app",
    "grp51_cb": "__project_grp51_cb_app",
    "grp52_cb": "__project_grp52_cb_app",
    "grp53_cb": "__project_grp53_cb_app",
    "grp54_cb": "__project_grp54_cb_app",
    "grp55_cb": "__project_grp55_cb_app",
    "grp56_cb": "__project_grp56_cb_app",
    "grp57_cb": "__project_grp57_cb_app",
    "grp58_cb": "__project_grp58_cb_app",
    "grp59_cb": "__project_grp59_cb_app",
    "grp60_cb": "__project_grp60_cb_app",

    "demo": "__project_demo_app"

}

module.exports = {
    DEFAULT_SQL,
    SOLUTION_SQL,
    PGDATABASES_MAPPING
};
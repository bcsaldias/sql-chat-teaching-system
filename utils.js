// =====================================================
// SQL LAB SUPPORTING CODE
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
 c.name,
 c.name,
 c.description,
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
    "messages_list": `SELECT username, body, created_at
FROM chat_inbox
WHERE channel_id = $1
ORDER BY created_at DESC
LIMIT 50;`,
    "message_post": "INSERT INTO chat_inbox(username, channel_id, body) VALUES ($1, $2, $3);",
    "channel_members_list": "SELECT username FROM channel_members WHERE channel = $1 ORDER BY username;",
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


// =====================================================
// SCHEMA INTROSPECTION
// =====================================================

const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
function qIdent(name) {
    const n = String(name || "").trim();
    if (!IDENT_RE.test(n)) throw new Error(`Unsafe identifier: ${n}`);
    return `"${n.replace(/"/g, '""')}"`;
}

// Parse an incoming id (from query/body) based on the DB column data_type
function parseByDataType(dataType, raw) {
    const t = String(dataType || "").toLowerCase();

    // Treat these as "stringy"
    if (
        t.includes("char") ||
        t.includes("text") ||
        t.includes("uuid") ||
        t.includes("date") ||
        t.includes("time") ||
        t.includes("json") ||
        t.includes("bool")
    ) {
        return String(raw);
    }

    // Treat these as numeric
    if (
        t.includes("int") ||
        t.includes("numeric") ||
        t.includes("decimal") ||
        t.includes("real") ||
        t.includes("double") ||
        t.includes("float")
    ) {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new Error(`Expected numeric id, got: ${raw}`);
        return n;
    }

    // Fallback: keep as string
    return String(raw);
}

async function loadPrimaryKey(client, tableName) {
    const r = await client.query(
        `
    SELECT
      kcu.column_name,
      cols.data_type,
      kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.columns cols
      ON cols.table_schema = tc.table_schema
     AND cols.table_name = tc.table_name
     AND cols.column_name = kcu.column_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = $1
    ORDER BY kcu.ordinal_position;
    `,
        [tableName]
    );

    if (r.rowCount === 0) return null;

    return {
        columns: r.rows.map(x => x.column_name),
        types: r.rows.map(x => x.data_type)
    };
}

async function loadForeignKey(client, fromTable, toTable) {
    // returns possibly multiple rows (composite FK), ordered by position
    const r = await client.query(
        `
    SELECT
      kcu.column_name    AS fk_column,
      fk_cols.data_type  AS fk_data_type,
      ccu.table_name     AS ref_table,
      ccu.column_name    AS ref_column,
      ref_cols.data_type AS ref_data_type,
      kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.columns fk_cols
      ON fk_cols.table_schema = tc.table_schema
     AND fk_cols.table_name = tc.table_name
     AND fk_cols.column_name = kcu.column_name
    JOIN information_schema.columns ref_cols
      ON ref_cols.table_schema = ccu.table_schema
     AND ref_cols.table_name = ccu.table_name
     AND ref_cols.column_name = ccu.column_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = $1
      AND ccu.table_name = $2
    ORDER BY kcu.ordinal_position;
    `,
        [fromTable, toTable]
    );

    if (r.rowCount === 0) return null;

    return r.rows.map(row => ({
        fk_column: row.fk_column,
        fk_data_type: row.fk_data_type,
        ref_table: row.ref_table,
        ref_column: row.ref_column,
        ref_data_type: row.ref_data_type
    }));
}

async function loadChatSchemaInfo(client) {
    // Try to load everything; if tables don’t exist yet, keep defaults
    const tables = {};

    try { tables.users = { pk: await loadPrimaryKey(client, "users") }; } catch { }
    try { tables.channels = { pk: await loadPrimaryKey(client, "channels") }; } catch { }
    try { tables.chat_inbox = { pk: await loadPrimaryKey(client, "chat_inbox") }; } catch { }
    try { tables.channel_members = { pk: await loadPrimaryKey(client, "channel_members") }; } catch { }

    let chatInboxToChannels = null;
    let chatInboxToUsers = null;
    let membersToChannels = null;
    let membersToUsers = null;

    try { chatInboxToChannels = await loadForeignKey(client, "chat_inbox", "channels"); } catch { }
    try { chatInboxToUsers = await loadForeignKey(client, "chat_inbox", "users"); } catch { }
    try { membersToChannels = await loadForeignKey(client, "channel_members", "channels"); } catch { }
    try { membersToUsers = await loadForeignKey(client, "channel_members", "users"); } catch { }

    // Pick “the” channel PK + “the” chat->channels FK (single-column expected in this project)
    const channels_pk = tables.channels?.pk?.columns?.[0] || "channel_id";
    const channels_pk_type = tables.channels?.pk?.types?.[0] || "text";

    const chat_to_channels_fk = chatInboxToChannels?.[0]?.fk_column || "channel_id";
    const chat_to_channels_fk_type = chatInboxToChannels?.[0]?.fk_data_type || "text";

    return {
        loadedAt: Date.now(),
        tables,
        fks: {
            chat_inbox_to_channels: chatInboxToChannels,
            chat_inbox_to_users: chatInboxToUsers,
            channel_members_to_channels: membersToChannels,
            channel_members_to_users: membersToUsers
        },
        // convenience fields used by your app today
        channels_pk,
        channels_pk_type,
        chat_to_channels_fk,
        chat_to_channels_fk_type
    };
}

// Ensure schema info exists in-session
async function ensureChatSchemaInfo(req) {
    if (req.session?.chatSchemaInfo?.channels_pk) return req.session.chatSchemaInfo;

    const { dbUser, dbPass, schema } = req.session;
    if (!dbUser || !dbPass || !schema) throw new Error("Not logged in.");

    const info = await withDb(dbUser, dbPass, schema, async (client) => {
        return await loadChatSchemaInfo(client);
    });

    req.session.chatSchemaInfo = info;
    return info;
}

// Replace your old parseChannelId(channel_id) with this:
function parseChannelId(req, channel_id_raw) {
    const info = req.session?.chatSchemaInfo;
    const dtype =
        info?.channels_pk_type ||
        info?.tables?.channels?.pk?.types?.[0] ||
        "text";
    return parseByDataType(dtype, channel_id_raw);
}


module.exports = {
    DEFAULT_SQL,
    SOLUTION_SQL,
    PGDATABASES_MAPPING,
    qIdent,
    parseChannelId,
    ensureChatSchemaInfo,
    loadChatSchemaInfo
};
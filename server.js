const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set true behind HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 6
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// SQL LAB SUPPORT (ADDED)
// =====================================================

// Default SQL templates (match your current server.js exactly)
const DEFAULT_SQL = {
  conn_test: "SELECT '';",
  user_register: "INSERT '';",
  user_login: "SELECT '';",
  channels_list: "SELECT '';",
  channel_join: "INSERT '';",
  channel_leave: "DELETE '';",
  channel_members_list: "SELECT '';",
  member_check: "SELECT '';",
  messages_list: "SELECT '';",
  message_post: "SELECT '';",
};


// Force a single statement (no multi-statement injection via ;)
function normalizeSingleStatement(sql) {
  const s = String(sql || "").trim();
  const t = s.endsWith(";") ? s.slice(0, -1).trim() : s;
  if (!t) throw new Error("SQL cannot be empty.");
  if (t.includes(";")) throw new Error("Only one SQL statement is allowed.");
  return t;
}

// Get template from session (if present) else default
function getSql(req, key) {
  const custom = req.session?.sqlTemplates?.[key];
  const base = custom ?? DEFAULT_SQL[key];
  if (!base) throw new Error(`Unknown SQL template key: ${key}`);
  return normalizeSingleStatement(base);
}

// =====================================================

function parseGroupToSchema(username) {
  const m = /^grp(\d{2})$/.exec(username);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 20) return null;
  return `g${m[1]}`;
}

async function withDb(dbUser, dbPass, schema, fn) {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: dbUser,
    password: dbPass
  });

  await client.connect();
  try {
    // schema is validated to g01..g20
    await client.query(`SET LOCAL search_path TO ${schema}, public;`);
    return await fn(client);
  } finally {
    await client.end();
  }
}

function requireGroupLogin(req, res, next) {
  if (!req.session?.dbUser || !req.session?.dbPass || !req.session?.schema) {
    return res.status(401).json({ error: "Not logged in to group database." });
  }
  next();
}

function requireChatUser(req, res, next) {
  if (!req.session?.chatUsername) {
    return res.status(401).json({ error: "Not logged in as a chat user." });
  }
  next();
}

// =====================================================
// SQL LAB ENDPOINTS (ADDED) - only visible once group login works
// =====================================================
app.get("/api/sql_templates", requireGroupLogin, (req, res) => {
  const merged = { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
  res.json({ ok: true, templates: merged });
});

app.post("/api/sql_templates", requireGroupLogin, (req, res) => {
  const templates = req.body?.templates || {};
  req.session.sqlTemplates = req.session.sqlTemplates || {};

  try {
    for (const [key, sql] of Object.entries(templates)) {
      if (!(key in DEFAULT_SQL)) continue; // ignore unknown keys
      const normalized = normalizeSingleStatement(sql);

      // (Optional lightweight guard) ensure the template begins with the expected verb
      // This prevents students from saving totally unrelated statements.
      const firstWord = normalized.trim().split(/\s+/)[0].toLowerCase();
      const allowed = ["select", "insert", "delete", "update", "with"];
      if (!allowed.includes(firstWord)) {
        throw new Error(`Template "${key}" must start with SELECT/INSERT/DELETE/UPDATE/WITH.`);
      }

      req.session.sqlTemplates[key] = normalized;
    }
    const merged = { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
    // Log a compact summary for debugging (server-side)
    try {
      // console.log('[sql_templates] saved keys ->', Object.keys(req.session.sqlTemplates || {}));
    } catch (e) {}
    res.json({ ok: true, templates: merged });
  } catch (e) {
    res.status(400).json({ error: "Invalid SQL template.", detail: String(e.message || e) });
  }
});

app.post("/api/sql_templates/reset", requireGroupLogin, (req, res) => {
  req.session.sqlTemplates = {};
  const merged = { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
  try {
    console.log('[sql_templates] reset to defaults');
  } catch (e) {}
  res.json({ ok: true, templates: merged });
});
// =====================================================

// --------------------
// Group DB login
// --------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const schema = parseGroupToSchema(username || "");
  if (!schema) return res.status(400).json({ error: "Invalid group username (grp01..grp20)." });

  try {
    // Test connection (students can overwrite later, but default is SELECT 1)
    await withDb(username, password, schema, async (client) => {
      await client.query(getSql(req, "conn_test"));
    });

    req.session.dbUser = username;
    req.session.dbPass = password;
    req.session.schema = schema;

    // Reset chat user session on new group login
    req.session.chatUsername = null;

    // Ensure sqlTemplates exists
    if (!req.session.sqlTemplates) req.session.sqlTemplates = {};

    res.json({ ok: true, schema });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password and connectivity.",
      detail: String(e.message || e)
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --------------------
// Chat user auth
// --------------------
app.post("/api/user/register", requireGroupLogin, async (req, res) => {
  const { username, password_hash } = req.body || {};
  const u = String(username || "").trim();
  const h = String(password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (h.length !== 128) return res.status(400).json({ error: "password_hash must be 128 characters." });

  const { dbUser, dbPass, schema } = req.session;

  try {
    await withDb(dbUser, dbPass, schema, async (client) => {
      await client.query(getSql(req, "user_register"), [u, h]);
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("duplicate key") || msg.includes("already exists")) {
      return res.status(409).json({ error: "Username already exists." });
    }
    res.status(400).json({ error: "Registration failed.", detail: msg });
  }
});

app.post("/api/user/login", requireGroupLogin, async (req, res) => {
  const { username, password_hash } = req.body || {};
  const u = String(username || "").trim();
  const h = String(password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (h.length !== 128) return res.status(400).json({ error: "password_hash must be 128 characters." });

  const { dbUser, dbPass, schema } = req.session;

  try {
    const ok = await withDb(dbUser, dbPass, schema, async (client) => {
      const r = await client.query(getSql(req, "user_login"), [u]);
      if (r.rowCount === 0) return false;
      return r.rows[0].password === h;
    });

    if (!ok) return res.status(401).json({ error: "Invalid username or password." });

    req.session.chatUsername = u;
    res.json({ ok: true, username: u });
  } catch (e) {
    res.status(400).json({ error: "Login failed.", detail: String(e.message || e) });
  }
});

app.post("/api/user/logout", requireGroupLogin, (req, res) => {
  req.session.chatUsername = null;
  res.json({ ok: true });
});

// --------------------
// Channels
// --------------------
app.get("/api/channels", requireGroupLogin, requireChatUser, async (req, res) => {
  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    const channels = await withDb(dbUser, dbPass, schema, async (client) => {
      const r = await client.query(getSql(req, "channels_list"), [chatUsername]);
      return r.rows;
    });

    res.json({ ok: true, channels });
  } catch (e) {
    res.status(400).json({ error: "Failed to load channels.", detail: String(e.message || e) });
  }
});

// Members list for a channel
app.get("/api/channels/members", requireGroupLogin, requireChatUser, async (req, res) => {
  const cid = Number(req.query.channel_id);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id query param required." });

  const { dbUser, dbPass, schema } = req.session;
  try {
    const members = await withDb(dbUser, dbPass, schema, async (client) => {
      // Use the editable SQL template so students can change how members are
      // selected/filtered. The template should accept $1 = channel_id and
      // return one column per row containing the username (or the first
      // column will be used).
      const r = await client.query(getSql(req, "channel_members_list"), [cid]);
      // Map each row to the first column value (flexible to column name)
      return r.rows.map(row => {
        const vals = Object.values(row || {});
        return vals.length > 0 ? String(vals[0]) : null;
      }).filter(v => v !== null && v !== undefined);
    });
    res.json({ ok: true, members });
  } catch (e) {
    res.status(400).json({ error: "Failed to load channel members.", detail: String(e.message || e) });
  }
});

app.post("/api/channels/join", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id } = req.body || {};
  const cid = Number(channel_id);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id must be a number." });

  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    await withDb(dbUser, dbPass, schema, async (client) => {
      await client.query(getSql(req, "channel_join"), [chatUsername, cid]);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to join channel.", detail: String(e.message || e) });
  }
});

app.post("/api/channels/leave", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id } = req.body || {};
  const cid = Number(channel_id);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id must be a number." });

  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    await withDb(dbUser, dbPass, schema, async (client) => {
      await client.query(getSql(req, "channel_leave"), [chatUsername, cid]);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to leave channel.", detail: String(e.message || e) });
  }
});

// --------------------
// Messages
// --------------------
app.get("/api/messages", requireGroupLogin, requireChatUser, async (req, res) => {
  const cid = Number(req.query.channel_id);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id query param required." });

  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    const messages = await withDb(dbUser, dbPass, schema, async (client) => {
      const mem = await client.query(getSql(req, "member_check"), [chatUsername, cid]);
      if (mem.rowCount === 0) {
        throw new Error("You must join this channel to view messages.");
      }

      const r = await client.query(getSql(req, "messages_list"), [cid]);
      return r.rows;
    });

    res.json({ ok: true, messages });
  } catch (e) {
    res.status(400).json({ error: "Failed to load messages.", detail: String(e.message || e) });
  }
});

app.post("/api/message", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id, body } = req.body || {};
  const cid = Number(channel_id);
  const b = String(body || "").trim();

  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id must be a number." });
  if (!b) return res.status(400).json({ error: "body is required." });

  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    const result = await withDb(dbUser, dbPass, schema, async (client) => {
      const r = await client.query(getSql(req, "message_post"), [chatUsername, cid, b]);
      return r.rows[0];
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: "Failed to post message.", detail: String(e.message || e) });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SQL Chat app running on http://localhost:${port}`);
});

const { DEFAULT_SQL, SOLUTION_SQL, PGDATABASES_MAPPING, loadChatSchemaInfo, parseByDataType } = require('./utils.js');
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

const app = express();

const IS_SUPERUSER = process.env.SUPERUSER_MODE === "true";
function isSuperUserReq(req) {
  // demo always uses solution SQL, or enable via env
  return IS_SUPERUSER || req.session?.dbUser === "demo";
}

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      // OK – self note. I thought about this a lot, and I don't want to make
      // it more secure than necessary for local testing for now.
      secure: false, // set true behind HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 6
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.use((req, _res, next) => {
  // console.log("sid", req.sessionID, "dbUser", req.session?.dbUser, "schema", req.session?.schema);
  next();
});

function parseChannelId(req, channel_id_raw) {
  const info = req.session?.chatSchemaInfo;
  const dtype =
    info?.channels_pk_type ||
    info?.tables?.channels?.pk?.types?.[0] ||
    "text";
  return parseByDataType(dtype, channel_id_raw);
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
function qIdent(name) {
  const n = String(name || "").trim();
  if (!IDENT_RE.test(n)) throw new Error(`Unsafe identifier: ${n}`);
  return `"${n.replace(/"/g, '""')}"`;
}

// Ensure schema info exists in-session
async function ensureChatSchemaInfo(req) {
  if (req.session?.chatSchemaInfo?.channels_pk) return req.session.chatSchemaInfo;

  const { dbUser, dbPass } = req.session;
  if (!dbUser || !dbPass) throw new Error("Not logged in.");

  const info = await withDb(dbUser, dbPass, async (client) => {
    return await loadChatSchemaInfo(client);
  });

  req.session.chatSchemaInfo = info;
  return info;
}

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
  if (isSuperUserReq(req)) return normalizeSingleStatement(SOLUTION_SQL[key] || "");
  const custom = req.session?.sqlTemplates?.[key];
  const base = custom ?? DEFAULT_SQL[key];
  if (!base) throw new Error(`Unknown SQL template key: ${key}`);
  return normalizeSingleStatement(base);
}

// TODO: remove schema param since not used
async function withDb(dbUser, dbPass, fn) {

  if (dbUser === "demo" && dbPass == "demo") {
    dbPass = process.env.REAL_DEMO_PASSWORD;
  }

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: PGDATABASES_MAPPING[dbUser],
    user: dbUser,
    password: dbPass
  });

  await client.connect();

  try {
    // schema is validated to g01..g20
    // await client.query(`SET LOCAL search_path TO ${schema}, public;`); // DEPRECATED: I had this when schemas were per-group.
    await client.query(`SET LOCAL search_path TO public;`);
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

      const firstWord = normalized.trim().split(/\s+/)[0].toLowerCase();
      const allowed = ["select", "insert", "delete", "update", "with"];
      if (!allowed.includes(firstWord)) {
        throw new Error(`Template "${key}" must start with SELECT/INSERT/DELETE/UPDATE/WITH.`);
      }

      if (normalized.includes("*")) {
        throw new Error(`Template "${key}" cannot contain "*". Please list explicit columns.`);
      }

      if (normalized.includes("--")) {
        throw new Error(`Template "${key}" cannot contain comments (--).`);
      }

      if (normalized.toLowerCase().includes("drop ") ||
        normalized.toLowerCase().includes("alter ") ||
        normalized.toLowerCase().includes("create ")) {
        throw new Error(`Template "${key}" cannot contain DROP/ALTER/CREATE statements.`);
      }

      req.session.sqlTemplates[key] = normalized;
    }
    const merged = { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
    try {
      // console.log('[sql_templates] saved keys ->', Object.keys(req.session.sqlTemplates || {}));
    } catch (e) { }
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
  } catch (e) { }
  res.json({ ok: true, templates: merged });
});
// =====================================================

// --------------------
// Group DB login
// --------------------

async function testDbLogin(username, password) {
  await withDb(username, password, (client) => client.query("select 1;"));
}

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};

  try {
    await testDbLogin(username, password);
    req.session.dbUser = username;
    req.session.dbPass = password;
    req.session.chatUsername = null;
    if (!req.session.sqlTemplates) req.session.sqlTemplates = {};
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password and connectivity.",
      detail: String(e.message || e)
    });
  }
});


app.post("/api/credentials_login", requireGroupLogin, async (req, res) => {
  const username = req.session.dbUser;
  const password = req.session.dbPass;

  try {
    await testDbLogin(username, password);
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password and connectivity.",
      detail: String(e.message || e)
    });
  }
});



app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});


// Browser-friendly logout URL
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    // clear the default express-session cookie name
    res.clearCookie("connect.sid");
    res.redirect("/"); // or res.redirect("/index.html");
  });
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

  const { dbUser, dbPass } = req.session;

  try {
    await withDb(dbUser, dbPass, async (client) => {
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

  const { dbUser, dbPass } = req.session;

  try {
    const ok = await withDb(dbUser, dbPass, async (client) => {
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
  const { dbUser, dbPass, chatUsername } = req.session;

  try {
    const channels = await withDb(dbUser, dbPass, async (client) => {
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
  await ensureChatSchemaInfo(req);
  const cid = parseChannelId(req, req.query.channel_id);

  const { dbUser, dbPass } = req.session;
  try {
    const members = await withDb(dbUser, dbPass, async (client) => {
      const r = await client.query(getSql(req, "channel_members_list"), [cid]);
      return r.rows.map(row => Object.values(row || {})[0]).filter(v => v != null).map(String);
    });
    res.json({ ok: true, members });
  } catch (e) {
    res.status(400).json({ error: "Failed to load channel members.", detail: String(e.message || e) });
  }
});


app.post("/api/channels/create", requireGroupLogin, requireChatUser, async (req, res) => {
  const { name, description } = req.body || {};
  const channel_name = String(name || "").trim();
  const channel_description = String(description || "").trim();

  if (!channel_name) return res.status(400).json({ error: "channel_name is required." });
  if (!channel_description) return res.status(400).json({ error: "channel_description is required." });
  const { dbUser, dbPass } = req.session;
  try {
    await withDb(dbUser, dbPass, async (client) => {
      await client.query(getSql(req, "channel_create"), [channel_name, channel_description]);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to create channel.", detail: String(e.message || e) });
  }
});

app.post("/api/channels/join", requireGroupLogin, requireChatUser, async (req, res) => {
  await ensureChatSchemaInfo(req);
  const cid = parseChannelId(req, req.body?.channel_id);

  const { dbUser, dbPass, chatUsername } = req.session;
  try {
    await withDb(dbUser, dbPass, async (client) => {
      await client.query(getSql(req, "channel_join"), [chatUsername, cid]);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to join channel.", detail: String(e.message || e) });
  }
});


app.post("/api/channels/leave", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id } = req.body || {};
  await ensureChatSchemaInfo(req);
  var cid = parseChannelId(req, channel_id);

  const { dbUser, dbPass, chatUsername } = req.session;

  try {
    await withDb(dbUser, dbPass, async (client) => {
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
  await ensureChatSchemaInfo(req);
  const cid = parseChannelId(req, req.query.channel_id);

  const { dbUser, dbPass, chatUsername } = req.session;
  try {
    const messages = await withDb(dbUser, dbPass, async (client) => {
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
  const b = String(body || "").trim();
  await ensureChatSchemaInfo(req);
  const cid = parseChannelId(req, channel_id);

  if (!b) return res.status(400).json({ error: "body is required." });

  const { dbUser, dbPass, chatUsername } = req.session;

  const result = await withDb(dbUser, dbPass, async (client) => {
    const r = await client.query(getSql(req, "message_post"), [chatUsername, cid, b]);
    return r.rows[0];
  });

  res.json({ ok: true, ...result });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SQL Chat app running on http://localhost:${port}`);
});



// =====================================================
// Check that the tables are correct!
// =====================================================

app.get("/api/test_schema", requireGroupLogin, async (req, res) => {
  // console.log("TESTING /api/test_schema");
  const { dbUser, dbPass } = req.session;

  const info = await ensureChatSchemaInfo(req);

  const channelsPkCol = qIdent(info.channels_pk);
  const channelsFkCol = qIdent(info.membership_channels_fk);
  const usersPkCol = qIdent(info.users_pk);
  const usersFkCol = qIdent(info.membership_users_fk);

  const sanityChecks = [
    `select ${usersPkCol}, password from users limit 0;`,
    `select ${channelsPkCol}, name, description from channels limit 0;`,
    `select ${usersFkCol}, ${channelsFkCol} from channel_members limit 0;`,
    // `select ${userFkCol}, ${chatFkCol}, body, created_at from chat_inbox limit 0;`,
  ];

  for (const checkQuery of sanityChecks) {
    console.log("Testing", checkQuery);
    try {
      const ok = await withDb(dbUser, dbPass, async (client) => {
        const r = await client.query(checkQuery);
        return r.rowCount === 0;
      });
    } catch (e) {
      return res.status(400).json({ error: "Incorrect Schema.", detail: String(e.message || e) });
    }
  }

  return res.json({ ok: true });
});



// =====================================================
// Reset password (requires ONLY group DB login, not chat-user session)
// =====================================================

app.post("/api/user/reset_password", requireGroupLogin, async (req, res) => {
  const { username, old_password_hash, new_password_hash } = req.body || {};
  const u = String(username || "").trim();
  const oldH = String(old_password_hash || "").trim();
  const newH = String(new_password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (oldH.length !== 128) return res.status(400).json({ error: "old_password_hash must be 128 characters." });
  if (newH.length !== 128) return res.status(400).json({ error: "new_password_hash must be 128 characters." });
  if (oldH === newH) return res.status(400).json({ error: "New password must be different." });

  const { dbUser, dbPass } = req.session;

  try {
    const changed = await withDb(dbUser, dbPass, async (client) => {
      const r = await client.query(getSql(req, "update_password"), [u, newH, oldH]);
      return r.rowCount;
    });

    if (changed === 0) {
      return res.status(401).json({ error: "Invalid username or current password." });
    }

    // Optional: if they were logged in as this user, keep them logged in
    if (req.session.chatUsername === u) req.session.chatUsername = u;

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Password reset failed.", detail: String(e.message || e) });
  }
});

const { DEFAULT_SQL, SOLUTION_SQL, PGDATABASES_MAPPING, loadChatSchemaInfo, parseChannelId } = require('./utils.js');
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

const ALLOW_SUPERUSER_MODE = process.env.ALLOW_SUPERUSER_MODE === "true";
const HEALTHCHECK_DB_USER = process.env.HEALTHCHECK_DB_USER || "demo";
const HEALTHCHECK_DB_PASS = process.env.HEALTHCHECK_DB_PASS || "demo";
const GIT_SHA = process.env.GIT_SHA || readGitSha() || "unknown";
const DEPLOYED_BY = process.env.DEPLOYED_BY || "unknown";
const DEPLOYED_AT = new Date().toISOString();
const PT_TZ = "America/Los_Angeles";
function formatPt(iso) {
  const base = new Date(iso).toLocaleString("sv-SE", { timeZone: PT_TZ, hour12: false });
  return `${base.replace(" ", "T")} PT`;
}
function isSuperUserReq(req) {
  // Superuser check. Superuser uses solution SQL.
  return ALLOW_SUPERUSER_MODE && req.session?.dbUser === "demo";
}

function readGitSha() {
  try {
    const headPath = path.join(__dirname, "..", ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref: ")) {
      const refPath = path.join(__dirname, "..", ".git", head.slice(5));
      return fs.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch (_err) {
    return null;
  }
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
      // IMPORTANT. OK – self note. I thought about this a lot, and I don't want to make
      // it more secure than necessary for local testing for now.
      secure: false, // in theory, should true behind HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 6
    }
  })
);

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, _res, next) => {
  // console.log("sid", req.sessionID, "dbUser", req.session?.dbUser, "schema", req.session?.schema);
  next();
});


// =====================================================
// DB/Auth helpers
// =====================================================


const DEMO_POOL_MAX = Number(process.env.PG_POOL_MAX || 3);
const DEFAULT_POOL_MAX = Number(process.env.PG_POOL_MAX_DEFAULT || 3);

const DB_CONFIG_BASE = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_MS || 5000)
};

function resolveDbPassword(dbUser, dbPass) {
  return dbUser === "demo" && dbPass === "demo" ? process.env.REAL_DEMO_PASSWORD : dbPass;
}

function dbConfig(dbUser, dbPass) {
  return {
    ...DB_CONFIG_BASE,
    max: dbUser === "demo" ? DEMO_POOL_MAX : DEFAULT_POOL_MAX,
    database: PGDATABASES_MAPPING[dbUser],
    user: dbUser,
    password: resolveDbPassword(dbUser, dbPass)
  };
}

async function withDb(dbUser, dbPass, fn) {
  const client = await getPool(dbUser, dbPass).connect();

  try {
    await client.query(`SET LOCAL search_path TO public;`);
    return await fn(client);
  } finally {
    client.release();
  }
}

const poolCache = new Map();
function getPool(dbUser, dbPass) {
  const config = dbConfig(dbUser, dbPass);
  const key = `${config.user}::${config.password || ""}`;
  let pool = poolCache.get(key);
  if (!pool) {
    pool = new Pool(config);
    poolCache.set(key, pool);
  }
  return pool;
}

async function dropPool(dbUser, dbPass) {
  if (!dbUser) return;
  const config = dbConfig(dbUser, dbPass);
  const key = `${config.user}::${config.password || ""}`;
  const pool = poolCache.get(key);
  if (!pool) return;
  poolCache.delete(key);
  await pool.end();
}

function requireGroupLogin(req, res, next) {
  if (!req.session?.dbUser || !req.session?.dbPass) {
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

// Schema cache
async function ensureChatSchemaInfo(req) {
  const cached = req.session?.chatSchemaInfo;
  if (cached?.channels_pk && cached?.membership_channels_fk && cached?.users_pk && cached?.membership_users_fk) {
    return cached;
  }

  const { dbUser, dbPass } = req.session;
  if (!dbUser || !dbPass) throw new Error("Not logged in.");

  const info = await withDb(dbUser, dbPass, (client) => loadChatSchemaInfo(client));

  req.session.chatSchemaInfo = info;
  return info;
}

// =====================================================
// Health
// =====================================================


async function readDbStats(client) {
  const dbNameRes = await client.query("SELECT current_database() AS current_database;");
  const currentDbRes = await client.query(
    "SELECT numbackends::int AS current_db_connections FROM pg_stat_database WHERE datname = current_database();"
  );
  const totalRes = await client.query(
    "SELECT sum(numbackends)::int AS total_connections FROM pg_stat_database;"
  );
  const maxRes = await client.query(
    "SELECT setting::int AS max_connections FROM pg_settings WHERE name = 'max_connections';"
  );

  const currentDatabase = dbNameRes.rows[0]?.current_database ?? null;
  const currentDbConnections = currentDbRes.rows[0]?.current_db_connections ?? null;
  const totalConnections = totalRes.rows[0]?.total_connections ?? null;
  const maxConnections = maxRes.rows[0]?.max_connections ?? null;
  const totalConnPct =
    typeof totalConnections === "number" && typeof maxConnections === "number" && maxConnections > 0
      ? Math.round((totalConnections / maxConnections) * 1000) / 10
      : null;

  const stats = {
    currentDatabase,
    dbConnectionsCurrentDb: currentDbConnections,
    dbConnectionsTotal: totalConnections,
    dbConnectionsMax: maxConnections,
    dbConnectionsPct: totalConnPct ? String(totalConnPct) + "%" : totalConnPct
  };

  try {
    const activityRes = await client.query(
      "SELECT state, count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;"
    );
    const dbSessionsByState = {};
    let dbSessionsCurrentDb = 0;
    for (const row of activityRes.rows) {
      const state = row.state ?? "unknown";
      const count = row.count ?? 0;
      dbSessionsByState[state] = count;
      dbSessionsCurrentDb += count;
    }
    stats.dbSessionsCurrentDb = dbSessionsCurrentDb;
    stats.dbSessionsByState = dbSessionsByState;
  } catch (err) {
    stats.dbActivityError = String(err?.message || err);
  }

  return stats;
}


function getStatusContext(req) {
  const sessionDbUser = req.session?.dbUser || null;
  const sessionDbPass = req.session?.dbPass || null;
  const sessionDatabase = sessionDbUser ? PGDATABASES_MAPPING[sessionDbUser] || null : null;
  const useSessionDb = Boolean(sessionDbUser && sessionDbPass && sessionDatabase);
  const statsDbUser = useSessionDb ? sessionDbUser : HEALTHCHECK_DB_USER;
  const statsDbPass = useSessionDb ? sessionDbPass : HEALTHCHECK_DB_PASS;
  const statsDbSource = useSessionDb ? "session" : "healthcheck";
  const statsDatabase = PGDATABASES_MAPPING[statsDbUser] || null;

  return {
    sessionDbUser,
    sessionDbPass,
    sessionDatabase,
    statsDbUser,
    statsDbPass,
    statsDbSource,
    statsDatabase
  };
}

async function getStatusResponse(req, includeDetails) {
  const {
    sessionDbUser,
    sessionDatabase,
    statsDbUser,
    statsDbPass,
    statsDbSource,
    statsDatabase
  } = getStatusContext(req);

  const base = includeDetails
    ? {
        gitSha: GIT_SHA,
        deployedBy: DEPLOYED_BY,
        deployedAt: DEPLOYED_AT,
        deployedAtPt: formatPt(DEPLOYED_AT),
        statsDbSource,
        statsDbUser,
        statsDatabase,
        sessionDbUser,
        sessionDatabase
      }
    : null;
  let poolStats = {};

  try {
    if (!statsDatabase) {
      throw new Error("Stats database user is not mapped.");
    }
    if (includeDetails) {
      const pool = getPool(statsDbUser, statsDbPass);
      poolStats = {
        poolTotalCount: pool.totalCount,
        poolIdleCount: pool.idleCount,
        poolWaitingCount: pool.waitingCount
      };
    }
    let dbStats = {};
    await withDb(statsDbUser, statsDbPass, async (client) => {
      await client.query("SELECT 1");
      if (!includeDetails) return;
      try {
        dbStats = await readDbStats(client);
      } catch (err) {
        dbStats = { dbStatsError: String(err?.message || err) };
      }
    });
    const body = includeDetails ? { ok: true, ...base, ...dbStats, ...poolStats } : { ok: true };
    return { status: 200, body };
  } catch (_err) {
    const body = includeDetails ? { ok: false, ...base, ...poolStats } : { ok: false };
    return { status: 503, body };
  }
}

async function handleStatus(req, res) {
  const { status, body } = await getStatusResponse(req, true);
  res.status(status).json(body);
}

async function handleHealth(req, res) {
  const { status, body } = await getStatusResponse(req, false);
  res.status(status).json(body);
}

app.get("/status", handleStatus);
app.get("/health", handleHealth);



// =====================================================
// SQL templates
// =====================================================

// Template merge
function getMergedTemplates(req) {
  return { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
}

function getSql(req, key) {
  if (isSuperUserReq(req)) return normalizeSingleStatement(SOLUTION_SQL[key] || "");
  const custom = req.session?.sqlTemplates?.[key];
  const base = custom ?? DEFAULT_SQL[key];
  if (!base) throw new Error(`Unknown SQL template key: ${key}`);
  return normalizeSingleStatement(base);
}

// Single statement
function normalizeSingleStatement(sql) {
  const s = String(sql || "").trim();
  const t = s.endsWith(";") ? s.slice(0, -1).trim() : s;
  if (!t) throw new Error("SQL cannot be empty.");
  if (t.includes(";")) throw new Error("Only one SQL statement is allowed.");
  return t;
}

const ALLOWED_SQL_FIRST_WORDS = new Set(["select", "insert", "delete", "update", "with"]);
const MAX_SQL_TEMPLATE_LEN = 600;
const COUNT_STAR_RE = /\bcount\s*\(\s*\*\s*\)/i;
const STAR_WITHOUT_COUNT_RE = /\*(?!\s*\))/; // bare star

function validateSqlTemplate(key, normalized) {
  if (normalized.length > MAX_SQL_TEMPLATE_LEN) {
    throw new Error(`Template "${key}" exceeds ${MAX_SQL_TEMPLATE_LEN} characters.`);
  }
  const firstWord = normalized.trim().split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_SQL_FIRST_WORDS.has(firstWord)) {
    throw new Error(`Template "${key}" must start with SELECT/INSERT/DELETE/UPDATE/WITH.`);
  }

  if (normalized.includes("*") && !COUNT_STAR_RE.test(normalized)) {
    throw new Error(`Template "${key}" can only use "*" inside COUNT(*). Please list explicit columns.`);
  }

  if (STAR_WITHOUT_COUNT_RE.test(normalized.replace(COUNT_STAR_RE, ""))) {
    throw new Error(`Template "${key}" can only use "*" inside COUNT(*). Please list explicit columns.`);
  }

  if (normalized.includes("--")) {
    throw new Error(`Template "${key}" cannot contain comments (--).`);
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("drop ") || lower.includes("alter ") || lower.includes("create ")) {
    throw new Error(`Template "${key}" cannot contain DROP/ALTER/CREATE statements.`);
  }
}


-// =====================================================
-// API routes
-// =====================================================

app.get("/api/sql_templates", requireGroupLogin, (req, res) => {
  res.json({ ok: true, templates: getMergedTemplates(req) });
});

app.post("/api/sql_templates", requireGroupLogin, (req, res) => {
  const templates = req.body?.templates || {};
  req.session.sqlTemplates = req.session.sqlTemplates || {};

  try {
    for (const [key, sql] of Object.entries(templates)) {
      if (!(key in DEFAULT_SQL)) continue; // ignore unknown keys
      const normalized = normalizeSingleStatement(sql);
      validateSqlTemplate(key, normalized);

      req.session.sqlTemplates[key] = normalized;
    }
    const merged = getMergedTemplates(req);
    try {
    } catch (e) { }
    res.json({ ok: true, templates: merged });
  } catch (e) {
    res.status(400).json({ error: "Invalid SQL template.", detail: String(e.message || e) });
  }
});

app.post("/api/sql_templates/reset", requireGroupLogin, (req, res) => {
  req.session.sqlTemplates = {};
  const merged = getMergedTemplates(req);
  try {
    console.log('[sql_templates] reset to defaults');
  } catch (e) { }
  res.json({ ok: true, templates: merged });
});
// =====================================================

// --------------------
// Group login
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
    res.json({ ok: true, dbUser: username });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password and connectivity.",
      detail: String(e.message || e)
    });
  }
});



app.post("/api/logout", async (req, res) => {
  const { dbUser, dbPass } = req.session || {};
  try { await dropPool(dbUser, dbPass); } catch { }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});


// Browser logout
app.get("/logout", async (req, res) => {
  const { dbUser, dbPass } = req.session || {};
  try { await dropPool(dbUser, dbPass); } catch { }
  req.session.destroy(() => {
    // Clear cookie
    res.clearCookie("connect.sid");
    res.redirect("/"); // or res.redirect("/index.html");
  });
});


// --------------------
// User auth
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

// Channel members
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
  const cid = parseChannelId(req, channel_id);

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
    const trace = [];
    const messages = await withDb(dbUser, dbPass, async (client) => {
      const run = async (key, params) => {
        const entry = { key, paramsCount: Array.isArray(params) ? params.length : 0, status: "running" };
        trace.push(entry);
        try {
          const r = await client.query(getSql(req, key), params);
          entry.status = "ok";
          return r;
        } catch (e) {
          entry.status = "error";
          e.sqlKey = key;
          e.sqlTrace = trace;
          throw e;
        }
      };

      const mem = await run("member_check", [chatUsername, cid]);
      if (mem.rowCount === 0) {
        const err = new Error("You must join this channel to view messages.");
        err.sqlKey = "member_check";
        err.sqlTrace = trace;
        throw err;
      }

      const r = await run("messages_list", [cid]);
      return r.rows;
    });

    res.json({ ok: true, messages });
  } catch (e) {
    res.status(400).json({
      error: "Failed to load messages.",
      detail: String(e.message || e),
      sqlKey: e.sqlKey || null,
      sqlTrace: e.sqlTrace || null
    });
  }
});


app.post("/api/message", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id, body } = req.body || {};
  const b = String(body || "").trim();
  await ensureChatSchemaInfo(req);
  const cid = parseChannelId(req, channel_id);

  if (!b) return res.status(400).json({ error: "body is required." });

  const { dbUser, dbPass, chatUsername } = req.session;

  try {
    const result = await withDb(dbUser, dbPass, async (client) => {
      const r = await client.query(getSql(req, "message_post"), [chatUsername, cid, b]);
      return r.rows[0];
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({
      error: "Failed to post message.",
      detail: String(e.message || e),
      sqlKey: "message_post"
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SQL Chat app running on http://localhost:${port}`);
});



// =====================================================
// Schema check
// =====================================================

app.get("/api/test_schema", requireGroupLogin, async (req, res) => {
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
    `select body, created_at from chat_inbox limit 0;`,
    // `select ${userFkCol}, ${chatFkCol}, body, created_at from chat_inbox limit 0;`,
  ];

  for (const checkQuery of sanityChecks) {
    console.log("Testing", checkQuery);
    try {
      await withDb(dbUser, dbPass, async (client) => {
        await client.query(checkQuery);
      });
    } catch (e) {
      return res.status(400).json({ error: "Incorrect Schema.", detail: String(e.message || e) });
    }
  }

  return res.json({ ok: true });
});

// prevents sql injection
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
function qIdent(name) {
  const n = String(name || "").trim();
  if (!IDENT_RE.test(n)) throw new Error(`Unsafe identifier: ${n}`);
  return `"${n.replace(/"/g, '""')}"`;
}


// =====================================================
// Password reset
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

    // Keep session
    if (req.session.chatUsername === u) req.session.chatUsername = u;

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Password reset failed.", detail: String(e.message || e) });
  }
});

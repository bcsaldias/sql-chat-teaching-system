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

// --------------------
// Group DB login
// --------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const schema = parseGroupToSchema(username || "");
  if (!schema) return res.status(400).json({ error: "Invalid group username (grp01..grp20)." });

  try {
    // Test connection + (optional) check contract objects exist.
    await withDb(username, password, schema, async (client) => {
      // Don’t hard-fail if students haven’t built everything yet; just sanity-check connection.
      await client.query("SELECT 1;");
    });

    req.session.dbUser = username;
    req.session.dbPass = password;
    req.session.schema = schema;

    // Reset chat user session on new group login
    req.session.chatUsername = null;

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
      // Expect students created: users(username PK, password varchar(128))
      await client.query(
        "INSERT INTO users(username, password) VALUES ($1, $2);",
        [u, h]
      );
    });
    res.json({ ok: true });
  } catch (e) {
    // unique violation -> user exists
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
      const r = await client.query("SELECT password FROM users WHERE username = $1;", [u]);
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
      // Expect students created: channels(id,name,description) + channel_members(username,channel_id)
      const q = `
        SELECT
          c.id,
          c.name,
          c.description,
          (cm.username IS NOT NULL) AS is_member
        FROM channels c
        LEFT JOIN channel_members cm
          ON cm.channel_id = c.id
         AND cm.username = $1
        ORDER BY c.name;
      `;
      const r = await client.query(q, [chatUsername]);
      return r.rows;
    });

    res.json({ ok: true, channels });
  } catch (e) {
    res.status(400).json({ error: "Failed to load channels.", detail: String(e.message || e) });
  }
});

app.post("/api/channels/join", requireGroupLogin, requireChatUser, async (req, res) => {
  const { channel_id } = req.body || {};
  const cid = Number(channel_id);
  if (!Number.isFinite(cid)) return res.status(400).json({ error: "channel_id must be a number." });

  const { dbUser, dbPass, schema, chatUsername } = req.session;

  try {
    await withDb(dbUser, dbPass, schema, async (client) => {
      await client.query(
        "INSERT INTO channel_members(username, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
        [chatUsername, cid]
      );
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
      await client.query(
        "DELETE FROM channel_members WHERE username = $1 AND channel_id = $2;",
        [chatUsername, cid]
      );
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
      // Only allow viewing if member
      const mem = await client.query(
        "SELECT 1 FROM channel_members WHERE username = $1 AND channel_id = $2;",
        [chatUsername, cid]
      );
      if (mem.rowCount === 0) {
        throw new Error("You must join this channel to view messages.");
      }

      // Expect view: chat_recent_messages(message_id, channel_id, channel_name, username, body, created_at)
      const q = `
        SELECT username, body, created_at
        FROM chat_recent_messages
        WHERE channel_id = $1
        ORDER BY created_at DESC
        LIMIT 50;
      `;
      const r = await client.query(q, [cid]);
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
      // Call the required function:
      // chat_post_message(p_username text, p_channel_id int, p_body text) returns bigint
      const r = await client.query(
        "SELECT chat_post_message($1, $2, $3) AS message_id;",
        [chatUsername, cid, b]
      );
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

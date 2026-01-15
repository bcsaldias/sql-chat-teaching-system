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
      // set secure: true if behind HTTPS
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 6 // 6 hours
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function parseGroupToSchema(username) {
  // Accept grp01..grp20 only
  const m = /^grp(\d{2})$/.exec(username);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 20) return null;
  return `g${m[1]}`;
}

async function withDb(sessionUser, sessionPass, schema, fn) {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: sessionUser,
    password: sessionPass
  });

  await client.connect();
  try {
    // schema name is validated to g01..g20; safe to interpolate
    await client.query(`SET LOCAL search_path TO ${schema}, public;`);
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Login: store group creds in server session (class use only)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const schema = parseGroupToSchema(username || "");
  if (!schema) return res.status(400).json({ error: "Invalid group username (use grp01..grp20)." });

  try {
    // test connection + check contract existence
    await withDb(username, password, schema, async (client) => {
      const viewCheck = await client.query("SELECT to_regclass('chat_recent_messages') AS v;");
      const funcCheck = await client.query("SELECT to_regproc('chat_post_message(text,text)') AS f;");
      return { view: viewCheck.rows[0].v, func: funcCheck.rows[0].f };
    });

    req.session.dbUser = username;
    req.session.dbPass = password;
    req.session.schema = schema;

    res.json({ ok: true, schema });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password, VPN/access, and that your view/function exist.",
      detail: String(e.message || e)
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function requireLogin(req, res, next) {
  if (!req.session?.dbUser || !req.session?.dbPass || !req.session?.schema) {
    return res.status(401).json({ error: "Not logged in." });
  }
  next();
}

// Fetch messages
app.get("/api/messages", requireLogin, async (req, res) => {
  const { dbUser, dbPass, schema } = req.session;

  try {
    const rows = await withDb(dbUser, dbPass, schema, async (client) => {
      const q = `
        SELECT display_name, body, created_at
        FROM chat_recent_messages
        ORDER BY created_at DESC
        LIMIT 50;
      `;
      const r = await client.query(q);
      return r.rows;
    });
    res.json({ ok: true, messages: rows });
  } catch (e) {
    res.status(400).json({ error: "Failed to load messages.", detail: String(e.message || e) });
  }
});

// Post message
app.post("/api/message", requireLogin, async (req, res) => {
  const { display_name, body } = req.body || {};
  const { dbUser, dbPass, schema } = req.session;

  if (!display_name || !String(display_name).trim()) {
    return res.status(400).json({ error: "display_name is required." });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: "body is required." });
  }

  try {
    const result = await withDb(dbUser, dbPass, schema, async (client) => {
      const r = await client.query("SELECT chat_post_message($1, $2) AS message_id;", [
        String(display_name),
        String(body)
      ]);
      return r.rows[0];
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: "Failed to post message.", detail: String(e.message || e) });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`INFO 330 SQL Chat app running on http://localhost:${port}`);
});


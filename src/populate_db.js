const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_MAPPING = {
  csv: {
    user_id: "user_id",
    username: "username",
    password: "password",
    channel_name: "channel_name",
    channel_id: "channel_id",
    channel_description: "channel_description",
    member_username: "username",
    member_channel: "channel_name",
    message_username: "username",
    message_channel: "channel_name",
    message_body: "message_body",
    message_created_at: "message_created_at"
  },
  db: {
    users: { table: "users", id: "user_id", username: "username", password: "password" },
    channels: { table: "channels", id: "channel_id", name: "name", description: "description" },
    members: { table: "channel_members", username: "username", channel: "channel" },
    messages: { table: "chat_inbox", username: "username", channel: "channel_id", body: "body", created_at: "created_at" }
  }
};

const MAX_CSV_BYTES = 2_000_000; // 2MB guardrail

const COLUMN_ALIASES = {
  users: {
    username: ["username", "user_name", "user", "login", "handle"],
    password: ["password", "password_hash", "password_digest", "pwd"]
  },
  channels: {
    name: ["name", "channel_name", "channel", "channelname", "cname"],
    description: ["description", "channel_description", "channel_desc", "desc", "cdesc"]
  },
  messages: {
    body: ["body", "message", "message_body", "content", "text", "body_text"],
    created_at: ["created_at", "created", "createdat", "created_on", "timestamp", "ts", "posted_at", "sent_at"]
  }
};

function normalizeHeaderName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeMaybe(value, fallback) {
  if (value === undefined) return fallback;
  const s = String(value ?? "").trim();
  return s || null;
}

function requireValue(value, label) {
  const s = String(value ?? "").trim();
  if (!s) throw new Error(`${label} is required.`);
  return s;
}

function normalizeList(list) {
  return (list || []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
}

function suggestColumn(columns, aliases) {
  const columnList = normalizeList(columns);
  for (const alias of normalizeList(aliases)) {
    const idx = columnList.indexOf(alias);
    if (idx !== -1) return columns[idx];
  }
  return null;
}

function resolveColumn(columns, name) {
  if (!name) return null;
  const columnList = normalizeList(columns);
  const target = String(name || "").trim().toLowerCase();
  const idx = columnList.indexOf(target);
  return idx === -1 ? null : columns[idx];
}

function findColumn(schema, name) {
  if (!schema || !name) return null;
  const target = String(name || "").trim().toLowerCase();
  const list = Array.isArray(schema.columns) ? schema.columns : [];
  return list.find((col) => String(col.column_name || "").trim().toLowerCase() === target) || null;
}

function isNumericType(type) {
  const t = String(type || "").toLowerCase();
  return /(int|numeric|decimal|bigint|smallint|double|real)/.test(t);
}

function pickFkFromSchema(schema, targetTable) {
  if (!schema || !targetTable) return null;
  const list = Array.isArray(schema.fks) ? schema.fks : [];
  const target = String(targetTable || "").trim().toLowerCase();
  if (!target) return null;
  const match = list.find(
    (fk) => String(fk.foreign_table_name || "").trim().toLowerCase() === target
  );
  return match?.column_name || null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    field += ch;
  }

  row.push(field);
  rows.push(row);

  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    const hasData = last.some((cell) => String(cell ?? "").trim() !== "");
    if (hasData) break;
    rows.pop();
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const rawHeaders = rows.shift();
  const headers = rawHeaders.map((h, idx) => {
    let value = String(h ?? "");
    if (idx === 0) value = value.replace(/^\uFEFF/, "");
    return value.trim();
  });

  const dataRows = rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
  return { headers, rows: dataRows };
}

async function getTableColumns(client, table) {
  const name = String(table || "").trim();
  if (!name) return [];
  const { rows } = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
     order by ordinal_position;`,
    [name]
  );
  return rows.map((r) => r.column_name).filter(Boolean);
}

async function getTableSchema(client, table) {
  const name = String(table || "").trim();
  if (!name) return null;

  const { rows: columns } = await client.query(
    `select
      column_name,
      data_type,
      is_nullable,
      column_default,
      is_identity,
      identity_generation,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      ordinal_position
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
     order by ordinal_position;`,
    [name]
  );

  if (!columns.length) return null;

  const { rows: pkRows } = await client.query(
    `select kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
     where tc.table_schema = 'public'
       and tc.table_name = $1
       and tc.constraint_type = 'PRIMARY KEY'
     order by kcu.ordinal_position;`,
    [name]
  );

  const { rows: fkRows } = await client.query(
    `select
       kcu.column_name,
       ccu.table_name as foreign_table_name,
       ccu.column_name as foreign_column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
     where tc.table_schema = 'public'
       and tc.table_name = $1
       and tc.constraint_type = 'FOREIGN KEY';`,
    [name]
  );

  return {
    name,
    columns,
    pk: pkRows.map((r) => r.column_name),
    fks: fkRows
  };
}

function formatDataType(col) {
  let type = String(col.data_type || "").trim().toLowerCase();
  if (!type) return "";
  if (type === "character varying") type = "varchar";
  if (type === "character") type = "char";
  if ((type === "varchar" || type === "char") && col.character_maximum_length) {
    type += `(${col.character_maximum_length})`;
  } else if (type === "numeric" && col.numeric_precision) {
    const scale = col.numeric_scale;
    type += scale ? `(${col.numeric_precision},${scale})` : `(${col.numeric_precision})`;
  }
  return type;
}

function buildCreateTableStatement(schema) {
  if (!schema) return null;
  const pkCols = Array.isArray(schema.pk) ? schema.pk : [];
  const pkSet = new Set(pkCols);
  const fks = Array.isArray(schema.fks) ? schema.fks : [];
  const fkMap = new Map();
  for (const fk of fks) {
    if (!fk?.column_name) continue;
    fkMap.set(fk.column_name, fk);
  }

  const lines = [];
  const inlinePk = pkCols.length === 1 ? pkCols[0] : null;

  for (const col of schema.columns) {
    const parts = [`${col.column_name} ${formatDataType(col)}`.trim()];
    if (col.is_identity === "YES" && col.identity_generation) {
      parts.push(`GENERATED ${String(col.identity_generation).toUpperCase()} AS IDENTITY`);
    } else if (col.column_default) {
      parts.push(`DEFAULT ${col.column_default}`);
    }
    if (col.is_nullable === "NO") parts.push("NOT NULL");
    if (inlinePk && col.column_name === inlinePk) parts.push("PRIMARY KEY");
    const fk = fkMap.get(col.column_name);
    if (fk) {
      parts.push(`REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})`);
    }
    lines.push(` ${parts.join(" ")}`);
  }

  if (pkCols.length > 1) {
    lines.push(` PRIMARY KEY (${pkCols.join(", ")})`);
  }

  return `CREATE TABLE ${schema.name} (\n${lines.join(",\n")}\n);`;
}

function buildHeaderIndex(headers) {
  const index = new Map();
  headers.forEach((h, i) => {
    const key = normalizeHeaderName(h);
    if (!key) return;
    if (!index.has(key)) index.set(key, i);
  });
  return index;
}

function resolveCsvIndex(headerIndex, headerName) {
  if (!headerName) return null;
  const key = normalizeHeaderName(headerName);
  if (!key) return null;
  return headerIndex.has(key) ? headerIndex.get(key) : null;
}

function requireCsvIndex(headerIndex, headerName, fileLabel) {
  const idx = resolveCsvIndex(headerIndex, headerName);
  if (idx === null) throw new Error(`CSV column not found in ${fileLabel}: ${headerName}`);
  return idx;
}

function getCsvTextForKey(body, key, defaultPath) {
  const provided = body?.csvText && typeof body.csvText === "object" ? body.csvText[key] : undefined;
  if (provided !== undefined && provided !== null) {
    const csv = String(provided);
    if (csv.length > MAX_CSV_BYTES) throw new Error(`CSV exceeds ${MAX_CSV_BYTES} bytes.`);
    return { text: csv, source: "upload" };
  }

  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Default CSV not found at ${defaultPath}`);
  }
  const csv = fs.readFileSync(defaultPath, "utf8");
  if (csv.length > MAX_CSV_BYTES) throw new Error(`CSV exceeds ${MAX_CSV_BYTES} bytes.`);
  return { text: csv, source: defaultPath };
}

function loadCsvPayloads(body, defaultPaths) {
  const payloads = {};
  const sources = {};

  for (const [key, defaultPath] of Object.entries(defaultPaths)) {
    const { text, source } = getCsvTextForKey(body, key, defaultPath);
    const parsed = parseCsv(text);
    if (!parsed.headers.length) {
      throw new Error(`${key}.csv must include a header row.`);
    }
    payloads[key] = parsed;
    sources[key] = source;
  }

  return { payloads, sources };
}

function buildMapping(body) {
  const csv = {
    user_id: normalizeMaybe(body?.mapping?.csv?.user_id, DEFAULT_MAPPING.csv.user_id),
    username: normalizeMaybe(body?.mapping?.csv?.username, DEFAULT_MAPPING.csv.username),
    password: normalizeMaybe(body?.mapping?.csv?.password, DEFAULT_MAPPING.csv.password),
    channel_name: normalizeMaybe(body?.mapping?.csv?.channel_name, DEFAULT_MAPPING.csv.channel_name),
    channel_id: normalizeMaybe(body?.mapping?.csv?.channel_id, DEFAULT_MAPPING.csv.channel_id),
    channel_description: normalizeMaybe(body?.mapping?.csv?.channel_description, DEFAULT_MAPPING.csv.channel_description),
    member_username: normalizeMaybe(body?.mapping?.csv?.member_username, DEFAULT_MAPPING.csv.member_username),
    member_channel: normalizeMaybe(body?.mapping?.csv?.member_channel, DEFAULT_MAPPING.csv.member_channel),
    message_username: normalizeMaybe(body?.mapping?.csv?.message_username, DEFAULT_MAPPING.csv.message_username),
    message_channel: normalizeMaybe(body?.mapping?.csv?.message_channel, DEFAULT_MAPPING.csv.message_channel),
    message_body: normalizeMaybe(body?.mapping?.csv?.message_body, DEFAULT_MAPPING.csv.message_body),
    message_created_at: normalizeMaybe(body?.mapping?.csv?.message_created_at, DEFAULT_MAPPING.csv.message_created_at)
  };

  const db = {
    users: {
      table: normalizeMaybe(body?.mapping?.db?.users?.table, DEFAULT_MAPPING.db.users.table),
      id: normalizeMaybe(body?.mapping?.db?.users?.id, DEFAULT_MAPPING.db.users.id),
      username: normalizeMaybe(body?.mapping?.db?.users?.username, DEFAULT_MAPPING.db.users.username),
      password: normalizeMaybe(body?.mapping?.db?.users?.password, DEFAULT_MAPPING.db.users.password)
    },
    channels: {
      table: normalizeMaybe(body?.mapping?.db?.channels?.table, DEFAULT_MAPPING.db.channels.table),
      id: normalizeMaybe(body?.mapping?.db?.channels?.id, DEFAULT_MAPPING.db.channels.id),
      name: normalizeMaybe(body?.mapping?.db?.channels?.name, DEFAULT_MAPPING.db.channels.name),
      description: normalizeMaybe(body?.mapping?.db?.channels?.description, DEFAULT_MAPPING.db.channels.description)
    },
    members: {
      table: normalizeMaybe(body?.mapping?.db?.members?.table, DEFAULT_MAPPING.db.members.table),
      username: normalizeMaybe(body?.mapping?.db?.members?.username, DEFAULT_MAPPING.db.members.username),
      channel: normalizeMaybe(body?.mapping?.db?.members?.channel, DEFAULT_MAPPING.db.members.channel)
    },
    messages: {
      table: normalizeMaybe(body?.mapping?.db?.messages?.table, DEFAULT_MAPPING.db.messages.table),
      username: normalizeMaybe(body?.mapping?.db?.messages?.username, DEFAULT_MAPPING.db.messages.username),
      channel: normalizeMaybe(body?.mapping?.db?.messages?.channel, DEFAULT_MAPPING.db.messages.channel),
      body: normalizeMaybe(body?.mapping?.db?.messages?.body, DEFAULT_MAPPING.db.messages.body),
      created_at: normalizeMaybe(body?.mapping?.db?.messages?.created_at, DEFAULT_MAPPING.db.messages.created_at)
    }
  };

  return { csv, db };
}

function getPkModes(options) {
  const channelRaw = String(options?.channelFkMode || "name").trim().toLowerCase();
  const channelMode = channelRaw === "id" || channelRaw === "serial" ? "id" : "name";
  const userRaw = String(options?.userPkMode || "username").trim().toLowerCase();
  const userMode = userRaw === "id" || userRaw === "serial" ? "id" : "username";
  return {
    channelMode,
    useChannelId: channelMode === "id",
    userMode,
    useUserId: userMode === "id"
  };
}

function looksLikeSha512Hex(value) {
  return /^[a-f0-9]{128}$/i.test(String(value ?? ""));
}

function hashPassword(value) {
  return crypto.createHash("sha512").update(String(value ?? ""), "utf8").digest("hex");
}

function buildSeedData(payloads, mapping, options) {
  const { useChannelId, useUserId } = getPkModes(options);
  const csv = mapping.csv;

  // Users
  const usersIndex = buildHeaderIndex(payloads.users.headers);
  const usersIdCol = useUserId ? requireValue(csv.user_id, "Users CSV id column") : null;
  const usersUsernameCol = requireValue(csv.username, "Users CSV username column");
  const usersPasswordCol = requireValue(csv.password, "Users CSV password column");
  const userIdIdx = usersIdCol
    ? requireCsvIndex(usersIndex, usersIdCol, "users.csv")
    : null;
  const usernameIdx = requireCsvIndex(usersIndex, usersUsernameCol, "users.csv");
  const passwordIdx = requireCsvIndex(usersIndex, usersPasswordCol, "users.csv");

  const users = new Map();
  for (const row of payloads.users.rows) {
    const id = userIdIdx !== null ? String(row[userIdIdx] ?? "").trim() : "";
    const username = String(row[usernameIdx] ?? "").trim();
    const password = String(row[passwordIdx] ?? "").trim();
    if (!username) continue;
    if (useUserId && !id) continue;
    const key = useUserId ? id : username;
    if (!key) continue;
    const prev = users.get(key);
    if (!prev || (password && !prev.password)) {
      users.set(key, { id: id || null, username, password });
    }
  }

  const hashPasswords = options?.hashPasswords !== false;
  const userList = Array.from(users.values()).map((entry) => {
    const pwd = String(entry.password ?? "");
    const next = hashPasswords && pwd && !looksLikeSha512Hex(pwd) ? hashPassword(pwd) : pwd;
    return { id: entry.id ?? null, username: entry.username, password: next };
  });

  // Channels
  const channelsIndex = buildHeaderIndex(payloads.channels.headers);
  const channelsNameCol = requireValue(csv.channel_name, "Channels CSV name column");
  const channelsDescCol = csv.channel_description ? csv.channel_description : null;
  const channelNameIdx = requireCsvIndex(channelsIndex, channelsNameCol, "channels.csv");
  const channelDescIdx = channelsDescCol
    ? requireCsvIndex(channelsIndex, channelsDescCol, "channels.csv")
    : null;

  const channelIdIdx = useChannelId
    ? requireCsvIndex(
      channelsIndex,
      requireValue(csv.channel_id, "Channels CSV id column"),
      "channels.csv"
    )
    : null;

  const channels = new Map();
  for (const row of payloads.channels.rows) {
    const name = String(row[channelNameIdx] ?? "").trim();
    if (!name) continue;
    const description = channelDescIdx !== null ? String(row[channelDescIdx] ?? "") : "";

    if (useChannelId) {
      const id = String(row[channelIdIdx] ?? "").trim();
      if (!id) continue;
      if (!channels.has(id)) {
        channels.set(id, { id, name, description });
      }
      continue;
    }

    if (!channels.has(name)) {
      channels.set(name, { name, description });
    }
  }

  const channelList = Array.from(channels.values()).map((entry) => ({
    id: entry.id ?? null,
    name: entry.name,
    description: String(entry.description ?? "")
  }));

  // Members
  const membersIndex = buildHeaderIndex(payloads.members.headers);
  const membersUsernameCol = requireValue(csv.member_username, "Members CSV username column");
  const membersChannelCol = requireValue(csv.member_channel, "Members CSV channel column");
  const memberUsernameIdx = requireCsvIndex(membersIndex, membersUsernameCol, "members.csv");
  const memberChannelIdx = requireCsvIndex(membersIndex, membersChannelCol, "members.csv");

  const members = new Set();
  for (const row of payloads.members.rows) {
    const username = String(row[memberUsernameIdx] ?? "").trim();
    const channelValue = String(row[memberChannelIdx] ?? "").trim();
    if (!username || !channelValue) continue;
    members.add(`${username}::${channelValue}`);
  }

  const memberList = Array.from(members.values()).map((key) => {
    const [username, channelValue] = key.split("::");
    return { username, channelValue };
  });

  // Messages
  const messagesIndex = buildHeaderIndex(payloads.messages.headers);
  const messagesUsernameCol = requireValue(csv.message_username, "Messages CSV username column");
  const messagesChannelCol = requireValue(csv.message_channel, "Messages CSV channel column");
  const messagesBodyCol = requireValue(csv.message_body, "Messages CSV body column");
  const messagesCreatedCol = csv.message_created_at ? csv.message_created_at : null;
  const messageUsernameIdx = requireCsvIndex(messagesIndex, messagesUsernameCol, "messages.csv");
  const messageChannelIdx = requireCsvIndex(messagesIndex, messagesChannelCol, "messages.csv");
  const messageBodyIdx = requireCsvIndex(messagesIndex, messagesBodyCol, "messages.csv");
  const messageCreatedIdx = messagesCreatedCol
    ? requireCsvIndex(messagesIndex, messagesCreatedCol, "messages.csv")
    : null;

  const messages = [];
  for (const row of payloads.messages.rows) {
    const username = String(row[messageUsernameIdx] ?? "").trim();
    const channelValue = String(row[messageChannelIdx] ?? "").trim();
    const body = String(row[messageBodyIdx] ?? "");
    if (!username || !channelValue || !body.trim()) continue;
    const createdAt = messageCreatedIdx !== null ? String(row[messageCreatedIdx] ?? "").trim() : "";
    messages.push({
      username,
      channelValue,
      body,
      createdAt: createdAt || null
    });
  }

  return { userList, channelList, memberList, messages };
}

function registerPopulateDbRoutes(app, options = {}) {
  if (!app) throw new Error("registerPopulateDbRoutes requires an express app");

  const requireGroupLogin = options.requireGroupLogin;
  const dbRoute = options.dbRoute;
  const dbError = options.dbError;
  const withDb = options.withDb;
  const qIdent = options.qIdent;
  const publicDir = options.publicDir || path.join(__dirname, "..", "public");

  const defaultCsvPaths = {
    users: process.env.POPULATE_DB_USERS_CSV || path.join(__dirname, "..", "data", "populate_db", "users.csv"),
    channels: process.env.POPULATE_DB_CHANNELS_CSV || path.join(__dirname, "..", "data", "populate_db", "channels.csv"),
    members: process.env.POPULATE_DB_MEMBERS_CSV || path.join(__dirname, "..", "data", "populate_db", "members.csv"),
    messages: process.env.POPULATE_DB_MESSAGES_CSV || path.join(__dirname, "..", "data", "populate_db", "messages.csv")
  };

  if (!requireGroupLogin || !dbRoute || !dbError || !withDb || !qIdent) {
    throw new Error("registerPopulateDbRoutes requires requireGroupLogin, dbRoute, dbError, withDb, and qIdent.");
  }

  app.get("/populate_db", (_req, res) => {
    res.sendFile(path.join(publicDir, "populate_db.html"));
  });

  app.get("/api/populate_db/definitions", requireGroupLogin, dbRoute(async (req, res) => {
    const tableNames = {
      users: DEFAULT_MAPPING.db.users.table,
      channels: DEFAULT_MAPPING.db.channels.table,
      channel_members: DEFAULT_MAPPING.db.members.table,
      chat_inbox: DEFAULT_MAPPING.db.messages.table
    };

    const definitions = {};
    const warnings = [];

    await withDb(req.session.dbUser, req.session.dbPass, async (client) => {
      for (const [key, name] of Object.entries(tableNames)) {
        const schema = await getTableSchema(client, name);
        if (!schema) {
          warnings.push(`Table "${name}" not found.`);
          continue;
        }
        definitions[key] = buildCreateTableStatement(schema);
      }
    });

    res.json({ ok: true, definitions, warnings });
  }, (e) => dbError("Failed to load table definitions.", String(e.message || e))));

  app.post("/api/populate_db/schema", requireGroupLogin, dbRoute(async (req, res) => {
    const tables = req.body?.tables || {};
    const tableNames = {
      users: normalizeMaybe(tables.users, DEFAULT_MAPPING.db.users.table),
      channels: normalizeMaybe(tables.channels, DEFAULT_MAPPING.db.channels.table),
      members: normalizeMaybe(tables.members, DEFAULT_MAPPING.db.members.table),
      messages: normalizeMaybe(tables.messages, DEFAULT_MAPPING.db.messages.table)
    };

    const columns = { users: [], channels: [], members: [], messages: [] };
    const suggestions = { users: {}, channels: {}, members: {}, messages: {} };
    const warnings = [];

    await withDb(req.session.dbUser, req.session.dbPass, async (client) => {
      columns.users = await getTableColumns(client, tableNames.users);
      columns.channels = await getTableColumns(client, tableNames.channels);
      columns.members = await getTableColumns(client, tableNames.members);
      columns.messages = await getTableColumns(client, tableNames.messages);

      if (!columns.users.length) warnings.push(`No columns found for users table "${tableNames.users}".`);
      if (!columns.channels.length) warnings.push(`No columns found for channels table "${tableNames.channels}".`);
      if (!columns.members.length) warnings.push(`No columns found for members table "${tableNames.members}".`);
      if (!columns.messages.length) warnings.push(`No columns found for messages table "${tableNames.messages}".`);

      const schemas = {
        users: await getTableSchema(client, tableNames.users),
        channels: await getTableSchema(client, tableNames.channels),
        members: await getTableSchema(client, tableNames.members),
        messages: await getTableSchema(client, tableNames.messages)
      };

      const userPk = schemas.users?.pk?.[0] || null;
      if (schemas.users?.pk?.length > 1 && userPk) {
        warnings.push(`Users PK is composite; using ${userPk}.`);
      }
      if (!userPk) {
        warnings.push("Users PK not detected; Users.username will remain blank.");
      } else {
        const userPkType = findColumn(schemas.users, userPk)?.data_type;
        if (isNumericType(userPkType)) {
          suggestions.users.id = userPk;
          suggestions.users.username = suggestColumn(columns.users, COLUMN_ALIASES.users.username);
          if (!suggestions.users.username) {
            warnings.push("Users.username not detected; update the DB schema column manually.");
          }
        } else {
          suggestions.users.username = userPk;
        }
      }
      suggestions.users.password = suggestColumn(columns.users, COLUMN_ALIASES.users.password);

      const channelPk = schemas.channels?.pk?.[0] || null;
      if (schemas.channels?.pk?.length > 1 && channelPk) {
        warnings.push(`Channels PK is composite; using ${channelPk}.`);
      }
      if (!channelPk) {
        warnings.push("Channels PK not detected; Channels.id/name will remain blank.");
      } else {
        const channelPkType = findColumn(schemas.channels, channelPk)?.data_type;
        if (isNumericType(channelPkType)) {
          suggestions.channels.id = channelPk;
          suggestions.channels.name = suggestColumn(columns.channels, COLUMN_ALIASES.channels.name);
          if (!suggestions.channels.name) {
            warnings.push("Channels.name not detected; update the DB schema column manually.");
          }
        } else {
          suggestions.channels.name = channelPk;
        }
      }
      suggestions.channels.description = suggestColumn(columns.channels, COLUMN_ALIASES.channels.description);

      const memberUserFk = resolveColumn(
        columns.members,
        pickFkFromSchema(schemas.members, tableNames.users)
      );
      const memberChannelFk = resolveColumn(
        columns.members,
        pickFkFromSchema(schemas.members, tableNames.channels)
      );
      if (!memberUserFk) warnings.push("Members.user FK not detected; Members.user will remain blank.");
      if (!memberChannelFk) warnings.push("Members.channel FK not detected; Members.channel will remain blank.");
      suggestions.members.username = memberUserFk;
      suggestions.members.channel = memberChannelFk;

      const messageUserFk = resolveColumn(
        columns.messages,
        pickFkFromSchema(schemas.messages, tableNames.users)
      );
      const messageChannelFk = resolveColumn(
        columns.messages,
        pickFkFromSchema(schemas.messages, tableNames.channels)
      );
      if (!messageUserFk) warnings.push("Messages.user FK not detected; Messages.username will remain blank.");
      if (!messageChannelFk) warnings.push("Messages.channel FK not detected; Messages.channel will remain blank.");
      suggestions.messages.username = messageUserFk;
      suggestions.messages.channel = messageChannelFk;
      suggestions.messages.body = suggestColumn(columns.messages, COLUMN_ALIASES.messages.body);
      suggestions.messages.created_at = suggestColumn(columns.messages, COLUMN_ALIASES.messages.created_at);
    });

    res.json({ ok: true, tables: tableNames, columns, suggestions, warnings });
  }, (e) => dbError("Schema lookup failed.", String(e.message || e))));

  app.post("/api/populate_db/preview", requireGroupLogin, dbRoute(async (req, res) => {
    const { payloads, sources } = loadCsvPayloads(req.body || {}, defaultCsvPaths);
    const mapping = buildMapping(req.body || {});
    const seedData = buildSeedData(payloads, mapping, req.body?.options || {});

    const files = {};
    for (const [key, payload] of Object.entries(payloads)) {
      const sampleLimit = Math.min(5, payload.rows.length);
      files[key] = {
        headers: payload.headers,
        sampleRows: payload.rows.slice(0, sampleLimit),
        rowCount: payload.rows.length
      };
    }

    res.json({
      ok: true,
      sources,
      files,
      counts: {
        rows: {
          users: payloads.users.rows.length,
          channels: payloads.channels.rows.length,
          members: payloads.members.rows.length,
          messages: payloads.messages.rows.length
        },
        entities: {
          users: seedData.userList.length,
          channels: seedData.channelList.length,
          members: seedData.memberList.length,
          messages: seedData.messages.length
        }
      }
    });
  }, (e) => dbError("Preview failed.", String(e.message || e))));

  app.post("/api/populate_db/run", requireGroupLogin, dbRoute(async (req, res) => {
    const { payloads } = loadCsvPayloads(req.body || {}, defaultCsvPaths);
    const mapping = buildMapping(req.body || {});
    const { useChannelId, useUserId } = getPkModes(req.body?.options || {});

    const db = mapping.db;
    const usersTable = qIdent(requireValue(db.users.table, "Users table"));
    const usersIdCol = useUserId ? qIdent(requireValue(db.users.id, "Users.id column")) : null;
    const usersUsernameCol = qIdent(requireValue(db.users.username, "Users.username column"));
    const usersPasswordCol = qIdent(requireValue(db.users.password, "Users.password column"));

    const channelsTable = qIdent(requireValue(db.channels.table, "Channels table"));
    const channelsIdCol = useChannelId ? qIdent(requireValue(db.channels.id, "Channels.id column")) : null;
    const channelsNameCol = qIdent(requireValue(db.channels.name, "Channels.name column"));
    const channelsDescCol = qIdent(requireValue(db.channels.description, "Channels.description column"));

    const membersTable = qIdent(requireValue(db.members.table, "Members table"));
    const membersUsernameCol = qIdent(requireValue(db.members.username, "Members.username column"));
    const membersChannelCol = qIdent(requireValue(db.members.channel, "Members.channel column"));

    const messagesTable = qIdent(requireValue(db.messages.table, "Messages table"));
    const messagesUsernameCol = qIdent(requireValue(db.messages.username, "Messages.username column"));
    const messagesChannelCol = qIdent(requireValue(db.messages.channel, "Messages.channel column"));
    const messagesBodyCol = qIdent(requireValue(db.messages.body, "Messages.body column"));
    const messagesCreatedCol = db.messages.created_at ? qIdent(db.messages.created_at) : null;

    const seedData = buildSeedData(payloads, mapping, req.body?.options || {});

    const stats = {
      users: { attempted: seedData.userList.length, inserted: 0 },
      channels: { attempted: seedData.channelList.length, inserted: 0 },
      members: { attempted: seedData.memberList.length, inserted: 0 },
      messages: { attempted: seedData.messages.length, inserted: 0 }
    };

    await withDb(req.session.dbUser, req.session.dbPass, async (client) => {
      await client.query("BEGIN");
      try {
        const insertUserSql = usersIdCol
          ? `INSERT INTO ${usersTable} (${usersIdCol}, ${usersUsernameCol}, ${usersPasswordCol}) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`
          : `INSERT INTO ${usersTable} (${usersUsernameCol}, ${usersPasswordCol}) VALUES ($1, $2) ON CONFLICT DO NOTHING;`;
        for (const user of seedData.userList) {
          const params = usersIdCol
            ? [user.id, user.username, user.password]
            : [user.username, user.password];
          const r = await client.query(insertUserSql, params);
          if (r.rowCount) stats.users.inserted += 1;
        }

        const insertChannelSql = channelsIdCol
          ? `INSERT INTO ${channelsTable} (${channelsIdCol}, ${channelsNameCol}, ${channelsDescCol}) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`
          : `INSERT INTO ${channelsTable} (${channelsNameCol}, ${channelsDescCol}) VALUES ($1, $2) ON CONFLICT DO NOTHING;`;

        for (const channel of seedData.channelList) {
          const params = channelsIdCol
            ? [channel.id, channel.name, channel.description]
            : [channel.name, channel.description];
          const r = await client.query(insertChannelSql, params);
          if (r.rowCount) stats.channels.inserted += 1;
        }

        const insertMemberSql = `INSERT INTO ${membersTable} (${membersUsernameCol}, ${membersChannelCol}) VALUES ($1, $2) ON CONFLICT DO NOTHING;`;
        for (const membership of seedData.memberList) {
          const r = await client.query(insertMemberSql, [membership.username, membership.channelValue]);
          if (r.rowCount) stats.members.inserted += 1;
        }

        const insertMessageSqlBase = `INSERT INTO ${messagesTable} (${messagesUsernameCol}, ${messagesChannelCol}, ${messagesBodyCol}) VALUES ($1, $2, $3);`;
        const insertMessageSqlWithCreated = messagesCreatedCol
          ? `INSERT INTO ${messagesTable} (${messagesUsernameCol}, ${messagesChannelCol}, ${messagesBodyCol}, ${messagesCreatedCol}) VALUES ($1, $2, $3, $4);`
          : null;

        for (const message of seedData.messages) {
          const hasCreated = messagesCreatedCol && message.createdAt;
          const sql = hasCreated ? insertMessageSqlWithCreated : insertMessageSqlBase;
          const params = hasCreated
            ? [message.username, message.channelValue, message.body, message.createdAt]
            : [message.username, message.channelValue, message.body];
          const r = await client.query(sql, params);
          if (r.rowCount) stats.messages.inserted += 1;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    res.json({ ok: true, stats });
  }, (e) => dbError("Populate failed.", String(e.message || e))));
}

module.exports = { registerPopulateDbRoutes, DEFAULT_MAPPING };

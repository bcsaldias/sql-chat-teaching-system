// ----------------------------
// Elements
// ----------------------------
const loginPanel = document.getElementById("loginPanel");
const chatPanel = document.getElementById("chatPanel");

const usernameEl = document.getElementById("username");   // group DB login username (grp10)
const passwordEl = document.getElementById("password");   // group DB login password
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const logoutBtn = document.getElementById("logoutBtn");
const connPill = document.getElementById("connPill");

const userAuthPanel = document.getElementById("userAuthPanel");
const mainChatUI = document.getElementById("mainChatUI");
const chatUsernameEl = document.getElementById("chatUsername");
const chatPasswordEl = document.getElementById("chatPassword");
const registerBtn = document.getElementById("registerBtn");
const userLoginBtn = document.getElementById("userLoginBtn");
const userAuthMsg = document.getElementById("userAuthMsg");

const channelsEl = document.getElementById("channels");
const channelSearchEl = document.getElementById("channelSearch");
const channelMsg = document.getElementById("channelMsg");
const activeChannelLabel = document.getElementById("activeChannelLabel");
const activeChannelSub = document.getElementById("activeChannelSub");

const composerInput = document.getElementById("composerInput");
const sendBtn = document.getElementById("sendBtn");
const postMsg = document.getElementById("postMsg");
const messagesEl = document.getElementById("messages");

const userPill = document.getElementById("userPill");
const userLabel = document.getElementById("userLabel");
const userAvatar = document.getElementById("userAvatar");

const sidebar = document.getElementById("sidebar");
const chatMain = document.getElementById("chatMain");
const sidebarOpen = document.getElementById("sidebarOpen");
const sidebarClose = document.getElementById("sidebarClose");

const toastEl = document.getElementById("toast");

// ----------------------------
// SQL Lab (UI created dynamically)
// ----------------------------
let tabChatBtn = null;
let tabSqlBtn = null;
let sqlPanel = null;
let sqlLabList = null;
let sqlSaveBtn = null;
let sqlResetBtn = null;
let sqlLabMsg = null;

const SQL_LAB_ITEMS = [
  // {
  //   key: "set_search_path",
  //   title: "1) Set schema search_path",
  //   required: "SET LOCAL search_path TO {{schema}}, public;"
  // // },
  // {
  //   key: "conn_test",
  //   title: "2) Connection test",
  //   required: "SELECT 1;"
  // },
  {
    key: "user_register",
    title: "1) Register user",
    required: "INSERT INTO users(username, password) VALUES ($1, $2);"
  },
  {
    key: "user_login",
    title: "2) Login user",
    required: "SELECT password FROM users WHERE username = $1;"
  },
  {
    key: "channels_list",
    title: "3) List channels + membership",
    required:
`SELECT
  c.id,
  c.name,
  c.description,
  (cm.username IS NOT NULL) AS is_member
FROM channels c
LEFT JOIN channel_members cm
  ON cm.channel_id = c.id
 AND cm.username = $1
ORDER BY c.name;`
  },
  {
    key: "channel_join",
    title: "4) Join channel",
    required: "INSERT INTO channel_members(username, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;"
  },
  {
    key: "channel_leave",
    title: "5) Leave channel",
    required: "DELETE FROM channel_members WHERE username = $1 AND channel_id = $2;"
  },
  {
    key: "member_check",
    title: "6) Membership check (view messages)",
    required: "SELECT 1 FROM channel_members WHERE username = $1 AND channel_id = $2;"
  },
  {
    key: "messages_list",
    title: "7) Load messages from view",
    required:
`SELECT username, body, created_at
FROM chat_recent_messages
WHERE channel_id = $1
ORDER BY created_at DESC
LIMIT 50;`
  },
  {
    key: "message_post",
    title: "8) Post message via function",
    required: "SELECT chat_post_message($1, $2, $3) AS message_id;"
  }
];

function setSidebarVisible(v) {
  sidebar.classList.toggle("hidden", !v); // hidden when v=false
  if (!v) sidebar.classList.remove("open"); // close drawer
  chatMain.classList.toggle("hidden", !v);
  if (!v) chatMain.classList.remove("open"); // close drawer
}


function ensureSqlLabUI() {
  if (sqlPanel && sqlLabList) return;

  tabChatBtn = document.getElementById("tabChat");
  tabSqlBtn = document.getElementById("tabSql");

  // SQL panel
  sqlPanel = document.createElement("div");
  sqlPanel.id = "sqlLabPanel";
  sqlPanel.className = "hidden";

  const card = document.createElement("div");
  card.className = "card";

  const h2 = document.createElement("div");
  h2.style.fontWeight = "900";
  h2.textContent = "SQL Lab (Fill the Server Queries)";

  const p = document.createElement("div");
  p.className = "mutedSmall";
  p.innerHTML = `Type the SQL exactly as shown in <b>Required</b>. Then click <b>Save</b>.`;

  sqlLabList = document.createElement("div");
  sqlLabList.id = "sqlLabList";

  const row = document.createElement("div");

  sqlSaveBtn = document.createElement("button");
  sqlSaveBtn.id = "sqlSaveBtn";
  sqlSaveBtn.className = "btn btn-primary";
  sqlSaveBtn.type = "button";
  sqlSaveBtn.textContent = "Save SQL";

  sqlResetBtn = document.createElement("button");
  sqlResetBtn.id = "sqlResetBtn";
  sqlResetBtn.className = "btn btn-ghost";
  sqlResetBtn.type = "button";
  sqlResetBtn.textContent = "Reset to defaults";
  sqlResetBtn.style.marginLeft = "10px";

  sqlLabMsg = document.createElement("span");
  sqlLabMsg.id = "sqlLabMsg";
  sqlLabMsg.className = "msg";

  row.appendChild(sqlSaveBtn);
  row.appendChild(sqlResetBtn);
  row.appendChild(sqlLabMsg);

  card.appendChild(h2);
  card.appendChild(p);
  card.appendChild(sqlLabList);
  card.appendChild(row);

  sqlPanel.appendChild(card);

  // Insert into chatPanel at the top
  chatPanel.prepend(sqlPanel);

  // Events
  tabChatBtn.addEventListener("click", async () => {
    // When switching back to Chat, save any SQL edits the user made so the server
    // will immediately use them. Failures shouldn't block switching to chat.
    try {
      if (sqlPanel && !sqlPanel.classList.contains('hidden')) {
        setMsg(sqlLabMsg, "");
        const templates = collectSqlLabInputs();
        await api("/api/sql_templates", "POST", { templates });
        await loadSqlTemplates();
        setMsg(sqlLabMsg, "Saved. The server will now use your SQL templates.", true);
      }
    } catch (e) {
      // show the error but continue to chat
      setMsg(sqlLabMsg, e.message, false);
    } finally {
      await setTab("chat");
    }
  });
  tabSqlBtn.addEventListener("click", () => setTab("sql"));

  sqlSaveBtn.addEventListener("click", async () => {
    setMsg(sqlLabMsg, "");
    try {
      const templates = collectSqlLabInputs();
      await api("/api/sql_templates", "POST", { templates });
      // Reload templates from server to confirm what the server stored is now active
      await loadSqlTemplates();
      setMsg(sqlLabMsg, "Saved. The server will now use your SQL templates.", true);
    } catch (e) {
      setMsg(sqlLabMsg, e.message, false);
    }
  });

  sqlResetBtn.addEventListener("click", async () => {
    setMsg(sqlLabMsg, "");
    try {
      await api("/api/sql_templates/reset", "POST");
      await loadSqlTemplates();
      setMsg(sqlLabMsg, "Reset to defaults.", true);
    } catch (e) {
      setMsg(sqlLabMsg, e.message, false);
    }
  });
}

function setTabsVisible(visible) {
  ensureSqlLabUI();
  if (!visible) {
    sqlPanel.classList.add("hidden");
    // restore chat panels to default state
    if (state.chatUsername) showMainUI(state.chatUsername);
    else showUserAuth();
  }
}

let _pollResume = false;

async function setTab(which) {
  ensureSqlLabUI();

  const isSql = which === "sql";
  document.documentElement.classList.toggle("sql-mode", isSql);
  document.body.classList.toggle("sql-mode", isSql);

  tabChatBtn.classList.toggle("active", !isSql);
  tabSqlBtn.classList.toggle("active", isSql);

  if (isSql) {
    // pause polling while in SQL lab
    _pollResume = !!state.pollTimer;
    stopPolling();
    setSidebarVisible(false);
    sqlPanel.classList.remove("hidden");
    userAuthPanel.classList.add("hidden");
    mainChatUI.classList.add("hidden");

    await loadSqlTemplates();
  } else {
    sqlPanel.classList.add("hidden");
    setSidebarVisible(true);
    // restore whichever chat sub-panel is appropriate
    if (state.chatUsername) {
      showMainUI(state.chatUsername);
      // Refresh channels/messages so the chat reflects any SQL/template changes
      try {
        await loadChannels();
        if (state.activeChannelId) await loadMessages(state.activeChannelId, { silent: true });
      } catch (e) {
        // non-fatal: show a small toast and continue
        console.error('Failed to refresh chat data on tab switch:', e);
        setMsg(postMsg, 'Failed to refresh chat data.', false);
      }
    } else showUserAuth();

    if (_pollResume && state.activeChannelId) startPolling();
  }
}

function renderSqlLab(templates) {
  ensureSqlLabUI();
  sqlLabList.innerHTML = "";

  for (const item of SQL_LAB_ITEMS) {
    const outer = document.createElement("div");
    outer.style.border = "1px solid var(--border,#ddd)";
    outer.style.borderRadius = "14px";
    outer.style.padding = "12px";
    outer.style.margin = "10px 0";
    outer.style.background = "#fff";

    const title = document.createElement("div");
    title.style.fontWeight = "900";
    title.style.marginBottom = "6px";
    title.textContent = item.title;

    const label = document.createElement("div");
    label.className = "mutedSmall";
    label.style.color = "var(--muted,#666)";
    label.style.marginBottom = "6px";
    label.textContent = "Required:";

    const req = document.createElement("pre");
    req.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    req.style.fontSize = "12px";
    req.style.background = "#f3f4f6";
    req.style.border = "1px solid var(--border,#ddd)";
    req.style.padding = "10px";
    req.style.borderRadius = "12px";
    req.style.whiteSpace = "pre-wrap";
    req.style.overflow = "auto";
    req.textContent = item.required;

    const ta = document.createElement("textarea");
    ta.className = "sqlInput";
    ta.dataset.sqlkey = item.key;
    ta.value = (templates && templates[item.key]) ? String(templates[item.key]) : item.required;
    ta.style.width = "100%";
    ta.style.minHeight = "80px";
    ta.style.marginTop = "10px";
    ta.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    outer.appendChild(title);
    outer.appendChild(label);
    outer.appendChild(req);
    outer.appendChild(ta);

    sqlLabList.appendChild(outer);
  }
}

function collectSqlLabInputs() {
  ensureSqlLabUI();
  const out = {};
  const areas = sqlLabList.querySelectorAll("textarea[data-sqlkey]");
  for (const ta of areas) out[ta.dataset.sqlkey] = ta.value;
  return out;
}

async function loadSqlTemplates() {
  ensureSqlLabUI();
  setMsg(sqlLabMsg, "");
  const data = await api("/api/sql_templates");
  renderSqlLab(data.templates || {});
}

// ----------------------------
// State
// ----------------------------
const state = {
  pollTimer: null,
  activeChannelId: null,
  channels: [],
  chatUsername: null,
  lastSeenByChannel: loadLocal("lastSeenByChannel", {})
};

// ----------------------------
// Helpers
// ----------------------------
function setMsg(el, text, ok = false) {
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
  if (!text) el.className = "msg";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(text, ms = 2200) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toastEl._t);
  toastEl._t = window.setTimeout(() => toastEl.classList.add("hidden"), ms);
}

function loadLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function toChronological(messages) {
  const arr = Array.isArray(messages) ? [...messages] : [];

  // If backend returns DESC (newest first), flip it to ASC (oldest first).
  if (arr.length >= 2) {
    const first = arr[0]?.created_at;
    const last = arr[arr.length - 1]?.created_at;
    if (first && last && new Date(first) > new Date(last)) arr.reverse();
  }
  return arr;
}

function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function expandTo128(s) {
  if (!s || s.length === 0) throw new Error("Input string must be non-empty");
  const reps = Math.ceil(128 / s.length);
  return (s.repeat(reps)).slice(0, 128);
}

// --- SHA-512 hash (128 hex chars) using Web Crypto API ---
async function sha512Hex(input) {
  // NOTE: currently using a simple placeholder expansion (your original code).
  // Replace with real SHA-512 if you want:
  return expandTo128(input);

  // const enc = new TextEncoder();
  // const buf = await crypto.subtle.digest("SHA-512", enc.encode(input));
  // const bytes = new Uint8Array(buf);
  // return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function api(path, method = "GET", body = null) {
  // Ensure cookies/session are sent so server sees our session (group DB login, templates)
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));

  // If unauthorized, decide *why* before hiding the chat UI
  if (r.status === 401 || r.status === 403) {
    const msg = String(data.error || data.detail || "").toLowerCase();

    const groupDbMissing =
      msg.includes("group database") ||
      msg.includes("not logged in to group") ||
      msg.includes("not logged in to group database") ||
      msg.includes("not logged in to group db");

    const chatUserMissing =
      msg.includes("chat user") ||
      msg.includes("not logged in as a chat user");

    if (groupDbMissing) {
      // DB session truly missing: hide chat + tabs
      state.isDbConnected = false;
      renderGate();
    } else if (chatUserMissing) {
      // DB still connected: keep chat visible + tabs
      state.isDbConnected = true;
      renderGate();
      // go back to chat tab and show chat-user auth
      setTab("chat");
      showUserAuth();
    }
  }

  if (!r.ok) throw new Error(data.detail || data.error || `Request failed (${r.status})`);
  return data;
}

function showChat() {
  loginPanel.classList.add("hidden");
  chatPanel.classList.remove("hidden");
}

function showLogin() {
  chatPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

function showUserAuth() {
  userAuthPanel.classList.remove("hidden");
  mainChatUI.classList.add("hidden");
  userPill.classList.add("pill-muted");
  userPill.textContent = "Not logged in";
  userLabel.textContent = "Not signed in";
  userAvatar.textContent = "?";
}

function showMainUI(username) {
  userAuthPanel.classList.add("hidden");
  mainChatUI.classList.remove("hidden");
  userPill.classList.remove("pill-muted");
  userPill.textContent = `@${username}`;
  userLabel.textContent = `@${username}`;
  userAvatar.textContent = (username?.[0] || "?").toUpperCase();
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (state.activeChannelId) loadMessages(state.activeChannelId, { silent: true });
  }, 2500);
}

function setConnectedPill(connected) {
  if (connected) {
    connPill.classList.remove("pill-muted");
    connPill.textContent = "Connected";
  } else {
    connPill.classList.add("pill-muted");
    connPill.textContent = "Not connected";
  }
}

function setActiveChannel(channel) {
  if (!channel) {
    state.activeChannelId = null;
    activeChannelLabel.textContent = "Select a channel";
    activeChannelSub.textContent = "Join a channel to read and post.";
    messagesEl.innerHTML = "";
    stopPolling();
    return;
  }
  state.activeChannelId = channel.id;
  activeChannelLabel.textContent = `# ${channel.name}`;
  activeChannelSub.textContent = channel.description || " ";
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isAtBottom(container) {
  const threshold = 80;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

// autosize textarea
function autosizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

// ----------------------------
// DB-connected gate
// ----------------------------
state.isDbConnected = false;

function renderGate() {
  if (state.isDbConnected) {
    loginPanel.classList.add("hidden");
    chatPanel.classList.remove("hidden");
    setConnectedPill(true);

    // show tabs (chat + sql lab) only when connected to schema
    setTabsVisible(true);
  } else {
    // show ONLY group db login
    chatPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    setConnectedPill(false);

    setTabsVisible(false);

    // clear chat UI so nothing “leaks”
    stopPolling();
    state.activeChannelId = null;
    state.channels = [];
    state.chatUsername = null;
    messagesEl.innerHTML = "";
    channelsEl.innerHTML = "";
  }
}

// ----------------------------
// Rendering
// ----------------------------
function renderMessages(messages) {
  const wasEmpty = messagesEl.childElementCount === 0;
  const shouldStick = wasEmpty || isAtBottom(messagesEl);

  messagesEl.innerHTML = "";
  for (const m of messages) {
    const mine = state.chatUsername && m.username === state.chatUsername;
    const div = document.createElement("div");
    div.className = "msgRow" + (mine ? " me" : "");

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (mine ? " me" : "");

    const when = m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    bubble.innerHTML = `
      <div class="metaLine">
        <span class="metaUser">${escapeHtml(m.username ?? "")}</span>
        <span class="metaTime">${escapeHtml(when)}</span>
      </div>
      <div class="msgText">${escapeHtml(m.body ?? "")}</div>
    `;

    div.appendChild(bubble);
    messagesEl.appendChild(div);
  }

  if (shouldStick) scrollToBottom(messagesEl);
}

function renderChannels(list) {
  channelsEl.innerHTML = "";

  const q = (channelSearchEl.value || "").trim().toLowerCase();
  const filtered = q
    ? list.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      )
    : list;

  // If the server returned no channels (for example because the SQL template
  // was changed to return none), show a friendly empty state rather than an
  // empty sidebar.
  if (!filtered || filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mutedSmall';
    empty.style.padding = '12px';
    empty.textContent = 'No channels available.';
    channelsEl.appendChild(empty);
    return;
  }

  for (const ch of filtered) {
    const item = document.createElement("div");
    item.className = "channelItem";

    const left = document.createElement("div");
    left.className = "channelLeft";

    const name = document.createElement("div");
    name.className = "channelName";
    name.textContent = `# ${ch.name}`;
    name.title = ch.description || "";

    const desc = document.createElement("div");
    desc.className = "channelDesc";
    desc.textContent = ch.description || "";

    left.appendChild(name);
    left.appendChild(desc);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "10px";

    const lastSeen = state.lastSeenByChannel[String(ch.id)];
    const hasUnread = lastSeen && ch.latest_created_at && new Date(ch.latest_created_at) > new Date(lastSeen);
    const badge = document.createElement("div");
    badge.className = "channelBadge " + (hasUnread ? "on" : "off");
    badge.title = hasUnread ? "New messages" : "";

    const btn = document.createElement("button");
    btn.className = "btn " + (ch.is_member ? "btn-ghost" : "btn-primary");
    btn.style.padding = "8px 10px";
    btn.textContent = ch.is_member ? "Leave" : "Join";

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        btn.disabled = true;
        if (ch.is_member) {
          await api("/api/channels/leave", "POST", { channel_id: ch.id });
          toast(`Left #${ch.name}`);
          if (state.activeChannelId === ch.id) setActiveChannel(null);
        } else {
          await api("/api/channels/join", "POST", { channel_id: ch.id });
          toast(`Joined #${ch.name}`);
        }
        await loadChannels();
      } catch (err) {
        setMsg(channelMsg, err.message, false);
      } finally {
        btn.disabled = false;
      }
    });

    item.addEventListener("click", async () => {
      if (!ch.is_member) {
        setMsg(channelMsg, "Join the channel to view messages.", false);
        toast("Join the channel to view messages");
        return;
      }
      setMsg(channelMsg, "", true);
      setMsg(postMsg, "", true);

      setActiveChannel(ch);

      state.lastSeenByChannel[String(ch.id)] = new Date().toISOString();
      saveLocal("lastSeenByChannel", state.lastSeenByChannel);

      await loadMessages(ch.id);
      startPolling();
      sidebar.classList.remove("open");
    });

    right.appendChild(badge);
    right.appendChild(btn);

    item.appendChild(left);
    item.appendChild(right);

    if (state.activeChannelId === ch.id) {
      item.style.background = "var(--panel2)";
      item.style.borderColor = "var(--border)";
    }

    channelsEl.appendChild(item);
  }
}

// ----------------------------
// Data Loading
// ----------------------------
async function loadChannels() {
  const data = await api("/api/channels");
  state.channels = (data.channels || []).map(c => ({
    ...c,
    latest_created_at: c.latest_created_at || null
  }));
  renderChannels(state.channels);

  if (!state.activeChannelId) {
    const firstJoined = state.channels.find(c => c.is_member);
    if (firstJoined) {
      setActiveChannel(firstJoined);
      await loadMessages(firstJoined.id);
      startPolling();
    }
  }
}

async function loadMessages(channelId, { silent = false } = {}) {
  try {
    if (!silent) {
      messagesEl.innerHTML = `<div class="mutedSmall">Loading…</div>`;
    }
    const data = await api(`/api/messages?channel_id=${encodeURIComponent(channelId)}`);
    renderMessages(toChronological(data.messages || []));

    state.lastSeenByChannel[String(channelId)] = new Date().toISOString();
    saveLocal("lastSeenByChannel", state.lastSeenByChannel);

    renderChannels(state.channels);
  } catch (e) {
    setMsg(postMsg, e.message, false);
    stopPolling();
  }
}

// ----------------------------
// Events: Sidebar (mobile)
// ----------------------------
sidebarOpen?.addEventListener("click", () => sidebar.classList.add("open"));
sidebarClose?.addEventListener("click", () => sidebar.classList.remove("open"));

// ----------------------------
// Events: DB / Group login
// ----------------------------
loginBtn.addEventListener("click", async () => {
  setMsg(loginMsg, "");
  loginBtn.disabled = true;
  try {
    await api("/api/login", "POST", {
      username: usernameEl.value.trim(),
      password: passwordEl.value
    });
    setMsg(loginMsg, "Connected to your group schema.", true);

    state.isDbConnected = true;
    renderGate();

    // Default to Chat tab after schema connect
    await setTab("chat");

    showUserAuth();
    toast("Connected");
  } catch (e) {
    setMsg(loginMsg, e.message, false);
    state.isDbConnected = false;
    renderGate();
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  // Sign out chat user only (keep DB session)
  try { await api("/api/user/logout", "POST"); } catch {}

  stopPolling();

  state.chatUsername = null;
  state.activeChannelId = null;
  state.channels = [];

  setActiveChannel(null);
  showUserAuth();
  channelsEl.innerHTML = "";
  setMsg(channelMsg, "Signed out. Log in to load channels.", true);
  setMsg(postMsg, "", true);

  // Keep DB connection indicator ON
  setConnectedPill(true);

  // ensure we're not stuck in SQL tab after user logout
  setTab("chat");

  toast("Signed out");
});

// ----------------------------
// Events: Chat user auth
// ----------------------------
registerBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  registerBtn.disabled = true;
  userLoginBtn.disabled = true;

  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) {
    setMsg(userAuthMsg, "Username and password are required.", false);
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    return;
  }

  try {
    const hash = await sha512Hex(p);
    await api("/api/user/register", "POST", { username: u, password_hash: hash });
    setMsg(userAuthMsg, "Registered. Logging you in…", true);
    await api("/api/user/login", "POST", { username: u, password_hash: hash });

    state.chatUsername = u;
    showMainUI(u);
    await loadChannels();
    toast(`Welcome @${u}`);
  } catch (e) {
    setMsg(userAuthMsg, e.message, false);
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
  }
});

userLoginBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  registerBtn.disabled = true;
  userLoginBtn.disabled = true;

  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) {
    setMsg(userAuthMsg, "Username and password are required.", false);
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    return;
  }

  try {
    const hash = await sha512Hex(p);
    await api("/api/user/login", "POST", { username: u, password_hash: hash });

    state.chatUsername = u;
    showMainUI(u);
    await loadChannels();
    toast(`Hello @${u}`);
  } catch (e) {
    const m = String(e.message || "");
    if (m.toLowerCase().includes("invalid username") || m.toLowerCase().includes("does not exist")) {
      setMsg(userAuthMsg, "Invalid username or password.", false);
    } else {
      setMsg(userAuthMsg, m, false);
    }
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
  }
});

// ----------------------------
// Events: Channel search
// ----------------------------
channelSearchEl.addEventListener("input", () => renderChannels(state.channels));

// ----------------------------
// Events: Composer
// ----------------------------
composerInput.addEventListener("input", () => autosizeTextarea(composerInput));

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener("click", async () => {
  setMsg(postMsg, "");
  const body = composerInput.value.trim();

  if (!state.activeChannelId) return setMsg(postMsg, "Select a channel first.", false);
  if (!body) return setMsg(postMsg, "Message body is required.", false);

  sendBtn.disabled = true;

  const optimistic = {
    username: state.chatUsername,
    body,
    created_at: new Date().toISOString()
  };

  const stick = isAtBottom(messagesEl);
  const currentMessages = Array.from(messagesEl.querySelectorAll(".msgRow")).length;

  try {
    if (currentMessages === 0) {
      renderMessages([optimistic]);
    } else {
      const row = document.createElement("div");
      row.className = "msgRow me";
      const bubble = document.createElement("div");
      bubble.className = "bubble me";
      bubble.innerHTML = `
        <div class="metaLine">
          <span class="metaUser">${escapeHtml(optimistic.username)}</span>
          <span class="metaTime">${escapeHtml(formatTime(optimistic.created_at))}</span>
        </div>
        <div class="msgText">${escapeHtml(optimistic.body)}</div>
      `;
      row.appendChild(bubble);
      messagesEl.appendChild(row);
      if (stick) scrollToBottom(messagesEl);
    }

    await api("/api/message", "POST", { channel_id: state.activeChannelId, body });
    composerInput.value = "";
    autosizeTextarea(composerInput);
    setMsg(postMsg, "Sent", true);

    await loadMessages(state.activeChannelId, { silent: true });
  } catch (e) {
    setMsg(postMsg, e.message, false);
    toast("Send failed");
  } finally {
    sendBtn.disabled = false;
  }
});

// ----------------------------
// Init
// ----------------------------
state.isDbConnected = false;
renderGate();
autosizeTextarea(composerInput);

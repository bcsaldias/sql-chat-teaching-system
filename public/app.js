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
const chatUI = document.getElementById("chatUI");
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

// Member modal elements (present in index.html)
const memberModal = document.getElementById("memberModal");
const memberModalOverlay = document.getElementById("memberModalOverlay");
const memberModalList = document.getElementById("memberModalList");
const memberModalTitle = document.getElementById("memberModalTitle");
const memberModalClose = document.getElementById("memberModalClose");

const toastEl = document.getElementById("toast");

const createChannelBtn = document.getElementById("createChannelBtn");
const newChannelName = document.getElementById("newChannelName");
const newChannelDescription = document.getElementById("newChannelDescription");
const createChannelPostBtn = document.getElementById("postNewChannelBtn");


// New channel modal elements (present in index.html)
const newChannelModal = document.getElementById("newChannelModal");
const newChannelModalOverlay = document.getElementById("newChannelModalOverlay");
const newChannelModalList = document.getElementById("newChannelModalList");
const newChannelModalTitle = document.getElementById("newChannelModalTitle");
const newChannelModalClose = document.getElementById("newChannelModalClose");


// ----------------------------
// SQL Lab (UI created dynamically)
// ----------------------------
let tabChatBtn = null;
let tabSqlBtn = null;
let sqlPanel = null;
let sqlLabList = null;
let sqlSaveBtn = null;
let sqlResetBtn = null;
let testSchemaBtn = null;
let sqlLabMsg = null;
let schemabMsg = null;
// keep the last templates we loaded from the server so we can avoid
// saving / reloading when nothing changed (prevents unnecessary re-runs)
let _lastSqlTemplates = null;

var SQL_LAB_ITEMS = [
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
    key: "user_login",
    status: null,
    title: "1) Log in button",
    description: "When a user clicks 'Log in' you need to retrieve that user's stored password from your database for the app to verify credentials. Use $1 = username.",
    required: "SELECT password FROM users WHERE username = $1;"
  },
  {
    key: "user_register",
    status: null,
    title: "2) Sign up button",
    description: "When a user clicks 'Register' you receive two parameters, $1 = username and $2 = password. Write an SQL query to INSERT a new user into the users table so the app can create an account a student can later log into.",
    required: "INSERT INTO users(username, password) VALUES ($1, $2);"
  },
  {
    key: "channels_list",
    status: null,
    title: "3) Display channels + membership",
    description: "Return the list of channels with membership info and a user count so the UI can show Join/Leave and how many users are in each channel. Parameter: $1 = username. Returns id, name, description, is_member (boolean), user_count (integer).",
    textAreaHeight: "280px",
    required:
`SELECT
  c.id,
  c.name,
  c.description,
  (cm.username IS NOT NULL) AS is_member,
  (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) AS user_count
FROM channels c
LEFT JOIN channel_members cm
  ON cm.channel_id = c.id
 AND cm.username = $1
ORDER BY c.name;`
  },
  {
    key: "channel_join",
    status: null,
    title: "4) Join channel",
    description: "Add the user to a channel by inserting a membership row. Parameters: $1 = username, $2 = channel_id. Use ON CONFLICT DO NOTHING to avoid duplicates.",
    required: "INSERT INTO channel_members(username, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;"
  },
  {
    key: "channel_leave",
    status: null,
    title: "5) Leave channel",
    description: "Remove the user's membership so they leave the channel. Parameters: $1 = username, $2 = channel_id.",
    required: "DELETE FROM channel_members WHERE username = $1 AND channel_id = $2;"
  },
  {
    key: "member_check",
    status: null,
    title: "6) Check membership before loading messages",
    description: "Returns true row when the user is a member of the channel so the app can allow viewing. Parameters: $1 = username, $2 = channel_id.",
    required: "SELECT true FROM channel_members WHERE username = $1 AND channel_id = $2;"
  },
  {
    key: "messages_list",
    status: null,
    title: "7) Display messages for a channel",
    description: "Return recent messages for a channel so the UI can display the chat. Parameter: $1 = channel_id. Return username, body, created_at (newest at the bottom). Limit to ~50 rows.",
    textAreaHeight: "120px",
    required:
`SELECT username, body, created_at
FROM chat_inbox
WHERE channel_id = $1
ORDER BY created_at DESC
LIMIT 50;`
//     required:
// `SELECT username, body, created_at
// FROM chat_recent_messages
// WHERE channel_id = $1
// ORDER BY created_at DESC
// LIMIT 50;`
  },
  {
    key: "message_post",
    status: null,
    title: "8) Send button: Post message",
    description: "Post a new message using the server function. Parameters: $1 = channel_id, $2 = username, $3 = body. Return the inserted message id.",
    // required: "SELECT chat_post_message($1, $2, $3) AS message_id;"
    required: "INSERT INTO chat_inbox(username, channel_id, body) VALUES ($1, $2, $3);"
  }
  ,
  {
    key: "channel_members_list",
    status: null,
    title: "9) Channel members list",
    description: "Return the list of member usernames for a channel (used by the members modal). Parameter: $1 = channel_id. Return a single column containing the username (ordered).",
    required: "SELECT username FROM channel_members WHERE channel_id = $1 ORDER BY username;"
  }
  ,
  {
    key: "channel_create",
    status: null,
    title: "10) Create channel",
    description: "Create a new channel. Parameters: $1 = name, $2 = description. Example: $1 = 'Sports', $2 = 'Discuss sports'. Return the new channel id.",
    required: "INSERT INTO channels(name, description) VALUES ($1, $2);"
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
  tabSqlBtn.addEventListener("click", () => setTab("sql"));

  // SQL panel
  sqlPanel = document.createElement("div");
  sqlPanel.id = "sqlLabPanel";
  sqlPanel.className = "hidden";

  const card = document.createElement("div");
  card.className = "card";

  const h2 = document.createElement("div");
  h2.className = "sqlPanelTitle";
  h2.textContent = "SQL Lab";

  const p = document.createElement("div");
  p.className = "description";
  p.innerHTML = `
  <h3>Welcome to SQL Lab!</h3>
  If you are here, it means your group database connection is active!
  <ul>
    <li>This app is only missing a few SQL queries to be fully functional.</li>
    <li><b>You will implement those missing SQL queries</b>, which the app will use to perform key actions like user login, channel listing, message retrieval, etc.</li>
    <li>Be sure to follow the exact requirements for each query, including returning the correct columns and data types as specified.</li>
    <li>Before you try your SQL queries here, make sure to test them in your group database (with test values) using pgAdmin with sample values.</li>
    <li>Once you are confident your SQL queries are correct, paste them into the corresponding textareas below and try out your app! You'll receive the user input or parameters for your SQL queries as $1, $2, etc. (e.g., $1 = 3, $2 = 'username_value').</li>
    <li>Queries are automatically saved when you switch back to the Chat tab.</li>
    <li>If any of the funcitonalities do not work as expected, check your database model in pgAdmin or adjust your SQL queries.</li>
  </ul>
  Good luck, and SQL querying! <br><br>`;

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
  // spacing for the reset button is handled in CSS

  testSchemaBtn = document.createElement("button");
  testSchemaBtn.id = "testSchemaBtn";
  testSchemaBtn.className = "btn btn-ghost";
  testSchemaBtn.type = "button";
  testSchemaBtn.textContent = "Test Schema";

  sqlLabMsg = document.createElement("span");
  sqlLabMsg.id = "sqlLabMsg";
  sqlLabMsg.className = "msg";

  schemabMsg = document.createElement("span");
  schemabMsg.id = "schemabMsg";
  schemabMsg.className = "msg";


  // row.appendChild(sqlSaveBtn);
  row.appendChild(sqlResetBtn);
  row.appendChild(sqlLabMsg);

  card.appendChild(h2);
  card.appendChild(p);

  const topRow = document.createElement("div");
  topRow.appendChild(testSchemaBtn);
  topRow.appendChild(schemabMsg);
  card.appendChild(topRow);

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
        // Only save if templates actually changed since we last loaded them.
        // This avoids re-running the same SQL on the server when the user
        // simply switches back to Chat without editing anything.
        const prev = _lastSqlTemplates || {};
        const changed = JSON.stringify(templates) !== JSON.stringify(prev);
        if (changed) {
          await api("/api/sql_templates", "POST", { templates });
          await loadSqlTemplates();
          setMsg(sqlLabMsg, "Saved. The server will now use your SQL templates.", true);
        }
      }
    } catch (e) {
      // show the error but continue to chat
      setMsg(sqlLabMsg, e.message, false);
    } finally {
      // Always switch to the Chat tab, then force a channels refresh so the
      // `#channels` div reflects any server-side changes even if the user
      // clicks the Chat tab while already on Chat.
      try {
        await setTab("chat");
        if (state.chatUsername) {
          await loadChannels();
          if (state.activeChannelId) await loadMessages(state.activeChannelId, { silent: true });
        }
      } catch (err) {
        console.error('Error refreshing channels after switching to chat:', err);
      }
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

  testSchemaBtn.addEventListener("click", async () => {
    setMsg(schemabMsg, "");
    try {
      setMsg(schemabMsg, "All required tables and columns exist in your Schema.", true);
      await api("/api/test_schema", "GET");
    } catch (e) {
      setMsg(schemabMsg, e.message, false);
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
    chatUI.classList.add("hidden");

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
        if (state.activeChannelId) {
          await loadMessages(state.activeChannelId, { silent: true });
          // Update the last-seen timestamp for the active channel to reflect
          // that the user returned to the Chat tab now. This updates the
          // channels list UI with the new "returned at" time.
          state.lastSeenByChannel[String(state.activeChannelId)] = new Date().toISOString();
          saveLocal("lastSeenByChannel", state.lastSeenByChannel);
          renderChannels(state.channels);
        }
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
    outer.className = "sqlItem";

    const title = document.createElement("div");
    title.className = "sqlTitle";
    title.textContent = item.title;

    const queryStatus = document.createElement("span");
    queryStatus.className = "queryStatus";

    if (item.status) queryStatus.classList.add("is-pass");
    else if (item.status === false) queryStatus.classList.add("is-fail");

    // console.log("STATUS", item.status, item.title);
    queryStatus.dataset.tip = item.status ? "Query runs." :
      item.status === false ? "Query error." :
      "Not tested";

    const desc = document.createElement("div");
    desc.className = "sqlDesc";
    desc.textContent = item.description || "";

    const req = document.createElement("pre");
    req.className = "sqlRequired";
    req.textContent = item.required;

    const ta = document.createElement("textarea");
    ta.className = "sqlInput";
    ta.dataset.sqlkey = item.key;
    const s = String(templates[item.key] || "");
    ta.value =  s.endsWith(";") ? s : s + ";";
    // for a given text area color keywords, SELECT, INSERT, ...

    const headerRow = document.createElement("div");
    headerRow.className = "sqlItemHeader";
    headerRow.appendChild(title);
    headerRow.appendChild(queryStatus);
    outer.appendChild(headerRow);

    outer.appendChild(desc);
    if (item.required) outer.appendChild(req);
    if (item.textAreaHeight) ta.style.height = item.textAreaHeight;
    outer.appendChild(ta);

    // TODO ADD green if correct query

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
  // remember what we loaded so we can detect real edits later
  _lastSqlTemplates = data.templates || {};
  renderSqlLab(_lastSqlTemplates);
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

// cache recent messages per-channel so we can detect changes and only
// re-render the messages list when the server response actually differs.
state.messagesByChannel = {};

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
  return messages.reverse();
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
  // return expandTo128(input);

  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-512", enc.encode(input));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
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
  chatUI.classList.add("hidden");
  mainChatUI.classList.add("hidden");
  userPill.classList.add("pill-muted");
  userPill.textContent = "Not logged in";
  userLabel.textContent = "Not signed in";
  userAvatar.textContent = "?";
}

function showMainUI(username) {
  userAuthPanel.classList.add("hidden");
  chatUI.classList.remove("hidden");
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
    // Clear messages and hide the chat body so stale messages don't remain
    messagesEl.innerHTML = "";
    mainChatUI.classList.add("hidden");
    stopPolling();
    return;
  }
  state.activeChannelId = channel.id;
  activeChannelLabel.textContent = `# ${channel.name}`;
  // Show description and, if provided by the backend, a clickable member count
  activeChannelSub.textContent = "";
  const desc = channel.description || "";
  const descSpan = document.createElement("span");
  descSpan.textContent = desc;
  activeChannelSub.appendChild(descSpan);

  const count = (typeof channel.user_count !== 'undefined' && channel.user_count !== null)
    ? Number(channel.user_count)
    : null;
  if (count !== null) {
    const btn = document.createElement("button");
    btn.className = "memberCount";
    btn.type = "button";
    btn.title = `Show members (${count})`;
    btn.textContent = `${count} ${count === 1 ? 'member' : 'members'}`;
    btn.style.marginLeft = "10px";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      // open modal and load members
      await loadChannelMembers(channel.id, channel.name);
    });
    activeChannelSub.appendChild(btn);
  }
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
    logoutBtn.click(); // TBD revise
  }
}

// ----------------------------
// Rendering
// ----------------------------
function renderMessages(messages) {
  // Make sure the chat body is visible when rendering messages
  mainChatUI.classList.remove("hidden");
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

function flagQueryStatus(query, status){
  for (var item of SQL_LAB_ITEMS) {
    if (item.key == query){
      item.status = status
    }
  }
  // console.log(query, status);
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
    // No channels are visible in the sidebar (could be server returned
    // none, or the current search filtered them out). Ensure the main
    // chat area is cleared so stale messages aren't shown.
    setActiveChannel(null); // clears messages and stops polling
    const empty = document.createElement('div');
    empty.className = 'mutedSmall channelEmpty';
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
    right.className = "channelRight";

    const lastSeen = state.lastSeenByChannel[String(ch.id)];
    const hasUnread = lastSeen && ch.latest_created_at && new Date(ch.latest_created_at) > new Date(lastSeen);
    const badge = document.createElement("div");
    badge.className = "channelBadge " + (hasUnread ? "on" : "off");
    badge.title = hasUnread ? "New messages" : "";

    const btn = document.createElement("button");
    btn.className = "btn " + (ch.is_member ? "btn-ghost" : "btn-primary");
    btn.classList.add("channelActionBtn");
    btn.textContent = ch.is_member ? "Leave" : "Join";

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        btn.disabled = true;
        if (ch.is_member) {
          await api("/api/channels/leave", "POST", { channel_id: ch.id }); // KEY: "channel_leave"
          toast(`Left #${ch.name}`);
          flagQueryStatus("channel_leave", true);
          if (state.activeChannelId === ch.id) setActiveChannel(null);
        } else {
          await api("/api/channels/join", "POST", { channel_id: ch.id }); // KEY: "channel_join"
          flagQueryStatus("channel_join", true);
          toast(`Joined #${ch.name}`);
        }
        await loadChannels();
      } catch (err) {
        setMsg(channelMsg, err.message, false);
        if (ch.is_member){
          flagQueryStatus("channel_leave", false);
        } else {
          flagQueryStatus("channel_join", false);
        }
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
      renderChannels(state.channels);

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
      item.classList.add("active");
    }

    channelsEl.appendChild(item);
  }
}

// ----------------------------
// Data Loading
// ----------------------------
async function loadChannels() {
  setMsg(channelMsg, "");
  try {
    const data = await api("/api/channels"); // KEY: channels_list
    // Debug: log the raw response so we can confirm the server returned the
    // updated channels after you changed the query.
    console.debug("loadChannels: server response:", data);
    state.channels = (data.channels || []).map(c => ({
      ...c,
      latest_created_at: c.latest_created_at || null
    }));
    renderChannels(state.channels);
    flagQueryStatus("channels_list", true);
  } catch (e) {
    // On error, clear any previously rendered channels so the sidebar
    // doesn't show stale data from a prior successful load.
    state.channels = [];
    channelsEl.innerHTML = "";
    // Hide the chat body when channels cannot be loaded so previous
    // messages don't remain visible.
    mainChatUI.classList.add("hidden");
    setMsg(channelMsg, e.message || String(e), false);
    // Stop polling since we don't have a valid channel context
    stopPolling();
    flagQueryStatus("channels_list", false);
    throw e; // rethrow so callers can handle additional UI changes if needed
  }

  // Ensure we have an active channel when possible. If the server now
  // reports that the user is a member of one or more channels, pick the
  // first joined channel and load its messages. This covers the case where
  // the channels SQL was changed and previously the UI had no joined
  // channels (so no activeChannelId); when the student fixes the SQL and
  // returns to Chat we must show messages.
  const firstJoined = state.channels.find(c => c.is_member);
  if (firstJoined) {
    if (state.activeChannelId !== firstJoined.id) {
      setActiveChannel(firstJoined);
      await loadMessages(firstJoined.id);
    }
    startPolling();
  } else {
    // If there are no joined channels, clear any previously active channel
    // so the main chat UI doesn't show stale content.
    if (state.activeChannelId) setActiveChannel(null);
  }
}

async function loadMessages(channelId, { silent = false } = {}) {
  try {
    if (!silent) {
      messagesEl.innerHTML = `<div class="mutedSmall">Loading…</div>`;
    }
    const data = await api(`/api/messages?channel_id=${encodeURIComponent(channelId)}`); // KEY: member_check, messages_list
    const messages = toChronological(data.messages || []);

    // Serialize to a compact string to detect changes. Avoids re-rendering
    // identical message lists and ensures the UI updates when the server
    // returns a different set.
    const key = String(channelId);
    const serialized = JSON.stringify(messages);
    const prev = state.messagesByChannel[key];
    if (serialized !== prev) {
      // only re-render when messages changed
      renderMessages(messages);
      state.messagesByChannel[key] = serialized;

      state.lastSeenByChannel[key] = new Date().toISOString();
      saveLocal("lastSeenByChannel", state.lastSeenByChannel);

      renderChannels(state.channels);
    } else {
      // If the server returned the same set as before but this load was
      // explicit (non-silent), re-render the cached messages so the UI is
      // visible (for example when the user clicks a channel). This avoids
      // leaving the "Loading…" placeholder visible when nothing changed.
      if (!silent && prev) {
        try {
          const cached = JSON.parse(prev);
          renderMessages(cached);
        } catch (err) {
          // fallback: no-op
        }
      }
    }

    flagQueryStatus("member_check", true);
    flagQueryStatus("messages_list", true);

  } catch (e) {
    // Clear messages UI on error so stale messages from a previous
    // successful load aren't shown when the request fails.
    messagesEl.innerHTML = "";
    // Also hide the chat body so no stale UI remains visible
    mainChatUI.classList.add("hidden");
    setMsg(postMsg, e.message || String(e), false);
    flagQueryStatus("member_check", false);
    flagQueryStatus("messages_list", false);
    stopPolling();
  }
}

// Modal helpers: load and display channel members
async function loadChannelMembers(channelId, channelName) {
  if (!memberModal || !memberModalList) return;
  memberModalList.innerHTML = `<div class="mutedSmall">Loading…</div>`;
  memberModalTitle.textContent = `Members • # ${channelName}`;
  memberModal.classList.remove("hidden");

  try {
    const data = await api(`/api/channels/members?channel_id=${encodeURIComponent(channelId)}`); // KEY: channel_members_list
    const members = data.members || [];
    if (!members || members.length === 0) {
      memberModalList.innerHTML = `<div class="mutedSmall">No members found.</div>`;
      return;
    }
    memberModalList.innerHTML = "";
    for (const m of members) {
      const item = document.createElement("div");
      item.className = "memberItem";
      item.textContent = m;
      memberModalList.appendChild(item);
    }
    flagQueryStatus("channel_members_list", true);
  } catch (err) {
    memberModalList.innerHTML = "";
    setMsg(channelMsg, err.message || String(err), false);
    flagQueryStatus("channel_members_list", false);
  }
}

function hideMemberModal() {
  if (!memberModal) return;
  memberModal.classList.add("hidden");
}

// hook up modal close events
memberModalClose?.addEventListener("click", hideMemberModal);
memberModalOverlay?.addEventListener("click", hideMemberModal);

// Modal helpers: allow to create new channels
async function createNewChannelModal() {
  if (!newChannelModal) return;
  newChannelModalTitle.textContent = `Creating new channel`;
  newChannelModal.classList.remove("hidden");

  try {

  } catch (err) {
    newChannelModalList.innerHTML = "";
    setMsg(channelMsg, err.message || String(err), false);
  }
}

function hidechannelModal() {
  if (!newChannelModal) return;
  newChannelModal.classList.add("hidden");
}

// hook up modal close events
newChannelModalClose?.addEventListener("click", hidechannelModal);
newChannelModalOverlay?.addEventListener("click", hidechannelModal);


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
    // DO I NEED THIS?
    // await setTab("chat");
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

async function tryDBCredentials() {
  setMsg(loginMsg, "");
  loginBtn.disabled = true;
  try {
    await api("/api/credentials_login", "POST");
    setMsg(loginMsg, "Connected to your group schema.", true);
    state.isDbConnected = true;
    renderGate();
    showUserAuth();
    toast("Connected");
  } catch (e) {
    setMsg(loginMsg, e.message, false);
    state.isDbConnected = false;
    renderGate();
  } finally {
    loginBtn.disabled = false;
  }
}


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
    await api("/api/user/register", "POST", { username: u, password_hash: hash }); // KEY: user_register
    flagQueryStatus("user_register", true);
    setMsg(userAuthMsg, "Registered. Logging you in…", true);
    await api("/api/user/login", "POST", { username: u, password_hash: hash }); // KEY: user_login
    flagQueryStatus("user_login", true);

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
    await api("/api/user/login", "POST", { username: u, password_hash: hash }); // KEY: user_login
    flagQueryStatus("user_login", true);

    state.chatUsername = u;
    showMainUI(u);
  } catch (e) {
    const m = String(e.message || "");
    if (m.toLowerCase().includes("invalid username") || m.toLowerCase().includes("does not exist")) {
      setMsg(userAuthMsg, "Invalid username or password.", false);
    } else {
      setMsg(userAuthMsg, m, false);
    }
    flagQueryStatus("user_login", false);
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    await loadChannels(); // channels_list
  }
});

// ----------------------------
// Events: Create Channel
// ----------------------------
createChannelBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  if (state.chatUsername) await createNewChannelModal();
});


postNewChannelBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  registerBtn.disabled = true;

  const n = newChannelName.value.trim();
  const d = newChannelDescription.value.trim();

  if (!n || !d) {
    setMsg(userAuthMsg, "Channel name and description are required.", false);
    return;
  }

  try {
    console.log("Creating channel:", n, d);
    await api("/api/channels/create", "POST", { name: n, description: d }); // KEY: channel_create
    setMsg(userAuthMsg, `Channel #${n} created.`, true);
    hidechannelModal();
    await loadChannels();
    toast(`Channel #${n} created.`);
    flagQueryStatus("channel_create", true);
  } catch (e) {
    setMsg(userAuthMsg, e.message, false);
    flagQueryStatus("channel_create", false);
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

    await api("/api/message", "POST", { channel_id: state.activeChannelId, body }); // KEY: message_post
    composerInput.value = "";
    autosizeTextarea(composerInput);
    setMsg(postMsg, "Sent", true);
    flagQueryStatus("message_post", true);

    await loadMessages(state.activeChannelId, { silent: true });
  } catch (e) {
    setMsg(postMsg, e.message, false);
    toast("Send failed");
    flagQueryStatus("message_post", false);
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
tryDBCredentials();
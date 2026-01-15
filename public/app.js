const loginPanel = document.getElementById("loginPanel");
const chatPanel = document.getElementById("chatPanel");

const usernameEl = document.getElementById("username");   // group DB login username (grp10)
const passwordEl = document.getElementById("password");   // group DB login password
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const logoutBtn = document.getElementById("logoutBtn");

const userAuthPanel = document.getElementById("userAuthPanel");
const mainChatUI = document.getElementById("mainChatUI");
const chatUsernameEl = document.getElementById("chatUsername");
const chatPasswordEl = document.getElementById("chatPassword");
const registerBtn = document.getElementById("registerBtn");
const userLoginBtn = document.getElementById("userLoginBtn");
const userAuthMsg = document.getElementById("userAuthMsg");

const channelsEl = document.getElementById("channels");
const channelMsg = document.getElementById("channelMsg");
const activeChannelLabel = document.getElementById("activeChannelLabel");

const bodyEl = document.getElementById("body");
const sendBtn = document.getElementById("sendBtn");
const postMsg = document.getElementById("postMsg");
const messagesEl = document.getElementById("messages");

let pollTimer = null;
let activeChannelId = null;

function setMsg(el, text, ok = false) {
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
  if (!text) el.className = "msg";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --- SHA-512 hash (128 hex chars) using Web Crypto API ---
async function sha512Hex(input) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-512", enc.encode(input));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
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
}

function showMainUI() {
  userAuthPanel.classList.add("hidden");
  mainChatUI.classList.remove("hidden");
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, 2500);
}

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = "message";
    const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
    div.innerHTML = `
      <div class="meta">
        <span class="name">${escapeHtml(m.username ?? "")}</span>
        <span class="time">${escapeHtml(when)}</span>
      </div>
      <div class="body">${escapeHtml(m.body ?? "")}</div>
    `;
    messagesEl.appendChild(div);
  }
}

async function loadMessages(channelId) {
  try {
    const data = await api(`/api/messages?channel_id=${encodeURIComponent(channelId)}`);
    renderMessages(data.messages || []);
  } catch (e) {
    setMsg(postMsg, e.message, false);
    stopPolling();
  }
}

function renderChannels(channels) {
  channelsEl.innerHTML = "";
  for (const ch of channels) {
    const row = document.createElement("div");
    row.className = "channelRow";

    const name = document.createElement("div");
    name.className = "channelName";
    name.textContent = `# ${ch.name}`;
    name.title = ch.description || "";
    name.addEventListener("click", async () => {
      if (!ch.is_member) {
        setMsg(channelMsg, "Join the channel to view messages.", false);
        return;
      }
      activeChannelId = ch.id;
      activeChannelLabel.textContent = `# ${ch.name}`;
      setMsg(channelMsg, "", true);
      await loadMessages(activeChannelId);
      startPolling();
    });

    const btn = document.createElement("button");
    btn.className = ch.is_member ? "secondary" : "";
    btn.textContent = ch.is_member ? "Leave" : "Join";
    btn.addEventListener("click", async () => {
      try {
        if (ch.is_member) {
          await api("/api/channels/leave", "POST", { channel_id: ch.id });
          if (activeChannelId === ch.id) {
            activeChannelId = null;
            activeChannelLabel.textContent = "None selected";
            messagesEl.innerHTML = "";
            stopPolling();
          }
        } else {
          await api("/api/channels/join", "POST", { channel_id: ch.id });
        }
        await loadChannels();
      } catch (e) {
        setMsg(channelMsg, e.message, false);
      }
    });

    row.appendChild(name);
    row.appendChild(btn);
    channelsEl.appendChild(row);
  }
}

async function loadChannels() {
  const data = await api("/api/channels");
  renderChannels(data.channels || []);
}

// --------------------
// DB / Group login
// --------------------
loginBtn.addEventListener("click", async () => {
  setMsg(loginMsg, "");
  try {
    await api("/api/login", "POST", {
      username: usernameEl.value.trim(),
      password: passwordEl.value
    });
    setMsg(loginMsg, "Connected to group schema.", true);
    showChat();
    showUserAuth();
  } catch (e) {
    setMsg(loginMsg, e.message, false);
  }
});

logoutBtn.addEventListener("click", async () => {
  try { await api("/api/logout", "POST"); } catch {}
  stopPolling();
  activeChannelId = null;
  activeChannelLabel.textContent = "None selected";
  messagesEl.innerHTML = "";
  showLogin();
});

// --------------------
// Chat user auth
// --------------------
registerBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) return setMsg(userAuthMsg, "Username and password are required.", false);

  try {
    const hash = await sha512Hex(p); // 128 hex chars
    await api("/api/user/register", "POST", { username: u, password_hash: hash });
    setMsg(userAuthMsg, "Registered. Now logging you in…", true);
    await api("/api/user/login", "POST", { username: u, password_hash: hash });
    showMainUI();
    await loadChannels();
  } catch (e) {
    setMsg(userAuthMsg, e.message, false);
  }
});

userLoginBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) return setMsg(userAuthMsg, "Username and password are required.", false);

  try {
    const hash = await sha512Hex(p);
    await api("/api/user/login", "POST", { username: u, password_hash: hash });
    setMsg(userAuthMsg, "Logged in.", true);
    showMainUI();
    await loadChannels();
  } catch (e) {
    setMsg(userAuthMsg, e.message, false);
  }
});

// --------------------
// Posting messages
// --------------------
sendBtn.addEventListener("click", async () => {
  setMsg(postMsg, "");
  const body = bodyEl.value.trim();
  if (!activeChannelId) return setMsg(postMsg, "Select a channel first.", false);
  if (!body) return setMsg(postMsg, "Message body is required.", false);

  try {
    await api("/api/message", "POST", { channel_id: activeChannelId, body });
    bodyEl.value = "";
    setMsg(postMsg, "Sent.", true);
    await loadMessages(activeChannelId);
  } catch (e) {
    setMsg(postMsg, e.message, false);
  }
});

bodyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

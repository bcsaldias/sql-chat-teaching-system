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
const sidebarOpen = document.getElementById("sidebarOpen");
const sidebarClose = document.getElementById("sidebarClose");

const toastEl = document.getElementById("toast");

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

function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
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
  // short-ish time; you can change to toLocaleString() if you want full
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
// Rendering
// ----------------------------
function renderMessages(messages) {
  const shouldStick = isAtBottom(messagesEl);

  messagesEl.innerHTML = "";
  for (const m of messages) {
    const mine = state.chatUsername && m.username === state.chatUsername;
    const row = document.createElement("div");
    row.className = "msgRow" + (mine ? " me" : "");

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (mine ? " me" : "");

    bubble.innerHTML = `
      <div class="metaLine">
        <span class="metaUser">${escapeHtml(m.username)}</span>
        <span class="metaTime">${escapeHtml(formatTime(m.created_at))}</span>
      </div>
      <div class="msgText">${escapeHtml(m.body)}</div>
    `;

    row.appendChild(bubble);
    messagesEl.appendChild(row);
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

    // unread dot (client-only)
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

    // click channel name to open (only if member)
    item.addEventListener("click", async () => {
      if (!ch.is_member) {
        setMsg(channelMsg, "Join the channel to view messages.", false);
        toast("Join the channel to view messages");
        return;
      }
      setMsg(channelMsg, "", true);
      setMsg(postMsg, "", true);

      setActiveChannel(ch);

      // mark last seen right away (so badge goes away after open)
      state.lastSeenByChannel[String(ch.id)] = new Date().toISOString();
      saveLocal("lastSeenByChannel", state.lastSeenByChannel);

      await loadMessages(ch.id);
      startPolling();

      // close sidebar on mobile
      sidebar.classList.remove("open");
    });

    right.appendChild(badge);
    right.appendChild(btn);

    item.appendChild(left);
    item.appendChild(right);

    // subtle active highlight
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
  // optional: if your backend can include latest message time per channel, use it:
  // (if not present, we just won't show unread dots)
  state.channels = (data.channels || []).map(c => ({
    ...c,
    latest_created_at: c.latest_created_at || null
  }));
  renderChannels(state.channels);

  // auto-pick first joined channel if none selected
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
      // small loading placeholder
      messagesEl.innerHTML = `<div class="mutedSmall">Loading…</div>`;
    }
    const data = await api(`/api/messages?channel_id=${encodeURIComponent(channelId)}`);
    renderMessages(data.messages || []);

    // update last seen to now when we successfully render
    state.lastSeenByChannel[String(channelId)] = new Date().toISOString();
    saveLocal("lastSeenByChannel", state.lastSeenByChannel);

    // re-render channels to update unread dots
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
    setConnectedPill(true);
    showChat();
    showUserAuth();
    toast("Connected");
  } catch (e) {
    setMsg(loginMsg, e.message, false);
    setConnectedPill(false);
  } finally {
    loginBtn.disabled = false;
  }
});

// logoutBtn.addEventListener("click", async () => {
//   try { await api("/api/logout", "POST"); } catch {}
//   stopPolling();
//   state.activeChannelId = null;
//   state.channels = [];
//   state.chatUsername = null;
//   setConnectedPill(false);
//   showLogin();
//   toast("Disconnected");
// });

logoutBtn.addEventListener("click", async () => {
  // Sign out chat user only (keep DB session)
  try { await api("/api/user/logout", "POST"); } catch {}

  stopPolling();

  // Clear chat-user state
  state.chatUsername = null;
  state.activeChannelId = null;
  state.channels = [];

  // Reset UI identity + hide main chat area
  setActiveChannel(null);
  showUserAuth();            // shows the chat user login/register panel
  channelsEl.innerHTML = ""; // remove channel list until user logs in again
  setMsg(channelMsg, "Signed out. Log in to load channels.", true);
  setMsg(postMsg, "", true);

  // Keep DB connection indicator ON (do NOT call /api/logout)
  setConnectedPill(true);

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
    setMsg(userAuthMsg, e.message, false);
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

  // optimistic UI: append bubble immediately
  const optimistic = {
    username: state.chatUsername,
    body,
    created_at: new Date().toISOString()
  };

  // only auto-scroll if already at bottom
  const stick = isAtBottom(messagesEl);
  const currentMessages = Array.from(messagesEl.querySelectorAll(".msgRow")).length;

  try {
    // show optimistic without clearing all messages
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

    // refresh from server (authoritative)
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
setConnectedPill(false);
autosizeTextarea(composerInput);

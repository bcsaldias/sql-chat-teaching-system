const loginPanel = document.getElementById("loginPanel");
const chatPanel = document.getElementById("chatPanel");

const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const logoutBtn = document.getElementById("logoutBtn");
const displayNameEl = document.getElementById("displayName");
const bodyEl = document.getElementById("body");
const sendBtn = document.getElementById("sendBtn");
const postMsg = document.getElementById("postMsg");

const messagesEl = document.getElementById("messages");

let pollTimer = null;

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

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.detail || data.error || `Request failed (${r.status})`);
  }
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

function renderMessages(messages) {
  messagesEl.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = "message";
    const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
    div.innerHTML = `
      <div class="meta">
        <span class="name">${escapeHtml(m.display_name ?? "")}</span>
        <span class="time">${escapeHtml(when)}</span>
      </div>
      <div class="body">${escapeHtml(m.body ?? "")}</div>
    `;
    messagesEl.appendChild(div);
  }
}

async function loadMessages() {
  try {
    const data = await api("/api/messages");
    renderMessages(data.messages || []);
  } catch (e) {
    setMsg(postMsg, e.message, false);
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadMessages, 2500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

loginBtn.addEventListener("click", async () => {
  setMsg(loginMsg, "");
  try {
    await api("/api/login", "POST", {
      username: usernameEl.value.trim(),
      password: passwordEl.value
    });
    setMsg(loginMsg, "Logged in.", true);
    showChat();
    await loadMessages();
    startPolling();
  } catch (e) {
    setMsg(loginMsg, e.message, false);
  }
});

logoutBtn.addEventListener("click", async () => {
  try { await api("/api/logout", "POST"); } catch {}
  stopPolling();
  showLogin();
});

sendBtn.addEventListener("click", async () => {
  setMsg(postMsg, "");
  const display_name = displayNameEl.value.trim();
  const body = bodyEl.value.trim();
  try {
    await api("/api/message", "POST", { display_name, body });
    bodyEl.value = "";
    setMsg(postMsg, "Sent.", true);
    await loadMessages();
  } catch (e) {
    setMsg(postMsg, e.message, false);
  }
});

bodyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});


// Simple instructor dashboard for SQL Lab progress.
const el = (id) => document.getElementById(id);

const tokenInput = el("tokenInput");
const dbUserInput = el("dbUserInput");
const historyToggle = el("historyToggle");
const autoRefreshToggle = el("autoRefreshToggle");
const highlightToggle = el("highlightToggle");
const historyLimit = el("historyLimit");
const loadBtn = el("loadBtn");
const clearBtn = el("clearBtn");
const loadMsg = el("loadMsg");
const summaryText = el("summaryText");
const latestRows = el("latestRows");
const historyCard = el("historyCard");
const historySummary = el("historySummary");
const historyRows = el("historyRows");
const themeSelect = el("themeSelect");

const TOKEN_KEY = "info330_instructor_token";
const THEME_KEY = "info330_theme";
let autoTimer = null;
let filterTimer = null;
let latestCache = [];
let historyCache = [];

function setMsg(text, ok = false) {
  loadMsg.textContent = text || "";
  loadMsg.className = "msg " + (ok ? "ok" : "err");
  if (!text) loadMsg.className = "msg";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function buildProgressCell(passed, total) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const bar = `<div class="progressBar"><span style="width:${pct}%"></span></div>`;
  const label = `<div class="mutedSmall">${passed}/${total} (${pct}%)</div>`;
  return bar + label;
}

function renderLatest(list) {
  latestRows.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    latestRows.innerHTML = `<tr><td colspan="4" class="mutedSmall">No progress reported yet.</td></tr>`;
    return;
  }
  for (const entry of list) {
    const passed = Number(entry.passedCount || 0);
    const total = Number(entry.totalCount || 0);
    const tr = document.createElement("tr");
    if (highlightToggle?.checked && total > 0 && passed === 0) tr.classList.add("is-zero");
    if (highlightToggle?.checked && total > 0 && passed === total) tr.classList.add("is-full");
    tr.innerHTML = `
      <td><code>${escapeHtml(entry.dbUser || "—")}</code></td>
      <td>${escapeHtml(entry.chatUser || "—")}</td>
      <td>${buildProgressCell(passed, total)}</td>
      <td class="mutedSmall">${escapeHtml(formatTime(entry.at))}</td>
    `;
    latestRows.appendChild(tr);
  }
}

function renderHistory(list) {
  historyRows.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    historyRows.innerHTML = `<tr><td colspan="5" class="mutedSmall">No history available.</td></tr>`;
    return;
  }
  for (const entry of list) {
    const passed = Number(entry.passedCount || 0);
    const total = Number(entry.totalCount || 0);
    const keys = Array.isArray(entry.passedKeys) ? entry.passedKeys.join(", ") : "";
    const shortKeys = keys.length > 80 ? keys.slice(0, 77) + "..." : keys;
    const tr = document.createElement("tr");
    const keysCell = document.createElement("td");
    keysCell.textContent = shortKeys || "—";
    if (keys) keysCell.title = keys;
    tr.innerHTML = `
      <td class="mutedSmall">${escapeHtml(formatTime(entry.at))}</td>
      <td><code>${escapeHtml(entry.dbUser || "—")}</code></td>
      <td>${escapeHtml(entry.chatUser || "—")}</td>
      <td>${buildProgressCell(passed, total)}</td>
    `;
    tr.appendChild(keysCell);
    historyRows.appendChild(tr);
  }
}

function buildUrl() {
  const params = new URLSearchParams();
  if (historyToggle.checked) params.set("history", "1");
  const limit = Number(historyLimit.value || 0);
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(limit));
  const dbUser = dbUserInput.value.trim();
  if (dbUser) params.set("dbUser", dbUser);
  const qs = params.toString();
  return qs ? `/api/instructor/progress?${qs}` : "/api/instructor/progress";
}

async function loadProgress() {
  const token = tokenInput.value.trim();
  if (!token) {
    setMsg("Token required.", false);
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  setMsg("");
  loadBtn.disabled = true;
  try {
    const r = await fetch(buildUrl(), {
      headers: { "x-instructor-token": token }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.ok === false) {
      const msg = data?.error || data?.detail || `Request failed (${r.status})`;
      setMsg(msg, false);
      return;
    }
    const latest = data.latest || [];
    latestCache = latest;
    renderLatest(latest);
    summaryText.textContent = `${latest.length} group${latest.length === 1 ? "" : "s"} reporting • ${formatTime(new Date().toISOString())}`;

    if (historyToggle.checked) {
      historyCard.classList.remove("hidden");
      const history = Array.isArray(data.history) ? data.history.slice() : [];
      history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      historyCache = history;
      renderHistory(history);
      historySummary.textContent = `${history.length} recent entries`;
    } else {
      historyCache = [];
      historyCard.classList.add("hidden");
    }
    setMsg("Loaded.", true);
  } catch (err) {
    setMsg(err?.message || String(err), false);
  } finally {
    loadBtn.disabled = false;
  }
}

function updateAutoRefresh() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  if (autoRefreshToggle.checked) {
    autoTimer = setInterval(() => loadProgress(), 10000);
  }
}

loadBtn?.addEventListener("click", loadProgress);
clearBtn?.addEventListener("click", () => {
  tokenInput.value = "";
  sessionStorage.removeItem(TOKEN_KEY);
  setMsg("Token cleared.", true);
});
autoRefreshToggle?.addEventListener("change", updateAutoRefresh);
historyToggle?.addEventListener("change", () => {
  if (!historyToggle.checked) historyCard.classList.add("hidden");
});
highlightToggle?.addEventListener("change", () => {
  renderLatest(latestCache);
  if (historyToggle?.checked) renderHistory(historyCache);
});
tokenInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadProgress();
});
dbUserInput?.addEventListener("input", () => {
  if (!tokenInput.value.trim()) return;
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    filterTimer = null;
    loadProgress();
  }, 450);
});

// Restore token + theme
const savedToken = sessionStorage.getItem(TOKEN_KEY);
if (savedToken) tokenInput.value = savedToken;

function applyTheme(theme) {
  const next = theme || "classic-light";
  document.documentElement.setAttribute("data-theme", next);
  if (themeSelect) themeSelect.value = next;
}

const savedTheme = sessionStorage.getItem(THEME_KEY);
applyTheme(savedTheme || "classic-light");
if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    const next = themeSelect.value;
    applyTheme(next);
    sessionStorage.setItem(THEME_KEY, next);
  });
}

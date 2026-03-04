// Simple instructor dashboard for SQL Lab progress.
const el = (id) => document.getElementById(id);

const tokenInput = el("tokenInput");
const dbUserInput = el("dbUserInput");
const historyToggle = el("historyToggle");
const autoRefreshToggle = el("autoRefreshToggle");
const highlightToggle = el("highlightToggle");
const viewToggle = el("viewToggle");
const historyLimit = el("historyLimit");
const loadBtn = el("loadBtn");
const clearBtn = el("clearBtn");
const loadMsg = el("loadMsg");
const summaryText = el("summaryText");
const excludedDbUsersNote = el("excludedDbUsersNote");
const excludedDbUsersInput = el("excludedDbUsersInput");
const resetExcludedBtn = el("resetExcludedBtn");
const latestRows = el("latestRows");
const groupViewTitle = el("groupViewTitle");
const keyStatsRows = el("keyStatsRows");
const keyStatsSummary = el("keyStatsSummary");
const sectionStatsRows = el("sectionStatsRows");
const sectionStatsSummary = el("sectionStatsSummary");
const historyCard = el("historyCard");
const historySummary = el("historySummary");
const historyRows = el("historyRows");
const themeSelect = el("themeSelect");

const TOKEN_KEY = "info330_instructor_token";
const THEME_KEY = "info330_theme";
const TEMP_EXCLUDED_DB_USERS_KEY = "info330_temp_excluded_db_users";
const EXCLUDED_DB_USERS_OVERRIDE_KEY = "info330_excluded_db_users_override";
let autoTimer = null;
let filterTimer = null;
let latestCache = [];
let historyCache = [];
let bestCache = [];
let keyStatsCache = [];
let sectionStatsCache = [];
let tempExcludedDbUsers = [];
let excludedDbUsersOverride = false;
let baseExcludedDbUsers = [];

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

function parseDbUserList(raw) {
  const seen = new Set();
  const out = [];
  const parts = String(raw || "").split(",");
  for (const part of parts) {
    const dbUser = part.trim().toLowerCase();
    if (!dbUser || seen.has(dbUser)) continue;
    seen.add(dbUser);
    out.push(dbUser);
  }
  return out;
}

function saveTempExcludedDbUsers() {
  if (!excludedDbUsersOverride) {
    sessionStorage.removeItem(TEMP_EXCLUDED_DB_USERS_KEY);
    sessionStorage.removeItem(EXCLUDED_DB_USERS_OVERRIDE_KEY);
    return;
  }
  sessionStorage.setItem(EXCLUDED_DB_USERS_OVERRIDE_KEY, "1");
  sessionStorage.setItem(TEMP_EXCLUDED_DB_USERS_KEY, tempExcludedDbUsers.join(","));
}

function stageExcludedOverrideFromInput() {
  tempExcludedDbUsers = parseDbUserList(excludedDbUsersInput?.value || "");
  excludedDbUsersOverride = true;
  if (excludedDbUsersInput && document.activeElement !== excludedDbUsersInput) {
    excludedDbUsersInput.value = tempExcludedDbUsers.join(", ");
  }
  saveTempExcludedDbUsers();
  renderExcludedDbUsers(tempExcludedDbUsers, baseExcludedDbUsers, tempExcludedDbUsers, true);
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

function renderCurrentView() {
  const useBest = !!viewToggle?.checked;
  const list = useBest ? bestCache : latestCache;
  renderLatest(list);
  if (groupViewTitle) groupViewTitle.textContent = useBest ? "Best per group" : "Latest per group";
  summaryText.textContent = `${list.length} group${list.length === 1 ? "" : "s"} reporting • ${formatTime(new Date().toISOString())}`;
}

function renderExcludedDbUsers(list, baseList, overrideList, overrideEnabled) {
  if (!excludedDbUsersNote) return;
  const baseUsers = Array.isArray(baseList) ? baseList.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const users = Array.isArray(list) ? list.map((s) => String(s || "").trim()).filter(Boolean) : [];
  const overrideUsers = Array.isArray(overrideList) ? overrideList.map((s) => String(s || "").trim()).filter(Boolean) : [];
  if (overrideEnabled) {
    const label = overrideUsers.length > 0 ? overrideUsers.join(", ") : "none";
    excludedDbUsersNote.textContent = `Override active. Excluded (${overrideUsers.length}): ${label}`;
    return;
  }
  if (baseUsers.length > 0) {
    excludedDbUsersNote.textContent = `Excluded from .env (${baseUsers.length}): ${baseUsers.join(", ")}`;
    return;
  }
  if (users.length > 0) {
    excludedDbUsersNote.textContent = `Excluded from report (${users.length}): ${users.join(", ")}`;
    return;
  }
  excludedDbUsersNote.textContent = "No excluded users configured in .env.";
}

async function loadExcludedConfig() {
  try {
    const r = await fetch("/api/instructor/public-config");
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.ok === false) return;
    baseExcludedDbUsers = Array.isArray(data.baseExcludedDbUsers) ? data.baseExcludedDbUsers : [];
    if (!excludedDbUsersOverride && excludedDbUsersInput) {
      excludedDbUsersInput.value = baseExcludedDbUsers.join(", ");
    }
    const effectiveList = excludedDbUsersOverride ? tempExcludedDbUsers : baseExcludedDbUsers;
    renderExcludedDbUsers(effectiveList, baseExcludedDbUsers, tempExcludedDbUsers, excludedDbUsersOverride);
  } catch {
    if (excludedDbUsersNote && !excludedDbUsersOverride) {
      excludedDbUsersNote.textContent = "Could not load excluded users config yet. Click Update report.";
    }
  }
}

function renderKeyStats(list, totalGroups) {
  if (!keyStatsRows) return;
  keyStatsRows.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    keyStatsRows.innerHTML = `<tr><td colspan="2" class="mutedSmall">No key stats yet.</td></tr>`;
    if (keyStatsSummary) keyStatsSummary.textContent = "No data yet.";
    return;
  }
  const denom = Number(totalGroups || 0);
  for (const entry of list) {
    const count = Number(entry.count ?? 0);
    const pct = denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0;
    const label = denom > 0 ? `${count}/${denom} (${pct}%)` : `${count}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escapeHtml(entry.key || "—")}</code></td>
      <td>${escapeHtml(label)}</td>
    `;
    keyStatsRows.appendChild(tr);
  }
  if (keyStatsSummary) {
    const base = `${list.length} key${list.length === 1 ? "" : "s"} with at least one pass`;
    keyStatsSummary.textContent = denom > 0 ? `${base} • ${denom} group${denom === 1 ? "" : "s"} total` : base;
  }
}

function renderSectionStats(list) {
  if (!sectionStatsRows) return;
  sectionStatsRows.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    sectionStatsRows.innerHTML = `<tr><td colspan="3" class="mutedSmall">No section stats yet.</td></tr>`;
    if (sectionStatsSummary) sectionStatsSummary.textContent = "No data yet.";
    return;
  }
  for (const entry of list) {
    const tr = document.createElement("tr");
    const section = entry.section ? String(entry.section).toUpperCase() : "—";
    const avg = Number(entry.avgPercent || 0);
    tr.innerHTML = `
      <td><code>${escapeHtml(section)}</code></td>
      <td>${escapeHtml(String(entry.groupCount ?? 0))}</td>
      <td>${escapeHtml(avg.toFixed(1))}%</td>
    `;
    sectionStatsRows.appendChild(tr);
  }
  if (sectionStatsSummary) {
    sectionStatsSummary.textContent = `${list.length} section${list.length === 1 ? "" : "s"} reported`;
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
  if (excludedDbUsersOverride) {
    params.set("excludeDbUsersOverride", "1");
    if (tempExcludedDbUsers.length > 0) params.set("excludeDbUsers", tempExcludedDbUsers.join(","));
  }
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
    bestCache = Array.isArray(data.best) ? data.best : [];
    renderCurrentView();
    const effectiveExcluded = Array.isArray(data.excludedDbUsers) ? data.excludedDbUsers : [];
    const baseExcluded = Array.isArray(data.baseExcludedDbUsers) ? data.baseExcludedDbUsers : [];
    const overrideExcluded = Array.isArray(data.overrideExcludedDbUsers)
      ? data.overrideExcludedDbUsers
      : (Array.isArray(data.tempExcludedDbUsers) ? data.tempExcludedDbUsers : tempExcludedDbUsers);
    baseExcludedDbUsers = baseExcluded;
    excludedDbUsersOverride = data.excludeDbUsersOverride === true;
    tempExcludedDbUsers = excludedDbUsersOverride ? parseDbUserList(overrideExcluded.join(",")) : [];
    if (excludedDbUsersInput) {
      const editorList = excludedDbUsersOverride ? tempExcludedDbUsers : baseExcluded;
      excludedDbUsersInput.value = editorList.join(", ");
    }
    saveTempExcludedDbUsers();
    renderExcludedDbUsers(effectiveExcluded, baseExcluded, overrideExcluded, excludedDbUsersOverride);
    keyStatsCache = Array.isArray(data.keyStats) ? data.keyStats : [];
    renderKeyStats(keyStatsCache, latestCache.length);
    sectionStatsCache = Array.isArray(data.sectionStats) ? data.sectionStats : [];
    renderSectionStats(sectionStatsCache);

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
  renderCurrentView();
  if (historyToggle?.checked) renderHistory(historyCache);
});
viewToggle?.addEventListener("change", () => {
  renderCurrentView();
});
resetExcludedBtn?.addEventListener("click", () => {
  excludedDbUsersOverride = false;
  tempExcludedDbUsers = [];
  if (excludedDbUsersInput) excludedDbUsersInput.value = baseExcludedDbUsers.join(", ");
  saveTempExcludedDbUsers();
  renderExcludedDbUsers(baseExcludedDbUsers, baseExcludedDbUsers, [], false);
  if (tokenInput.value.trim()) loadProgress();
});
tokenInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadProgress();
});
excludedDbUsersInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (tokenInput.value.trim()) loadProgress();
});
excludedDbUsersInput?.addEventListener("input", () => {
  stageExcludedOverrideFromInput();
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
const savedExcludedOverride = sessionStorage.getItem(EXCLUDED_DB_USERS_OVERRIDE_KEY) === "1";
if (savedExcludedOverride) {
  excludedDbUsersOverride = true;
  tempExcludedDbUsers = parseDbUserList(sessionStorage.getItem(TEMP_EXCLUDED_DB_USERS_KEY) || "");
  if (excludedDbUsersInput) excludedDbUsersInput.value = tempExcludedDbUsers.join(", ");
  renderExcludedDbUsers(tempExcludedDbUsers, [], tempExcludedDbUsers, true);
}
loadExcludedConfig();

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

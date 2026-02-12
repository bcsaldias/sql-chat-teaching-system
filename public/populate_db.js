const el = (id) => document.getElementById(id);

const fileInputs = {
  users: el("csvUsersFile"),
  channels: el("csvChannelsFile"),
  members: el("csvMembersFile"),
  messages: el("csvMessagesFile")
};

const fileLabels = {
  users: el("csvUsersLabel"),
  channels: el("csvChannelsLabel"),
  members: el("csvMembersLabel"),
  messages: el("csvMessagesLabel")
};

const useDefaultsBtn = el("useDefaultsBtn");
const hashToggle = el("hashToggle");

const previewBtn = el("previewBtn");
const runBtn = el("runBtn");
const populateMsg = el("populateMsg");
const previewMsg = el("previewMsg");
const brandSubEl = el("brandSub");
const schemaBtn = el("schemaBtn");
const schemaMsg = el("schemaMsg");
const populateConfirm = el("populateConfirm");
const populateConfirmOk = el("populateConfirmOk");
const populateConfirmCancel = el("populateConfirmCancel");
const populateConfirmAck = el("populateConfirmAck");
const previewSummary = el("previewSummary");
const previewHeader = el("previewHeader");
const previewBody = el("previewBody");
const previewSelect = el("previewSelect");
const fkModeSelect = el("fkModeSelect");
const channelIdRow = el("channelIdRow");
const userPkSelect = el("userPkSelect");
const userIdRow = el("userIdRow");
const tableDefs = el("tableDefs");
const themeSelect = el("themeSelect");

const THEME_KEY = "info330_theme";
const BRAND_SUB_DEFAULT = "UW INFO 330 • SQL-driven messaging";
const DB_USER_KEY = "info330_db_user";
const POPULATE_CONFIRM_WINDOW_MS = 60_000;
const csvText = {
  users: null,
  channels: null,
  members: null,
  messages: null
};
let previewCache = null;
let lastPopulateAt = null;

function confirmPopulateAgain() {
  if (!populateConfirm || !populateConfirmOk || !populateConfirmCancel || !populateConfirmAck) {
    return Promise.resolve(window.confirm(
      "You just populated the DB. Insert the data again? This may create duplicates.\n\nClick OK to load anyways, or Cancel to abort."
    ));
  }

  return new Promise((resolve) => {
    const close = (result) => {
      populateConfirm.classList.add("hidden");
      populateConfirm.removeEventListener("click", onBackdrop);
      populateConfirmCancel.removeEventListener("click", onCancel);
      populateConfirmOk.removeEventListener("click", onOk);
      populateConfirmAck.removeEventListener("change", onAck);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };

    const onBackdrop = (e) => {
      if (e.target === populateConfirm) close(false);
    };
    const onCancel = () => close(false);
    const onOk = () => close(true);
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    const onAck = () => {
      populateConfirmOk.disabled = !populateConfirmAck.checked;
    };

    populateConfirmAck.checked = false;
    onAck();

    populateConfirm.addEventListener("click", onBackdrop);
    populateConfirmCancel.addEventListener("click", onCancel);
    populateConfirmOk.addEventListener("click", onOk);
    populateConfirmAck.addEventListener("change", onAck);
    document.addEventListener("keydown", onKey);

    populateConfirm.classList.remove("hidden");
    populateConfirmCancel.focus();
  });
}

function updateFkModeUI() {
  const mode = fkModeSelect?.value || "name";
  const useId = mode === "id";
  if (channelIdRow) channelIdRow.classList.toggle("hidden", !useId);
  const dbIdInput = el("dbChannelsId");
  const csvIdInput = el("csvChannelId");
  if (dbIdInput) dbIdInput.disabled = !useId;
  if (csvIdInput) csvIdInput.disabled = !useId;

  const userMode = userPkSelect?.value || "username";
  const useUserId = userMode === "id";
  if (userIdRow) userIdRow.classList.toggle("hidden", !useUserId);
  const dbUserIdInput = el("dbUsersId");
  const csvUserIdInput = el("csvUserId");
  if (dbUserIdInput) dbUserIdInput.disabled = !useUserId;
  if (csvUserIdInput) csvUserIdInput.disabled = !useUserId;

  const maybeAutoSet = (id, nextValue, allowedCurrent) => {
    const input = el(id);
    if (!input) return;
    const current = String(input.value ?? "").trim();
    if (!current || allowedCurrent.includes(current)) {
      input.value = nextValue;
    }
  };

  if (useId) {
    ["csvMemberChannel", "csvMessageChannel"].forEach((id) => {
      maybeAutoSet(id, "channel_id", ["channel_name"]);
    });
  } else {
    ["csvMemberChannel", "csvMessageChannel"].forEach((id) => {
      maybeAutoSet(id, "channel_name", ["channel_id"]);
    });
  }

  if (useUserId) {
    ["csvMemberUsername", "csvMessageUsername"].forEach((id) => {
      maybeAutoSet(id, "user_id", ["username"]);
    });
  } else {
    ["csvMemberUsername", "csvMessageUsername"].forEach((id) => {
      maybeAutoSet(id, "username", ["user_id"]);
    });
  }
}

function setMsg(text, ok = false) {
  populateMsg.textContent = text || "";
  populateMsg.className = "msg " + (ok ? "ok" : "err");
  if (!text) populateMsg.className = "msg";
}

function setPreviewMsg(text, ok = false) {
  if (!previewMsg) return;
  previewMsg.textContent = text || "";
  previewMsg.className = "msg " + (ok ? "ok" : "err");
  if (!text) previewMsg.className = "msg";
}

function setSchemaMsg(text, ok = false) {
  if (!schemaMsg) return;
  schemaMsg.textContent = text || "";
  schemaMsg.className = "msg " + (ok ? "ok" : "err");
  if (!text) schemaMsg.className = "msg";
}

function setInputValue(id, value) {
  const input = el(id);
  if (!input) return;
  if (value === undefined || value === null || value === "") return;
  input.value = value;
}

function trimCell(value, max = 80) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getDbUserFromSession() {
  return sessionStorage.getItem(DB_USER_KEY);
}

function setBrandSubFromSession() {
  if (!brandSubEl) return;
  const dbUser = getDbUserFromSession();
  brandSubEl.textContent = dbUser ? `UW INFO 330 – SQL chat for ${dbUser}` : BRAND_SUB_DEFAULT;
}

function looksLikeSha512Hex(value) {
  return /^[a-f0-9]{128}$/i.test(String(value ?? ""));
}

async function sha512Hex(value) {
  const data = new TextEncoder().encode(String(value ?? ""));
  const digest = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function highlightKeywords(html) {
  return highlightReferenceColumns(String(html))
    .replace(/\bPRIMARY KEY\b/gi, '<span class="schemaKeyword">$&</span>')
    .replace(/\bREFERENCES\b/gi, '<span class="schemaKeyword">$&</span>');
}

function highlightReferenceColumns(html) {
  return String(html).replace(
    /(REFERENCES\s+[^\s(]+\s*\()([^)]+)(\))/gi,
    (match, start, cols, end) => {
      const highlighted = cols
        .split(/(\s*,\s*)/)
        .map((part) => {
          if (/^\s*,\s*$/.test(part)) return part;
          const trimmed = part.trim();
          if (!trimmed) return part;
          return part.replace(
            trimmed,
            `<span class="schemaKeyword">${trimmed}</span>`
          );
        })
        .join("");
      return `${start}${highlighted}${end}`;
    }
  );
}

function formatDefinition(def) {
  if (!def) return "";
  const lines = String(def).split("\n");
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push("");
      continue;
    }

    if (/^CREATE TABLE\s+/i.test(trimmed)) {
      const match = trimmed.match(/^CREATE TABLE\s+([^\s(]+)\s*\($/i);
      if (match) {
        out.push(highlightKeywords(`CREATE TABLE <strong>${escapeHtml(match[1])}</strong> (`));
        continue;
      }
    }

    if (/^(PRIMARY KEY|CONSTRAINT|FOREIGN KEY)\b/i.test(trimmed)) {
      out.push(highlightKeywords(escapeHtml(line)));
      continue;
    }

    const leading = line.match(/^\s*/)?.[0] || "";
    const rest = line.slice(leading.length);
    const colMatch = rest.match(/^([^\s,)\(]+)(.*)$/);
    if (colMatch) {
      const colName = colMatch[1];
      const remainder = colMatch[2] || "";
      out.push(
        highlightKeywords(
          `${escapeHtml(leading)}<strong>${escapeHtml(colName)}</strong>${escapeHtml(remainder)}`
        )
      );
    } else {
      out.push(highlightKeywords(escapeHtml(line)));
    }
  }
  return out.join("\n");
}

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {}, credentials: "same-origin" };
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

function applyTheme(theme) {
  const next = theme || "classic-light";
  document.documentElement.setAttribute("data-theme", next);
  if (themeSelect) themeSelect.value = next;
}

function collectMapping() {
  return {
    mapping: {
      csv: {
        user_id: el("csvUserId")?.value?.trim(),
        username: el("csvUsername")?.value?.trim(),
        password: el("csvPassword")?.value?.trim(),
        channel_name: el("csvChannelName")?.value?.trim(),
        channel_id: el("csvChannelId")?.value?.trim(),
        channel_description: el("csvChannelDesc")?.value?.trim(),
        member_username: el("csvMemberUsername")?.value?.trim(),
        member_channel: el("csvMemberChannel")?.value?.trim(),
        message_username: el("csvMessageUsername")?.value?.trim(),
        message_channel: el("csvMessageChannel")?.value?.trim(),
        message_body: el("csvMessageBody")?.value?.trim(),
        message_created_at: el("csvMessageCreated")?.value?.trim()
      },
      db: {
        users: {
          table: el("dbUsersTable")?.value?.trim(),
          id: el("dbUsersId")?.value?.trim(),
          username: el("dbUsersUsername")?.value?.trim(),
          password: el("dbUsersPassword")?.value?.trim()
        },
        channels: {
          table: el("dbChannelsTable")?.value?.trim(),
          id: el("dbChannelsId")?.value?.trim(),
          name: el("dbChannelsName")?.value?.trim(),
          description: el("dbChannelsDesc")?.value?.trim()
        },
        members: {
          table: el("dbMembersTable")?.value?.trim(),
          username: el("dbMembersUsername")?.value?.trim(),
          channel: el("dbMembersChannel")?.value?.trim()
        },
        messages: {
          table: el("dbMessagesTable")?.value?.trim(),
          username: el("dbMessagesUsername")?.value?.trim(),
          channel: el("dbMessagesChannel")?.value?.trim(),
          body: el("dbMessagesBody")?.value?.trim(),
          created_at: el("dbMessagesCreated")?.value?.trim()
        }
      }
    },
    options: {
      hashPasswords: !!hashToggle?.checked,
      channelFkMode: el("fkModeSelect")?.value || "name",
      userPkMode: el("userPkSelect")?.value || "username"
    }
  };
}

function buildPayload() {
  return {
    csvText: {
      users: csvText.users,
      channels: csvText.channels,
      members: csvText.members,
      messages: csvText.messages
    },
    ...collectMapping()
  };
}

function renderTableDefinitions(defs) {
  if (!tableDefs) return;
  if (!defs || typeof defs !== "object") {
    tableDefs.textContent = "Unable to load table definitions.";
    return;
  }
  const order = ["users", "channels", "channel_members", "chat_inbox"];
  const blocks = [];
  for (const key of order) {
    if (defs[key]) blocks.push(formatDefinition(defs[key]));
  }
  tableDefs.innerHTML = blocks.length ? blocks.join("\n\n") : "No table definitions found.";
}

async function loadTableDefinitions() {
  if (!tableDefs) return;
  try {
    const data = await api("/api/populate_db/definitions", "GET");
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    renderTableDefinitions(data?.definitions);
    if (warnings.length) {
      const warnText = escapeHtml(warnings.join(" "));
      tableDefs.innerHTML = `${tableDefs.innerHTML}\n\n<span class="schemaWarn">-- ${warnText}</span>`;
    }
  } catch (err) {
    tableDefs.textContent = err?.message || "Failed to load table definitions.";
  }
}

async function loadSchemaSuggestions() {
  if (!schemaBtn) return;
  setSchemaMsg("");
  schemaBtn.disabled = true;
  try {
    const tables = {
      users: el("dbUsersTable")?.value?.trim(),
      channels: el("dbChannelsTable")?.value?.trim(),
      members: el("dbMembersTable")?.value?.trim(),
      messages: el("dbMessagesTable")?.value?.trim()
    };

    const data = await api("/api/populate_db/schema", "POST", { tables });
    const s = data?.suggestions || {};
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];

    if (fkModeSelect) {
      fkModeSelect.value = s.channels?.id ? "id" : "name";
    }
    if (userPkSelect) {
      userPkSelect.value = s.users?.id ? "id" : "username";
    }
    updateFkModeUI();

    setInputValue("dbMessagesUsername", s.messages?.username);
    setInputValue("dbMessagesChannel", s.messages?.channel);
    setInputValue("dbMessagesBody", s.messages?.body);
    setInputValue("dbMessagesCreated", s.messages?.created_at);

    if (userPkSelect?.value === "id") {
      setInputValue("dbUsersId", s.users?.id);
    }
    setInputValue("dbUsersUsername", s.users?.username);
    setInputValue("dbUsersPassword", s.users?.password);

    if (fkModeSelect?.value === "id") {
      setInputValue("dbChannelsId", s.channels?.id);
    }
    setInputValue("dbChannelsName", s.channels?.name);
    setInputValue("dbChannelsDesc", s.channels?.description);

    setInputValue("dbMembersUsername", s.members?.username);
    setInputValue("dbMembersChannel", s.members?.channel);

    const suggestedCount = [
      s.messages?.username, s.messages?.channel, s.messages?.body, s.messages?.created_at,
      s.users?.id, s.users?.username, s.users?.password,
      s.channels?.id, s.channels?.name, s.channels?.description,
      s.members?.username, s.members?.channel
    ].filter((v) => v).length;

    if (warnings.length) {
      setSchemaMsg(warnings.join(" "), false);
    } else if (suggestedCount === 0) {
      setSchemaMsg("No matching columns found. Check table names.", false);
    } else {
      setSchemaMsg("Schema suggestions loaded.", true);
    }
  } catch (err) {
    setSchemaMsg(err?.message || String(err), false);
  } finally {
    schemaBtn.disabled = false;
  }
}

function buildSummary(data) {
  const rows = data?.counts?.rows || {};
  const entities = data?.counts?.entities || {};
  return `Rows: users ${rows.users ?? 0}, channels ${rows.channels ?? 0}, members ${rows.members ?? 0}, messages ${rows.messages ?? 0}`;
    // ` • Entities: users ${entities.users ?? 0}, channels ${entities.channels ?? 0}, members ${entities.members ?? 0}, messages ${entities.messages ?? 0}`;
}

function renderPreviewTable(fileKey) {
  previewHeader.innerHTML = "";
  previewBody.innerHTML = "";

  if (!previewCache || !previewCache.files) {
    previewBody.innerHTML = `<tr><td class="mutedSmall">No preview loaded.</td></tr>`;
    return;
  }

  const fileData = previewCache.files[fileKey];
  if (!fileData) {
    previewBody.innerHTML = `<tr><td class="mutedSmall">No data for ${fileKey}.</td></tr>`;
    return;
  }

  const headers = Array.isArray(fileData.headers) ? fileData.headers : [];
  const sampleRows = Array.isArray(fileData.sampleRows) ? fileData.sampleRows : [];

  if (headers.length === 0) {
    previewBody.innerHTML = `<tr><td class="mutedSmall">No headers found.</td></tr>`;
    return;
  }

  const hideUserId = (userPkSelect?.value || "username") !== "id";
  const hideChannelId = (fkModeSelect?.value || "name") !== "id";
  const userIdCol = normalizeHeader(el("csvUserId")?.value || "user_id");
  const channelIdCol = normalizeHeader(el("csvChannelId")?.value || "channel_id");
  const passwordCol = normalizeHeader(el("csvPassword")?.value || "password");
  const showHashNote = hashToggle?.checked && fileKey === "users";
  const visibleIndexes = [];

  headers.forEach((h, idx) => {
    const headerKey = normalizeHeader(h);
    if (hideUserId && headerKey && headerKey === userIdCol) return;
    if (hideChannelId && headerKey && headerKey === channelIdCol) return;
    visibleIndexes.push(idx);
  });

  if (visibleIndexes.length === 0) {
    previewBody.innerHTML = `<tr><td class="mutedSmall">No visible columns for this preview.</td></tr>`;
    return;
  }

  visibleIndexes.forEach((idx) => {
    const th = document.createElement("th");
    let label = headers[idx] || "—";
    if (showHashNote && normalizeHeader(label) === passwordCol) {
      label = `${label} (as indicated, pwds being hashed)`;
    }
    th.textContent = label;
    previewHeader.appendChild(th);
  });

  if (sampleRows.length === 0) {
    previewBody.innerHTML = `<tr><td colspan="${visibleIndexes.length}" class="mutedSmall">No rows found.</td></tr>`;
    return;
  }

  for (const row of sampleRows) {
    const tr = document.createElement("tr");
    visibleIndexes.forEach((idx) => {
      const td = document.createElement("td");
      td.textContent = trimCell(row?.[idx] ?? "");
      tr.appendChild(td);
    });
    previewBody.appendChild(tr);
  }
}

async function handlePreview() {
  setPreviewMsg("");
  previewBtn.disabled = true;
  try {
    const data = await api("/api/populate_db/preview", "POST", buildPayload());
    if (hashToggle?.checked && data?.files?.users?.sampleRows?.length) {
      const users = data.files.users;
      const headers = Array.isArray(users.headers) ? users.headers : [];
      const pwdCol = normalizeHeader(el("csvPassword")?.value || "password");
      const pwdIdx = headers.findIndex((h) => normalizeHeader(h) === pwdCol);
      if (pwdIdx !== -1 && crypto?.subtle) {
        const nextRows = [];
        for (const row of users.sampleRows) {
          const next = row.slice();
          const raw = String(next[pwdIdx] ?? "");
          if (raw && !looksLikeSha512Hex(raw)) {
            next[pwdIdx] = await sha512Hex(raw);
          }
          nextRows.push(next);
        }
        users.sampleRows = nextRows;
      }
    }
    previewCache = data;
    previewSummary.textContent = buildSummary(data);
    renderPreviewTable(previewSelect?.value || "users");
    setPreviewMsg("Preview loaded.", true);
  } catch (err) {
    setPreviewMsg(err?.message || String(err), false);
  } finally {
    previewBtn.disabled = false;
  }
}

async function handleRun() {
  setMsg("");
  if (lastPopulateAt && (Date.now() - lastPopulateAt) < POPULATE_CONFIRM_WINDOW_MS) {
    const ok = await confirmPopulateAgain();
    if (!ok) return;
  }
  runBtn.disabled = true;
  try {
    const data = await api("/api/populate_db/run", "POST", buildPayload());
    const stats = data?.stats || {};
    const summary = `Inserted users ${stats.users?.inserted ?? 0}/${stats.users?.attempted ?? 0}, ` +
      `channels ${stats.channels?.inserted ?? 0}/${stats.channels?.attempted ?? 0}, ` +
      `members ${stats.members?.inserted ?? 0}/${stats.members?.attempted ?? 0}, ` +
      `messages ${stats.messages?.inserted ?? 0}/${stats.messages?.attempted ?? 0}`;
    previewSummary.textContent = summary;
    setMsg("Populate complete.", true);
    lastPopulateAt = Date.now();
  } catch (err) {
    setMsg(err?.message || String(err), false);
  } finally {
    runBtn.disabled = false;
  }
}

function setFileLabel(key, text) {
  const label = fileLabels[key];
  if (label) label.textContent = text;
}

function resetFile(key) {
  csvText[key] = null;
  const input = fileInputs[key];
  if (input) input.value = "";
  setFileLabel(key, `Using default ${key}.csv.`);
}

function initFileInput(key) {
  const input = fileInputs[key];
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      csvText[key] = await file.text();
      setFileLabel(key, `Using uploaded file: ${file.name}`);
      setMsg("CSV loaded.", true);
    } catch (err) {
      csvText[key] = null;
      setFileLabel(key, `Using default ${key}.csv.`);
      setMsg(err?.message || String(err), false);
    }
  });
}

["users", "channels", "members", "messages"].forEach(initFileInput);

useDefaultsBtn?.addEventListener("click", () => {
  ["users", "channels", "members", "messages"].forEach(resetFile);
  setMsg("Using default CSV files.", true);
});

previewBtn?.addEventListener("click", handlePreview);
runBtn?.addEventListener("click", handleRun);
previewSelect?.addEventListener("change", () => {
  renderPreviewTable(previewSelect.value);
});
fkModeSelect?.addEventListener("change", updateFkModeUI);
userPkSelect?.addEventListener("change", updateFkModeUI);
updateFkModeUI();
schemaBtn?.addEventListener("click", loadSchemaSuggestions);
loadTableDefinitions();

const savedTheme = sessionStorage.getItem(THEME_KEY);
applyTheme(savedTheme || "classic-light");
if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    const next = themeSelect.value;
    applyTheme(next);
    sessionStorage.setItem(THEME_KEY, next);
  });
}

setBrandSubFromSession();

const fs = require("fs");
const path = require("path");

function registerInstructorRoutes(app, options = {}) {
  if (!app) throw new Error("registerInstructorRoutes requires an express app");

  const requireGroupLogin = options.requireGroupLogin;
  const dbRoute = options.dbRoute;
  const dbError = options.dbError;
  const publicDir = options.publicDir || path.join(__dirname, "..", "public");
  const submissionsDir =
    options.submissionsDir || process.env.SQL_SUBMISSIONS_DIR || path.join(__dirname, "..", "submissions");
  const progressLogPath =
    options.progressLogPath || process.env.SQL_PROGRESS_LOG || path.join(submissionsDir, "progress_log.jsonl");
  const configuredExcludedDbUsers = Array.isArray(options.excludedDbUsers)
    ? options.excludedDbUsers.map((dbUser) => normalizeDbUser(dbUser)).filter(Boolean)
    : parseDbUserList(process.env.INSTRUCTOR_EXCLUDED_DB_USERS);
  const baseExcludedDbUsers = configuredExcludedDbUsers;
  const excludedDbUsers = new Set(baseExcludedDbUsers);

  if (!requireGroupLogin || !dbRoute || !dbError) {
    throw new Error("registerInstructorRoutes requires requireGroupLogin, dbRoute, and dbError.");
  }

  function ensureSubmissionsDir() {
    fs.mkdirSync(submissionsDir, { recursive: true });
  }

  function appendProgressLog(entry) {
    ensureSubmissionsDir();
    fs.appendFileSync(progressLogPath, JSON.stringify(entry) + "\n", "utf8");
  }

  const progressLatest = new Map();
  const progressBest = new Map();
  const progressKeySets = new Map();
  let progressCacheLoaded = false;
  const SECTION_ORDER = ["ba", "bb", "ca", "cb"];

  function normalizePassedKeys(keys) {
    return Array.isArray(keys) ? keys.map(String).sort() : [];
  }

  function normalizeDbUser(dbUser) {
    return String(dbUser || "").trim().toLowerCase();
  }

  function parseDbUserList(raw) {
    return String(raw || "")
      .split(",")
      .map((dbUser) => normalizeDbUser(dbUser))
      .filter(Boolean);
  }

  function isProgressDuplicate(prev, next) {
    if (!prev) return false;
    if (Number(prev.passedCount) !== Number(next.passedCount)) return false;
    if (Number(prev.totalCount) !== Number(next.totalCount)) return false;
    const prevKeys = normalizePassedKeys(prev.passedKeys);
    const nextKeys = normalizePassedKeys(next.passedKeys);
    return prevKeys.length === nextKeys.length && prevKeys.every((k, i) => k === nextKeys[i]);
  }

  function isBetterProgress(prev, next) {
    if (!prev) return true;
    const prevPassed = Number(prev.passedCount || 0);
    const nextPassed = Number(next.passedCount || 0);
    if (nextPassed !== prevPassed) return nextPassed > prevPassed;
    const prevTotal = Number(prev.totalCount || 0);
    const nextTotal = Number(next.totalCount || 0);
    if (nextTotal !== prevTotal) return nextTotal > prevTotal;
    return new Date(next.at).getTime() >= new Date(prev.at).getTime();
  }

  function updateProgressBest(entry) {
    const prev = progressBest.get(entry.dbUser);
    if (isBetterProgress(prev, entry)) progressBest.set(entry.dbUser, entry);
  }

  function trackProgressKeys(entry) {
    const dbUser = String(entry.dbUser || "");
    if (!dbUser) return;
    const keys = Array.isArray(entry.passedKeys) ? entry.passedKeys : [];
    for (const key of keys) {
      if (!key) continue;
      let set = progressKeySets.get(key);
      if (!set) {
        set = new Set();
        progressKeySets.set(key, set);
      }
      set.add(dbUser);
    }
  }

  function loadProgressCache() {
    if (progressCacheLoaded) return;
    progressCacheLoaded = true;
    if (!fs.existsSync(progressLogPath)) return;
    const raw = fs.readFileSync(progressLogPath, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (!entry || !entry.dbUser) continue;
        progressLatest.set(entry.dbUser, entry);
        updateProgressBest(entry);
        trackProgressKeys(entry);
      } catch { }
    }
  }

  function buildKeyStats(dbUserNeedle, excludedSet) {
    const out = [];
    for (const [key, set] of progressKeySets.entries()) {
      let count = 0;
      for (const dbUser of set) {
        const normalizedDbUser = normalizeDbUser(dbUser);
        if (excludedSet.has(normalizedDbUser)) continue;
        if (!dbUserNeedle || normalizedDbUser.includes(dbUserNeedle)) count += 1;
      }
      if (count > 0) out.push({ key, count });
    }
    out.sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
    return out;
  }

  function getSectionCode(dbUser) {
    const m = String(dbUser || "").toLowerCase().match(/_([a-z0-9]+)$/);
    return m ? m[1] : null;
  }

  function buildSectionStats(dbUserNeedle, matchesDbUser) {
    const buckets = new Map();
    for (const entry of progressBest.values()) {
      if (!matchesDbUser(entry)) continue;
      const section = getSectionCode(entry.dbUser);
      if (!section) continue;
      const total = Number(entry.totalCount || 0);
      const passed = Number(entry.passedCount || 0);
      const pct = total > 0 ? (passed / total) * 100 : 0;
      const prev = buckets.get(section) || { section, groupCount: 0, sumPercent: 0 };
      prev.groupCount += 1;
      prev.sumPercent += pct;
      buckets.set(section, prev);
    }

    const out = [];
    const seen = new Set();
    for (const section of SECTION_ORDER) {
      const data = buckets.get(section) || { section, groupCount: 0, sumPercent: 0 };
      const avg = data.groupCount ? data.sumPercent / data.groupCount : 0;
      out.push({ section, groupCount: data.groupCount, avgPercent: Math.round(avg * 10) / 10 });
      seen.add(section);
    }

    const extra = Array.from(buckets.keys())
      .filter((s) => !seen.has(s))
      .sort((a, b) => String(a).localeCompare(String(b)));
    for (const section of extra) {
      const data = buckets.get(section);
      const avg = data.groupCount ? data.sumPercent / data.groupCount : 0;
      out.push({ section, groupCount: data.groupCount, avgPercent: Math.round(avg * 10) / 10 });
    }
    return out;
  }

  function requireInstructor(req, res, next) {
    const token = process.env.INSTRUCTOR_TOKEN;
    if (!token) return res.status(403).json({ error: "Instructor access not configured." });
    const got = req.headers["x-instructor-token"] || req.query.token;
    if (String(got || "") !== String(token)) {
      return res.status(403).json({ error: "Forbidden." });
    }
    next();
  }

  // Friendly instructor dashboard route
  app.get("/instructor", (_req, res) => {
    res.sendFile(path.join(publicDir, "instructor.html"));
  });

  // Lightweight config for initial instructor page state.
  app.get("/api/instructor/public-config", (_req, res) => {
    const baseExcludedList = Array.from(excludedDbUsers).sort((a, b) => String(a).localeCompare(String(b)));
    res.json({ ok: true, baseExcludedDbUsers: baseExcludedList });
  });

  // Progress logging endpoints
  app.post("/api/progress", requireGroupLogin, dbRoute(async (req, res) => {
    const { passedCount, totalCount, passedKeys } = req.body || {};
    const passed = Number(passedCount);
    const total = Number(totalCount);
    if (!Number.isFinite(passed) || !Number.isFinite(total)) {
      return res.status(400).json({ error: "passedCount and totalCount are required." });
    }
    const keys = Array.isArray(passedKeys) ? passedKeys.map(String) : [];
    const entry = {
      at: new Date().toISOString(),
      dbUser: String(req.session?.dbUser || "unknown"),
      chatUser: String(req.session?.chatUsername || ""),
      passedCount: passed,
      totalCount: total,
      passedKeys: keys
    };
    const prev = progressLatest.get(entry.dbUser);
    progressLatest.set(entry.dbUser, entry);
    updateProgressBest(entry);
    trackProgressKeys(entry);
    if (!isProgressDuplicate(prev, entry)) {
      appendProgressLog(entry);
    }
    res.json({ ok: true });
  }, (e) => dbError("Failed to log progress.", String(e.message || e))));

  app.get("/api/instructor/progress", requireInstructor, (req, res) => {
    loadProgressCache();
    const wantHistory = String(req.query?.history || "") === "1";
    const dbUserFilter = req.query?.dbUser ? String(req.query.dbUser) : null;
    const dbUserNeedle = dbUserFilter ? dbUserFilter.trim().toLowerCase() : null;
    const excludedOverrideEnabled = String(req.query?.excludeDbUsersOverride || "") === "1";
    const overrideExcludedDbUsers = new Set(parseDbUserList(req.query?.excludeDbUsers));
    const effectiveExcludedDbUsers = excludedOverrideEnabled
      ? new Set(overrideExcludedDbUsers)
      : new Set(excludedDbUsers);
    const matchesDbUser = (entry) => {
      const dbUser = normalizeDbUser(entry.dbUser);
      if (effectiveExcludedDbUsers.has(dbUser)) return false;
      if (!dbUserNeedle) return true;
      return dbUser.includes(dbUserNeedle);
    };
    const latest = Array.from(progressLatest.values())
      .filter(matchesDbUser)
      .sort((a, b) => String(a.dbUser).localeCompare(String(b.dbUser)));
    const best = Array.from(progressBest.values())
      .filter(matchesDbUser)
      .sort((a, b) => String(a.dbUser).localeCompare(String(b.dbUser)));
    const keyStats = buildKeyStats(dbUserNeedle, effectiveExcludedDbUsers);
    const sectionStats = buildSectionStats(dbUserNeedle, matchesDbUser);
    const baseExcludedList = Array.from(excludedDbUsers).sort((a, b) => String(a).localeCompare(String(b)));
    const overrideExcludedList = Array.from(overrideExcludedDbUsers).sort((a, b) => String(a).localeCompare(String(b)));
    const excludedList = Array.from(effectiveExcludedDbUsers).sort((a, b) => String(a).localeCompare(String(b)));

    if (!wantHistory) {
      return res.json({
        ok: true,
        latest,
        best,
        keyStats,
        sectionStats,
        excludedDbUsers: excludedList,
        baseExcludedDbUsers: baseExcludedList,
        tempExcludedDbUsers: overrideExcludedList,
        overrideExcludedDbUsers: overrideExcludedList,
        excludeDbUsersOverride: excludedOverrideEnabled,
      });
    }

    const limit = Math.max(1, Math.min(1000, Number(req.query?.limit || 200)));
    const history = [];
    if (fs.existsSync(progressLogPath)) {
      const lines = fs.readFileSync(progressLogPath, "utf8").trim().split("\n");
      for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          if (!matchesDbUser(entry)) continue;
          history.push(entry);
        } catch { }
      }
    }
    res.json({
      ok: true,
      latest,
      best,
      history,
      keyStats,
      sectionStats,
      excludedDbUsers: excludedList,
      baseExcludedDbUsers: baseExcludedList,
      tempExcludedDbUsers: overrideExcludedList,
      overrideExcludedDbUsers: overrideExcludedList,
      excludeDbUsersOverride: excludedOverrideEnabled,
    });
  });
}

module.exports = { registerInstructorRoutes };

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
  let progressCacheLoaded = false;

  function normalizePassedKeys(keys) {
    return Array.isArray(keys) ? keys.map(String).sort() : [];
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
      } catch { }
    }
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
    if (!isProgressDuplicate(prev, entry)) {
      appendProgressLog(entry);
    }
    res.json({ ok: true });
  }, (e) => dbError("Failed to log progress.", String(e.message || e))));

  app.get("/api/instructor/progress", requireInstructor, (req, res) => {
    loadProgressCache();
    const wantHistory = String(req.query?.history || "") === "1";
    const dbUserFilter = req.query?.dbUser ? String(req.query.dbUser) : null;
    const dbUserNeedle = dbUserFilter ? dbUserFilter.toLowerCase() : null;
    const matchesDbUser = (entry) => {
      if (!dbUserNeedle) return true;
      return String(entry.dbUser || "").toLowerCase().includes(dbUserNeedle);
    };
    const latest = Array.from(progressLatest.values())
      .filter(matchesDbUser)
      .sort((a, b) => String(a.dbUser).localeCompare(String(b.dbUser)));
    const best = Array.from(progressBest.values())
      .filter(matchesDbUser)
      .sort((a, b) => String(a.dbUser).localeCompare(String(b.dbUser)));

    if (!wantHistory) return res.json({ ok: true, latest, best });

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
    res.json({ ok: true, latest, best, history });
  });
}

module.exports = { registerInstructorRoutes };

const fs = require("fs");
const path = require("path");

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

function uniq(list) {
  return Array.from(new Set(list));
}

function extractSqlLabKeys(appJs) {
  const keys = [];
  const re = /\bkey\s*:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(appJs))) {
    keys.push(match[1]);
  }
  return uniq(keys);
}

function extractStringOccurrences(haystack, keys) {
  const present = new Set();
  for (const key of keys) {
    const re = new RegExp(`["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
    if (re.test(haystack)) present.add(key);
  }
  return present;
}

function extractCallKeys(haystack, fnName, keys) {
  const present = new Set();
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${fnName}\\s*\\([^\\)]*["']${escaped}["']`, "g");
    if (re.test(haystack)) present.add(key);
  }
  return present;
}

function extractCallStringKeys(haystack, fnName) {
  const out = new Set();
  const re = new RegExp(`${fnName}\\s*\\([^\\)]*?["']([^"']+)["']`, "g");
  let match;
  while ((match = re.exec(haystack))) {
    out.add(match[1]);
  }
  return out;
}

function diff(a, b) {
  const setB = new Set(b);
  return a.filter((k) => !setB.has(k));
}

function main() {
  const utilsPath = path.join(__dirname, "..", "src", "utils.js");
  const utils = require(utilsPath);
  const contractKeys = Object.keys(utils.SQL_CONTRACT || {}).sort();
  const solutionKeys = Object.keys(utils.SOLUTION_SQL || {}).sort();

  const appJs = readFile("public/app.js");
  const serverJs = readFile("src/server.js");

  const labKeys = extractSqlLabKeys(appJs).sort();
  const serverKeys = Array.from(extractStringOccurrences(serverJs, contractKeys)).sort();
  const appKeys = Array.from(extractStringOccurrences(appJs, contractKeys)).sort();
  const runSqlKeys = Array.from(extractCallKeys(serverJs, "runSql", contractKeys)).sort();
  const inputKeys = Array.from(extractCallKeys(appJs, "recordSqlInput", contractKeys)).sort();
  const statusKeys = Array.from(extractCallKeys(appJs, "flagQueryStatus", contractKeys)).sort();
  const errorKeys = Array.from(extractCallKeys(appJs, "recordSqlError", contractKeys)).sort();
  const runSqlAll = Array.from(extractCallStringKeys(serverJs, "runSql")).sort();
  const inputAll = Array.from(extractCallStringKeys(appJs, "recordSqlInput")).sort();
  const statusAll = Array.from(extractCallStringKeys(appJs, "flagQueryStatus")).sort();
  const errorAll = Array.from(extractCallStringKeys(appJs, "recordSqlError")).sort();

  const issues = [];

  if (contractKeys.length === 0) issues.push("SQL_CONTRACT has no keys.");

  const missingFirstWords = contractKeys.filter((k) => {
    const words = utils.SQL_CONTRACT?.[k]?.firstWords;
    if (!words) return true;
    const list = Array.isArray(words) ? words : [words];
    return list.map((w) => String(w || "").trim()).filter(Boolean).length === 0;
  });
  if (missingFirstWords.length) {
    issues.push(`Missing firstWords in SQL_CONTRACT: ${missingFirstWords.join(", ")}`);
  }

  const missingInSolutions = diff(contractKeys, solutionKeys);
  if (missingInSolutions.length) {
    issues.push(`Missing in SOLUTION_SQL: ${missingInSolutions.join(", ")}`);
  }

  const extraInSolutions = diff(solutionKeys, contractKeys);
  if (extraInSolutions.length) {
    issues.push(`Extra keys in SOLUTION_SQL (not in SQL_CONTRACT): ${extraInSolutions.join(", ")}`);
  }

  const missingInLab = diff(contractKeys, labKeys);
  if (missingInLab.length) {
    issues.push(`Missing in SQL_LAB_ITEMS: ${missingInLab.join(", ")}`);
  }

  const extraInLab = diff(labKeys, contractKeys);
  if (extraInLab.length) {
    issues.push(`Extra keys in SQL_LAB_ITEMS (not in SQL_CONTRACT): ${extraInLab.join(", ")}`);
  }

  const missingInApp = diff(contractKeys, appKeys);
  if (missingInApp.length) {
    issues.push(`Missing string references in public/app.js: ${missingInApp.join(", ")}`);
  }

  const missingInServer = diff(contractKeys, serverKeys);
  if (missingInServer.length) {
    issues.push(`Missing string references in src/server.js: ${missingInServer.join(", ")}`);
  }

  const extraRunSql = diff(runSqlAll, contractKeys);
  if (extraRunSql.length) {
    issues.push(`Extra keys in runSql calls (not in SQL_CONTRACT): ${extraRunSql.join(", ")}`);
  }

  const extraInput = diff(inputAll, contractKeys);
  if (extraInput.length) {
    issues.push(`Extra keys in recordSqlInput calls (not in SQL_CONTRACT): ${extraInput.join(", ")}`);
  }

  const extraStatus = diff(statusAll, contractKeys);
  if (extraStatus.length) {
    issues.push(`Extra keys in flagQueryStatus calls (not in SQL_CONTRACT): ${extraStatus.join(", ")}`);
  }

  const extraError = diff(errorAll, contractKeys);
  if (extraError.length) {
    issues.push(`Extra keys in recordSqlError calls (not in SQL_CONTRACT): ${extraError.join(", ")}`);
  }

  const labContractKeys = contractKeys.filter((k) => labKeys.includes(k));
  const missingRunSql = diff(labContractKeys, runSqlKeys);
  if (missingRunSql.length) {
    issues.push(`Missing runSql("<key>") calls in src/server.js: ${missingRunSql.join(", ")}`);
  }

  const missingInputs = diff(labContractKeys, inputKeys);
  if (missingInputs.length) {
    issues.push(`Missing recordSqlInput("<key>") calls in public/app.js: ${missingInputs.join(", ")}`);
  }

  const missingStatus = diff(labContractKeys, statusKeys);
  if (missingStatus.length) {
    issues.push(`Missing flagQueryStatus("<key>") calls in public/app.js: ${missingStatus.join(", ")}`);
  }

  const missingErrors = diff(labContractKeys, errorKeys);
  if (missingErrors.length) {
    issues.push(`Missing recordSqlError("<key>") calls in public/app.js: ${missingErrors.join(", ")}`);
  }

  if (issues.length) {
    console.error("Contract check failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("Contract check passed.");
}

main();

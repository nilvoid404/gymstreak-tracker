const fs = require("fs");
const path = require("path");

const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, "..", "data", "db.json");

function empty() {
  return { users: [], workouts: {}, tokens: {} };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    cache = empty();
  }
  if (!Array.isArray(cache.users)) cache.users = [];
  if (!cache.workouts || typeof cache.workouts !== "object") cache.workouts = {};
  if (!cache.tokens || typeof cache.tokens !== "object") cache.tokens = {};
  return cache;
}

function save() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function resetCache() {
  cache = null;
}

module.exports = { load, save, resetCache, DATA_FILE };

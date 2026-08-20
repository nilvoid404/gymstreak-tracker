const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const TOKEN_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function createToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const data = db.load();
  pruneTokens(data);
  data.tokens[token] = { userId, expiresAt: Date.now() + TOKEN_MS };
  db.save();
  return token;
}

function destroyToken(token) {
  if (!token) return;
  const data = db.load();
  delete data.tokens[token];
  db.save();
}

function pruneTokens(data) {
  const now = Date.now();
  for (const [token, rec] of Object.entries(data.tokens)) {
    if (!rec || rec.expiresAt < now) delete data.tokens[token];
  }
}

function userFromToken(token) {
  if (!token) return null;
  const data = db.load();
  const rec = data.tokens[token];
  if (!rec || rec.expiresAt < Date.now()) return null;
  return data.users.find((user) => user.id === rec.userId) || null;
}

function findUserByUsername(username) {
  const data = db.load();
  const key = String(username || "").toLowerCase();
  return data.users.find((user) => user.usernameLower === key) || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

function validateUsername(username) {
  if (!USERNAME_RE.test(username || "")) {
    return "Username must be 3–20 letters, numbers, or underscores.";
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return "Password must be 8–72 characters.";
  }
  return null;
}

function sanitizeDisplayName(name, fallback) {
  const cleaned = String(name || "").trim().slice(0, 24);
  return cleaned || fallback;
}

module.exports = {
  hashPassword,
  verifyPassword,
  newId,
  createToken,
  destroyToken,
  userFromToken,
  findUserByUsername,
  publicUser,
  validateUsername,
  validatePassword,
  sanitizeDisplayName,
};

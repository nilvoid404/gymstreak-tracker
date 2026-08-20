const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const db = require("./lib/db");
const auth = require("./lib/auth");
const { calculateStats } = require("./lib/stats");

try {
  const envFile = path.join(__dirname, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch (err) {
  /* ignore missing .env */
}

const app = express();
const PORT = process.env.PORT || 3000;
const INVITE_CODE = process.env.INVITE_CODE || "";
const COOKIE = "gs_session";
const isProd = process.env.NODE_ENV === "production";

const loginAttempts = new Map();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProd ? "7d" : 0,
    extensions: ["html"],
  })
);

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function setSession(res, token) {
  res.cookie(COOKIE, token, cookieOpts());
}

function clearSession(res) {
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: 0 });
}

function currentUser(req) {
  return auth.userFromToken(req.cookies[COOKIE]);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please log in." });
  }
  req.user = user;
  next();
}

function todayParam(req) {
  const raw = String(req.query.today || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const rec = loginAttempts.get(ip) || { count: 0, start: Date.now() };
  if (Date.now() - rec.start > 15 * 60 * 1000) {
    rec.count = 0;
    rec.start = Date.now();
  }
  rec.count += 1;
  loginAttempts.set(ip, rec);
  if (rec.count > 30) {
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
  }
  next();
}

function stripNotes(sessions) {
  const out = {};
  for (const [date, session] of Object.entries(sessions || {})) {
    out[date] = {
      went: session.went,
      workout: session.workout,
      duration: session.duration,
      loggedAt: session.loggedAt,
    };
  }
  return out;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, invite: Boolean(INVITE_CODE) });
});

app.get("/api/config", (req, res) => {
  res.json({ inviteRequired: Boolean(INVITE_CODE) });
});

app.post("/api/register", rateLimit, (req, res) => {
  const username = String((req.body && req.body.username) || "").trim();
  const password = String((req.body && req.body.password) || "");
  const displayName = auth.sanitizeDisplayName(req.body && req.body.displayName, username);
  const invite = String((req.body && req.body.inviteCode) || "").trim();

  const userErr = auth.validateUsername(username);
  if (userErr) return res.status(400).json({ error: userErr });

  const passErr = auth.validatePassword(password);
  if (passErr) return res.status(400).json({ error: passErr });

  if (INVITE_CODE && invite !== INVITE_CODE) {
    return res.status(403).json({ error: "Invite code is wrong." });
  }

  if (auth.findUserByUsername(username)) {
    return res.status(409).json({ error: "That username is taken." });
  }

  const data = db.load();
  const user = {
    id: auth.newId(),
    username,
    usernameLower: username.toLowerCase(),
    displayName,
    passwordHash: auth.hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  data.workouts[user.id] = {};
  db.save();

  const token = auth.createToken(user.id);
  setSession(res, token);
  res.status(201).json({ user: auth.publicUser(user) });
});

app.post("/api/login", rateLimit, (req, res) => {
  const username = String((req.body && req.body.username) || "").trim();
  const password = String((req.body && req.body.password) || "");

  const user = auth.findUserByUsername(username);
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Username or password is wrong." });
  }

  const token = auth.createToken(user.id);
  setSession(res, token);
  res.json({ user: auth.publicUser(user) });
});

app.post("/api/logout", (req, res) => {
  auth.destroyToken(req.cookies[COOKIE]);
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/me", requireUser, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

app.patch("/api/me", requireUser, (req, res) => {
  const displayName = auth.sanitizeDisplayName(req.body && req.body.displayName, req.user.username);
  const data = db.load();
  const user = data.users.find((item) => item.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  user.displayName = displayName;
  db.save();
  res.json({ user: auth.publicUser(user) });
});

app.get("/api/me/workouts", requireUser, (req, res) => {
  const data = db.load();
  const sessions = data.workouts[req.user.id] || {};
  res.json({
    sessions,
    stats: calculateStats(sessions, todayParam(req)),
  });
});

app.put("/api/me/workouts/:date", requireUser, (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date." });
  }

  const workout = String((req.body && req.body.workout) || "").trim();
  const allowed = ["Push", "Pull", "Legs", "Abs", "Full", "Rest"];
  if (!allowed.includes(workout)) {
    return res.status(400).json({ error: "Pick a workout type." });
  }

  const duration = Math.max(0, Math.min(300, parseInt(req.body && req.body.duration, 10) || 0));
  const notes = String((req.body && req.body.notes) || "").trim().slice(0, 500);

  const data = db.load();
  if (!data.workouts[req.user.id]) data.workouts[req.user.id] = {};
  data.workouts[req.user.id][date] = {
    went: workout !== "Rest",
    workout,
    duration,
    notes,
    loggedAt: new Date().toISOString(),
  };
  db.save();

  const sessions = data.workouts[req.user.id];
  res.json({
    session: data.workouts[req.user.id][date],
    stats: calculateStats(sessions, date),
  });
});

app.delete("/api/me/workouts/:date", requireUser, (req, res) => {
  const date = req.params.date;
  const data = db.load();
  if (data.workouts[req.user.id]) {
    delete data.workouts[req.user.id][date];
    db.save();
  }
  const sessions = data.workouts[req.user.id] || {};
  res.json({ ok: true, stats: calculateStats(sessions, todayParam(req)) });
});

app.get("/api/bros", requireUser, (req, res) => {
  const data = db.load();
  const today = todayParam(req);
  const list = data.users.map((user) => {
    const sessions = data.workouts[user.id] || {};
    return {
      ...auth.publicUser(user),
      stats: calculateStats(sessions, today),
    };
  });
  list.sort((a, b) => (b.stats.currentStreak || 0) - (a.stats.currentStreak || 0));
  res.json({ bros: list });
});

app.get("/api/bros/:username/workouts", requireUser, (req, res) => {
  const user = auth.findUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: "Athlete not found." });
  const data = db.load();
  const sessions = data.workouts[user.id] || {};
  const mine = user.id === req.user.id;
  res.json({
    user: auth.publicUser(user),
    sessions: mine ? sessions : stripNotes(sessions),
    stats: calculateStats(sessions, todayParam(req)),
  });
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`GymStreak running on http://0.0.0.0:${PORT}`);
  if (INVITE_CODE) console.log("Invite code is required to register.");
});

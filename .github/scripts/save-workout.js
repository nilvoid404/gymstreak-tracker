// ─────────────────────────────────────────────
// save-workout.js
// Runs inside GitHub Actions
// Has access to all secrets via environment
// variables — safe, never exposed to browser
// ─────────────────────────────────────────────

const https = require("https");
const fs = require("fs");
const path = require("path");

// Pull everything from environment
const {
  GH_TOKEN,
  GIST_ID,
  GH_USERNAME,
  WORKOUT_DATE,
  WORKOUT_TYPE,
  WORKOUT_DURATION,
  WORKOUT_INTENSITY,
  WORKOUT_NOTES,
} = process.env;

// ─────────────────────────────────────────────
// Local date helper (Nepal timezone safe)
// ─────────────────────────────────────────────

function getLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────
// HTTPS request helper
// ─────────────────────────────────────────────

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || "{}"));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─────────────────────────────────────────────
// GitHub API headers
// ─────────────────────────────────────────────

function githubHeaders(extraHeaders = {}) {
  return {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "GymStreak-Tracker",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extraHeaders,
  };
}

// ─────────────────────────────────────────────
// Read gym data from Gist
// ─────────────────────────────────────────────

async function readGistData() {
  console.log("📖 Reading gym data from Gist...");

  const data = await request({
    hostname: "api.github.com",
    path: `/gists/${GIST_ID}`,
    method: "GET",
    headers: githubHeaders(),
  });

  const gymFile = data.files["gym-data.json"];

  if (!gymFile || !gymFile.content) {
    console.log("No existing data — starting fresh");
    return {
      sessions: {},
      stats: {
        totalSessions: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalMinutes: 0,
      },
      lastUpdated: null,
    };
  }

  return JSON.parse(gymFile.content);
}

// ─────────────────────────────────────────────
// Write gym data to Gist
// ─────────────────────────────────────────────

async function writeGistData(gymData) {
  console.log("💾 Saving gym data to Gist...");

  await request(
    {
      hostname: "api.github.com",
      path: `/gists/${GIST_ID}`,
      method: "PATCH",
      headers: githubHeaders(),
    },
    {
      description: `GymStreak Data — Updated ${new Date().toISOString()}`,
      files: {
        "gym-data.json": {
          content: JSON.stringify(gymData, null, 2),
        },
      },
    }
  );

  console.log("✅ Gist updated");
}

// ─────────────────────────────────────────────
// Calculate stats (includes Rest days in streak)
// ─────────────────────────────────────────────

function calculateStats(sessions) {
  // Count any logged day (gym or rest) for streak
  const allDates = Object.keys(sessions).sort();

  // Only count gym days for totalSessions
  const gymDates = Object.keys(sessions)
    .filter((date) => sessions[date].went === true)
    .sort();

  if (allDates.length === 0) {
    return {
      totalSessions: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalMinutes: 0,
    };
  }

  const totalSessions = gymDates.length;

  const totalMinutes = gymDates.reduce((sum, date) => {
    return sum + (parseInt(sessions[date].duration) || 0);
  }, 0);

  // Current streak — count backwards from today
  // Both gym days AND rest days keep the streak alive
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= 730; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateStr = getLocalDateStr(checkDate);

    if (sessions[dateStr]) {
      currentStreak++;
    } else if (i > 0) {
      break;
    }
  }

  // Longest streak — includes rest days
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const date of allDates) {
    if (prevDate) {
      const prev = new Date(prevDate);
      const curr = new Date(date);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = date;
  }

  return {
    totalSessions,
    currentStreak,
    longestStreak,
    totalMinutes,
  };
}

// ─────────────────────────────────────────────
// Create session file
// ─────────────────────────────────────────────

function createSessionFile(sessionData) {
  const { date, workout, duration, intensity, notes } = sessionData;

  const dateObj = new Date(date + "T00:00:00");
  const year = dateObj.getFullYear();
  const month = dateObj.toLocaleString("en-US", { month: "long" });
  const day = dateObj.getDate();
  const weekday = dateObj.toLocaleString("en-US", { weekday: "long" });

  const workoutEmoji = {
    Push: "🏋️",
    Pull: "💪",
    Legs: "🦵",
    Abs: "🏃",
    Full: "⚡",
    Rest: "😴",
  };

  const emoji = workoutEmoji[workout] || "💪";

  const filled = "█".repeat(parseInt(intensity) || 0);
  const empty = "░".repeat(10 - (parseInt(intensity) || 0));
  const intensityBar = filled + empty;

  const content = `# ${emoji} ${workout} Day — ${month} ${day}, ${year}

## Session Info

| | |
|---|---|
| 📅 Date | ${weekday}, ${month} ${day}, ${year} |
| 💪 Workout | ${workout} |
| ⏱️ Duration | ${duration} minutes |
| 🔥 Intensity | ${intensityBar} ${intensity}/10 |

## Notes

${notes || "No notes logged."}

---

*Auto-logged by GymStreak Tracker*
`;

  const folderPath = path.join("gym-sessions", String(year), month);
  fs.mkdirSync(folderPath, { recursive: true });

  const filePath = path.join(folderPath, `${date}.md`);
  fs.writeFileSync(filePath, content, "utf8");

  console.log(`✅ Session file created: ${filePath}`);
}

// ─────────────────────────────────────────────
// Update README with stats
// ─────────────────────────────────────────────

function updateReadme(stats) {
  const now = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalHours = Math.round(stats.totalMinutes / 60);

  const content = `# 💪 GymStreak Tracker

> Automatically tracking my gym progress, one commit at a time.

## 📊 Live Stats

| Metric | Value |
|--------|-------|
| 🔥 Current Streak | **${stats.currentStreak} days** |
| 🏆 Longest Streak | **${stats.longestStreak} days** |
| 📅 Total Sessions | **${stats.totalSessions} sessions** |
| ⏱️ Total Time | **${totalHours} hours** |
| 🕐 Last Updated | ${now} |

## 📁 How This Works

Every time I log a gym session on my tracker:

1. Session data saves to a private GitHub Gist
2. A markdown file gets created in this repo
3. Stats in this README update automatically
4. A meaningful commit appears on my profile

## 🗂️ Session Files

\`\`\`
gym-sessions/
└── 2026/
    ├── January/
    │   └── 2026-01-15.md
    └── July/
        └── 2026-07-23.md
\`\`\`

---

*Built with GitHub Pages + GitHub Actions*
`;

  fs.writeFileSync("README.md", content, "utf8");
  console.log("✅ README updated");
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log("─────────────────────────────────");
  console.log(`💪 Processing workout: ${WORKOUT_TYPE}`);
  console.log(`📅 Date: ${WORKOUT_DATE}`);
  console.log(`⏱️ Duration: ${WORKOUT_DURATION} minutes`);
  console.log("─────────────────────────────────");

  const gymData = await readGistData();

  if (!gymData.sessions) {
    gymData.sessions = {};
  }

  gymData.sessions[WORKOUT_DATE] = {
    went: WORKOUT_TYPE !== "Rest",
    workout: WORKOUT_TYPE,
    duration: parseInt(WORKOUT_DURATION) || 0,
    intensity: parseInt(WORKOUT_INTENSITY) || 5,
    notes: WORKOUT_NOTES || "",
    loggedAt: new Date().toISOString(),
  };

  gymData.stats = calculateStats(gymData.sessions);
  gymData.lastUpdated = new Date().toISOString();

  await writeGistData(gymData);

  createSessionFile({
    date: WORKOUT_DATE,
    workout: WORKOUT_TYPE,
    duration: WORKOUT_DURATION,
    intensity: WORKOUT_INTENSITY,
    notes: WORKOUT_NOTES,
  });

  updateReadme(gymData.stats);

  console.log("─────────────────────────────────");
  console.log("✅ All done!");
  console.log(`🔥 Current streak: ${gymData.stats.currentStreak} days`);
  console.log(`🏆 Longest streak: ${gymData.stats.longestStreak} days`);
  console.log(`📅 Total sessions: ${gymData.stats.totalSessions}`);
  console.log("─────────────────────────────────");
}

main().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
// ─────────────────────────────────────────
// Config
// ─────────────────────────────────────────

const CONFIG = {
  owner:  "nilvoid404",
  repo:   "gymstreak-tracker",
  gistId: "0664ec92c22c6ab58467969149477615",
};

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────

let sessions = {};
let stats = { currentStreak: 0, totalSessions: 0 };

// Map workout type → CSS class
const WORKOUT_CLASS = {
  Push:   "push",
  Pull:   "pull",
  Legs:   "legs",
  Cardio: "cardio",
  Full:   "full",
  Rest:   "rest",
};

// ─────────────────────────────────────────
// DOM
// ─────────────────────────────────────────

const dom = {
  setup:           document.getElementById("setup"),
  app:             document.getElementById("app"),
  tokenInput:      document.getElementById("tokenInput"),
  passwordInput:   document.getElementById("passwordInput"),
  streak:          document.getElementById("streak"),
  total:           document.getElementById("total"),
  workoutType:     document.getElementById("workoutType"),
  duration:        document.getElementById("duration"),
  saveBtn:         document.getElementById("saveBtn"),
  msg:             document.getElementById("msg"),
  calendarSection: document.getElementById("calendarSection"),
};

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────

function init() {
  const password = localStorage.getItem("gymstreak_password");
  const token    = localStorage.getItem("gymstreak_trigger_token");

  if (password && token) {
    dom.setup.classList.add("hidden");
    dom.app.classList.remove("hidden");
    loadData();
  } else {
    dom.setup.classList.remove("hidden");
    dom.app.classList.add("hidden");
  }
}

// ─────────────────────────────────────────
// Setup
// ─────────────────────────────────────────

function saveSetup() {
  const pw    = dom.passwordInput.value.trim();
  const token = dom.tokenInput.value.trim();

  if (!pw || !token) {
    alert("Both fields required");
    return;
  }

  localStorage.setItem("gymstreak_password", pw);
  localStorage.setItem("gymstreak_trigger_token", token);

  dom.setup.classList.add("hidden");
  dom.app.classList.remove("hidden");
  loadData();
}

// ─────────────────────────────────────────
// Reset
// ─────────────────────────────────────────

function resetApp() {
  if (!confirm("Clear saved token and password from this device?")) return;

  localStorage.removeItem("gymstreak_password");
  localStorage.removeItem("gymstreak_trigger_token");

  dom.app.classList.add("hidden");
  dom.setup.classList.remove("hidden");
  dom.tokenInput.value = "";
  dom.passwordInput.value = "";
}

// ─────────────────────────────────────────
// Load data from Gist
// ─────────────────────────────────────────

async function loadData() {
  setMsg("Loading...", "wait");

  try {
    const res = await fetch(
      `https://api.github.com/gists/${CONFIG.gistId}`
    );

    if (!res.ok) throw new Error("Gist fetch failed");

    const gist = await res.json();
    const file = gist.files["gym-data.json"];

    if (file && file.content) {
      const data = JSON.parse(file.content);
      sessions = data.sessions || {};
      stats    = data.stats    || stats;
    }

    render();
    setMsg("", "");
  } catch (err) {
    console.error(err);
    setMsg("Failed to load data", "err");
  }
}

// ─────────────────────────────────────────
// Save workout
// ─────────────────────────────────────────

async function saveWorkout() {
  const workout = dom.workoutType.value;

  if (!workout) {
    setMsg("Pick a workout type", "err");
    return;
  }

  const today    = new Date().toISOString().split("T")[0];
  const password = localStorage.getItem("gymstreak_password");
  const token    = localStorage.getItem("gymstreak_trigger_token");

  if (!token) {
    setMsg("Token missing. Reset and re-setup.", "err");
    return;
  }

  dom.saveBtn.disabled = true;
  setMsg("⏳ Sending to GitHub...", "wait");

  try {
    const res = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "gym-checkin",
          client_payload: {
            date:      today,
            workout:   workout,
            duration:  dom.duration.value || "0",
            intensity: "7",
            notes:     "",
            password:  password,
          },
        }),
      }
    );

    if (res.status === 204) {
      setMsg("✅ Saved! Updating in ~25 seconds...", "ok");

      // Optimistic update — instant color change
      sessions[today] = {
        went:     workout !== "Rest",
        workout:  workout,
        duration: parseInt(dom.duration.value) || 0,
      };
      render();

      setTimeout(() => loadData(), 25000);
    } else {
      const err = await res.json();
      throw new Error(err.message || "Failed");
    }
  } catch (err) {
    console.error(err);
    setMsg("❌ " + err.message, "err");
  } finally {
    dom.saveBtn.disabled = false;
  }
}

// ─────────────────────────────────────────
// Render stats + calendar
// ─────────────────────────────────────────

function render() {
  dom.streak.textContent = stats.currentStreak || 0;
  dom.total.textContent  = stats.totalSessions || 0;
  renderCalendar();
}

// ─────────────────────────────────────────
// Month-based calendar
// Shows current year January through December
// ─────────────────────────────────────────

function renderCalendar() {
  dom.calendarSection.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  const monthNames = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  // Build each month block
  for (let m = 0; m < 12; m++) {
    const monthBlock = document.createElement("div");
    monthBlock.className = "month-block";

    // Month title
    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = `${monthNames[m]} ${currentYear}`;
    monthBlock.appendChild(title);

    // Grid container
    const grid = document.createElement("div");
    grid.className = "month-grid";

    // Weekday headers
    weekdays.forEach((wd) => {
      const wdEl = document.createElement("div");
      wdEl.className = "weekday";
      wdEl.textContent = wd;
      grid.appendChild(wdEl);
    });

    // Get first day of month and days in month
    const firstDay    = new Date(currentYear, m, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(currentYear, m + 1, 0).getDate();

    // Empty cells before first day
    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement("div");
      empty.className = "day empty";
      grid.appendChild(empty);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, m, d);
      date.setHours(0, 0, 0, 0);

      const dateStr  = date.toISOString().split("T")[0];
      const isToday  = date.getTime() === today.getTime();
      const isFuture = date > today;

      const dayEl = document.createElement("div");
      dayEl.className = "day";
      dayEl.textContent = d;

      // Apply workout color if session exists
      const session = sessions[dateStr];
      if (session && session.workout) {
        const cls = WORKOUT_CLASS[session.workout];
        if (cls) dayEl.classList.add(cls);
      }

      if (isFuture) dayEl.classList.add("future");
      if (isToday)  dayEl.classList.add("today");

      // Tooltip
      if (session) {
        dayEl.title = `${dateStr} — ${session.workout}${
          session.duration ? " (" + session.duration + "min)" : ""
        }`;
      } else {
        dayEl.title = dateStr;
      }

      grid.appendChild(dayEl);
    }

    monthBlock.appendChild(grid);
    dom.calendarSection.appendChild(monthBlock);
  }
}

// ─────────────────────────────────────────
// Helper
// ─────────────────────────────────────────

function setMsg(text, type) {
  dom.msg.textContent = text;
  dom.msg.className = "msg " + type;
}

// ─────────────────────────────────────────
// Start
// ─────────────────────────────────────────

init();
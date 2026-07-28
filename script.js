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
let currentMode = "simple"; // "simple" or "detailed"

const WORKOUT_CLASS = {
  Push:   "push",
  Pull:   "pull",
  Legs:   "legs",
  Abs: "Abs",
  Full:   "full",
  Rest:   "rest",
};

// Get date as YYYY-MM-DD in LOCAL timezone
function getLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  legend:          document.getElementById("legend"),
};

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────

function init() {
  // Load saved mode preference
  const savedMode = localStorage.getItem("gymstreak_mode") || "simple";
  currentMode = savedMode;
  applyMode();

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
// Mode switching
// ─────────────────────────────────────────

function switchMode(mode) {
  currentMode = mode;
  localStorage.setItem("gymstreak_mode", mode);
  applyMode();
  renderLegend();
}

function applyMode() {
  // Toggle body class
  document.body.classList.remove("mode-simple", "mode-detailed");
  document.body.classList.add(`mode-${currentMode}`);

  // Toggle active button
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });

  renderLegend();
}

// ─────────────────────────────────────────
// Legend — different per mode
// ─────────────────────────────────────────

function renderLegend() {
  if (currentMode === "simple") {
    dom.legend.innerHTML = `
      <span><i class="dot gym"></i> Gym Day</span>
      <span><i class="dot rest"></i> Rest Day</span>
    `;
  } else {
    dom.legend.innerHTML = `
      <span><i class="dot push"></i> Push</span>
      <span><i class="dot pull"></i> Pull</span>
      <span><i class="dot legs"></i> Legs</span>
      <span><i class="dot Abs"></i> Abs</span>
      <span><i class="dot full"></i> Full Body</span>
      <span><i class="dot rest"></i> Rest</span>
    `;
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
// Load data
// ─────────────────────────────────────────

async function loadData() {
  setMsg("Loading...", "wait");

  try {
    const token = localStorage.getItem("gymstreak_trigger_token");

    const headers = {
      Accept: "application/vnd.github+json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(
      `https://api.github.com/gists/${CONFIG.gistId}`,
      { headers }
    );

    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);

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

  const today    = getLocalDateStr(new Date());
  const password = localStorage.getItem("gymstreak_password");
  const token    = localStorage.getItem("gymstreak_trigger_token");

  if (!token) {
    setMsg("Token missing. Reset and re-setup.", "err");
    return;
  }

  dom.saveBtn.disabled = true;


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
            notes:     "",
            password:  password,
          },
        }),
      }
    );

    if (res.status === 204) {
     

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
// Render
// ─────────────────────────────────────────

function render() {
  dom.streak.textContent = stats.currentStreak || 0;
  dom.total.textContent  = stats.totalSessions || 0;
  renderCalendar();
}

// ─────────────────────────────────────────
// Calendar — from current month to Dec 2027
// ─────────────────────────────────────────

function renderCalendar() {
  dom.calendarSection.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentYear  = today.getFullYear();
  const currentMonth = today.getMonth();

  const monthNames = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  const monthsToShow = [];
  let year  = currentYear;
  let month = currentMonth;

  while (year < 2028) {
    monthsToShow.push({ year, month });
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  monthsToShow.forEach(({ year, month }) => {
    const monthBlock = document.createElement("div");
    monthBlock.className = "month-block";

    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = `${monthNames[month]} ${year}`;
    monthBlock.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "month-grid";

    weekdays.forEach((wd) => {
      const wdEl = document.createElement("div");
      wdEl.className = "weekday";
      wdEl.textContent = wd;
      grid.appendChild(wdEl);
    });

    const firstDay     = new Date(year, month, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth  = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement("div");
      empty.className = "day empty";
      grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);

      const dateStr    = getLocalDateStr(date);
      const isToday    = date.getTime() === today.getTime();
      const isFuture   = date > today;
      const isSaturday = date.getDay() === 6;

      const dayEl = document.createElement("div");
      dayEl.className = "day";
      dayEl.textContent = d;

      const session = sessions[dateStr];
      if (session && session.workout) {
        const cls = WORKOUT_CLASS[session.workout];
        if (cls) dayEl.classList.add(cls);
      } else if (isSaturday && !isFuture) {
        dayEl.classList.add("rest");
      }

      if (isFuture) dayEl.classList.add("future");
      if (isToday)  dayEl.classList.add("today");

      if (session) {
        dayEl.title = `${dateStr} — ${session.workout}${
          session.duration ? " (" + session.duration + "min)" : ""
        }`;
      } else if (isSaturday) {
        dayEl.title = `${dateStr} — Rest Day (auto)`;
      } else {
        dayEl.title = dateStr;
      }

      grid.appendChild(dayEl);
    }

    monthBlock.appendChild(grid);
    dom.calendarSection.appendChild(monthBlock);
  });
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

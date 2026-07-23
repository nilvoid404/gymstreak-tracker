// ─────────────────────────────────────────
// Config — fill in your details
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

// ─────────────────────────────────────────
// DOM
// ─────────────────────────────────────────

const dom = {
  setup:       document.getElementById("setup"),
  app:         document.getElementById("app"),
  passwordInput: document.getElementById("passwordInput"),
  streak:      document.getElementById("streak"),
  total:       document.getElementById("total"),
  workoutType: document.getElementById("workoutType"),
  duration:    document.getElementById("duration"),
  saveBtn:     document.getElementById("saveBtn"),
  msg:         document.getElementById("msg"),
  calendar:    document.getElementById("calendar"),
};

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────

function init() {
  const password = localStorage.getItem("gymstreak_password");

  if (password) {
    dom.setup.classList.add("hidden");
    dom.app.classList.remove("hidden");
    loadData();
  } else {
    dom.setup.classList.remove("hidden");
    dom.app.classList.add("hidden");
  }
}

// ─────────────────────────────────────────
// Password
// ─────────────────────────────────────────

function savePassword() {
  const pw = dom.passwordInput.value.trim();
  if (!pw) return;

  localStorage.setItem("gymstreak_password", pw);
  dom.setup.classList.add("hidden");
  dom.app.classList.remove("hidden");
  loadData();
}

// ─────────────────────────────────────────
// Load data from Gist (public, no token)
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
      stats = data.stats || stats;
    }

    render();
    setMsg("", "");
  } catch (err) {
    console.error(err);
    setMsg("Failed to load data", "err");
  }
}

// ─────────────────────────────────────────
// Save workout — triggers GitHub Action
// ─────────────────────────────────────────

async function saveWorkout() {
  const workout = dom.workoutType.value;
  if (!workout) {
    setMsg("Pick a workout type", "err");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const password = localStorage.getItem("gymstreak_password");
  const token = localStorage.getItem("gymstreak_trigger_token");

  if (!token) {
    setMsg("Trigger token missing. Check setup.", "err");
    return;
  }

  // Disable button while saving
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
      setMsg("✅ Saved! Updating in ~20 seconds...", "ok");

      // Optimistic update — show green immediately
      sessions[today] = {
        went: workout !== "Rest",
        workout: workout,
        duration: parseInt(dom.duration.value) || 0,
      };
      render();

      // Reload actual data after Action finishes
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
  // Stats
  dom.streak.textContent = stats.currentStreak || 0;
  dom.total.textContent  = stats.totalSessions || 0;

  // Calendar
  renderCalendar();
}

function renderCalendar() {
  dom.calendar.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start 364 days ago, align to Sunday
  const start = new Date(today);
  start.setDate(today.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  for (let i = 0; i < 371; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dateStr  = date.toISOString().split("T")[0];
    const isToday  = date.getTime() === today.getTime();
    const isFuture = date > today;

    const div = document.createElement("div");
    div.classList.add("day");

    if (isFuture) {
      div.classList.add("future");
    } else {
      const session = sessions[dateStr];

      if (session) {
        if (session.workout === "Rest") {
          div.classList.add("rest");
        } else if (session.went) {
          div.classList.add("green");
        }
      }
    }

    if (isToday) div.classList.add("today");

    // Simple title tooltip (native browser tooltip)
    if (!isFuture) {
      const session = sessions[dateStr];
      if (session) {
        div.title = `${dateStr} — ${session.workout}${session.duration ? " (" + session.duration + "min)" : ""}`;
      } else {
        div.title = dateStr;
      }
    }

    dom.calendar.appendChild(div);
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
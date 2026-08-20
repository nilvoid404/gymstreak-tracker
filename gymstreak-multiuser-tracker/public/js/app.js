(() => {
  const stage = document.getElementById("stage");
  const tabbar = document.getElementById("tabbar");
  const toastEl = document.getElementById("toast");

  const WORKOUTS = ["Push", "Pull", "Legs", "Abs", "Full", "Rest"];
  const WORKOUT_CLASS = {
    Push: "push",
    Pull: "pull",
    Legs: "legs",
    Abs: "abs",
    Full: "full",
    Rest: "rest",
  };

  const state = {
    user: null,
    sessions: {},
    stats: emptyStats(),
    bros: [],
    viewing: null,
    selectedDate: null,
    screen: "welcome",
    config: { inviteRequired: true },
    installEvent: null,
  };

  let toastTimer = null;

  function emptyStats() {
    return { totalSessions: 0, currentStreak: 0, longestStreak: 0, totalMinutes: 0 };
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, type) {
    toastEl.textContent = message;
    toastEl.className = "toast " + (type || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2400);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function hours(stats) {
    return Math.round((stats.totalMinutes || 0) / 60);
  }

  function initial(name) {
    return String(name || "?").trim().charAt(0).toUpperCase();
  }

  function go(screen) {
    state.screen = screen;
    if (screen !== "bro" && screen !== "calendar") state.viewing = null;
    location.hash = "/" + screen;
    render();
  }

  function screenFromHash() {
    const raw = (location.hash || "#/welcome").replace(/^#\/?/, "");
    return raw.split("/")[0] || "welcome";
  }

  window.addEventListener("hashchange", () => {
    state.screen = screenFromHash();
    render();
  });

  tabbar.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-go]");
    if (btn) go(btn.dataset.go);
  });

  async function refreshMine() {
    const data = await api("/api/me/workouts?today=" + todayStr());
    state.sessions = data.sessions || {};
    state.stats = data.stats || emptyStats();
  }

  async function boot() {
    try {
      state.config = await api("/api/config");
    } catch (err) {
      state.config = { inviteRequired: true };
    }

    try {
      const me = await api("/api/me");
      state.user = me.user;
      await refreshMine();
      const start = ["welcome", "login", "register"].includes(screenFromHash())
        ? "home"
        : screenFromHash();
      go(start);
    } catch (err) {
      state.user = null;
      go(screenFromHash() === "register" ? "register" : "welcome");
    }
  }

  function render() {
    const authed = Boolean(state.user);
    const authScreens = ["welcome", "login", "register"];
    const screen = state.screen;

    tabbar.classList.toggle("hidden", !authed || authScreens.includes(screen) || screen === "bro");
    stage.classList.toggle("auth", !authed || authScreens.includes(screen));

    tabbar.querySelectorAll("[data-go]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.go === screen);
    });

    if (!authed && !authScreens.includes(screen)) {
      stage.innerHTML = welcomeView();
      bindAuth();
      return;
    }

    const views = {
      welcome: welcomeView,
      login: loginView,
      register: registerView,
      home: homeView,
      log: logView,
      calendar: calendarView,
      bros: brosView,
      bro: broView,
      you: youView,
    };

    stage.innerHTML = (views[screen] || homeView)();
    bindScreen(screen);
  }

  function welcomeView() {
    return `
      <img class="hero-mark" src="/icons/icon-192.png" alt="GymStreak" />
      <h1 class="auth-title">GymStreak</h1>
      <p class="auth-lead">Your workouts. Your bros. One board for the whole crew.</p>
      <div class="stack">
        <button class="btn primary" data-go="login">Log in</button>
        <button class="btn ghost" data-go="register">Create account</button>
      </div>
    `;
  }

  function loginView() {
    return `
      <button class="back" data-go="welcome">← Back</button>
      <h1 class="auth-title">Welcome back</h1>
      <p class="auth-lead">Log in with your username and password.</p>
      <form class="stack" id="loginForm">
        <label class="field"><span>Username</span>
          <input name="username" autocomplete="username" required maxlength="20" />
        </label>
        <label class="field"><span>Password</span>
          <div class="pw-wrap">
            <input name="password" type="password" autocomplete="current-password" required />
            <button type="button" class="pw-toggle" data-toggle>Show</button>
          </div>
        </label>
        <p class="form-error" id="formError"></p>
        <button class="btn primary" type="submit">Enter</button>
      </form>
      <p class="linkish">New here? <button type="button" data-go="register">Create an account</button></p>
    `;
  }

  function registerView() {
    const invite = state.config.inviteRequired
      ? `<label class="field"><span>Invite code</span>
          <input name="inviteCode" placeholder="Ask the crew" required /></label>`
      : "";
    return `
      <button class="back" data-go="welcome">← Back</button>
      <h1 class="auth-title">Join the crew</h1>
      <p class="auth-lead">Your password is encrypted on the server. Nobody can read it back — not even us.</p>
      <form class="stack" id="registerForm">
        <label class="field"><span>Username</span>
          <input name="username" autocomplete="username" required maxlength="20" placeholder="letters, numbers, _" />
        </label>
        <label class="field"><span>Display name</span>
          <input name="displayName" maxlength="24" placeholder="What bros see" />
        </label>
        <label class="field"><span>Password</span>
          <div class="pw-wrap">
            <input name="password" type="password" autocomplete="new-password" required minlength="8" />
            <button type="button" class="pw-toggle" data-toggle>Show</button>
          </div>
        </label>
        <label class="field"><span>Confirm password</span>
          <input name="confirm" type="password" autocomplete="new-password" required minlength="8" />
        </label>
        ${invite}
        <p class="form-error" id="formError"></p>
        <button class="btn primary" type="submit">Create account</button>
      </form>
      <p class="linkish">Already in? <button type="button" data-go="login">Log in</button></p>
    `;
  }

  function homeView() {
    const name = state.user.displayName || state.user.username;
    const today = todayStr();
    const session = state.sessions[today];
    const week = last7();
    return `
      <div class="toprow">
        <div class="hello">Hey<strong>${escapeHtml(name)}</strong></div>
      </div>
      <div class="streak-card">
        <div class="streak-num">${state.stats.currentStreak || 0}</div>
        <p>day streak</p>
      </div>
      <div class="stats-grid">
        <div class="stat"><b>${state.stats.longestStreak || 0}</b><span>longest</span></div>
        <div class="stat"><b>${state.stats.totalSessions || 0}</b><span>sessions</span></div>
        <div class="stat"><b>${hours(state.stats)}</b><span>hours</span></div>
      </div>
      <div class="card">
        <h3>Today</h3>
        <div class="today-row">
          <div>${
            session
              ? `<span class="pill">${escapeHtml(session.workout)} · ${session.duration || 0} min</span>`
              : `<span style="color:var(--muted)">Not logged yet</span>`
          }</div>
          <button class="btn primary" style="width:auto;padding:10px 14px;font-size:.85rem" data-go="log">
            ${session ? "Update" : "Log it"}
          </button>
        </div>
      </div>
      <div class="card">
        <h3>Last 7 days</h3>
        <div class="week">
          ${week
            .map((day) => {
              const s = state.sessions[day.date];
              const cls = s ? (s.workout === "Rest" ? "rest" : "on") : "";
              const todayCls = day.date === today ? " today" : "";
              return `<div class="d ${cls}${todayCls}" title="${day.date}">${day.label}</div>`;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function last7() {
    const labels = ["S", "M", "T", "W", "T", "F", "S"];
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({
        date: [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-"),
        label: labels[d.getDay()],
      });
    }
    return out;
  }

  function logView() {
    const date = state.selectedDate || todayStr();
    const existing = state.sessions[date] || {};
    const chips = WORKOUTS.map((w) => {
      const on = existing.workout === w ? " active" : "";
      return `<button type="button" class="chip${on}" data-workout="${w}">${w}</button>`;
    }).join("");
    return `
      <h1 class="screen-title">Log workout</h1>
      <p class="screen-lead">Saved to your record only. Bros see the type, not your notes.</p>
      <form class="stack" id="logForm">
        <label class="field"><span>Date</span>
          <input type="date" name="date" value="${date}" max="${todayStr()}" required />
        </label>
        <div class="field"><span>Type</span>
          <div class="chips">${chips}</div>
          <input type="hidden" name="workout" value="${escapeHtml(existing.workout || "")}" />
        </div>
        <label class="field"><span>Minutes</span>
          <input type="number" name="duration" min="0" max="300" value="${existing.duration || ""}" placeholder="60" />
        </label>
        <label class="field"><span>Notes</span>
          <textarea name="notes" rows="3" maxlength="500" placeholder="How did it feel?">${escapeHtml(existing.notes || "")}</textarea>
        </label>
        <p class="form-error" id="formError"></p>
        <button class="btn primary" type="submit">${existing.workout ? "Update workout" : "Save workout"}</button>
        ${
          existing.workout
            ? `<button class="btn ghost" type="button" id="deleteWorkout">Remove this day</button>`
            : ""
        }
      </form>
    `;
  }

  function calendarView(sessions, stats, title) {
    const data = sessions || state.sessions;
    const st = stats || state.stats;
    const heading = title || "Calendar";
    return `
      ${title ? `<button class="back" data-go="bros">← Crew</button>` : ""}
      <h1 class="screen-title">${escapeHtml(heading)}</h1>
      <p class="screen-lead">${st.currentStreak || 0} day streak · ${st.totalSessions || 0} sessions</p>
      <div class="legend">
        <span><i class="dot push"></i>Push</span>
        <span><i class="dot pull"></i>Pull</span>
        <span><i class="dot legs"></i>Legs</span>
        <span><i class="dot abs"></i>Abs</span>
        <span><i class="dot full"></i>Full</span>
        <span><i class="dot rest"></i>Rest</span>
      </div>
      <div id="dayDetail"></div>
      <div id="calMount">${renderMonths(data)}</div>
    `;
  }

  function renderMonths(sessions) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = Object.keys(sessions).sort();
    let start = dates.length
      ? new Date(dates[0] + "T00:00:00")
      : new Date(today.getFullYear(), today.getMonth(), 1);
    start = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    const names = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
    let html = "";
    const cursor = new Date(start);
    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const firstWeekday = new Date(year, month, 1).getDay();
      const days = new Date(year, month + 1, 0).getDate();
      html += `<div class="month-block"><div class="month-title">${names[month]} ${year}</div><div class="month-grid">`;
      weekdays.forEach((w) => {
        html += `<div class="weekday">${w}</div>`;
      });
      for (let i = 0; i < firstWeekday; i++) html += `<div class="day empty"></div>`;
      for (let d = 1; d <= days; d++) {
        const date = new Date(year, month, d);
        date.setHours(0, 0, 0, 0);
        const iso = [
          year,
          String(month + 1).padStart(2, "0"),
          String(d).padStart(2, "0"),
        ].join("-");
        const session = sessions[iso];
        const future = date > today;
        const cls = [
          "day",
          session && WORKOUT_CLASS[session.workout] ? WORKOUT_CLASS[session.workout] : "",
          iso === todayStr() ? "today" : "",
          future ? "future" : "",
        ]
          .filter(Boolean)
          .join(" ");
        html += `<div class="${cls}" data-date="${iso}">${d}</div>`;
      }
      html += `</div></div>`;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return html;
  }

  function brosView() {
    if (!state.bros.length) {
      return `<h1 class="screen-title">Crew</h1><p class="screen-lead">Loading the board…</p>`;
    }
    const rows = state.bros
      .map((bro, i) => {
        const mine = bro.username === state.user.username ? " (you)" : "";
        return `
          <button class="bro" type="button" data-bro="${escapeHtml(bro.username)}">
            <span class="avatar">${escapeHtml(initial(bro.displayName || bro.username))}</span>
            <span class="meta">
              <b>${escapeHtml(bro.displayName || bro.username)}${mine}</b>
              <span>#${i + 1} · ${bro.stats.totalSessions || 0} sessions · ${hours(bro.stats)}h</span>
            </span>
            <span class="score">${bro.stats.currentStreak || 0}</span>
          </button>`;
      })
      .join("");
    return `
      <h1 class="screen-title">Crew</h1>
      <p class="screen-lead">Streaks on the right are live. Tap someone to see their calendar.</p>
      ${rows}
    `;
  }

  function broView() {
    const v = state.viewing;
    if (!v) return `<p class="screen-lead">Pick someone from Crew.</p>`;
    return calendarView(v.sessions, v.stats, v.user.displayName || v.user.username);
  }

  function youView() {
    const ios = isIos() && !isStandalone();
    const canInstall = Boolean(state.installEvent);
    return `
      <h1 class="screen-title">You</h1>
      <p class="screen-lead">@${escapeHtml(state.user.username)}</p>
      <div class="card">
        <label class="field"><span>Display name</span>
          <input id="displayName" value="${escapeHtml(state.user.displayName || "")}" maxlength="24" />
        </label>
        <button class="btn ghost" id="saveName" style="margin-top:10px">Save name</button>
      </div>
      <div class="install-card">
        <h3>Add to Home Screen</h3>
        <p>Install GymStreak like an app. It opens full-screen, no browser chrome.</p>
        ${
          canInstall
            ? `<button class="btn primary" id="installBtn">Install app</button>`
            : ios
              ? `<ol class="ios-steps">
                  <li>Tap the Share button in Safari</li>
                  <li>Scroll to <b>Add to Home Screen</b></li>
                  <li>Tap Add</li>
                </ol>`
              : `<p>On Android Chrome: menu → <b>Install app</b> or <b>Add to Home screen</b>.</p>`
        }
      </div>
      <p class="lock-note">Passwords are stored as a one-way bcrypt hash. The server can check a login, but it cannot decrypt your password.</p>
      <button class="btn danger" id="logoutBtn">Log out</button>
    `;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function bindAuth() {
    stage.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.go));
    });
  }

  function bindPwToggle() {
    stage.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
      });
    });
  }

  function bindScreen(screen) {
    bindAuth();
    bindPwToggle();

    if (screen === "login") {
      document.getElementById("loginForm").addEventListener("submit", onLogin);
    }
    if (screen === "register") {
      document.getElementById("registerForm").addEventListener("submit", onRegister);
    }
    if (screen === "log") bindLog();
    if (screen === "calendar" || screen === "bro") {
      bindCalendar(screen === "bro" && state.viewing ? state.viewing.sessions : state.sessions);
    }
    if (screen === "bros") {
      loadBros();
      stage.querySelectorAll("[data-bro]").forEach((btn) => {
        btn.addEventListener("click", () => openBro(btn.dataset.bro));
      });
    }
    if (screen === "you") {
      document.getElementById("logoutBtn").addEventListener("click", onLogout);
      document.getElementById("saveName").addEventListener("click", onSaveName);
      const installBtn = document.getElementById("installBtn");
      if (installBtn) installBtn.addEventListener("click", onInstall);
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    const form = event.target;
    const err = document.getElementById("formError");
    err.textContent = "";
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          username: form.username.value.trim(),
          password: form.password.value,
        },
      });
      state.user = data.user;
      await refreshMine();
      go("home");
    } catch (ex) {
      err.textContent = ex.message;
    }
  }

  async function onRegister(event) {
    event.preventDefault();
    const form = event.target;
    const err = document.getElementById("formError");
    err.textContent = "";
    if (form.password.value !== form.confirm.value) {
      err.textContent = "Passwords do not match.";
      return;
    }
    try {
      const data = await api("/api/register", {
        method: "POST",
        body: {
          username: form.username.value.trim(),
          password: form.password.value,
          displayName: form.displayName.value.trim(),
          inviteCode: form.inviteCode ? form.inviteCode.value.trim() : "",
        },
      });
      state.user = data.user;
      await refreshMine();
      go("home");
      toast("Welcome to the crew");
    } catch (ex) {
      err.textContent = ex.message;
    }
  }

  function bindLog() {
    const form = document.getElementById("logForm");
    const hidden = form.querySelector("[name=workout]");
    form.querySelectorAll("[data-workout]").forEach((chip) => {
      chip.addEventListener("click", () => {
        hidden.value = chip.dataset.workout;
        form.querySelectorAll("[data-workout]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      });
    });
    form.date.addEventListener("change", () => {
      state.selectedDate = form.date.value;
      render();
    });
    form.addEventListener("submit", onSaveWorkout);
    const del = document.getElementById("deleteWorkout");
    if (del) del.addEventListener("click", onDeleteWorkout);
  }

  async function onSaveWorkout(event) {
    event.preventDefault();
    const form = event.target;
    const err = document.getElementById("formError");
    err.textContent = "";
    const workout = form.workout.value;
    if (!workout) {
      err.textContent = "Pick a workout type.";
      return;
    }
    try {
      await api("/api/me/workouts/" + form.date.value, {
        method: "PUT",
        body: {
          workout,
          duration: form.duration.value,
          notes: form.notes.value,
        },
      });
      await refreshMine();
      state.selectedDate = form.date.value;
      toast("Saved");
      go("home");
    } catch (ex) {
      err.textContent = ex.message;
    }
  }

  async function onDeleteWorkout() {
    const form = document.getElementById("logForm");
    if (!confirm("Remove this workout?")) return;
    try {
      await api("/api/me/workouts/" + form.date.value, { method: "DELETE" });
      await refreshMine();
      toast("Removed");
      go("home");
    } catch (ex) {
      document.getElementById("formError").textContent = ex.message;
    }
  }

  function bindCalendar(sessions) {
    stage.querySelectorAll(".day[data-date]").forEach((day) => {
      day.addEventListener("click", () => {
        const date = day.dataset.date;
        if (day.classList.contains("future")) return;
        const session = sessions[date];
        const box = document.getElementById("dayDetail");
        const pretty = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        if (session) {
          box.innerHTML = `<div class="detail"><h3>${pretty}</h3><p>${escapeHtml(session.workout)}${
            session.duration ? " · " + session.duration + " min" : ""
          }</p>${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : ""}</div>`;
        } else {
          box.innerHTML = `<div class="detail"><h3>${pretty}</h3><p>No session logged.</p></div>`;
        }
        if (state.screen === "calendar") state.selectedDate = date;
      });
    });
  }

  async function loadBros() {
    try {
      const data = await api("/api/bros?today=" + todayStr());
      const same =
        state.bros.length === data.bros.length &&
        state.bros.every((b, i) => {
          const other = data.bros[i];
          return (
            b.username === other.username &&
            b.stats.currentStreak === other.stats.currentStreak &&
            b.stats.totalSessions === other.stats.totalSessions
          );
        });
      state.bros = data.bros;
      if (!same) render();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  async function openBro(username) {
    try {
      const data = await api(
        "/api/bros/" + encodeURIComponent(username) + "/workouts?today=" + todayStr()
      );
      state.viewing = data;
      go("bro");
    } catch (err) {
      toast(err.message, "err");
    }
  }

  async function onLogout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch (err) {
      /* still drop local session */
    }
    state.user = null;
    state.sessions = {};
    state.stats = emptyStats();
    go("welcome");
  }

  async function onSaveName() {
    const value = document.getElementById("displayName").value.trim();
    try {
      const data = await api("/api/me", { method: "PATCH", body: { displayName: value } });
      state.user = data.user;
      toast("Name saved");
    } catch (err) {
      toast(err.message, "err");
    }
  }

  async function onInstall() {
    if (!state.installEvent) return;
    state.installEvent.prompt();
    await state.installEvent.userChoice;
    state.installEvent = null;
    render();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installEvent = event;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  boot();
})();

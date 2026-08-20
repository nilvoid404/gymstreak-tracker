function emptyStats() {
  return {
    totalSessions: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalMinutes: 0,
  };
}

function shiftDate(dateStr, days) {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateStats(sessions, todayStr) {
  const allDates = Object.keys(sessions || {}).sort();
  const gymDates = allDates.filter((date) => sessions[date] && sessions[date].went === true);

  if (allDates.length === 0) return emptyStats();

  const totalSessions = gymDates.length;
  const gymMinutes = gymDates.reduce((sum, date) => {
    return sum + (parseInt(sessions[date].duration, 10) || 0);
  }, 0);

  let currentStreak = 0;
  const today = todayStr || allDates[allDates.length - 1];

  for (let i = 0; i <= 730; i++) {
    const dateStr = shiftDate(today, -i);
    if (sessions[dateStr]) currentStreak++;
    else if (i > 0) break;
  }

  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const date of allDates) {
    if (prevDate) {
      const prev = new Date(prevDate + "T00:00:00");
      const curr = new Date(date + "T00:00:00");
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      tempStreak = diffDays === 1 ? tempStreak + 1 : 1;
    } else {
      tempStreak = 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = date;
  }

  return { totalSessions, currentStreak, longestStreak, totalMinutes: gymMinutes };
}

module.exports = { calculateStats, emptyStats };

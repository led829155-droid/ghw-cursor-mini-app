// Pure timer and week math. No DOM. Loaded as a classic script, or via node for the self-check.
const WEEK_GOAL = 7;
const DURATIONS = { focus: 25 * 60, break: 5 * 60 };

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekDates(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function pointsForDay(state, key) {
  const tasks = state.tasksByDay[key] || [];
  const done = tasks.reduce((n, task) => n + (task.done ? 1 : 0), 0);
  return done + (state.sessionsByDay[key] || 0);
}

function weekPoints(state, date) {
  return weekDates(date).reduce((sum, day) => sum + pointsForDay(state, localDateKey(day)), 0);
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function remainingSeconds(timer, now) {
  if (!timer.running || !Number.isFinite(timer.endsAt)) return timer.remaining;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

function freshState(now) {
  return {
    seeded: true,
    tasksByDay: {
      [localDateKey(now)]: [
        { id: "seed-ship", text: "Ship the mini app", done: false },
        { id: "seed-readme", text: "Write the README", done: false },
        { id: "seed-pr", text: "Open the pull request", done: false },
      ],
    },
    sessionsByDay: {},
    timer: { mode: "focus", running: false, endsAt: null, remaining: DURATIONS.focus },
  };
}

function emptyState() {
  return {
    seeded: true,
    tasksByDay: {},
    sessionsByDay: {},
    timer: { mode: "focus", running: false, endsAt: null, remaining: DURATIONS.focus },
  };
}

const FocusLogic = {
  WEEK_GOAL,
  DURATIONS,
  localDateKey,
  weekDates,
  pointsForDay,
  weekPoints,
  formatClock,
  remainingSeconds,
  freshState,
  emptyState,
};

globalThis.FocusLogic = FocusLogic;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function selfCheck() {
  const monday = new Date(2026, 10, 9, 15, 0, 0);
  assert(monday.getDay() === 1, "fixture is Monday");
  assert(localDateKey(monday) === "2026-11-09", "local key");
  const days = weekDates(monday);
  assert(localDateKey(days[0]) === "2026-11-09", "week starts Monday");
  assert(localDateKey(days[6]) === "2026-11-15", "week ends Sunday");
  const sunday = new Date(2026, 10, 15, 23, 30);
  assert(localDateKey(weekDates(sunday)[0]) === "2026-11-09", "Sunday stays in this week");
  const state = freshState(monday);
  state.tasksByDay["2026-11-09"][0].done = true;
  state.sessionsByDay["2026-11-10"] = 2;
  assert(pointsForDay(state, "2026-11-09") === 1, "task point");
  assert(pointsForDay(state, "2026-11-10") === 2, "session points");
  assert(pointsForDay(state, "2026-11-11") === 0, "empty day");
  assert(weekPoints(state, monday) === 3, "week sum");
  assert(formatClock(0) === "00:00", "zero");
  assert(formatClock(25 * 60) === "25:00", "focus length");
  assert(formatClock(65) === "01:05", "mixed");
  assert(remainingSeconds({ running: true, endsAt: 10_000, remaining: 25 }, 7_500) === 3, "ceil");
  assert(remainingSeconds({ running: true, endsAt: 10_000, remaining: 25 }, 20_000) === 0, "clamp");
  assert(remainingSeconds({ running: false, endsAt: 10_000, remaining: 40 }, 0) === 40, "paused");
  console.log("logic self-check ok");
}

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("logic.js")) {
  selfCheck();
}

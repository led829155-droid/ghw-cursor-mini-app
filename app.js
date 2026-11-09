// logic.js is a classic script, so its functions and constants are already in this page's scope.
const KEY = "hack-week-focus-board";

const clock = document.querySelector("#clock");
const status = document.querySelector("#status");
const toggle = document.querySelector("#toggle");
const resetBtn = document.querySelector("#reset");
const slice = document.querySelector("#slice");
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const form = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskList = document.querySelector("#task-list");
const empty = document.querySelector("#empty");
const taskCount = document.querySelector("#task-count");
const days = document.querySelector("#days");
const weekProgress = document.querySelector("#week-progress");
const weekDetail = document.querySelector("#week-detail");
const todayLabel = document.querySelector("#today");
const clearBtn = document.querySelector("#clear");

let state = load();
let tickId = 0;
let endId = 0;
let audioCtx = null;

function sanitizeTasks(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, list] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(list)) continue;
    out[key] = list
      .filter((task) => task && typeof task.id === "string" && typeof task.text === "string")
      .slice(0, 50)
      .map((task) => ({ id: task.id.slice(0, 80), text: task.text.slice(0, 140), done: Boolean(task.done) }));
  }
  return out;
}

function sanitizeSessions(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, count] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(count)) continue;
    out[key] = Math.min(99, Math.max(0, Math.floor(count)));
  }
  return out;
}

function sanitize(data) {
  const timer = data && data.timer ? data.timer : {};
  const mode = timer.mode === "break" ? "break" : "focus";
  const remaining = Number.isFinite(timer.remaining)
    ? Math.min(DURATIONS[mode], Math.max(0, Math.floor(timer.remaining)))
    : DURATIONS[mode];
  const running = Boolean(timer.running) && Number.isFinite(timer.endsAt);
  return {
    seeded: true,
    tasksByDay: sanitizeTasks(data && data.tasksByDay),
    sessionsByDay: sanitizeSessions(data && data.sessionsByDay),
    timer: { mode, running, endsAt: running ? timer.endsAt : null, remaining },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState(new Date());
    return sanitize(JSON.parse(raw));
  } catch {
    return freshState(new Date());
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function todayKey() {
  return localDateKey(new Date());
}

function tasksToday() {
  return state.tasksByDay[todayKey()] || [];
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function say(message) {
  status.textContent = message;
}

function unlockAudio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = audioCtx || new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [523, 784].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.22 + i * 0.12);
    });
  } catch {
    // A blocked audio device should not stop the timer.
  }
}

// ponytail: a tab closed across the end of a block counts that one block, not a chain. Replay intervals if auto-continue is added.
function finishIfDue(now) {
  if (!state.timer.running || state.timer.endsAt > now) return "";
  const finished = state.timer.mode;
  if (finished === "focus") {
    const key = todayKey();
    state.sessionsByDay[key] = (state.sessionsByDay[key] || 0) + 1;
  }
  const next = finished === "focus" ? "break" : "focus";
  state.timer = { mode: next, running: false, endsAt: null, remaining: DURATIONS[next] };
  return finished;
}

function arm() {
  clearInterval(tickId);
  clearTimeout(endId);
  if (!state.timer.running) return;
  tickId = setInterval(renderClock, 250);
  endId = setTimeout(onMaybeFinish, Math.max(0, state.timer.endsAt - Date.now()));
}

function onMaybeFinish() {
  const finished = finishIfDue(Date.now());
  if (!finished) return;
  save();
  beep();
  say(
    finished === "focus"
      ? "Focus block complete. Break is ready when you are."
      : "Break complete. Ready for another focus block.",
  );
  render();
}

function renderClock() {
  const left = remainingSeconds(state.timer, Date.now());
  const total = DURATIONS[state.timer.mode];
  clock.textContent = formatClock(left);
  clock.setAttribute("aria-valuemin", "0");
  clock.setAttribute("aria-valuemax", String(total));
  clock.setAttribute("aria-valuenow", String(left));
  clock.setAttribute("aria-valuetext", `${Math.floor(left / 60)} minutes ${left % 60} seconds remaining`);
  slice.max = total;
  slice.value = total - left;
  const running = state.timer.running;
  toggle.textContent = running ? "Pause" : "Start";
  toggle.setAttribute("aria-pressed", String(running));
  const title = running ? `${formatClock(left)} · Hack Week Focus Board` : "Hack Week Focus Board";
  if (document.title !== title) document.title = title;
}

function syncModes() {
  for (const input of modeInputs) {
    const on = input.value === state.timer.mode;
    if (input.checked !== on) input.checked = on;
  }
}

function renderTasks() {
  const list = tasksToday();
  taskList.replaceChildren();
  empty.hidden = list.length > 0;
  const done = list.filter((task) => task.done).length;
  taskCount.textContent = list.length ? `${done} of ${list.length} done` : "Nothing checked off yet";
  list.forEach((task, index) => {
    const li = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");
    const remove = document.createElement("button");
    input.type = "checkbox";
    input.className = "task-check";
    input.id = `task-${index}-${task.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    input.checked = task.done;
    text.textContent = task.text;
    if (task.done) text.className = "done";
    label.htmlFor = input.id;
    label.append(input, text);
    remove.type = "button";
    remove.className = "text";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${task.text}`);
    input.addEventListener("change", () => {
      task.done = input.checked;
      text.classList.toggle("done", task.done);
      const listNow = tasksToday();
      const doneNow = listNow.filter((item) => item.done).length;
      taskCount.textContent = `${doneNow} of ${listNow.length} done`;
      save();
      renderWeek();
    });
    remove.addEventListener("click", () => {
      state.tasksByDay[todayKey()] = tasksToday().filter((item) => item.id !== task.id);
      save();
      renderTasks();
      renderWeek();
      say(`Removed “${task.text}”.`);
    });
    li.className = "row";
    li.append(label, remove);
    taskList.append(li);
  });
}

function renderWeek() {
  const now = new Date();
  const today = localDateKey(now);
  const points = weekPoints(state, now);
  weekProgress.max = WEEK_GOAL;
  weekProgress.value = Math.min(points, WEEK_GOAL);
  weekDetail.textContent =
    points >= WEEK_GOAL
      ? `${points} points this week. Goal of ${WEEK_GOAL} met.`
      : `${points} of ${WEEK_GOAL} points this week.`;
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const full = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
  days.replaceChildren();
  for (const day of weekDates(now)) {
    const key = localDateKey(day);
    const pts = pointsForDay(state, key);
    const li = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("span");
    name.className = "dow";
    name.textContent = weekday.format(day);
    score.className = "pts";
    score.textContent = String(pts);
    if (key === today) li.setAttribute("aria-current", "date");
    li.setAttribute("aria-label", `${full.format(day)}, ${pts} ${pts === 1 ? "point" : "points"}`);
    li.append(name, score);
    days.append(li);
  }
}

function render() {
  syncModes();
  renderClock();
  renderTasks();
  renderWeek();
  arm();
}

todayLabel.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

toggle.addEventListener("click", () => {
  unlockAudio();
  if (state.timer.running) {
    state.timer.remaining = remainingSeconds(state.timer, Date.now());
    state.timer.running = false;
    state.timer.endsAt = null;
    say("Paused.");
  } else {
    if (state.timer.remaining <= 0) state.timer.remaining = DURATIONS[state.timer.mode];
    state.timer.endsAt = Date.now() + state.timer.remaining * 1000;
    state.timer.running = true;
    say(state.timer.mode === "focus" ? "Focus block started." : "Break started.");
  }
  save();
  render();
});

resetBtn.addEventListener("click", () => {
  state.timer.running = false;
  state.timer.endsAt = null;
  state.timer.remaining = DURATIONS[state.timer.mode];
  save();
  say("Timer reset.");
  render();
});

for (const input of modeInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    const mode = input.value === "break" ? "break" : "focus";
    state.timer = { mode, running: false, endsAt: null, remaining: DURATIONS[mode] };
    save();
    say(mode === "focus" ? "Ready for a 25 minute focus block." : "Ready for a 5 minute break.");
    render();
  });
}

taskInput.addEventListener("input", () => taskInput.setCustomValidity(""));

form.addEventListener("submit", (event) => {
  const text = taskInput.value.trim().slice(0, 140);
  if (!text) {
    taskInput.setCustomValidity("Add a few words first.");
    taskInput.reportValidity();
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const key = todayKey();
  const list = state.tasksByDay[key] || (state.tasksByDay[key] = []);
  list.push({ id: uid(), text, done: false });
  taskInput.value = "";
  save();
  renderTasks();
  say(`Added “${text}”.`);
  taskInput.focus();
});

clearBtn.addEventListener("click", () => {
  const ok = confirm("Clear tasks, focus blocks, and the timer saved in this browser?");
  if (!ok) return;
  state = emptyState();
  save();
  say("Saved data cleared. Nothing leaves this browser.");
  render();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  onMaybeFinish();
  renderClock();
  arm();
});

save();
const pending = finishIfDue(Date.now());
if (pending) {
  save();
  say(
    pending === "focus"
      ? "Focus block finished while this tab was closed. Break is ready."
      : "Break finished while this tab was closed. Ready to focus.",
  );
} else if (state.timer.running) {
  say(state.timer.mode === "focus" ? "Focus block in progress." : "Break in progress.");
} else if (state.timer.mode === "break") {
  say("Ready for a 5 minute break.");
}
render();

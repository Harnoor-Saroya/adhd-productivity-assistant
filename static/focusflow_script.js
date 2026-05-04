/* ═══════════════════════════════════════════════════
   FocusFlow — ADHD Productivity Assistant
   Frontend JavaScript
═══════════════════════════════════════════════════ */

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────
const state = {
  tasks: [],
  filter: "all",
  timer: {
    duration: 25 * 60,  // seconds
    remaining: 25 * 60,
    running: false,
    interval: null,
    focusTaskId: null,
    focusTaskTitle: "Select a task →",
    isBreak: false,
  }
};

// ──────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadTasks();
  loadProgress();
  
  // Allow pressing Enter in task input
  document.getElementById("taskInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });
});

// ──────────────────────────────────────────────
// TASKS: ADD
// ──────────────────────────────────────────────
async function addTask() {
  const input     = document.getElementById("taskInput");
  const priority  = document.getElementById("taskPriority");
  const tag       = document.getElementById("taskTag");
  const mins      = document.getElementById("taskMins");
  const btn       = document.getElementById("addTaskBtn");

  const title = input.value.trim();
  if (!title) { shakeElement(input); return; }

  btn.classList.add("loading");
  btn.querySelector("span").textContent = "Adding...";

  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        priority:           parseInt(priority.value),
        tag:                tag.value,
        estimated_minutes:  parseInt(mins.value) || 25,
      })
    });
    const data = await res.json();
    
    if (res.ok) {
      state.tasks.unshift(data.task);
      renderTasks();
      input.value = "";
      showToast(data.message || "Task added! 🎯");
      loadProgress();
    } else {
      showToast("Error: " + data.error, "error");
    }
  } catch (err) {
    showToast("Network error. Is Flask running?", "error");
  } finally {
    btn.classList.remove("loading");
    btn.querySelector("span").textContent = "+ Add Task";
  }
}

// ──────────────────────────────────────────────
// TASKS: LOAD FROM BACKEND
// ──────────────────────────────────────────────
async function loadTasks() {
  try {
    const res  = await fetch("/api/tasks");
    const data = await res.json();
    state.tasks = data.tasks || [];
    renderTasks();
  } catch (err) {
    console.error("Could not load tasks:", err);
  }
}

// ──────────────────────────────────────────────
// TASKS: RENDER
// ──────────────────────────────────────────────
function renderTasks() {
  const list      = document.getElementById("taskList");
  const emptyState = document.getElementById("emptyState");
  const template  = document.getElementById("taskTemplate");

  // Filter
  let filtered = state.tasks;
  if (state.filter === "pending")   filtered = state.tasks.filter(t => !t.completed);
  else if (state.filter === "done") filtered = state.tasks.filter(t =>  t.completed);

  // Clear existing cards (but keep emptyState)
  Array.from(list.querySelectorAll(".task-card")).forEach(c => c.remove());

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach(task => {
    const clone = template.content.cloneNode(true);
    const card  = clone.querySelector(".task-card");

    card.dataset.id    = task.id;
    card.dataset.title = task.title;

    // Priority class
    const pClass = task.priority === 3 ? "high" : task.priority === 2 ? "medium" : "low";
    card.classList.add(`${pClass}-priority`);
    if (task.completed) card.classList.add("completed");

    card.querySelector(".task-title-text").textContent  = task.title;
    card.querySelector(".task-mins").textContent        = task.estimated_minutes || 25;

    const priorityLabels = { 1: "🟢 Low", 2: "🟡 Medium", 3: "🔴 High" };
    const tagLabels = {
      study: "📚 Study", work: "💼 Work",
      personal: "🏠 Personal", health: "🏃 Health", general: "📌 General"
    };
    card.querySelector(".badge-priority").textContent = priorityLabels[task.priority] || "🟡 Medium";
    card.querySelector(".badge-tag").textContent      = tagLabels[task.tag] || "📌 General";

    // Completed check
    if (task.completed) {
      const checkBtn = card.querySelector(".task-check");
      checkBtn.style.background     = "var(--green)";
      checkBtn.style.borderColor    = "var(--green)";
      checkBtn.style.color          = "#fff";
    }

    // Inline steps (if previously fetched)
    if (task.steps && task.steps.length > 0) {
      renderInlineSteps(card, task.steps);
    }

    list.appendChild(clone);
  });
}

// ──────────────────────────────────────────────
// TASKS: COMPLETE
// ──────────────────────────────────────────────
async function completeTask(btn) {
  const card   = btn.closest(".task-card");
  const taskId = card.dataset.id;

  try {
    const res  = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      const task = state.tasks.find(t => t.id === taskId);
      if (task) task.completed = true;
      renderTasks();
      showToast(data.message);
      loadProgress();
    }
  } catch (err) {
    showToast("Could not update task.", "error");
  }
}

// ──────────────────────────────────────────────
// TASKS: DELETE
// ──────────────────────────────────────────────
async function deleteTask(btn) {
  const card   = btn.closest(".task-card");
  const taskId = card.dataset.id;

  card.style.opacity   = "0";
  card.style.transform = "translateX(20px)";
  card.style.transition = "all 0.2s ease";

  try {
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      setTimeout(() => renderTasks(), 200);
    }
  } catch (err) {
    card.style.opacity   = "1";
    card.style.transform = "none";
    showToast("Could not delete task.", "error");
  }
}

// ──────────────────────────────────────────────
// TASKS: FILTER
// ──────────────────────────────────────────────
function filterTasks(filter, btn) {
  state.filter = filter;
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderTasks();
}

// ──────────────────────────────────────────────
// AI: BREAK DOWN TASK
// ──────────────────────────────────────────────
async function breakDownTask(btn) {
  const card      = btn.closest(".task-card");
  const taskId    = card.dataset.id;
  const taskTitle = card.dataset.title;

  btn.classList.add("loading");
  btn.textContent = "⏳";

  // Show skeleton in side panel
  showStepsSkeleton(taskTitle);

  try {
    const res  = await fetch("/api/break-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: taskTitle, task_id: taskId })
    });
    const data = await res.json();

    if (res.ok) {
      // Update state
      const task = state.tasks.find(t => t.id === taskId);
      if (task) task.steps = data.steps;

      // Render in side panel
      renderSideSteps(data, taskTitle);

      // Render inline on card
      renderInlineSteps(card, data.steps);

      showToast("Steps ready! Let's go 🚀");
    } else {
      showToast("AI error: " + data.error, "error");
      clearStepsPanel();
    }
  } catch (err) {
    showToast("AI service unavailable.", "error");
    clearStepsPanel();
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "🤖 Break";
  }
}

function renderInlineSteps(card, steps) {
  const inlineDiv = card.querySelector(".task-steps-inline");
  const html = `<ul class="steps-list">
    ${steps.map((s, i) => `
      <li class="step-item">
        <span class="step-num">${i + 1}</span>
        <span>${s}</span>
      </li>`).join("")}
  </ul>`;
  inlineDiv.innerHTML = html;
  inlineDiv.classList.remove("hidden");
}

function renderSideSteps(data, taskTitle) {
  const panel = document.getElementById("stepsContent");
  panel.innerHTML = `
    <div style="margin-bottom:0.8rem; font-size:0.82rem; color:var(--text-3);">
      Breakdown for: <strong style="color:var(--text)">${escapeHtml(taskTitle)}</strong>
    </div>
    <ul class="ai-steps-list">
      ${data.steps.map((s, i) => `
        <li class="ai-step-item">
          <span class="ai-step-num">${i + 1}</span>
          <span>${escapeHtml(s)}</span>
        </li>`).join("")}
    </ul>
    <div class="ai-step-meta">
      <span class="meta-chip">⏱ ~${data.estimated_minutes || 25} min</span>
      <span class="meta-chip">📊 ${capitalize(data.difficulty || "medium")}</span>
    </div>
    ${data.encouragement ? `
      <div class="ai-step-encouragement">
        💬 ${escapeHtml(data.encouragement)}
      </div>` : ""}
  `;
  document.querySelector(".steps-subtitle").textContent = "AI-generated micro-steps";
}

function showStepsSkeleton(title) {
  document.getElementById("stepsContent").innerHTML = `
    <div style="font-size:0.82rem;color:var(--text-3);margin-bottom:0.8rem;">
      Breaking down: <strong style="color:var(--text)">${escapeHtml(title)}</strong>
    </div>
    <div class="skeleton"></div>
    <div class="skeleton" style="width:85%"></div>
    <div class="skeleton" style="width:70%"></div>
    <div class="skeleton" style="width:90%"></div>
  `;
}

function clearStepsPanel() {
  document.getElementById("stepsContent").innerHTML = `
    <div class="steps-placeholder">
      <div class="placeholder-icon">🔍</div>
      <p>Click <strong>Break Down</strong> on any task<br/>to get step-by-step guidance</p>
    </div>`;
}

// ──────────────────────────────────────────────
// AI: FOCUS TASK (set active task for timer)
// ──────────────────────────────────────────────
function focusOnTask(btn) {
  const card      = btn.closest(".task-card");
  const taskId    = card.dataset.id;
  const taskTitle = card.dataset.title;

  state.timer.focusTaskId    = taskId;
  state.timer.focusTaskTitle = taskTitle;

  document.getElementById("focusTaskName").textContent = taskTitle;

  // Scroll to timer
  document.getElementById("timerCard").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Focusing on: ${taskTitle} 🎯`);

  // Highlight active task
  document.querySelectorAll(".task-card").forEach(c => c.style.outline = "none");
  card.style.outline      = "2px solid var(--amber)";
  card.style.outlineOffset = "2px";
}

// ──────────────────────────────────────────────
// AI: "NOW WHAT SHOULD I DO?"
// ──────────────────────────────────────────────
async function suggestNext() {
  const btn    = document.getElementById("nowWhatBtn");
  const result = document.getElementById("nowWhatResult");

  btn.textContent = "⏳ Thinking...";
  btn.classList.add("loading");
  result.classList.add("hidden");

  try {
    const res  = await fetch("/api/suggest-next");
    const data = await res.json();

    if (res.ok) {
      if (!data.task && !data.recommended_task) {
        result.innerHTML = `<p>${data.message || "All done! 🎉"}</p>`;
      } else {
        result.innerHTML = `
          <p><strong>${escapeHtml(data.recommended_task)}</strong></p>
          <p>💡 ${escapeHtml(data.reason || "")}</p>
          <p>🚀 ${escapeHtml(data.start_tip || "")}</p>
          <p style="margin-top:0.4rem;font-style:italic;color:var(--green)">✨ ${escapeHtml(data.motivation || "")}</p>
        `;
      }
      result.classList.remove("hidden");
    }
  } catch (err) {
    result.innerHTML = "<p>Could not reach AI. Check your connection.</p>";
    result.classList.remove("hidden");
  } finally {
    btn.textContent = "🎯 Now what should I do?";
    btn.classList.remove("loading");
  }
}

// ──────────────────────────────────────────────
// AI: MOTIVATION
// ──────────────────────────────────────────────
document.getElementById("motivateBtn").addEventListener("click", async () => {
  const btn = document.getElementById("motivateBtn");
  btn.textContent = "⏳ Loading...";
  btn.disabled = true;

  try {
    const res  = await fetch("/api/motivate");
    const data = await res.json();

    document.getElementById("motEmoji").textContent   = data.emoji   || "💫";
    document.getElementById("motMessage").textContent = data.message || "";
    document.getElementById("motTip").textContent     = data.tip     || "";

    document.getElementById("motivationBanner").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showToast("Could not load motivation message.", "error");
  } finally {
    btn.textContent = "✨ Inspire me";
    btn.disabled = false;
  }
});

function closeBanner() {
  document.getElementById("motivationBanner").classList.add("hidden");
}

// ──────────────────────────────────────────────
// POMODORO TIMER
// ──────────────────────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 88; // r=88

function setTimerMode(minutes, btn) {
  if (state.timer.running) return; // Don't switch while running

  state.timer.duration  = minutes * 60;
  state.timer.remaining = minutes * 60;
  state.timer.isBreak   = minutes !== 25;

  document.querySelectorAll(".mode-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  updateTimerDisplay();
  updateRing(1.0);

  const ring = document.getElementById("timerRing");
  ring.classList.toggle("break", state.timer.isBreak);
  document.getElementById("timerStatus").textContent = "Ready";
}

function toggleTimer() {
  if (state.timer.running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timer.running = true;
  document.getElementById("startBtn").textContent    = "⏸ Pause";
  document.getElementById("startBtn").classList.add("running");
  document.getElementById("timerStatus").textContent = state.timer.isBreak ? "On break..." : "Focusing...";

  state.timer.interval = setInterval(() => {
    state.timer.remaining--;
    updateTimerDisplay();
    const progress = state.timer.remaining / state.timer.duration;
    updateRing(progress);

    if (state.timer.remaining <= 0) {
      timerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.timer.interval);
  state.timer.running = false;
  document.getElementById("startBtn").textContent    = "▶ Resume";
  document.getElementById("startBtn").classList.remove("running");
  document.getElementById("timerStatus").textContent = "Paused";
}

function resetTimer() {
  clearInterval(state.timer.interval);
  state.timer.running   = false;
  state.timer.remaining = state.timer.duration;
  document.getElementById("startBtn").textContent    = "▶ Start";
  document.getElementById("startBtn").classList.remove("running");
  document.getElementById("timerStatus").textContent = "Ready";
  updateTimerDisplay();
  updateRing(1.0);
}

async function timerComplete() {
  clearInterval(state.timer.interval);
  state.timer.running = false;

  document.getElementById("startBtn").textContent    = "▶ Start";
  document.getElementById("startBtn").classList.remove("running");
  document.getElementById("timerStatus").textContent = "Done! 🎉";

  // Play a subtle beep (Web Audio API)
  playBeep();

  const minutes = Math.round(state.timer.duration / 60);
  showToast(state.timer.isBreak
    ? `Break over! Ready to focus? 💪`
    : `🔥 ${minutes}-min session complete! Amazing work!`
  );

  // Log session to backend
  if (!state.timer.isBreak) {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_minutes: minutes,
          task_id:          state.timer.focusTaskId,
          task_title:       state.timer.focusTaskTitle,
          completed:        true
        })
      });
      loadProgress();
    } catch (err) {
      console.error("Could not log session:", err);
    }
  }

  // Reset for next session
  state.timer.remaining = state.timer.duration;
  updateTimerDisplay();
  updateRing(1.0);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timer.remaining / 60);
  const s = state.timer.remaining % 60;
  document.getElementById("timerDisplay").textContent =
    `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateRing(progress) {
  const offset = CIRCUMFERENCE * (1 - progress);
  document.getElementById("timerRing").style.strokeDashoffset = offset;
}

// Subtle beep using Web Audio API
function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  } catch (e) { /* Audio not available */ }
}

// ──────────────────────────────────────────────
// PROGRESS
// ──────────────────────────────────────────────
async function loadProgress() {
  try {
    const res  = await fetch("/api/progress");
    const data = await res.json();

    document.getElementById("stat-completed-num").textContent = data.completed_today || 0;
    document.getElementById("stat-focus-num").textContent     = data.focus_minutes_today || 0;
    document.getElementById("stat-pending-num").textContent   = data.pending || 0;
  } catch (err) {
    console.error("Could not load progress:", err);
  }
}

// ──────────────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────────────
let toastTimeout;
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = message;
  toast.classList.remove("hidden");
  toast.style.borderColor = type === "error" ? "var(--red)" : "var(--amber)";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function shakeElement(el) {
  el.style.animation = "none";
  el.style.borderColor = "var(--red)";
  el.style.boxShadow  = "0 0 0 3px rgba(248,113,113,0.2)";
  setTimeout(() => {
    el.style.borderColor = "";
    el.style.boxShadow  = "";
  }, 800);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str || ""));
  return d.innerHTML;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

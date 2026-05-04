# 🧠 FocusFlow — AI-Based ADHD Productivity Assistant
**Course: AI Essentials | Project: AI-Based ADHD Productivity Assistant**

---

## 📁 Folder Structure

```
adhd-assistant/
├── app.py                 ← Flask backend (all routes + AI integration)
├── requirements.txt       ← Python dependencies
├── .env                   ← API key (you create this — never commit!)
├── templates/
│   └── index.html         ← Main UI (Jinja2 template)
└── static/
    ├── style.css          ← All styling
    └── script.js          ← Frontend logic (fetch, timer, UI)
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────┐
│                  BROWSER (Client)               │
│   HTML + CSS + JS  ──→  Fetch API calls        │
└───────────────────────┬─────────────────────────┘
                        │ HTTP (JSON)
                        ▼
┌─────────────────────────────────────────────────┐
│              FLASK BACKEND (app.py)             │
│                                                 │
│  Routes:                                        │
│  GET  /                    → Serve index.html   │
│  GET  /api/tasks           → List tasks         │
│  POST /api/tasks           → Add task           │
│  POST /api/tasks/<id>/complete → Complete task  │
│  DEL  /api/tasks/<id>      → Delete task        │
│  POST /api/break-task      → AI breakdown       │
│  GET  /api/suggest-next    → AI suggestion      │
│  GET  /api/motivate        → AI motivation      │
│  POST /api/sessions        → Log focus session  │
│  GET  /api/progress        → Stats              │
└───────────────────────┬─────────────────────────┘
                        │ HTTPS (Anthropic SDK)
                        ▼
┌─────────────────────────────────────────────────┐
│           ANTHROPIC API (Claude)                │
│   Model: claude-sonnet-4-20250514              │
│   Used for:                                     │
│   • Task breakdown into micro-steps            │
│   • "Now what?" smart suggestions              │
│   • Personalized motivation messages           │
└─────────────────────────────────────────────────┘
```

---

## ⚙️ Setup & Run Locally

### Step 1: Prerequisites
```bash
python --version    # Need Python 3.9+
pip --version       # Need pip
```

### Step 2: Create project folder & virtual environment
```bash
cd adhd-assistant
python -m venv venv

# Activate — PICK YOUR OS:
# Windows (Command Prompt):
venv\Scripts\activate.bat
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Mac/Linux:
source venv/bin/activate
```

### Step 3: Install dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Set your Gemini API key
Create a `.env` file in the project root:
```
GEMINI_API_KEY=your_api_key_here
```
Or set it in your terminal:
```bash
# Windows (Command Prompt)
set GEMINI_API_KEY=your_key_here

# Windows (PowerShell)
$env:GEMINI_API_KEY="your_key_here"

# Mac/Linux
export GEMINI_API_KEY="your_key_here"
```
> Get your **free** API key from: https://aistudio.google.com/app/apikey

### Step 5: Run the app
```bash
python focusflow_app.py
```
Open browser: **http://localhost:5000**

---

## 🧪 Testing API Endpoints (curl examples)

**Add a task:**
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Study for biology exam", "priority": 3, "tag": "study"}'
```

**Break a task into AI steps:**
```bash
curl -X POST http://localhost:5000/api/break-task \
  -H "Content-Type: application/json" \
  -d '{"task": "Write a 500-word essay on climate change"}'
```

**Get AI suggestion for what to do next:**
```bash
curl http://localhost:5000/api/suggest-next
```

**Get motivation:**
```bash
curl http://localhost:5000/api/motivate
```

**Get progress stats:**
```bash
curl http://localhost:5000/api/progress
```

---

## 📡 Sample API Request / Response

### POST /api/break-task

**Request:**
```json
{
  "task": "Write my biology essay"
}
```

**Response:**
```json
{
  "steps": [
    "📖 Open your notes and textbook",
    "✍️ Write a 2-sentence intro paragraph",
    "🔍 List 3 main points to cover",
    "📝 Write one body paragraph at a time",
    "✅ Review and spell-check once done"
  ],
  "encouragement": "You've totally got this — just one step at a time!",
  "estimated_minutes": 40,
  "difficulty": "medium"
}
```

### GET /api/suggest-next

**Response:**
```json
{
  "recommended_task": "Study for biology exam",
  "reason": "Highest priority and best for morning focus.",
  "motivation": "Start with just 5 minutes — you'll get into the flow!",
  "start_tip": "Open your notes and read the first heading.",
  "task": { "id": "...", "title": "...", ... }
}
```

---

## 🧠 ADHD-Specific Design Decisions

| Design Choice | ADHD Reason |
|---|---|
| Max 6 steps per task | Prevents overwhelm from too many items |
| Short step text (≤10 words) | Easier to scan, less cognitive load |
| Emoji on every step | Visual anchors improve attention & memory |
| Pomodoro timer built-in | Time-blindness is common in ADHD; structured chunks help |
| "Now what?" button | Reduces decision paralysis |
| Encouragement messages | Dopamine support; ADHD often struggles with motivation |
| Dark, low-contrast UI | Reduces visual overstimulation |
| Single-page layout | No navigation complexity |
| Amber highlight color | Warm, non-alarming focus indicator |
| Audio beep on timer end | Helps with time blindness awareness |

---

## 🔌 How Frontend Connects to Backend

JavaScript uses the **Fetch API** to call Flask routes:

```javascript
// Example: Break down a task
const res = await fetch("/api/break-task", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ task: "Write my essay" })
});
const data = await res.json();
// data.steps → array of step strings
```

Flask serves `index.html` from `templates/` via:
```python
@app.route("/")
def index():
    return render_template("index.html")
```

Static files (CSS/JS) are served automatically by Flask from the `static/` folder and referenced in HTML as:
```html
<link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}" />
<script src="{{ url_for('static', filename='script.js') }}"></script>
```

---

## 🤖 Prompt Engineering Strategy

All AI calls use a shared `ADHD_SYSTEM_PROMPT` that enforces:
- Short steps (≤10 words)
- Action verbs at the start of every step
- Emojis for visual scannability
- 3–6 steps maximum (no overwhelm)
- Warm, encouraging tone

Task breakdown always returns **structured JSON**, not prose, so the frontend can render each step as a clean list item.

---

## 🚀 Possible Enhancements

- Replace in-memory `tasks_db` with **SQLite** via SQLAlchemy
- Add **user login** with Flask-Login
- **Daily planner** view by date
- **Streak tracking** over multiple days
- PWA support for mobile home screen install
- Voice input for hands-free task entry

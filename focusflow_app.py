"""
ADHD Productivity Assistant - Flask Backend
==========================================
AI-powered task management and focus tool for ADHD users.
Uses Google Gemini API for intelligent task breakdown and suggestions.
"""

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import google.generativeai as genai
import json
import uuid
from datetime import datetime
import os
from dotenv import load_dotenv
load_dotenv()  # Loads variables from .env into os.environ

app = Flask(__name__)
CORS(app)

# ──────────────────────────────────────────────
# Gemini Client Setup
# ──────────────────────────────────────────────
# Set your API key as an environment variable:
#   Windows:   set GEMINI_API_KEY=your-key-here
#   Mac/Linux: export GEMINI_API_KEY="your-key-here"
# Or replace os.environ.get(...) with your key string directly.
# Get your free key at: https://aistudio.google.com/app/apikey
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
gemini_model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    system_instruction="""You are an ADHD productivity coach and assistant. Your role is to help users with ADHD manage tasks, stay focused, and feel encouraged.

STRICT RULES for your responses:
1. Keep ALL steps SHORT (max 10 words each)
2. Use ACTION verbs to start every step (Open, Write, Click, Set, Read)
3. Never overwhelm — give 3 to 6 steps maximum
4. Be warm, encouraging, and non-judgmental
5. Use simple language — no jargon
6. Add ONE emoji per step to make it visually scannable
7. Always end with a brief encouragement (1 sentence)

Remember: ADHD brains need clarity, brevity, and dopamine boosts."""
)

# ──────────────────────────────────────────────
# In-Memory Storage (replace with DB in production)
# ──────────────────────────────────────────────
tasks_db = []
sessions_db = []  # Focus session history
progress_db = {"completed": 0, "total_focus_minutes": 0, "streak": 0}


# ──────────────────────────────────────────────
# ROUTES
# ──────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main HTML page."""
    return render_template("focusflow_index.html")


# ── 1. TASK MANAGEMENT ──

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Return all tasks sorted by priority."""
    sorted_tasks = sorted(tasks_db, key=lambda x: (x["completed"], -x["priority"]))
    return jsonify({"tasks": sorted_tasks, "count": len(tasks_db)})


@app.route("/api/tasks", methods=["POST"])
def add_task():
    """Add a new task to the list."""
    data = request.get_json()
    
    if not data or not data.get("title"):
        return jsonify({"error": "Task title is required"}), 400

    task = {
        "id": str(uuid.uuid4()),
        "title": data["title"],
        "priority": data.get("priority", 2),  # 1=low, 2=medium, 3=high
        "estimated_minutes": data.get("estimated_minutes", 25),
        "steps": [],
        "completed": False,
        "created_at": datetime.now().isoformat(),
        "tag": data.get("tag", "general"),
    }

    tasks_db.append(task)
    return jsonify({"task": task, "message": "Task added! You got this 🎯"}), 201


@app.route("/api/tasks/<task_id>/complete", methods=["POST"])
def complete_task(task_id):
    """Mark a task as completed."""
    for task in tasks_db:
        if task["id"] == task_id:
            task["completed"] = True
            task["completed_at"] = datetime.now().isoformat()
            progress_db["completed"] += 1
            return jsonify({
                "task": task,
                "message": "Amazing work! 🌟 Task crushed!",
                "progress": progress_db
            })
    return jsonify({"error": "Task not found"}), 404


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    """Delete a task."""
    global tasks_db
    original_count = len(tasks_db)
    tasks_db = [t for t in tasks_db if t["id"] != task_id]
    if len(tasks_db) < original_count:
        return jsonify({"message": "Task removed"})
    return jsonify({"error": "Task not found"}), 404


# ── 2. AI TASK BREAKDOWN ──

@app.route("/api/break-task", methods=["POST"])
def break_task():
    """
    Use AI to break a task into ADHD-friendly micro-steps.
    
    Request Body:
        { "task": "Write my biology essay" }
    
    Response:
        {
          "steps": ["📖 Open notes doc", "✍️ Write intro paragraph", ...],
          "encouragement": "You've got this!",
          "estimated_minutes": 25
        }
    """
    data = request.get_json()
    task_title = data.get("task", "").strip()
    
    if not task_title:
        return jsonify({"error": "Task description is required"}), 400

    prompt = f"""Break down this task for an ADHD user: "{task_title}"

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{{
  "steps": ["step 1", "step 2", "step 3"],
  "encouragement": "one short encouraging sentence",
  "estimated_minutes": <number between 10-60>,
  "difficulty": "<easy|medium|hard>"
}}

Rules:
- 3-6 steps maximum
- Each step max 10 words
- Start each step with an emoji + action verb
- estimated_minutes should be realistic"""

    try:
        response = gemini_model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Clean up if model wraps in markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        result = json.loads(response_text)
        
        # Update task steps in DB if task_id provided
        task_id = data.get("task_id")
        if task_id:
            for task in tasks_db:
                if task["id"] == task_id:
                    task["steps"] = result.get("steps", [])
                    task["estimated_minutes"] = result.get("estimated_minutes", 25)
                    break
        
        return jsonify(result)

    except json.JSONDecodeError:
        # Fallback: return raw text split into steps
        lines = [l.strip() for l in response_text.split("\n") if l.strip()]
        return jsonify({
            "steps": lines[:6],
            "encouragement": "You can do this, one step at a time! 💪",
            "estimated_minutes": 25,
            "difficulty": "medium"
        })
    except Exception as e:
        return jsonify({"error": f"AI service error: {str(e)}"}), 500


# ── 3. "NOW WHAT?" SMART SUGGESTION ──

@app.route("/api/suggest-next", methods=["GET"])
def suggest_next():
    """
    AI picks the best task to do right now based on context.
    Considers: priority, time of day, task length, completion history.
    """
    pending_tasks = [t for t in tasks_db if not t["completed"]]
    
    if not pending_tasks:
        return jsonify({
            "suggestion": None,
            "message": "🎉 All tasks complete! Take a well-deserved break.",
            "motivation": "You crushed it today! Seriously impressive."
        })

    hour = datetime.now().hour
    time_context = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
    
    task_list = "\n".join([
        f"- [{t['priority']} priority] {t['title']} (~{t['estimated_minutes']}min)"
        for t in pending_tasks[:8]  # Limit to avoid huge prompts
    ])

    prompt = f"""It's {time_context} ({hour}:00). Help an ADHD user pick ONE task to start right now.

Pending tasks:
{task_list}

Return ONLY a JSON object (no markdown):
{{
  "recommended_task": "<exact task title from the list>",
  "reason": "<one sentence, max 15 words, why this task now>",
  "motivation": "<one encouraging sentence, max 15 words>",
  "start_tip": "<one concrete first action, max 10 words>"
}}"""

    try:
        response = gemini_model.generate_content(prompt)
        response_text = response.text.strip()
        if "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
            if response_text.startswith("json"):
                response_text = response_text[4:].strip()
        
        result = json.loads(response_text)
        
        # Attach full task object
        for task in pending_tasks:
            if task["title"].lower() in result.get("recommended_task", "").lower():
                result["task"] = task
                break
        
        return jsonify(result)
    
    except Exception as e:
        # Fallback: pick highest priority task
        best_task = max(pending_tasks, key=lambda x: x["priority"])
        return jsonify({
            "task": best_task,
            "recommended_task": best_task["title"],
            "reason": "This has your highest priority right now.",
            "motivation": "Start small — just 5 minutes! 🚀",
            "start_tip": "Open it up and take one small action."
        })


# ── 4. MOTIVATION & ENCOURAGEMENT ──

@app.route("/api/motivate", methods=["GET"])
def get_motivation():
    """Return a personalized ADHD-friendly motivation message."""
    completed_today = sum(
        1 for t in tasks_db
        if t.get("completed") and
        t.get("completed_at", "")[:10] == datetime.now().strftime("%Y-%m-%d")
    )
    
    prompt = f"""Give a short, genuine motivational message for someone with ADHD.
They've completed {completed_today} tasks today.
Context: {"Great progress!" if completed_today > 2 else "Just getting started." if completed_today == 0 else "Making progress!"}

Return ONLY a JSON object:
{{
  "message": "<warm, encouraging message, 1-2 sentences max>",
  "emoji": "<1-2 relevant emojis>",
  "tip": "<one practical ADHD tip, max 15 words>"
}}"""

    try:
        response = gemini_model.generate_content(prompt)
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
            if text.startswith("json"): text = text[4:].strip()
        return jsonify(json.loads(text))
    except Exception:
        return jsonify({
            "message": "Every step counts. You're making progress even when it doesn't feel like it.",
            "emoji": "💫",
            "tip": "Try the 2-minute rule: if it takes under 2 minutes, do it now."
        })


# ── 5. FOCUS SESSION TRACKING ──

@app.route("/api/sessions", methods=["POST"])
def log_session():
    """Log a completed focus session (Pomodoro)."""
    data = request.get_json()
    session = {
        "id": str(uuid.uuid4()),
        "duration_minutes": data.get("duration_minutes", 25),
        "task_id": data.get("task_id"),
        "task_title": data.get("task_title", "Focus session"),
        "completed": data.get("completed", True),
        "timestamp": datetime.now().isoformat()
    }
    sessions_db.append(session)
    progress_db["total_focus_minutes"] += session["duration_minutes"]
    
    return jsonify({
        "session": session,
        "total_focus_minutes": progress_db["total_focus_minutes"],
        "message": f"🔥 {session['duration_minutes']} minutes of deep focus logged!"
    }), 201


@app.route("/api/progress", methods=["GET"])
def get_progress():
    """Return overall progress stats."""
    today = datetime.now().strftime("%Y-%m-%d")
    completed_today = sum(
        1 for t in tasks_db
        if t.get("completed") and t.get("completed_at", "")[:10] == today
    )
    focus_today = sum(
        s["duration_minutes"] for s in sessions_db
        if s["timestamp"][:10] == today
    )
    
    return jsonify({
        "total_tasks": len(tasks_db),
        "completed_total": progress_db["completed"],
        "completed_today": completed_today,
        "pending": len([t for t in tasks_db if not t["completed"]]),
        "total_focus_minutes": progress_db["total_focus_minutes"],
        "focus_minutes_today": focus_today,
        "sessions_count": len(sessions_db)
    })


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🧠 ADHD Productivity Assistant is running!")
    print("📍 Open: http://localhost:5000\n")
    app.run(debug=True, port=5000)

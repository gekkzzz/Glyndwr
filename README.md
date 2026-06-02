# Glyndwr — Self-Hosted AI Workspace

```text
    /\        /\
   /  \  /\  /  \
  / /\ \/  \/ /\ \
 /_/  \_\  /_/  \_\

  G L Y N D W R  v1.2
```

Named after Owain Glyndwr, the last native Prince of Wales. A fully self-hosted AI workspace
where **you choose your AI** — bring your own API keys for any provider, or run models locally.
No lock-in, no telemetry, no cloud dependency. Everything stays on your machine.

---

## What's New in v1.2

- **Multi-user auth** — auto-generates an admin password on first run, printed to the terminal
- **14 themes** — 8 new themes plus a full custom theme creator with live preview
- **Animated backgrounds** — Synapse, Rain, Stars, Sparkles, Embers
- **Image editor** — canvas-based layers, brush/eraser/fill/select, adjustments, undo/redo, gallery
- **Persistent memory** — categorised memory bank (facts, preferences, contacts, projects, goals)
- **Rebindable shortcuts** — remap any keyboard shortcut from Settings → Shortcuts
- **Mobile-first** — bottom nav bar, swipe gestures, touch-optimised throughout
- **Admin panel** — manage users, set roles, reset passwords from Settings → Admin

---

## Features

| Section | What it does |
|---------|-------------|
| **Chat** | Multi-conversation AI chat with streaming. Rename, pin, and search conversations. |
| **Agent** | Autonomous tool-use agent: web search (SearXNG), Python code execution, URL fetch. |
| **Deep Research** | Multi-step pipeline that searches, reads sources, and synthesises a structured report. |
| **Notes** | Markdown note-taking with auto-save. |
| **Tasks** | Todo list with due dates, overdue tracking, and browser push reminders. |
| **Documents** | Multi-tab editor with live split preview and AI editing (improve, summarise, expand…). |
| **Gallery** | Canvas-based image editor — multiple layers, brushes, filters, history, save to gallery. |
| **Email** | Real IMAP inbox, AI triage (urgency/category/summary), SMTP compose, unsubscribe scanner. |
| **Calendar** | Local events + CalDAV sync (Nextcloud, Apple, Fastmail, Radicale). |
| **Memory** | Persistent knowledge bank with categories and confidence ratings. |
| **Forge** | Hardware guide — detect GPU/RAM and see which open models you can run locally. |
| **Compare** | Side-by-side model comparison in a single prompt. |
| **PWA** | Installable on desktop and mobile. Push notifications built-in. |

---

## Quick Start

### First Run — Login

On the very first startup, Glyndwr automatically creates an admin account and prints the
credentials to your terminal:

```
======================================================
  GLYNDWR -- First Run Setup
======================================================
  Admin account created automatically.

  Username : admin
  Password : <randomly generated — shown once here>

  Sign in at http://localhost:7860/login
  Change credentials in Settings -> Account
======================================================
```

Open `http://localhost:7860`, sign in with those credentials, then change your username and
password in **Settings → Account**. Additional users can be created by admins in
**Settings → Admin**.

---

### Start Glyndwr

Use one of these options after cloning the repository and copying `.env.example` to
`.env`.

**Launcher script (recommended):**

- Windows:
  ```powershell
  .\launch.ps1
  ```
- macOS / Linux:
  ```bash
  ./launch.sh
  ```

These scripts create the `.venv` virtual environment if needed, install dependencies,
ensure `.env` exists, start Uvicorn, and open the browser at the configured app URL.

Both launcher files live in the repository root (`launch.ps1` and `launch.sh`). Use them when
you want a one-step startup experience instead of manually activating the venv and running
`app.py`.

**Direct Python run:**

- Windows:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  .venv\Scripts\python app.py
  ```
- macOS / Linux:
  ```bash
  source .venv/bin/activate
  .venv/bin/python app.py
  ```

If your virtual environment is already active, `python app.py` is sufficient.

### When to use each startup option

| Method | Best for |
|--------|----------|
| `.\launch.ps1` / `./launch.sh` | One-step setup and run on Windows or macOS/Linux with dependency install and browser launch |
| `.venv\Scripts\python app.py` / `.venv/bin/python app.py` | Direct launch when the virtual environment is already created and you want manual control |
| `docker compose up -d --build` | Container-based deployment or an isolated environment without local Python package install |

**Docker:**

```bash
docker compose up -d --build
```

The app is available at `http://localhost:7860` by default. Use `APP_PORT` in `.env`
if you want a different port.

---

### Windows

**Requirements:** Python 3.9+, Git

```powershell
git clone https://github.com/yourname/glyndwr.git
cd glyndwr
copy .env.example .env
notepad .env
.\launch.ps1
```

The PowerShell launcher does the heavy lifting for you: it creates the `.venv` if needed,
installs dependencies, ensures `.env` exists, starts Uvicorn, and opens your browser at
`http://localhost:7860`.

If you prefer to start the app manually after the venv is ready, use:

```powershell
.\.venv\Scripts\Activate.ps1
.venv\Scripts\python app.py
```

Press `Ctrl+C` to stop.

**Docker:**

```powershell
copy .env.example .env
notepad .env
docker compose up -d --build
```

---

### macOS / Linux

**Requirements:** Python 3.9+, Git

```bash
git clone https://github.com/yourname/glyndwr.git
cd glyndwr
cp .env.example .env
nano .env
./launch.sh
```

The shell launcher creates the `.venv` virtual environment if needed, installs dependencies,
ensures `.env` exists, starts Uvicorn, and opens your browser once the app is ready.

If you prefer to launch manually after the venv is ready, use:

```bash
source .venv/bin/activate
.venv/bin/python app.py
```

**Docker:**

```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

---

## Choosing Your AI

Glyndwr works with **any AI provider you configure**. Add keys for the ones you have access to —
you are not required to use any particular service.

| Provider | Models | Where to get a key |
|----------|--------|--------------------|
| **OpenAI** | GPT-4o, GPT-4o-mini, o1, o3 | platform.openai.com |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4 | console.anthropic.com |
| **Grok** | Llama 3.3, Mixtral, Gemma (ultra-fast) | grok-api.apidog.io |
| **Google Gemini** | Gemini 2.0 Flash, 1.5 Pro | aistudio.google.com |
| **DeepSeek** | DeepSeek Chat, Reasoner | platform.deepseek.com |
| **OpenRouter** | 200+ models via one key | openrouter.ai |
| **Ollama** | Any open model, no key needed | ollama.ai |

Add keys to `.env` or enter them live in **Settings → Providers** — no restart needed.

---

## Running Models Locally (Optional)

Local inference is entirely **optional**. You can use Glyndwr with cloud APIs only if you prefer.

### Ollama

[Ollama](https://ollama.ai) is the easiest way to run open-weight models with no API key.

```bash
# 1. Install from https://ollama.ai
# 2. Pull a model
ollama pull llama3.2        # ~2 GB, fast and capable
ollama pull mistral         # ~4.5 GB, great all-rounder
ollama pull llama3.1:8b     # ~5 GB, excellent quality

# 3. In Glyndwr: Settings → Providers → Ollama
#    Host: http://localhost:11434
```

### llama.cpp / vLLM / LM Studio

Any OpenAI-compatible server works. Set the Ollama host field to your server's address and port.

### Hardware guide

Open **Forge** in the sidebar to see model recommendations matched to your GPU and RAM.

| VRAM | What you can run |
|------|-----------------|
| < 4 GB | 1–3B models (Llama 3.2 1B/3B, Phi-4 Mini) |
| 6–8 GB | 7–8B models (Llama 3.1 8B, Mistral 7B, Gemma 2 9B) |
| 12–16 GB | 13–14B models (Qwen 2.5 14B, Gemma 3 12B) |
| 20–24 GB | 27–32B models (DeepSeek-R1 32B, Gemma 3 27B) |
| 40–48 GB | 70B frontier models (Llama 3.3 70B) |
| CPU only | Any model — expect ~2–5 tokens/sec |

---

## Configuration

Copy `.env.example` to `.env` and fill in what you need.

```env
# Add keys for any providers you want to use
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROK_API_KEY=grok_...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Optional: local Ollama (leave blank if not using)
OLLAMA_HOST=http://localhost:11434

# Server
APP_PORT=7860
APP_HOST=0.0.0.0
```

All other settings (theme, default model, email, CalDAV, etc.) are changed inside the app and
stored in the local SQLite database — no restart required.

---

## Themes

Glyndwr ships with 14 built-in themes and a full custom theme creator.

| Theme | Style |
|-------|-------|
| **Y Ddraig** | Deep red-on-black (default) — Glyndwr's dragon banner |
| **Annwn** | Dark purple — the Welsh Otherworld |
| **Eryri** | Slate blue-grey — Snowdonia |
| **Mabinogi** | Warm parchment light theme |
| **Coed** | Deep forest green |
| **Mor Cymru** | Cold Atlantic blue |
| **Midnight** | Cobalt blue-black |
| **Cyberpunk** | Neon magenta on black |
| **Retrowave** | Synthwave pink-purple |
| **Forest** | Bright green woodland |
| **Ocean** | Deep-sea blue |
| **Terminal** | Classic green-on-black |
| **Amber** | Warm amber on black |
| **Light** | Clean white |
| **Custom** | Pick any 8 colours with live preview |

Theme picker is in **Settings → Appearance**. Your choice persists across sessions.

**Animated backgrounds** (Settings → Appearance):

| Effect | Description |
|--------|-------------|
| **Synapse** | Pulsing nodes with connecting lines |
| **Rain** | Falling vertical streaks |
| **Stars** | Slowly twinkling star field |
| **Sparkles** | Appearing and fading sparkles |
| **Embers** | Rising glowing particles |

---

## Image Editor (Gallery)

The Gallery section includes a canvas-based image editor:

- **Tools** — Brush, Eraser, Move, Rectangle Select, Crop, Fill
- **Layers** — add, delete, reorder, toggle visibility, set opacity
- **Adjustments** — brightness, contrast, saturation (non-destructive via CSS filters)
- **History** — 20-step undo/redo (`Ctrl+Z` / `Ctrl+Y`)
- **Save** — stores to the local gallery (SQLite, base64 PNG)
- **Export** — download as PNG

Click **+** to create a new canvas, or click any thumbnail to reopen a saved image.

---

## User Management

Glyndwr supports multiple users. The **admin** account is created automatically on first run.

### Account settings (Settings → Account)

- Change your username and password
- Sign out

### Admin panel (Settings → Admin — admins only)

- Create new users with username and password
- Promote or demote users to/from admin
- Delete users (immediately revokes all active sessions)

Users each have their own conversations, notes, tasks, and settings. Multiple people can use the
same Glyndwr instance simultaneously.

---

## Agent Tools

The **Agent** tab runs autonomous multi-step tool loops. To enable web search, you need a
self-hosted [SearXNG](https://searxng.org) instance:

```bash
# Quick start via Docker
docker run -d -p 8080:8080 searxng/searxng

# Then in Glyndwr: Settings → Tools → SearXNG URL: http://localhost:8080
```

Code execution runs Python in a subprocess sandbox on your machine. Enable it in
**Settings → Tools → Code Execution**.

---

## Email Setup

In **Settings → Email**, configure:

- **IMAP** for reading your inbox (Gmail: `imap.gmail.com:993`)
- **SMTP** for sending (Gmail: `smtp.gmail.com:587`)

For Gmail, use an [App Password](https://myaccount.google.com/apppasswords) — not your account
password. For other providers, check their IMAP/SMTP settings page.

---

## Calendar Sync (CalDAV)

In **Settings → Calendar**, enter your CalDAV server URL to sync events from:

| Provider | URL format |
|----------|-----------|
| **Nextcloud** | `https://yourcloud.com/remote.php/dav/calendars/username/` |
| **Apple iCloud** | `https://caldav.icloud.com/` |
| **Fastmail** | `https://caldav.fastmail.com/dav/` |
| **Radicale** (self-hosted) | `http://localhost:5232/` |

---

## Keyboard Shortcuts

Default shortcuts — all rebindable in **Settings → Shortcuts**.

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Ctrl+N` | New conversation |
| `Ctrl+B` | Toggle chat sidebar |
| `Ctrl+S` | Save (note / document / settings) |
| `Ctrl+/` | Show keyboard shortcuts |
| `Ctrl+1` | Go to Chat |
| `Ctrl+2` | Go to Notes |
| `Ctrl+3` | Go to Tasks |
| `Ctrl+4` | Go to Gallery |
| `Ctrl+Z` | Undo (image editor) |
| `Ctrl+Y` | Redo (image editor) |
| `Esc` | Close modal |

---

## Mobile

Glyndwr is designed to work well on phones and tablets:

- **Bottom navigation bar** for Chat, Notes, Tasks, Gallery, and a More menu
- **Swipe right** from the left screen edge to open the conversation sidebar
- **Swipe left** to close it or dismiss open modals
- **Installable as a PWA** — add to home screen from the browser menu
- **Safe area support** — works correctly on notched/Dynamic Island devices
- **Push notifications** for task reminders work on mobile (requires PWA install on iOS)

---

## Push Notifications

In **Settings → Alerts**, click **Enable Notifications** to grant permission. Glyndwr will send
browser push notifications for task reminders. Set how far in advance you want reminders
(at due time, 15 min, 30 min, 1 hour, or 1 day before).

---

## Architecture

```text
glyndwr/
├── app.py                  # FastAPI application entry point
├── core/
│   ├── config.py           # Environment / .env settings
│   └── database.py         # SQLite schema + async CRUD
├── routes/
│   ├── auth.py             # Login, logout, session management
│   ├── users.py            # Admin user management
│   ├── gallery.py          # Image gallery CRUD
│   ├── memories.py         # Persistent memory CRUD
│   ├── chat.py             # Conversations + streaming messages
│   ├── models.py           # Model listing per provider
│   ├── settings.py         # App settings key-value store
│   ├── notes.py            # Notes CRUD
│   ├── tasks.py            # Tasks CRUD
│   ├── documents.py        # Documents editor CRUD + AI actions
│   ├── email.py            # IMAP/SMTP + AI triage
│   ├── calendar_api.py     # Calendar events + CalDAV
│   ├── research.py         # Deep research pipeline (streaming)
│   ├── tools.py            # Agent tool-use (search, fetch, exec)
│   └── notifications.py    # Web Push (VAPID)
├── services/
│   ├── llm.py              # Provider abstraction + streaming
│   ├── imap_service.py     # IMAP client
│   ├── caldav_service.py   # CalDAV protocol
│   ├── tools.py            # Agent tools implementation
│   ├── research.py         # Research pipeline logic
│   └── push.py             # Web Push sending
└── static/
    ├── index.html          # Single-page app shell
    ├── login.html          # Login page
    ├── css/main.css        # Themes, layout, components
    └── js/
        ├── app.js          # Main SPA logic
        └── image-editor.js # Canvas image editor
```

**Stack:** FastAPI + aiosqlite backend · Vanilla JS frontend (no framework) · SQLite database.

---

## Version History

### v1.2 ✅ (current)

- Multi-user authentication with auto-generated admin password
- 14 themes + custom theme creator + animated backgrounds
- Gallery section with canvas image editor (layers, tools, history)
- Persistent memory bank with categories and confidence ratings
- Rebindable keyboard shortcuts
- Mobile bottom nav, swipe gestures, safe-area support
- Admin panel for user management
- Font family selector (monospace / sans-serif / serif)
- Density modes (compact, comfortable, spacious)
- Accent colour override

### v1.1

- Real IMAP/SMTP email with AI triage
- Task due dates and browser push notifications
- CalDAV calendar sync
- Agent with tool use (web search, code execution, URL fetch)
- Deep Research (multi-step web research → synthesised report)
- Documents editor (split-view, AI editing, live preview)
- Forge — hardware guide for local model selection
- PWA (installable app, offline shell)

### v1.0

- Multi-provider chat with streaming
- Notes with auto-save
- Tasks with filter tabs
- Model comparison side-by-side
- Welsh folklore theme set

---

## License

MIT — see [LICENSE](LICENSE).

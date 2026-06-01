# Glyndwr — Self-Hosted AI Workspace

```text
    /\        /\
   /  \  /\  /  \
  / /\ \/  \/ /\ \
 /_/  \_\  /_/  \_\

  G L Y N D W R  v1.1
```

Named after Owain Glyndwr, the last native Prince of Wales. A fully self-hosted AI workspace
where **you choose your AI** — bring your own API keys for any provider, or run models locally.
No lock-in, no telemetry, everything on your machine.

---

## Features

| Section | What it does |
|---------|-------------|
| **Chat** | Multi-conversation AI chat with streaming. Supports any provider you configure. |
| **Agent** | Autonomous tool-use agent: web search (SearXNG), code execution, URL fetch. |
| **Deep Research** | Multi-step research pipeline that searches, reads sources, and synthesises a report. |
| **Notes** | Markdown note-taking with auto-save. |
| **Tasks** | Todo list with due dates, overdue tracking, and browser push reminders. |
| **Documents** | Multi-tab editor with live split preview. AI-assisted editing (improve, summarise, expand…). |
| **Email** | Real IMAP inbox, AI email triage (urgency/category/summary), SMTP compose, subscription scanner. |
| **Calendar** | Local events + CalDAV sync (Nextcloud, Apple, Fastmail, Radicale). |
| **Forge** | Hardware guide — detect your GPU/RAM and see which open models you can run locally. |
| **Memory** | Search all past conversations. |
| **Compare** | Side-by-side model comparison. |
| **PWA** | Installable as an app on desktop and mobile. Push notifications built-in. |

---

## Quick Start

### Windows

**Requirements:** Python 3.9+, Git

```powershell
git clone https://github.com/yourname/glyndwr.git
cd glyndwr
copy .env.example .env
notepad .env        # add your API keys
.\launch.ps1
```

The launcher creates a `.venv`, installs dependencies, and opens your browser at
`http://localhost:7860` automatically. Press `Ctrl+C` to stop.

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
nano .env          # add your API keys
./launch.sh
```

**Docker:**
```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

---

## Choosing Your AI

Glyndwr works with **any AI provider you configure**. You are not required to use any particular service.

| Provider | Models | Where to get key |
|----------|--------|-----------------|
| **OpenAI** | GPT-4o, GPT-4o-mini, o3 | platform.openai.com |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4 | console.anthropic.com |
| **Groq** | Llama 3.3, Mixtral, Gemma 2 (ultra-fast) | console.groq.com |
| **Google Gemini** | Gemini 2.0 Flash, 1.5 Pro | aistudio.google.com |
| **DeepSeek** | DeepSeek Chat, Reasoner | platform.deepseek.com |
| **OpenRouter** | 200+ models via one key | openrouter.ai |

Add keys to your `.env` file or enter them in **Settings → Providers**.

---

## Running Models Locally (Optional)

Glyndwr supports local inference, but it is entirely **optional and opt-in**.

### Ollama

[Ollama](https://ollama.ai) is the easiest way to run open models locally with no API key.

```bash
# 1. Install Ollama from https://ollama.ai
# 2. Pull a model
ollama pull llama3.2        # 2 GB, good for most tasks
ollama pull mistral         # 4.5 GB, great all-rounder
ollama pull llama3.1:8b     # 5 GB, excellent quality

# 3. In Glyndwr: Settings → Providers → Ollama
#    Set host to: http://localhost:11434
```

### llama.cpp / vLLM / LM Studio

Any OpenAI-compatible local server works. Set the OpenAI base URL to your local server address.

### What can your hardware run?

Open **Forge** in the sidebar to see model recommendations based on your GPU and RAM.

**Quick guide:**
| VRAM | What you can run |
|------|-----------------|
| < 4 GB | 1–3B models (Llama 3.2 1B/3B, Phi-4 Mini) |
| 6–8 GB | 7–8B models (Llama 3.1 8B, Mistral 7B, Gemma 2 9B) |
| 12–16 GB | 13–14B models (Qwen 2.5 14B, Gemma 3 12B) |
| 20–24 GB | 27–32B models (DeepSeek-R1 32B, Gemma 3 27B) |
| 40–48 GB | 70B models (Llama 3.3 70B) |
| CPU only | Any model, but expect ~2–5 tokens/sec |

---

## Configuration

Copy `.env.example` to `.env` and fill in what you need:

```env
# Add keys for any providers you want to use
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Optional: local Ollama server (leave blank if not using)
OLLAMA_HOST=http://localhost:11434

# Server config
APP_PORT=7860
APP_HOST=0.0.0.0
```

You only need to add keys for providers you intend to use. The app works fine with just one.

---

## Agent Tools

The **Agent** tab runs autonomous tool-use loops. To enable web search, you need a SearXNG instance:

```bash
# Quick SearXNG via Docker
docker run -d -p 8080:8080 searxng/searxng
# Then in Glyndwr: Settings → Tools → SearXNG URL: http://localhost:8080
```

Code execution runs Python in a subprocess sandbox on your machine. Enable in **Settings → Tools**.

---

## Email Setup

In **Settings → Email**, configure:
- **IMAP** for reading your inbox (Gmail: `imap.gmail.com:993`)
- **SMTP** for sending email (Gmail: `smtp.gmail.com:587`)

For Gmail, use an [App Password](https://myaccount.google.com/apppasswords) instead of your main password.

---

## Calendar Sync (CalDAV)

In **Settings → Calendar**, enter your CalDAV server URL to sync events from:
- **Nextcloud**: `https://yourcloud.com/remote.php/dav/calendars/username/`
- **Apple iCloud**: `https://caldav.icloud.com/`
- **Fastmail**: `https://caldav.fastmail.com/dav/`
- **Radicale** (self-hosted): `http://localhost:5232/`

---

## Push Notifications

In **Settings → Notifications**, click **Enable Notifications** to grant permission.
Glyndwr will send browser push notifications for task reminders. Works on desktop and mobile
when installed as a PWA (use the Install button in the About tab).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New conversation |
| `Ctrl+/` | Show keyboard shortcuts |
| `?` | Show keyboard shortcuts (when not typing) |
| `Ctrl+S` | Save (notes / documents / settings) |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Esc` | Close modal |

---

## Roadmap

### v1.1 ✅ (current)
- [x] Real IMAP/SMTP email with AI triage
- [x] Task due dates and browser push notifications
- [x] CalDAV calendar sync
- [x] Agent with tool use (web search, code execution, URL fetch)
- [x] Deep Research (multi-step web research → synthesised report)
- [x] Documents editor (split-view, AI editing, live preview)
- [x] Forge — hardware guide for local model selection
- [x] PWA (installable app, offline shell)
- [x] Keyboard shortcut modal

### v1.2 (planned)
- [ ] Memory/skills with vector search
- [ ] Image editor
- [ ] Multi-agent coordination
- [ ] Custom tool plugins

---

## License

MIT — see [LICENSE](LICENSE).

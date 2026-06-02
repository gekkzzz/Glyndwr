# Glyndwr — Guides

Detailed how-to guides for getting the most out of Glyndwr.

---

## Contents

1. [First-time setup and login](#first-time-setup)
2. [Setting up providers (no .env required)](#setting-up-providers)
3. [Running Ollama locally](#running-ollama-locally)
4. [Using the Forge to pick a model](#using-the-forge)
5. [Memory — how it works and how to train it](#memory)
6. [Deep Research](#deep-research)
7. [Image editor (Gallery)](#image-editor)
8. [Configuring email (IMAP/SMTP)](#configuring-email)
9. [Unsubscribing from mailing lists](#unsubscribing-from-mailing-lists)
10. [Task reminders on your phone](#task-reminders-on-your-phone)
11. [Calendar sync (CalDAV)](#calendar-sync)
12. [User management (multi-user)](#user-management)
13. [Themes and appearance](#themes-and-appearance)
14. [HTTPS reverse proxy](#https-reverse-proxy)
15. [Accessing Glyndwr on mobile](#accessing-glyndwr-on-mobile)
16. [Backing up your data](#backing-up-your-data)
17. [Updating Glyndwr](#updating-glyndwr)

---

## First-time Setup

When you start Glyndwr for the very first time it automatically creates an admin
account and prints the credentials to the terminal window:

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

**Important:** the password is randomly generated and only shown once. Copy it before
navigating away from the terminal. You can change it immediately after signing in via
**Settings → Account → Change Password**.

If you lose the password, reset it from the terminal:

```powershell
# Windows
cd C:\path\to\glyndwr
.\.venv\Scripts\python.exe -c "
import asyncio, secrets, string
from core.database import get_user_by_username, update_user
async def r():
    pw = ''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(16))
    u = await get_user_by_username('admin')
    await update_user(u['id'], password=pw)
    print('New password:', pw)
asyncio.run(r())"
```

```bash
# macOS / Linux
cd /path/to/glyndwr
.venv/bin/python -c "
import asyncio, secrets, string
from core.database import get_user_by_username, update_user
async def r():
    pw = ''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(16))
    u = await get_user_by_username('admin')
    await update_user(u['id'], password=pw)
    print('New password:', pw)
asyncio.run(r())"
```

---

## Setting Up Providers

Open **Settings** (gear icon) → **Providers**.

API keys are saved directly to the local database — **no `.env` file required**.
Enter your key, hit **Test** to verify the connection, then click **Save Settings**.
The model selector updates immediately without a restart.

| Provider | Where to get a key | Notes |
|----------|--------------------|-------|
| OpenAI | platform.openai.com | GPT-4o, o1, o3 |
| Anthropic | console.anthropic.com | Claude Opus 4, Sonnet 4 |
| Groq | console.groq.com | Free tier, very fast |
| Google Gemini | aistudio.google.com | Gemini 2.0 Flash is free |
| DeepSeek | platform.deepseek.com | Very affordable |
| OpenRouter | openrouter.ai | 200+ models, one key |
| Ollama | (no key needed) | Enter host URL, e.g. `http://localhost:11434` |

You can configure as many or as few as you like. The app works with just one.

---

## Running Ollama Locally

Ollama lets you run open-weight models on your own hardware at no cost.

**Install Ollama:**

- **Windows/macOS:** download from [ollama.com/download](https://ollama.com/download)
- **Linux:**
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

**Pull a model:**

```bash
ollama pull llama3.2          # 2 GB — fast, good general use
ollama pull mistral           # 4.5 GB — excellent all-rounder
ollama pull llama3.1:8b       # 5 GB — strong quality/speed balance
ollama pull deepseek-r1:7b    # 5 GB — reasoning/math focus
ollama pull phi4-mini         # 2.5 GB — tiny but capable reasoning
```

**Connect to Glyndwr:**

Go to **Settings → Providers → Ollama / Local** and set the host to
`http://localhost:11434`, then click **Test**. Glyndwr will list all your pulled
models in the model selector.

Not sure what to pull? Open the **Forge** section for hardware-matched recommendations.

---

## Using the Forge

The **Forge** section helps you find models suited to your hardware.

### Auto-detect

Click **Auto-detect** — Glyndwr reads your browser's hardware APIs (RAM, GPU name,
core count) and estimates what you can run. Note: browsers can only report approximate
values. VRAM is estimated from the GPU name string.

### Enter manually (recommended for accuracy)

Click **Enter manually** and type in:

- **GPU Model** — e.g. `RTX 4070`, `M2 Pro`, `RX 7900 XTX`, `Intel Arc A770`
- **VRAM** — in GB (check GPU specs if unsure)
- **RAM** — total system RAM in GB
- **CPU** — optional, for CPU-only inference context

Click **Apply** and the model cards will show a **Fits your GPU** or **Needs X GB VRAM**
badge on each card.

### Filter and search

Use the tier buttons (**Any**, **Low-end**, **Mid-range**, **High-end**, **Workstation**)
to filter by hardware class, or type in the search box to find a specific model.

### Downloading a model

Each card shows the `ollama pull` command. Copy and run it in your terminal. Once
downloaded, the model appears in Glyndwr's model selector automatically.

---

## Memory

Glyndwr maintains a persistent memory bank that the AI can draw on across all
conversations.

### How auto-extraction works

After each conversation, Glyndwr automatically sends the last 20 messages to the AI
and asks it to extract memorable facts — things like your preferences, projects, goals,
or contacts. These are saved as individual memory entries with:

- A short title
- A 1–2 sentence summary
- A category (fact, preference, contact, project, goal, general)
- A confidence score (50–100%)

### Viewing and managing memories

Go to **Memory** in the nav rail. You can:

- **Search** — filter memories by keyword
- **Filter by category** — click the category tabs
- **Edit** — click **Edit** on any card to correct a misremembered fact
- **Delete** — remove individual memories
- **Clear all** — wipe the entire memory bank

### Training the AI

The edit function is how you train the AI over time. If it extracted something wrong,
click **Edit**, correct it, and save. The corrected version will be used in future
conversations.

To manually add something the AI should always know:

1. Click **+ Add** in the Memory section
2. Write the title and content yourself
3. Pick a category and save

### Privacy note

Memories are stored locally in your SQLite database. They are never sent anywhere
except to the LLM API when generating a response that uses them.

---

## Deep Research

The **Deep Research** section runs a multi-step pipeline to answer complex questions:

1. **Generate queries** — the AI expands your question into multiple search queries
2. **Search the web** — each query is sent to your SearXNG instance
3. **Read sources** — top results are fetched and cleaned
4. **Synthesise** — the AI combines everything into a structured report

**Requirements:** a running [SearXNG](https://searxng.org) instance. The easiest way:

```bash
docker run -d -p 8080:8080 searxng/searxng
```

Then go to **Settings → Tools → SearXNG URL** and enter `http://localhost:8080`.

**Tips:**

- Be specific — "best open-weight LLMs for code in June 2026" gets better results
  than "good AI models"
- Use **Deep (5 queries)** for thorough research, **Quick (2 queries)** for a fast
  overview
- The pipeline steps are shown at the top so you can see what stage it's at

---

## Image Editor

The **Gallery** section includes a full canvas-based image editor.

### Creating an image

Click **+** in the Gallery panel → set a name, width, height, and background colour →
**Create**.

### Tools

| Tool | Shortcut | What it does |
|------|----------|--------------|
| Brush | B | Paint with the selected colour and size |
| Eraser | E | Erase pixels on the active layer |
| Move | V | Drag the active layer's contents |
| Rectangle Select | M | Select a rectangular region |
| Crop | C | Crop the canvas |
| Fill | G | Flood-fill an area with the current colour |

### Layers

- **Add layer** — click **+** in the Layers panel
- **Toggle visibility** — click the eye icon
- **Delete layer** — hover and click ✕
- **Reorder** — click a layer to make it active (drag reorder coming soon)

### Adjustments

Use the sliders in the Layers panel to adjust Brightness, Contrast, and Saturation
on the active layer. These are non-destructive (applied via CSS filters, not baked in).

### History

`Ctrl+Z` undoes, `Ctrl+Y` redoes. Up to 20 states are stored.

### Saving and exporting

- **Save** — stores the image in your local database
- **Export PNG** — downloads the flattened image as a PNG file

---

## Configuring Email

Go to **Settings → Email** and fill in:

**IMAP (receiving):**

| Field | Gmail example |
|-------|---------------|
| Host | `imap.gmail.com` |
| Port | `993` |
| Username | `you@gmail.com` |
| Password | app password (see below) |

**SMTP (sending):**

| Field | Gmail example |
|-------|---------------|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `you@gmail.com` |
| Password | app password |

**Gmail app password** (required if you use 2-factor auth):

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Create a password named "Glyndwr"
3. Use the generated 16-character code in both fields

**Other providers:**

| Provider | IMAP | SMTP |
|----------|------|------|
| Outlook/Hotmail | `imap.outlook.com:993` | `smtp.office365.com:587` |
| Fastmail | `imap.fastmail.com:993` | `smtp.fastmail.com:587` |
| ProtonMail | requires Proton Mail Bridge | requires Bridge |
| Self-hosted | your server hostname | your server hostname |

---

## Unsubscribing from Mailing Lists

1. Ensure IMAP is configured (see above)
2. Go to **Email → Unsubscribe** folder in the left panel
3. Click **Scan for Subscriptions**
4. For each detected sender:
   - **Unsubscribe** — opens the sender's official unsubscribe link
   - **Block** — hides that sender from future scans

---

## Task Reminders on Your Phone

Go to **Settings → Alerts** and click **Enable Notifications**. Glyndwr will send
browser push notifications for task reminders. Set how far in advance you want them.

For push to work on mobile, install Glyndwr as a PWA first (see
[Accessing Glyndwr on mobile](#accessing-glyndwr-on-mobile)).

---

## Calendar Sync

Go to **Settings → Calendar** and enter your CalDAV server URL:

| Provider | URL |
|----------|-----|
| Nextcloud | `https://cloud.example.com/remote.php/dav/calendars/username/` |
| Apple iCloud | `https://caldav.icloud.com/` |
| Fastmail | `https://caldav.fastmail.com/dav/` |
| Radicale (self-hosted) | `http://localhost:5232/` |

Enter your username and password (use an app-specific password for iCloud), then
click **Save CalDAV Settings**. In the Calendar section click **⟳ Sync** to pull events.

---

## User Management

Glyndwr supports multiple users sharing one instance.

### Adding users (admin only)

Go to **Settings → Admin → + Add User**. Set a username, password, and whether
the user has admin privileges. The new user can sign in at `/login` immediately.

### Changing passwords

Any user can change their own password in **Settings → Account → Change Password**.
Admins can reset any user's password from **Settings → Admin**.

### Deleting users

In **Settings → Admin**, click **Delete** next to a user. All their active sessions
are revoked immediately.

---

## Themes and Appearance

Go to **Settings → Appearance**.

### Built-in themes (14)

Click any theme swatch to apply it instantly. Your choice is saved automatically.

### Custom theme

Scroll down to the **Custom Theme Colors** section. Use the colour pickers to set
your own background, foreground, accent, and panel colours. The preview bar updates
in real time. Click **Apply Custom Theme** to switch to it.

### Animated backgrounds

Choose from: **Synapse** (pulsing nodes), **Rain** (streaks), **Stars**, **Sparkles**,
or **Embers**. These are canvas-based and have no impact on text performance.

### Font

Switch between **Monospace** (JetBrains Mono — default), **Sans-serif** (Inter), or
**Serif** (Georgia) in the font picker.

### Density

**Compact**, **Comfortable** (default), or **Spacious** — adjusts spacing throughout.

### Keyboard shortcuts

All shortcuts are rebindable in **Settings → Shortcuts**. Click **Edit** next to any
action and press your new key combination.

---

## HTTPS Reverse Proxy

Required for external access or PWA install from outside your local network.

### Caddy (recommended — handles certificates automatically)

```caddyfile
glyndwr.yourdomain.com {
    reverse_proxy localhost:7860
}
```

```bash
caddy run
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name glyndwr.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/glyndwr.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/glyndwr.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:7860;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_buffering    off;     # required for SSE / streaming responses
        proxy_read_timeout 300s;
    }
}
```

### Tailscale (zero config, no port forwarding)

Install Tailscale on both your server and phone. Access Glyndwr via your Tailscale
IP — no domain or certificate needed.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Accessing Glyndwr on Mobile

**Same network:**

Find your machine's local IP (e.g. `192.168.1.42`) and open
`http://192.168.1.42:7860` in your phone's browser.

**Install as PWA:**

- **iOS Safari:** Share → Add to Home Screen
- **Android Chrome:** three-dot menu → Install app

The app opens full-screen without browser chrome. The nav rail is visible on all
screen sizes — swipe right from the left edge to open the chat sidebar, swipe left
to close it.

**Outside your home network:** set up an [HTTPS reverse proxy](#https-reverse-proxy)
or use Tailscale.

---

## Backing Up Your Data

All data is in `data/glyndwr.db`. Back it up by copying that one file:

```bash
# Simple copy
cp data/glyndwr.db data/glyndwr.db.bak

# Timestamped
cp data/glyndwr.db "data/glyndwr-$(date +%Y%m%d).db"

# Cron — daily at 3 AM
0 3 * * * cp /home/user/glyndwr/data/glyndwr.db /backups/glyndwr-$(date +\%Y\%m\%d).db
```

**Restore:**

```bash
# Stop the server first, then:
cp data/glyndwr-20260101.db data/glyndwr.db
# Restart
```

---

## Updating Glyndwr

```bash
git pull
.\launch.ps1      # Windows — reinstalls deps if requirements.txt changed
./launch.sh       # macOS/Linux
```

**Docker:**

```bash
docker compose pull && docker compose up -d --build
```

Database schema migrations run automatically on startup. Your existing data is
always preserved.

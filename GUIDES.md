# Glyndwr — Guides

Detailed how-to guides for getting the most out of Glyndwr.

---

## Contents

1. [Setting up providers](#setting-up-providers)
2. [Running Ollama locally](#running-ollama-locally)
3. [Configuring email (IMAP/SMTP)](#configuring-email)
4. [Unsubscribing from mailing lists](#unsubscribing-from-mailing-lists)
5. [Phone notifications for important emails](#phone-notifications-for-important-emails)
6. [Task reminders on your phone](#task-reminders-on-your-phone)
7. [Calendar sync (CalDAV)](#calendar-sync)
8. [HTTPS reverse proxy](#https-reverse-proxy)
9. [Accessing Glyndwr on mobile](#accessing-glyndwr-on-mobile)
10. [Backing up your data](#backing-up-your-data)
11. [Updating Glyndwr](#updating-glyndwr)

---

## Setting Up Providers

Open **Settings** (gear icon in the nav rail) > **Providers**.

Each provider has a collapsible section with an API key field and a **Test** button.
Keys entered here are session-only. To persist them across restarts, add them to your
`.env` file:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
```

Restart the server after editing `.env`. Ollama requires no key — just set
`OLLAMA_HOST=http://localhost:11434` and make sure Ollama is running.

---

## Running Ollama Locally

Ollama lets you run models on your own hardware at no cost.

**Install Ollama:**

- **Windows/macOS:** download the installer from [ollama.com](https://ollama.com)
- **Linux:**
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

**Pull a model:**

```bash
ollama pull llama3.2          # small, fast, good general use
ollama pull mistral           # strong reasoning
ollama pull codellama         # code-focused
ollama pull phi3              # very small, runs on CPU
```

**Start Ollama** (it usually auto-starts; if not):

```bash
ollama serve
```

Glyndwr will auto-detect all locally pulled models and list them under the **LLM**
provider group in the model selector.

---

## Configuring Email

Go to **Settings > Email** and fill in:

**IMAP (receiving):**

| Field | Example |
| ----- | ------- |
| Host | `imap.gmail.com` |
| Port | `993` (SSL) |
| Username | `you@gmail.com` |
| Password | your app password (see below) |

**SMTP (sending):**

| Field | Example |
| ----- | ------- |
| Host | `smtp.gmail.com` |
| Port | `587` (STARTTLS) |
| Username | `you@gmail.com` |
| Password | your app password |

**Gmail app password** (required if you use 2FA):

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Create a new app password named "Glyndwr"
3. Use that 16-character password in both IMAP and SMTP fields

**Other providers:**

- **Outlook/Hotmail:** `imap.outlook.com:993` / `smtp.office365.com:587`
- **Fastmail:** `imap.fastmail.com:993` / `smtp.fastmail.com:587`
- **ProtonMail:** requires the Proton Mail Bridge app running locally
- **Self-hosted (Postfix/Dovecot):** use your server's hostname and standard ports

---

## Unsubscribing from Mailing Lists

1. Go to the **Email** section.
2. Make sure IMAP is configured (see above).
3. Click the **Unsubscribe** folder in the left panel.
4. Click **Scan for Subscriptions**.
5. Glyndwr scans your inbox for senders with `List-Unsubscribe` headers and high
   email frequency.
6. For each detected sender you can:
   - Click **Unsubscribe** — opens the sender's official unsubscribe link.
   - Click **Block** — hides that sender from future scans in Glyndwr.

> Note: Live IMAP scanning is in v1.2. The current version shows demo data so you can
> test the UI before connecting your real inbox.

---

## Phone Notifications for Important Emails

Glyndwr uses [ntfy](https://ntfy.sh) for push notifications — it is free, open source,
and does not require a phone number or account.

### Step 1: Install ntfy on your phone

- **Android:** [ntfy on F-Droid](https://f-droid.org/packages/io.heckel.ntfy/) or
  [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- **iOS:** [ntfy on the App Store](https://apps.apple.com/app/ntfy/id1625396347)

### Step 2: Subscribe to a topic

Open the ntfy app and subscribe to a topic name of your choice, e.g. `glyndwr-alerts`.
This is just a string — pick something hard to guess so random people cannot send you
notifications.

### Step 3: Add ntfy URL to your .env

```env
NTFY_URL=https://ntfy.sh/glyndwr-alerts
```

Or self-host ntfy on your own server and use that URL instead.

### Step 4: Trigger notifications from email rules (coming in v1.2)

Once email scanning is live, you will be able to set rules such as:

- "Notify me when an email from `boss@company.com` arrives"
- "Notify me when the subject contains URGENT"
- "Notify me for any email the AI rates as high priority"

Until then, you can trigger ntfy manually from the terminal:

```bash
curl -d "You have an important email" https://ntfy.sh/glyndwr-alerts
```

Or from Python:

```python
import httpx
httpx.post("https://ntfy.sh/glyndwr-alerts", content="Important email arrived")
```

---

## Task Reminders on Your Phone

Until the built-in scheduler ships in v1.2, you can set up task reminders using ntfy
and a cron job (Linux/macOS) or Task Scheduler (Windows).

### Linux / macOS cron

Create a script `remind.sh`:

```bash
#!/bin/bash
# Check Glyndwr for tasks due today and push via ntfy
TASKS=$(curl -s http://localhost:7860/api/tasks/?done=false)
COUNT=$(echo "$TASKS" | python3 -c "import sys,json; t=json.load(sys.stdin); print(len(t))")
if [ "$COUNT" -gt "0" ]; then
  curl -d "You have $COUNT active tasks in Glyndwr" https://ntfy.sh/glyndwr-alerts
fi
```

Add to crontab (`crontab -e`) to run every morning at 8 AM:

```
0 8 * * * /home/youruser/remind.sh
```

### Windows Task Scheduler

1. Open Task Scheduler -> Create Basic Task
2. Set trigger: Daily at 08:00
3. Set action: Start a Program
4. Program: `powershell.exe`
5. Arguments:
   ```powershell
   -Command "$t=(Invoke-RestMethod http://localhost:7860/api/tasks/?done=false).Count; if($t -gt 0){Invoke-RestMethod -Method Post -Uri 'https://ntfy.sh/glyndwr-alerts' -Body \"You have $t active tasks\"}"
   ```

---

## Calendar Sync

Full CalDAV sync is planned for v1.2. Until then:

- The **Calendar** section stores events locally in your browser (`localStorage`).
- To sync with an existing calendar, export your `.ics` file and import events manually.

**Self-hosted CalDAV with Radicale (future):**

```bash
pip install radicale
python -m radicale --config /etc/radicale/config
```

Then point Glyndwr's `CALDAV_URL` env var at `http://localhost:5232`.

Compatible apps: Nextcloud, Apple Calendar, Thunderbird, Fastmail.

---

## HTTPS Reverse Proxy

Required if you want to access Glyndwr from outside your home network or install it as
a PWA from a phone not on your local Wi-Fi.

### Caddy (recommended — auto HTTPS)

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
        proxy_pass http://127.0.0.1:7860;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection keep-alive;
        proxy_set_header Host $host;
        proxy_buffering off;       # required for SSE streaming
        proxy_read_timeout 300s;
    }
}
```

### Tailscale (no port forwarding needed)

Tailscale creates a private mesh network between your devices. Install it on both your
server and your phone, then access Glyndwr via your Tailscale IP or hostname — no
public domain required.

```bash
# On server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then access `http://<tailscale-ip>:7860` from any device on your Tailnet.

---

## Accessing Glyndwr on Mobile

**Same Wi-Fi network:**

Find your machine's local IP (e.g. `192.168.1.42`) and open
`http://192.168.1.42:7860` in your phone's browser.

**Install as PWA:**

- iOS Safari: Share -> Add to Home Screen
- Android Chrome: Three-dot menu -> Install app / Add to Home Screen

Once installed the app opens full-screen without the browser chrome, just like a
native app. It works offline for notes and tasks (chat requires internet for the API).

**Outside your home network:** see [HTTPS Reverse Proxy](#https-reverse-proxy) above.

---

## Backing Up Your Data

All data lives in `data/glyndwr.db` (SQLite). Back it up by copying that file:

```bash
# Simple copy
cp data/glyndwr.db data/glyndwr.db.bak

# Timestamped backup
cp data/glyndwr.db "data/glyndwr-$(date +%Y%m%d).db"

# Automated daily backup via cron
0 3 * * * cp /home/youruser/glyndwr/data/glyndwr.db /backups/glyndwr-$(date +\%Y\%m\%d).db
```

**Restore:**

```bash
# Stop Glyndwr first
cp data/glyndwr-20260101.db data/glyndwr.db
# Restart Glyndwr
```

---

## Updating Glyndwr

```bash
git pull
# If dependencies changed:
.venv/Scripts/pip install -r requirements.txt   # Windows
.venv/bin/pip install -r requirements.txt        # macOS/Linux
# Restart the server
```

**Docker:**

```bash
docker compose pull
docker compose up -d --build
```

Database migrations run automatically on startup via `init_db()` which uses
`CREATE TABLE IF NOT EXISTS` — your existing data is safe.

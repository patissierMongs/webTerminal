# OpenClaw Web Terminal

A web terminal that lets you attach to a tmux session from a desktop browser or a phone and keep working with Claude Code CLI (Command Line Interface).

English | [한국어](README.md)

![Typing commands in the browser terminal](docs/images/terminal-typing.gif)

## Features

- **Web terminal**: an xterm.js terminal connected to a server-side tmux session over Socket.IO in real time. Several browsers can share the same session, and a newly connected client receives the most recent output (up to 100 KB).
- **Auto reconnect**: if the tmux attachment exits, the server re-attaches after 2 seconds; the browser reconnects automatically through Socket.IO.
- **Session logs**: terminal output is written to daily files in `logs/` — a `-plain.log` with ANSI (American National Standards Institute) color codes stripped and a `-raw.log` with the original bytes.
- **Pattern alerts**: output is scanned for permission prompts (`Allow`, `(y/n)`, ...), errors (`Error:`, `command not found`, ...) and completion messages (`Done`, `Success`, ...), which show up as a toast at the top of the page. Each alert type fires at most once every 30 seconds.
- **Telegram alerts (optional)**: errors and permission prompts are also sent to Telegram through the `openclaw` CLI.
- **AI (Artificial Intelligence) summary (optional)**: a local Ollama model summarizes the day's log in Korean. Watch it stream in the ▲ panel, or generate one from the Summary menu and reopen saved summaries (`summaries/`).
- **System monitor**: CPU (Central Processing Unit), GPU (Graphics Processing Unit; only when `nvidia-smi` is present) and network usage in the bottom-right corner, refreshed every 3 seconds.
- **PWA (Progressive Web App)**: install to the home screen to open in fullscreen; static files and the FiraCode Nerd Font are cached.
- **PWA-only keyboard**: an HHKB (Happy Hacking Keyboard) layout on-screen keyboard with shortcut rows (`C-c`, `C-z`, ...), arrow keys, sticky Ctrl/Alt, an Fn layer (F1–F12, Home, PgDn, ...), and Korean 2-set (두벌식) input with a 한/영 toggle.
- **Resize priority**: while a desktop browser is connected, resize requests from PWA clients are ignored so the desktop layout does not break.

| Logs drawer | PWA keyboard with Korean input |
|---|---|
| ![Logs drawer](docs/images/drawer-logs.png) | <img src="docs/images/pwa-keyboard.gif" alt="Typing ls and echo 한글 on the PWA keyboard" width="300"> |

![Terminal after running commands, with an error toast](docs/images/terminal-desktop.png)

> The screenshots were taken by running this repository locally. The shell prompt was set to `demo@home-server`, and neither Ollama nor Telegram was connected. The PWA view was produced by making the browser report `display-mode: fullscreen` as true, which activates the app's PWA code path.

## Usage

### 1. Requirements

- Node.js 18 or newer, npm
- tmux (required)
- Build tools for node-pty (`python3`, `make`, `g++`) on platforms without a prebuilt binary
- Optional: Ollama (AI summary), `openclaw` CLI (Telegram alerts), `nvidia-smi` (GPU usage), Tailscale (remote access)

### 2. Install

```bash
git clone https://github.com/patissierMongs/webTerminal.git
cd webTerminal
npm install
cp .env.example .env
```

Settings available in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3030` | HTTP (Hypertext Transfer Protocol) port |
| `HOST` | `0.0.0.0` | Listen address |
| `TMUX_SESSION` | `openclaw` | tmux session to attach to (created if missing) |
| `TELEGRAM_CHAT_ID` | (empty) | Telegram recipient ID; alerts are not sent when empty |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API (Application Programming Interface) URL (Uniform Resource Locator) |
| `OLLAMA_MODEL` | `qwen3:30b-a3b` | Model used for summaries |

### 3. Run

```bash
./start.sh     # checks tmux/node, prepares logs/, summaries/ and the tmux session, then starts the server
# or
npm start      # node server.js
npm run dev    # restart on file changes (node --watch)
```

`start.sh` reads `TMUX_SESSION` from the shell environment only, not from `.env`. If you change the session name in `.env`, the server creates that session on its own.

### 4. Connect and use

1. Open `http://<server address>:3030` in a browser. The dot at the top left turns green and shows `Connected`.
2. Click the terminal and type as usual; input goes straight to the tmux session.
3. The number at the top right is the count of connected clients.
4. The ☰ button opens the drawer menu on the right:
   - **Logs**: daily log files; tap one to see its last 8,000 characters.
   - **Summary**: `Generate New Summary` summarizes today's log, and saved summaries can be opened (requires Ollama).
   - **Reload**: reloads the page (useful inside the PWA, which has no refresh button).
5. The ▲ button opens the Ollama streaming panel; `Run` shows the summary as it is generated.
6. On a phone, use the browser's "Add to Home screen". The installed app shows the custom keyboard and ▲/▼ scroll buttons.

> **Security note**: the server has no login or token authentication. Anyone who can reach it can run commands in the tmux session. Bind it with `HOST=127.0.0.1` or expose it only inside a private network such as Tailscale. `start.sh` prints the Tailscale address when Tailscale is installed.

### HTTP API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | tmux/PTY (pseudo-terminal) state, client count, Ollama availability |
| `GET` | `/api/logs` | List log files |
| `GET` | `/api/logs/:filename` | Log file content |
| `POST` | `/api/summarize` | Create a summary (body `{ "filename": "..." }`; defaults to today's plain log) |
| `GET` | `/api/summaries` | List summary files |
| `GET` | `/api/summaries/:filename` | Summary file content |
| `GET` | `/api/monitor` | CPU/GPU/network usage |

Socket.IO events: client→server `input`, `resize`, `register`, `ollama-summarize`; server→client `output`, `alert`, `client-count`, `pty-dimensions`, `pty-exit`, `ollama-start`/`ollama-chunk`/`ollama-done`/`ollama-error` (see `server.js`).

## Tech stack

| Area | Technology |
|------|------------|
| Languages | JavaScript (Node.js 18+, vanilla browser JS), Bash |
| Server | Express `^4.21.2`, Socket.IO `^4.8.1`, node-pty `^1.0.0`, dotenv `^16.4.7`, strip-ansi `^7.1.0` |
| Frontend | xterm.js `5.5.0`, `@xterm/addon-fit` `0.10.0`, `@xterm/addon-web-links` `0.11.0` (jsDelivr CDN (Content Delivery Network)), Service Worker, Web App Manifest |
| Font | FiraCode Nerd Font (WOFF2 (Web Open Font Format 2), served locally) |
| External tools | tmux (required); Ollama, `openclaw` CLI, `nvidia-smi`, Tailscale (optional) |

## Docs

- [Progress record](docs/PROGRESS.en.md) — goal, per-feature status, work history

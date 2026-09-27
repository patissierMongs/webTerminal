# Progress record

English | [한국어](PROGRESS.md)

## Final goal

A personal remote web terminal: attach to a server-side tmux session from a desktop browser or a phone to keep working with Claude Code CLI (Command Line Interface), get notified about permission prompts and errors, and read summaries of the session produced by a local LLM (Large Language Model). `package.json` describes it as "Remote web terminal for Claude Code CLI via tmux + xterm.js".

## Current implementation status

Status below was checked on 2026-09-27 by reading the code and running the server locally. The repository has no automated tests.

| Feature | Status | Code location | How it was checked |
|---------|--------|---------------|--------------------|
| tmux attachment (node-pty running `tmux attach-session`) | Implemented | `lib/terminal.js` `spawn()`, `ensureTmuxSession()` | Ran it; input and output work |
| Browser terminal (xterm.js + Socket.IO) | Implemented | top of `public/app.js`, `server.js` `io.on('connection')` | Ran it |
| Replay of recent output (100 KB) | Implemented | `lib/terminal.js` `appendScrollback()`, `addClient()` | Code read; replay causes terminal query replies to be typed into the shell (see known issues) |
| Re-attach 2 s after PTY (pseudo-terminal) exit | Implemented | `lib/terminal.js` `onExit` | Killed the tmux server; the session was recreated and re-attached |
| Daily logs (plain/raw) | Implemented | `lib/logger.js` | `logs/<date>-plain.log` and `-raw.log` were created |
| Log API (Application Programming Interface) and drawer view | Implemented | `server.js` `/api/logs`, `public/app.js` `showLogs()` | Ran it |
| Pattern alerts (permission/error/completion, 30 s cooldown) | Implemented | `lib/watcher.js` | Typing a missing command showed an error toast |
| Idle detection | Not started | — | Removed in commit `b458320`; the old README still listed it |
| Telegram alerts (`openclaw` CLI) | Partial | `lib/notifier.js`, `server.js` `watcher.on('alert')` | Code exists; could not verify sending here because the `openclaw` CLI is not installed |
| Ollama summary (REST, saved to file) | Implemented | `lib/summarizer.js` `summarize()`, `server.js` `/api/summarize` | Without Ollama, only the error path (HTTP (Hypertext Transfer Protocol) 503) was verified |
| Ollama streaming panel | Implemented | `lib/summarizer.js` `streamSummarize()`, expand panel in `public/app.js` | Code read; no live stream without Ollama |
| System monitor (CPU (Central Processing Unit) / GPU (Graphics Processing Unit) / NET (network)) | Implemented | `lib/monitor.js`, `public/app.js` `updateMonitor()` | `/api/monitor` response and on-screen display (GPU hidden when absent) |
| PWA (Progressive Web App) manifest and service worker | Implemented | `public/manifest.json`, `public/sw.js` (cache `v7`) | Code read |
| PWA-only HHKB (Happy Hacking Keyboard) keyboard, shortcut rows, Fn layer | Implemented | `if (isPWA())` block in `public/app.js` | Rendered in PWA mode and tapped keys |
| Korean 2-set input (buffered) | Implemented | `ime`, `toggleKoreanMode()` in `public/app.js` | Typed `echo 한글` and saw the output |
| PWA resize restriction (desktop browser wins) | Implemented | `lib/terminal.js` `resizeIfAllowed()` | Code read |
| Scroll buttons | Implemented | `public/app.js` `setupRepeatButton()` | Visible in the PWA view |
| Authentication (login/token) | Not started | — | No authentication; Socket.IO CORS (Cross-Origin Resource Sharing) is `*` |
| Automated tests | Not started | — | No test files and no `test` script |

### Known issues

- **Query replies leak into the shell**: a new client receives the replayed output, xterm.js answers the terminal queries (Device Attributes) contained in it, and that answer is sent to the shell as `input`. During the local run, strings such as `1;2c0;276;0c` appeared at the prompt.
- **Log dates are UTC (Coordinated Universal Time)**: `new Date().toISOString()` is used, so log files roll over at 09:00 KST.
- **`start.sh` and `.env`**: `start.sh` does not read `.env`, and its Ollama check is hardcoded to `http://localhost:11434`.
- **tmux locale**: if the server process has no UTF-8 locale (`LANG`), tmux shows Korean characters as `_`.
- The old README mentioned repeated sentences on some Android keyboards and `nvidia-smi` reporting 0% under WSL2 (Windows Subsystem for Linux 2); neither could be reproduced in this environment.

## Work history

Taken from `git log`; times are Korea Standard Time (KST, Asia/Seoul). The stored commit offset is already `+0900`, so the times are copied as is.

| Date (KST) | Commit | Change |
|------------|--------|--------|
| 2026-02-14 05:26 | `a5f6390` | Initial commit (v1.0.0): server, tmux bridge, logging, pattern alerts, Telegram alerts, Ollama summary, system monitor, PWA. Includes the 2026-02-13 work: locally served Nerd Font, delta-based monitor with interface auto-detection, mobile autocomplete disabled on the input textarea, Ollama 0.9.4→0.16.1 upgrade (Blackwell GPU support), modal UI (User Interface) for logs/summaries |
| 2026-02-14 06:23 | `b458320` | Remove idle detection |
| 2026-02-14 06:24 | `51e7d72` | Resize policy for concurrent PWA/browser connections |
| 2026-02-14 06:26 | `68c349a` | Replace header with a status bar, PWA fullscreen, scrolling improvements |
| 2026-02-14 06:27 | `e5bddbc` | Replace modal with a right-side drawer |
| 2026-02-14 06:28 | `f1c5439` | Add PWA-only HHKB keyboard |
| 2026-02-14 06:28 | `465a57b` | Service worker cache v4 |
| 2026-02-14 06:41 | `1ccfca8` | Ollama real-time streaming panel, monitor position fix |
| 2026-02-14 06:55 | `1ad80d8` | 한/영 toggle and scroll buttons on the PWA keyboard, IME (Input Method Editor)/tmux fixes |
| 2026-02-14 07:09 | `d9152db` | Korean 2-set IME for the PWA keyboard |
| 2026-02-14 08:54 | `a6df067` | Switch Korean input to a buffered approach (no backspace replace) |
| 2026-09-27 | (this work) | README rewritten as separate Korean/English files, screenshots and GIFs, progress record |

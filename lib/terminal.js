const pty = require('node-pty');
const { execSync, exec } = require('child_process');
const EventEmitter = require('events');

const SESSION_NAME = process.env.TMUX_SESSION || 'openclaw';
const SCROLLBACK_LIMIT = 100 * 1024; // 100KB

class TerminalManager extends EventEmitter {
  constructor() {
    super();
    this.ptyProcess = null;
    this.clients = new Map(); // socket -> { deviceType: 'pwa'|'browser' }
    this.scrollbackBuffer = '';
    this.reconnectTimer = null;
    this.currentCols = 120;
    this.currentRows = 40;
  }

  ensureTmuxSession() {
    try {
      execSync(`tmux has-session -t ${SESSION_NAME} 2>/dev/null`);
      return true;
    } catch {
      execSync(`tmux new-session -d -s ${SESSION_NAME} -x 120 -y 40`);
      return false;
    }
  }

  spawn() {
    if (this.ptyProcess) return;

    this.ensureTmuxSession();

    this.ptyProcess = pty.spawn('tmux', ['attach-session', '-t', SESSION_NAME], {
      name: 'xterm-256color',
      cols: this.currentCols,
      rows: this.currentRows,
      cwd: process.env.HOME,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.ptyProcess.onData((data) => {
      this.appendScrollback(data);
      this.emit('data', data);
      for (const socket of this.clients.keys()) {
        socket.emit('output', data);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      console.log(`[terminal] pty exited with code ${exitCode}, reconnecting in 2s...`);
      this.ptyProcess = null;
      this.emit('exit', exitCode);
      this.reconnectTimer = setTimeout(() => this.spawn(), 2000);
    });

    console.log(`[terminal] pty bridge spawned, pid=${this.ptyProcess.pid}`);
  }

  appendScrollback(data) {
    this.scrollbackBuffer += data;
    if (this.scrollbackBuffer.length > SCROLLBACK_LIMIT) {
      this.scrollbackBuffer = this.scrollbackBuffer.slice(-SCROLLBACK_LIMIT);
    }
  }

  addClient(socket, deviceType) {
    this.clients.set(socket, { deviceType: deviceType || 'browser' });
    if (this.scrollbackBuffer.length > 0) {
      socket.emit('output', this.scrollbackBuffer);
    }
    // Send current dimensions so PWA clients can sync
    socket.emit('pty-dimensions', { cols: this.currentCols, rows: this.currentRows });
  }

  removeClient(socket) {
    this.clients.delete(socket);
  }

  registerDevice(socket, deviceType) {
    const info = this.clients.get(socket);
    if (info) {
      info.deviceType = deviceType;
    }
  }

  resizeIfAllowed(socket, cols, rows) {
    const info = this.clients.get(socket);
    if (!info) return;

    if (info.deviceType === 'pwa') {
      // PWA: only resize if no browser clients connected
      let hasBrowser = false;
      for (const [s, i] of this.clients) {
        if (s !== socket && i.deviceType === 'browser') {
          hasBrowser = true;
          break;
        }
      }
      if (hasBrowser) {
        // Reject resize, send current dims back
        socket.emit('pty-dimensions', { cols: this.currentCols, rows: this.currentRows });
        return;
      }
    }

    // Browser clients always allowed, PWA allowed when alone
    this.resize(cols, rows);
  }

  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols, rows) {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
        this.currentCols = cols;
        this.currentRows = rows;
      } catch (e) {
        console.error('[terminal] resize error:', e.message);
      }
    }
  }

  getStatus() {
    let tmuxAlive = false;
    try {
      execSync(`tmux has-session -t ${SESSION_NAME} 2>/dev/null`);
      tmuxAlive = true;
    } catch {}

    return {
      tmuxSession: SESSION_NAME,
      tmuxAlive,
      ptyRunning: !!this.ptyProcess,
      clientCount: this.clients.size,
    };
  }

  destroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }
}

module.exports = new TerminalManager();

const EventEmitter = require('events');

let stripAnsi;

const PATTERNS = {
  permission: [
    /\bAllow\b/i,
    /\(y\/n\)/i,
    /Do you want to/i,
    /\bapprove\b/i,
    /\bpermission\b/i,
    /Press Enter to/i,
  ],
  error: [
    /\bError:/,
    /\bERROR\b/,
    /\bENOENT\b/,
    /\bTypeError\b/,
    /\bSyntaxError\b/,
    /\bfatal:/,
    /command not found/,
    /\bpanic\b/i,
    /\bFAILED\b/,
  ],
  completion: [
    /\bDone[.!]?\s*$/m,
    /\bCompleted?\b/i,
    /\bFinished\b/i,
    /\bSuccess\b/i,
  ],
};

const COOLDOWN_MS = 30_000;

class Watcher extends EventEmitter {
  constructor() {
    super();
    this.lastAlert = {};
    this.buffer = '';
    this.ready = false;
  }

  async init() {
    const mod = await import('strip-ansi');
    stripAnsi = mod.default;
    this.ready = true;
  }

  feed(data) {
    if (!this.ready) return;

    const clean = stripAnsi(data);
    this.buffer += clean;

    // Keep buffer manageable
    if (this.buffer.length > 4096) {
      this.buffer = this.buffer.slice(-2048);
    }

    // Check patterns on the recent chunk
    for (const [category, patterns] of Object.entries(PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(clean)) {
          const match = clean.match(pattern);
          this._alert(category, match ? match[0] : category);
          break;
        }
      }
    }
  }

  _alert(type, detail) {
    const now = Date.now();
    if (this.lastAlert[type] && now - this.lastAlert[type] < COOLDOWN_MS) {
      return;
    }
    this.lastAlert[type] = now;
    this.emit('alert', { type, detail, timestamp: new Date().toISOString() });
  }

  destroy() {}
}

module.exports = new Watcher();

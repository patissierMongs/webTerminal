const fs = require('fs');
const path = require('path');

let stripAnsi;

const LOGS_DIR = path.join(__dirname, '..', 'logs');

class Logger {
  constructor() {
    this.currentDate = null;
    this.plainStream = null;
    this.rawStream = null;
    this.ready = false;
  }

  async init() {
    const mod = await import('strip-ansi');
    stripAnsi = mod.default;
    this.ready = true;
    this._ensureStreams();
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _ensureStreams() {
    const today = this._today();
    if (this.currentDate === today) return;

    if (this.plainStream) this.plainStream.end();
    if (this.rawStream) this.rawStream.end();

    this.currentDate = today;

    fs.mkdirSync(LOGS_DIR, { recursive: true });

    this.plainStream = fs.createWriteStream(
      path.join(LOGS_DIR, `${today}-plain.log`),
      { flags: 'a' }
    );
    this.rawStream = fs.createWriteStream(
      path.join(LOGS_DIR, `${today}-raw.log`),
      { flags: 'a' }
    );
  }

  write(data) {
    if (!this.ready) return;
    this._ensureStreams();
    this.rawStream.write(data);
    this.plainStream.write(stripAnsi(data));
  }

  listLogs() {
    if (!fs.existsSync(LOGS_DIR)) return [];
    return fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse();
  }

  readLog(filename) {
    const filePath = path.join(LOGS_DIR, path.basename(filename));
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }
}

module.exports = new Logger();

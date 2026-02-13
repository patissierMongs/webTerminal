const { exec } = require('child_process');

class Notifier {
  constructor() {
    this.enabled = false;
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.method = 'cli'; // 'cli' uses openclaw CLI
  }

  async init() {
    // Check if openclaw CLI is available
    try {
      await this._exec('which openclaw');
      if (this.chatId) {
        this.enabled = true;
        console.log('[notifier] OpenClaw CLI found, Telegram notifications enabled');
      } else {
        console.log('[notifier] TELEGRAM_CHAT_ID not set, notifications disabled');
      }
    } catch {
      console.log('[notifier] openclaw CLI not found, notifications disabled');
    }
  }

  async send(message) {
    if (!this.enabled) {
      console.log(`[notifier] (disabled) ${message}`);
      return false;
    }

    try {
      const escaped = message.replace(/'/g, "'\\''");
      await this._exec(
        `openclaw message send --to '${this.chatId}' --message '${escaped}'`
      );
      console.log('[notifier] Telegram message sent');
      return true;
    } catch (err) {
      console.error('[notifier] Failed to send:', err.message);
      return false;
    }
  }

  _exec(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 10_000 }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }
}

module.exports = new Notifier();

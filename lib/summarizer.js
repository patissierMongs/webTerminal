const fs = require('fs');
const path = require('path');
const http = require('http');

const SUMMARIES_DIR = path.join(__dirname, '..', 'summaries');
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:30b-a3b';
const MAX_LOG_CHARS = 12_000;

class Summarizer {
  async checkOllama() {
    return new Promise((resolve) => {
      const req = http.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  async summarize(logFilename) {
    const available = await this.checkOllama();
    if (!available) {
      throw new Error('Ollama is not running');
    }

    // Read log file
    const logPath = path.join(LOGS_DIR, path.basename(logFilename));
    if (!fs.existsSync(logPath)) {
      throw new Error(`Log file not found: ${logFilename}`);
    }

    let content = fs.readFileSync(logPath, 'utf-8');
    if (content.length > MAX_LOG_CHARS) {
      content = content.slice(-MAX_LOG_CHARS);
    }

    const prompt = `다음은 Claude Code CLI 터미널 세션 로그입니다. 핵심 작업 내용을 한국어로 간결하게 요약해주세요:\n\n${content}`;

    const result = await this._generate(prompt);

    // Save summary
    fs.mkdirSync(SUMMARIES_DIR, { recursive: true });
    const date = logFilename.replace(/-plain\.log$|-raw\.log$/, '');
    const summaryPath = path.join(SUMMARIES_DIR, `${date}-summary.md`);
    const summaryContent = `# 세션 요약 — ${date}\n\n${result}\n\n---\n*생성: ${new Date().toISOString()}*\n`;
    fs.writeFileSync(summaryPath, summaryContent);

    return { summary: result, file: `${date}-summary.md` };
  }

  _generate(prompt) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_URL}/api/generate`);
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      });

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 300_000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.response || '');
            } catch (e) {
              reject(new Error('Invalid Ollama response'));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
      req.write(body);
      req.end();
    });
  }

  streamGenerate(prompt, onChunk) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_URL}/api/generate`);
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: true,
      });

      let full = '';
      let buf = '';

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 300_000,
        },
        (res) => {
          res.on('data', (chunk) => {
            buf += chunk.toString();
            // Ollama streams newline-delimited JSON
            let nl;
            while ((nl = buf.indexOf('\n')) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              try {
                const obj = JSON.parse(line);
                if (obj.response) {
                  full += obj.response;
                  onChunk(obj.response);
                }
              } catch (_) { /* skip malformed lines */ }
            }
          });
          res.on('end', () => resolve(full));
        }
      );

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
      req.write(body);
      req.end();
    });
  }

  async streamSummarize(logFilename, onChunk) {
    const available = await this.checkOllama();
    if (!available) throw new Error('Ollama is not running');

    const logPath = path.join(LOGS_DIR, path.basename(logFilename));
    if (!fs.existsSync(logPath)) throw new Error(`Log file not found: ${logFilename}`);

    let content = fs.readFileSync(logPath, 'utf-8');
    if (content.length > MAX_LOG_CHARS) content = content.slice(-MAX_LOG_CHARS);

    const prompt = `다음은 Claude Code CLI 터미널 세션 로그입니다. 핵심 작업 내용을 한국어로 간결하게 요약해주세요:\n\n${content}`;

    const result = await this.streamGenerate(prompt, onChunk);

    fs.mkdirSync(SUMMARIES_DIR, { recursive: true });
    const date = logFilename.replace(/-plain\.log$|-raw\.log$/, '');
    const summaryPath = path.join(SUMMARIES_DIR, `${date}-summary.md`);
    const summaryContent = `# 세션 요약 — ${date}\n\n${result}\n\n---\n*생성: ${new Date().toISOString()}*\n`;
    fs.writeFileSync(summaryPath, summaryContent);

    return { summary: result, file: `${date}-summary.md` };
  }

  listSummaries() {
    if (!fs.existsSync(SUMMARIES_DIR)) return [];
    return fs.readdirSync(SUMMARIES_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
  }

  readSummary(filename) {
    const filePath = path.join(SUMMARIES_DIR, path.basename(filename));
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }
}

module.exports = new Summarizer();

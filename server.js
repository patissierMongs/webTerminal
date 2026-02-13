require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const terminal = require('./lib/terminal');
const logger = require('./lib/logger');
const watcher = require('./lib/watcher');
const notifier = require('./lib/notifier');
const summarizer = require('./lib/summarizer');
const monitor = require('./lib/monitor');

const PORT = parseInt(process.env.PORT || '3030', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- REST API ---

app.get('/api/status', async (_req, res) => {
  const ollamaOk = await summarizer.checkOllama();
  res.json({
    ...terminal.getStatus(),
    ollamaAvailable: ollamaOk,
  });
});

app.get('/api/logs', (_req, res) => {
  res.json(logger.listLogs());
});

app.get('/api/logs/:filename', (req, res) => {
  const content = logger.readLog(req.params.filename);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain').send(content);
});

app.post('/api/summarize', async (req, res) => {
  const { filename } = req.body;
  const target = filename || `${new Date().toISOString().slice(0, 10)}-plain.log`;
  try {
    const result = await summarizer.summarize(target);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('not running') ? 503 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/summaries', (_req, res) => {
  res.json(summarizer.listSummaries());
});

app.get('/api/summaries/:filename', (req, res) => {
  const content = summarizer.readSummary(req.params.filename);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  res.type('text/markdown').send(content);
});

app.get('/api/monitor', (_req, res) => {
  res.json(monitor.getStats());
});

// --- Socket.IO ---

io.on('connection', (socket) => {
  console.log(`[io] client connected: ${socket.id}`);
  terminal.addClient(socket);

  socket.on('input', (data) => {
    terminal.write(data);
  });

  socket.on('resize', ({ cols, rows }) => {
    terminal.resize(cols, rows);
  });

  socket.on('disconnect', () => {
    console.log(`[io] client disconnected: ${socket.id}`);
    terminal.removeClient(socket);
  });
});

// --- Wire events ---

terminal.on('data', (data) => {
  logger.write(data);
  watcher.feed(data);
});

terminal.on('exit', () => {
  io.emit('pty-exit');
});

watcher.on('alert', (alert) => {
  console.log(`[watcher] ${alert.type}: ${alert.detail}`);
  io.emit('alert', alert);

  if (alert.type === 'error' || alert.type === 'permission') {
    notifier.send(`[${alert.type.toUpperCase()}] ${alert.detail}`);
  }
});

// --- Startup ---

async function start() {
  await logger.init();
  await watcher.init();
  await notifier.init();

  terminal.spawn();

  server.listen(PORT, HOST, () => {
    console.log(`\n  OpenClaw Web Terminal`);
    console.log(`  http://${HOST}:${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  terminal.destroy();
  watcher.destroy();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminal.destroy();
  watcher.destroy();
  server.close();
  process.exit(0);
});

/* global Terminal, FitAddon, WebLinksAddon, io */
(function () {
  'use strict';

  // --- PWA Detection ---
  function isPWA() {
    return window.matchMedia('(display-mode: fullscreen)').matches ||
           window.matchMedia('(display-mode: standalone)').matches ||
           navigator.standalone === true;
  }

  const deviceType = isPWA() ? 'pwa' : 'browser';

  // --- Terminal Setup ---
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'FiraCode Nerd Font', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    theme: {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#4ecca3',
      selectionBackground: '#0f346080',
    },
    allowProposedApi: true,
    scrollSensitivity: 3,
  });

  const fitAddon = new FitAddon.FitAddon();
  const webLinksAddon = new WebLinksAddon.WebLinksAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(webLinksAddon);

  const container = document.getElementById('terminal-container');
  term.open(container);
  fitAddon.fit();

  // --- Socket.IO ---
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  function setStatus(state, text) {
    statusDot.className = 'dot ' + state;
    statusText.textContent = text;
  }

  socket.on('connect', () => {
    setStatus('connected', 'Connected');
    socket.emit('register', { deviceType });
  });

  socket.on('pty-dimensions', ({ cols, rows }) => {
    if (deviceType === 'pwa') {
      term.resize(cols, rows);
      fitAddon.fit();
    }
  });

  socket.on('client-count', (count) => {
    const el = document.getElementById('client-count');
    if (el) el.textContent = count;
  });

  socket.on('disconnect', () => {
    setStatus('disconnected', 'Disconnected');
  });

  socket.on('reconnecting', () => {
    setStatus('reconnecting', 'Reconnecting...');
  });

  socket.on('reconnect_attempt', () => {
    setStatus('reconnecting', 'Reconnecting...');
  });

  socket.on('output', (data) => {
    term.write(data);
  });

  socket.on('pty-exit', () => {
    term.writeln('\r\n\x1b[33m[PTY exited, reconnecting...]\x1b[0m');
  });

  socket.on('alert', (alert) => {
    showToast(`${alert.type}: ${alert.detail}`, alert.type === 'error' ? 'error' : 'warning');
  });

  // --- Mobile Korean IME fix ---
  const xtermTextarea = term.textarea;

  if (xtermTextarea) {
    xtermTextarea.setAttribute('autocomplete', 'off');
    xtermTextarea.setAttribute('autocorrect', 'off');
    xtermTextarea.setAttribute('autocapitalize', 'off');
    xtermTextarea.setAttribute('spellcheck', 'false');
    xtermTextarea.setAttribute('data-gramm', 'false');
  }

  // Terminal input -> server
  term.onData((data) => {
    socket.emit('input', data);
  });

  // --- Resize handling ---
  function doResize() {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      socket.emit('resize', { cols: dims.cols, rows: dims.rows });
    }
  }

  if (deviceType !== 'pwa') {
    window.addEventListener('resize', doResize);
    window.addEventListener('orientationchange', () => setTimeout(doResize, 200));
    setTimeout(doResize, 100);
  }

  // --- Clock ---
  const clockEl = document.getElementById('clock');
  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toTimeString().slice(0, 5);
  }
  updateClock();
  setInterval(updateClock, 60000);

  // --- Toast ---
  const toastEl = document.getElementById('alert-toast');
  let toastTimer = null;

  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + (type || '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 5000);
  }

  // --- Util ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Export for drawer (Commit 4)
  window.__openclaw = { term, socket, fitAddon, escapeHtml, showToast, doResize, deviceType, isPWA };

  // --- PWA Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // --- System Monitor ---
  const monCpu = document.getElementById('mon-cpu');
  const monGpu = document.getElementById('mon-gpu');
  const monNet = document.getElementById('mon-net');

  function colorByPercent(pct) {
    if (pct >= 80) return 'var(--red)';
    if (pct >= 50) return 'var(--yellow)';
    return 'var(--green)';
  }

  async function updateMonitor() {
    try {
      const res = await fetch('/api/monitor');
      const d = await res.json();
      monCpu.textContent = `CPU ${d.cpu}%`;
      monCpu.style.color = colorByPercent(d.cpu);

      if (d.gpuAvailable) {
        monGpu.textContent = `GPU ${d.gpu}%`;
        monGpu.style.color = colorByPercent(d.gpu);
        monGpu.style.display = '';
      } else {
        monGpu.style.display = 'none';
      }

      monNet.textContent = `NET ${d.netFormatted}`;
      monNet.style.color = 'var(--green)';
    } catch (_) { /* ignore */ }
  }

  updateMonitor();
  setInterval(updateMonitor, 3000);

  // Focus terminal on touch (mobile)
  container.addEventListener('touchstart', () => term.focus(), { passive: true });
})();

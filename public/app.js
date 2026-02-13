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

  // --- Drawer ---
  const drawerEl = document.getElementById('drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerContent = document.getElementById('drawer-content');
  const drawerClose = document.getElementById('drawer-close');
  const drawerBack = document.getElementById('drawer-back');
  const drawerHistory = [];

  function openDrawer() {
    drawerHistory.length = 0;
    drawerBack.style.display = 'none';
    showDrawerMenu();
    drawerEl.classList.add('open');
    drawerBackdrop.classList.add('open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    drawerHistory.length = 0;
    term.focus();
  }

  function showDrawerContent(title, html, pushHistory) {
    if (pushHistory) {
      drawerHistory.push({ title: drawerTitle.textContent, html: drawerContent.innerHTML });
      drawerBack.style.display = '';
    }
    drawerTitle.textContent = title;
    drawerContent.innerHTML = html;
    drawerContent.scrollTop = 0;
  }

  function drawerGoBack() {
    const prev = drawerHistory.pop();
    if (prev) {
      drawerTitle.textContent = prev.title;
      drawerContent.innerHTML = prev.html;
      if (drawerHistory.length === 0) drawerBack.style.display = 'none';
    }
  }

  function showDrawerMenu() {
    drawerTitle.textContent = 'Menu';
    drawerContent.innerHTML = [
      '<div class="drawer-menu-item" data-action="summaries">Summary</div>',
      '<div class="drawer-menu-item" data-action="logs">Logs</div>',
      '<div class="drawer-menu-item" data-action="reload">Reload</div>',
    ].join('');
  }

  // Drawer trigger
  document.getElementById('btn-drawer').addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  drawerBack.addEventListener('click', drawerGoBack);

  // ESC to close drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerEl.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Swipe right to close drawer
  let swipeStartX = 0;
  drawerEl.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
  }, { passive: true });

  drawerEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (dx > 60) closeDrawer();
  }, { passive: true });

  // Drawer menu actions (event delegation)
  drawerContent.addEventListener('click', async (e) => {
    const menuItem = e.target.closest('.drawer-menu-item');
    if (menuItem) {
      const action = menuItem.dataset.action;
      if (action === 'summaries') showSummaries();
      else if (action === 'logs') showLogs();
      else if (action === 'reload') location.reload(true);
      return;
    }

    const logItem = e.target.closest('.log-item');
    if (logItem) {
      const file = logItem.dataset.file;
      showDrawerContent(file, '<div class="loading">Loading...</div>', true);
      try {
        const r = await fetch(`/api/logs/${encodeURIComponent(file)}`);
        const text = await r.text();
        drawerContent.innerHTML = `<pre>${escapeHtml(text.slice(-8000))}</pre>`;
      } catch (err) {
        drawerContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
      }
      return;
    }

    const summaryItem = e.target.closest('.summary-item');
    if (summaryItem) {
      const file = summaryItem.dataset.file;
      showDrawerContent(file, '<div class="loading">Loading...</div>', true);
      try {
        const r = await fetch(`/api/summaries/${encodeURIComponent(file)}`);
        const text = await r.text();
        drawerContent.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
      } catch (err) {
        drawerContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
      }
      return;
    }

    const genBtn = e.target.closest('.btn-generate');
    if (genBtn) {
      showDrawerContent('Summarizing...', '<div class="loading">Sending to Ollama...</div>', true);
      try {
        const r = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || 'Unknown error');
        }
        const result = await r.json();
        drawerContent.innerHTML = `<pre>${escapeHtml(result.summary)}</pre>`;
        drawerTitle.textContent = 'Summary';
      } catch (err) {
        drawerContent.innerHTML = `<div class="loading">${escapeHtml(err.message)}</div>`;
        drawerTitle.textContent = 'Error';
      }
    }
  });

  async function showLogs() {
    showDrawerContent('Logs', '<div class="loading">Loading...</div>', true);
    try {
      const res = await fetch('/api/logs');
      const files = await res.json();
      if (files.length === 0) {
        drawerContent.innerHTML = '<div class="loading">No logs yet</div>';
        return;
      }
      drawerContent.innerHTML = files
        .map((f) => `<div class="log-item" data-file="${f}">${f}</div>`)
        .join('');
    } catch (err) {
      drawerContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  }

  async function showSummaries() {
    showDrawerContent('Summaries', '<div class="loading">Loading...</div>', true);
    try {
      const res = await fetch('/api/summaries');
      const files = await res.json();

      let html = '<button class="btn-generate">Generate New Summary</button>';
      if (files.length > 0) {
        html += files
          .map((f) => `<div class="summary-item" data-file="${f}">${f}</div>`)
          .join('');
      } else {
        html += '<div style="color:#888;margin-top:8px">No summaries yet</div>';
      }
      drawerContent.innerHTML = html;
    } catch (err) {
      drawerContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  }

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

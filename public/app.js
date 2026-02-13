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

  // --- Custom Keyboard (PWA only) ---
  if (isPWA()) {
    // Block soft keyboard, keep physical keyboard working
    if (xtermTextarea) {
      xtermTextarea.setAttribute('inputmode', 'none');
    }

    const kbdContainer = document.getElementById('mobile-keyboard');

    // Modifier state
    let shiftActive = false;
    let ctrlSticky = false;
    let altSticky = false;
    let fnActive = false;

    // Shortcut rows
    const shortcutRow1 = [
      { label: 'C-c', seq: '\x03' },
      { label: 'C-z', seq: '\x1a' },
      { label: 'C-d', seq: '\x04' },
      { label: 'C-a', seq: '\x01' },
      { label: 'C-l', seq: '\x0c' },
      { label: 'C-r', seq: '\x12' },
      { label: 'C-w', seq: '\x17' },
      { label: 'C-k', seq: '\x0b' },
      { label: 'C-u', seq: '\x15' },
      { label: 'C-e', seq: '\x05' },
    ];

    const shortcutRow2 = [
      { label: '\u2190', seq: '\x1b[D' },
      { label: '\u2191', seq: '\x1b[A' },
      { label: '\u2193', seq: '\x1b[B' },
      { label: '\u2192', seq: '\x1b[C' },
      { label: '|', seq: '|' },
      { label: '\\', seq: '\\' },
      { label: '_', seq: '_' },
      { label: '+', seq: '+' },
      { label: '-', seq: '-' },
      { label: '`', seq: '`' },
    ];

    // HHKB layout
    const row1 = [
      { label: 'Esc', shift: 'Esc', seq: '\x1b', fn: null },
      { label: '1', shift: '!', seq: null, fn: 'F1' },
      { label: '2', shift: '@', seq: null, fn: 'F2' },
      { label: '3', shift: '#', seq: null, fn: 'F3' },
      { label: '4', shift: '$', seq: null, fn: 'F4' },
      { label: '5', shift: '%', seq: null, fn: 'F5' },
      { label: '6', shift: '^', seq: null, fn: 'F6' },
      { label: '7', shift: '&', seq: null, fn: 'F7' },
      { label: '8', shift: '*', seq: null, fn: 'F8' },
      { label: '9', shift: '(', seq: null, fn: 'F9' },
      { label: '0', shift: ')', seq: null, fn: 'F10' },
      { label: '-', shift: '_', seq: null, fn: 'F11' },
      { label: '=', shift: '+', seq: null, fn: 'F12' },
      { label: '\\', shift: '|', seq: null, fn: null },
      { label: 'Del', shift: 'Del', seq: '\x1b[3~', fn: null },
    ];

    const row2 = [
      { label: 'Tab', shift: 'Tab', seq: '\t', cls: 'w15', fn: null },
      { label: 'q', shift: 'Q', seq: null, fn: null },
      { label: 'w', shift: 'W', seq: null, fn: null },
      { label: 'e', shift: 'E', seq: null, fn: null },
      { label: 'r', shift: 'R', seq: null, fn: null },
      { label: 't', shift: 'T', seq: null, fn: null },
      { label: 'y', shift: 'Y', seq: null, fn: null },
      { label: 'u', shift: 'U', seq: null, fn: null },
      { label: 'i', shift: 'I', seq: null, fn: null },
      { label: 'o', shift: 'O', seq: null, fn: null },
      { label: 'p', shift: 'P', seq: null, fn: null },
      { label: '[', shift: '{', seq: null, fn: null },
      { label: ']', shift: '}', seq: null, fn: null },
      { label: 'BS', shift: 'BS', seq: '\x7f', cls: 'w15', fn: null },
    ];

    const row3 = [
      { label: 'Ctrl', shift: 'Ctrl', seq: '__ctrl__', cls: 'w175', fn: null },
      { label: 'a', shift: 'A', seq: null, fn: 'Home' },
      { label: 's', shift: 'S', seq: null, fn: null },
      { label: 'd', shift: 'D', seq: null, fn: 'PgDn' },
      { label: 'f', shift: 'F', seq: null, fn: null },
      { label: 'g', shift: 'G', seq: null, fn: null },
      { label: 'h', shift: 'H', seq: null, fn: null },
      { label: 'j', shift: 'J', seq: null, fn: null },
      { label: 'k', shift: 'K', seq: null, fn: null },
      { label: 'l', shift: 'L', seq: null, fn: null },
      { label: ';', shift: ':', seq: null, fn: null },
      { label: "'", shift: '"', seq: null, fn: null },
      { label: 'Enter', shift: 'Enter', seq: '\r', cls: 'w175', fn: null },
    ];

    const row4 = [
      { label: 'Shift', shift: 'Shift', seq: '__shift__', cls: 'w225', fn: null },
      { label: 'z', shift: 'Z', seq: null, fn: null },
      { label: 'x', shift: 'X', seq: null, fn: null },
      { label: 'c', shift: 'C', seq: null, fn: null },
      { label: 'v', shift: 'V', seq: null, fn: null },
      { label: 'b', shift: 'B', seq: null, fn: null },
      { label: 'n', shift: 'N', seq: null, fn: null },
      { label: 'm', shift: 'M', seq: null, fn: null },
      { label: ',', shift: '<', seq: null, fn: null },
      { label: '.', shift: '>', seq: null, fn: null },
      { label: '/', shift: '?', seq: null, fn: null },
      { label: 'Shift', shift: 'Shift', seq: '__shift__', cls: 'w225', fn: null },
    ];

    const row5 = [
      { label: 'Fn', shift: 'Fn', seq: '__fn__', fn: null },
      { label: 'Alt', shift: 'Alt', seq: '__alt__', fn: null },
      { label: '\u2318', shift: '\u2318', seq: '__meta__', fn: null },
      { label: '', shift: '', seq: ' ', cls: 'kbd-space', fn: null },
      { label: '\u2318', shift: '\u2318', seq: '__meta__', fn: null },
      { label: 'Alt', shift: 'Alt', seq: '__alt__', fn: null },
      { label: 'Fn', shift: 'Fn', seq: '__fn__', fn: null },
    ];

    const fnKeyMap = {
      'F1': '\x1bOP', 'F2': '\x1bOQ', 'F3': '\x1bOR', 'F4': '\x1bOS',
      'F5': '\x1b[15~', 'F6': '\x1b[17~', 'F7': '\x1b[18~', 'F8': '\x1b[19~',
      'F9': '\x1b[20~', 'F10': '\x1b[21~', 'F11': '\x1b[23~', 'F12': '\x1b[24~',
      'Home': '\x1b[H', 'End': '\x1b[F', 'PgUp': '\x1b[5~', 'PgDn': '\x1b[6~',
    };

    function buildRow(keys, isFnRow) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'kbd-row';
      keys.forEach((key) => {
        const btn = document.createElement('div');
        btn.className = 'kbd-key' + (isFnRow ? ' kbd-fn-key' : '') + (key.cls ? ' ' + key.cls : '');
        btn.textContent = key.label;
        btn.dataset.label = key.label;
        btn.dataset.shift = key.shift || key.label;
        btn.dataset.seq = key.seq || '';
        if (key.fn) btn.dataset.fn = key.fn;
        rowDiv.appendChild(btn);
      });
      return rowDiv;
    }

    const kbdDiv = document.createElement('div');
    kbdDiv.className = 'mobile-kbd';
    kbdDiv.appendChild(buildRow(shortcutRow1, true));
    kbdDiv.appendChild(buildRow(shortcutRow2, true));
    kbdDiv.appendChild(buildRow(row1, false));
    kbdDiv.appendChild(buildRow(row2, false));
    kbdDiv.appendChild(buildRow(row3, false));
    kbdDiv.appendChild(buildRow(row4, false));
    kbdDiv.appendChild(buildRow(row5, false));
    kbdContainer.appendChild(kbdDiv);

    function updateKeyLabels() {
      kbdDiv.querySelectorAll('.kbd-key:not(.kbd-fn-key)').forEach((btn) => {
        const seq = btn.dataset.seq;
        if (seq && seq.startsWith('__')) return;
        if (fnActive && btn.dataset.fn) {
          btn.textContent = btn.dataset.fn;
        } else {
          btn.textContent = shiftActive ? btn.dataset.shift : btn.dataset.label;
        }
      });
    }

    function updateModifierUI() {
      kbdDiv.querySelectorAll('.kbd-key').forEach((btn) => {
        const seq = btn.dataset.seq;
        if (seq === '__shift__') btn.classList.toggle('active', shiftActive);
        if (seq === '__ctrl__') btn.classList.toggle('active', ctrlSticky);
        if (seq === '__alt__') btn.classList.toggle('active', altSticky);
        if (seq === '__fn__') btn.classList.toggle('active', fnActive);
      });
    }

    function sendKey(char) {
      let out = char;

      if (ctrlSticky && char.length === 1 && char >= 'a' && char <= 'z') {
        out = String.fromCharCode(char.charCodeAt(0) - 96);
        ctrlSticky = false;
      } else if (ctrlSticky && char.length === 1 && char >= 'A' && char <= 'Z') {
        out = String.fromCharCode(char.charCodeAt(0) - 64);
        ctrlSticky = false;
      } else if (altSticky) {
        out = '\x1b' + char;
        altSticky = false;
      }

      socket.emit('input', out);
      updateModifierUI();
    }

    // Prevent focus loss on keyboard tap
    kbdDiv.addEventListener('mousedown', (e) => e.preventDefault());
    kbdDiv.addEventListener('touchstart', (e) => {
      // Allow scrolling but prevent focus loss
      if (e.target.closest('.kbd-key')) {
        e.preventDefault();
      }
    });

    kbdDiv.addEventListener('touchend', (e) => {
      const btn = e.target.closest('.kbd-key');
      if (!btn) return;
      e.preventDefault();

      const seq = btn.dataset.seq;

      // Modifiers
      if (seq === '__shift__') {
        shiftActive = !shiftActive;
        updateKeyLabels();
        updateModifierUI();
        return;
      }
      if (seq === '__ctrl__') {
        ctrlSticky = !ctrlSticky;
        updateModifierUI();
        return;
      }
      if (seq === '__alt__') {
        altSticky = !altSticky;
        updateModifierUI();
        return;
      }
      if (seq === '__fn__') {
        fnActive = !fnActive;
        updateKeyLabels();
        updateModifierUI();
        return;
      }
      if (seq === '__meta__') {
        return; // Meta key not used in terminal
      }

      // Fn layer
      if (fnActive && btn.dataset.fn) {
        const fnSeq = fnKeyMap[btn.dataset.fn];
        if (fnSeq) {
          socket.emit('input', fnSeq);
          fnActive = false;
          updateKeyLabels();
          updateModifierUI();
        }
        return;
      }

      // Fixed sequence keys (Esc, Tab, Enter, BS, Del, arrows, shortcuts)
      if (seq) {
        sendKey(seq);
        return;
      }

      // Character keys
      const ch = shiftActive ? btn.dataset.shift : btn.dataset.label;
      if (ch.length === 1) {
        sendKey(ch);
        if (shiftActive) {
          shiftActive = false;
          updateKeyLabels();
          updateModifierUI();
        }
      }

      term.focus();
    });

    // Also handle click for desktop PWA testing
    kbdDiv.addEventListener('click', (e) => {
      const btn = e.target.closest('.kbd-key');
      if (!btn) return;
      // On touch devices, touchend already handled it
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;

      const seq = btn.dataset.seq;

      if (seq === '__shift__') {
        shiftActive = !shiftActive;
        updateKeyLabels();
        updateModifierUI();
        return;
      }
      if (seq === '__ctrl__') {
        ctrlSticky = !ctrlSticky;
        updateModifierUI();
        return;
      }
      if (seq === '__alt__') {
        altSticky = !altSticky;
        updateModifierUI();
        return;
      }
      if (seq === '__fn__') {
        fnActive = !fnActive;
        updateKeyLabels();
        updateModifierUI();
        return;
      }
      if (seq === '__meta__') return;

      if (fnActive && btn.dataset.fn) {
        const fnSeq = fnKeyMap[btn.dataset.fn];
        if (fnSeq) {
          socket.emit('input', fnSeq);
          fnActive = false;
          updateKeyLabels();
          updateModifierUI();
        }
        return;
      }

      if (seq) {
        sendKey(seq);
        return;
      }

      const ch = shiftActive ? btn.dataset.shift : btn.dataset.label;
      if (ch.length === 1) {
        sendKey(ch);
        if (shiftActive) {
          shiftActive = false;
          updateKeyLabels();
          updateModifierUI();
        }
      }

      term.focus();
    });

    // Re-fit terminal with keyboard visible
    setTimeout(() => fitAddon.fit(), 200);
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

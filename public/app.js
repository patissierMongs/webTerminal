/* global Terminal, FitAddon, WebLinksAddon, io */
(function () {
  'use strict';

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
  // Disable Android keyboard autocomplete/prediction to reduce interference
  // with xterm.js internal IME handling. Do NOT clear textarea — it breaks
  // cross-syllable Korean composition (e.g. "안녕" becomes "안ㅕ").
  const xtermTextarea = term.textarea;

  if (xtermTextarea) {
    xtermTextarea.setAttribute('autocomplete', 'off');
    xtermTextarea.setAttribute('autocorrect', 'off');
    xtermTextarea.setAttribute('autocapitalize', 'off');
    xtermTextarea.setAttribute('spellcheck', 'false');
    xtermTextarea.setAttribute('data-gramm', 'false');
  }

  // Terminal input -> server (let xterm.js handle IME natively)
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

  window.addEventListener('resize', doResize);
  window.addEventListener('orientationchange', () => setTimeout(doResize, 200));

  // Initial resize after a tick
  setTimeout(doResize, 100);

  // --- Modal ---
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalContent = document.getElementById('modal-content');
  const modalClose = document.getElementById('modal-close');

  function showModal(title, html) {
    modalTitle.textContent = title;
    modalContent.innerHTML = html;
    modalContent.scrollTop = 0;
    overlay.classList.remove('hidden');
  }

  function hideModal() {
    overlay.classList.add('hidden');
  }

  modalClose.addEventListener('click', hideModal);
  overlay.addEventListener('click', (e) => {
    if (!document.getElementById('modal').contains(e.target)) hideModal();
  });

  // --- Logs ---
  document.getElementById('btn-logs').addEventListener('click', async () => {
    showModal('Logs', '<div class="loading">Loading...</div>');
    try {
      const res = await fetch('/api/logs');
      const files = await res.json();
      if (files.length === 0) {
        modalContent.innerHTML = '<div class="loading">No logs yet</div>';
        return;
      }
      modalContent.innerHTML = files
        .map((f) => `<div class="log-item" data-file="${f}">${f}</div>`)
        .join('');

      modalContent.querySelectorAll('.log-item').forEach((el) => {
        el.addEventListener('click', async () => {
          const file = el.dataset.file;
          showModal(file, '<div class="loading">Loading...</div>');
          const r = await fetch(`/api/logs/${encodeURIComponent(file)}`);
          const text = await r.text();
          modalContent.innerHTML = `<pre>${escapeHtml(text.slice(-8000))}</pre>`;
        });
      });
    } catch (err) {
      modalContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  });

  // --- Summarize ---
  document.getElementById('btn-summarize').addEventListener('click', async () => {
    showModal('Summaries', '<div class="loading">Loading...</div>');
    try {
      const res = await fetch('/api/summaries');
      const files = await res.json();

      let html = '<button class="btn-generate" id="btn-gen-summary">Generate New Summary</button>';

      if (files.length > 0) {
        html += files
          .map((f) => `<div class="summary-item" data-file="${f}">${f}</div>`)
          .join('');
      } else {
        html += '<div style="color:#888;margin-top:8px">No summaries yet</div>';
      }

      modalContent.innerHTML = html;

      document.getElementById('btn-gen-summary').addEventListener('click', async () => {
        showModal('Summarizing...', '<div class="loading">Sending to Ollama...</div>');
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
          showModal('Summary', `<pre>${escapeHtml(result.summary)}</pre>`);
        } catch (err) {
          showModal('Error', `<div class="loading">${escapeHtml(err.message)}</div>`);
        }
      });

      modalContent.querySelectorAll('.summary-item').forEach((el) => {
        el.addEventListener('click', async () => {
          const file = el.dataset.file;
          showModal(file, '<div class="loading">Loading...</div>');
          const r = await fetch(`/api/summaries/${encodeURIComponent(file)}`);
          const text = await r.text();
          modalContent.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
        });
      });
    } catch (err) {
      modalContent.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  });

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

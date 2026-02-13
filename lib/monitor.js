const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');

// --- CPU (delta-based) ---

let prevCpuIdle = 0;
let prevCpuTotal = 0;

function getCpu() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    const { user, nice, sys, idle: i, irq } = cpu.times;
    total += user + nice + sys + i + irq;
    idle += i;
  }

  const dIdle = idle - prevCpuIdle;
  const dTotal = total - prevCpuTotal;
  prevCpuIdle = idle;
  prevCpuTotal = total;

  if (dTotal === 0) return 0;
  return Math.round((1 - dIdle / dTotal) * 100);
}

// --- GPU ---

function getGpu() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
      { timeout: 3000, encoding: 'utf-8' }
    );
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return -1; // unavailable
  }
}

// --- NET (auto-detect active interface, delta-based) ---

let prevNetBytes = 0;
let prevNetTime = 0;

function findActiveInterface() {
  try {
    const data = fs.readFileSync('/proc/net/dev', 'utf-8');
    const lines = data.split('\n').slice(2); // skip header
    let best = null;
    let bestTotal = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [iface, ...rest] = trimmed.split(':');
      const name = iface.trim();
      if (name === 'lo' || name.startsWith('docker') || name.startsWith('br-') || name.startsWith('loopback')) continue;
      const parts = rest.join(':').trim().split(/\s+/);
      const rx = parseInt(parts[0], 10) || 0;
      const tx = parseInt(parts[8], 10) || 0;
      const total = rx + tx;
      if (total > bestTotal) {
        bestTotal = total;
        best = name;
      }
    }
    return best;
  } catch {
    return null;
  }
}

let activeIface = null;

function getNetBytes() {
  try {
    if (!activeIface) activeIface = findActiveInterface();
    if (!activeIface) return 0;

    const data = fs.readFileSync('/proc/net/dev', 'utf-8');
    const line = data.split('\n').find(l => l.trim().startsWith(activeIface + ':'));
    if (!line) return 0;

    const parts = line.split(':')[1].trim().split(/\s+/);
    const rx = parseInt(parts[0], 10) || 0;
    const tx = parseInt(parts[8], 10) || 0;
    return rx + tx;
  } catch {
    return 0;
  }
}

function getNet() {
  const now = Date.now();
  const currentBytes = getNetBytes();

  if (prevNetTime === 0) {
    prevNetBytes = currentBytes;
    prevNetTime = now;
    return { bytesPerSec: 0, iface: activeIface };
  }

  const elapsed = (now - prevNetTime) / 1000;
  if (elapsed <= 0) return { bytesPerSec: 0, iface: activeIface };

  const bytesPerSec = Math.max(0, (currentBytes - prevNetBytes) / elapsed);
  prevNetBytes = currentBytes;
  prevNetTime = now;

  return { bytesPerSec: Math.round(bytesPerSec), iface: activeIface };
}

// Re-detect interface every 60s in case it changes
setInterval(() => { activeIface = null; }, 60_000);

// --- Format helpers ---

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

function getStats() {
  const net = getNet();
  const gpu = getGpu();
  return {
    cpu: getCpu(),
    gpu,
    gpuAvailable: gpu >= 0,
    net: net.bytesPerSec,
    netFormatted: formatBytes(net.bytesPerSec),
    netIface: net.iface,
  };
}

module.exports = { getStats };

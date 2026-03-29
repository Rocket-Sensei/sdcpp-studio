import readline from 'readline';

const MAX_LOG_LINES = 2000;
const ESC = '\x1b[';

const state = {
  initialized: false,
  active: false,
  hasTty: false,
  title: 'sd.cpp Studio',
  startTime: Date.now(),
  logs: [],
  scrollOffset: 0,
  lastRenderAt: 0,
  renderScheduled: false,
  renderTimer: null,
  status: {
    phase: 'starting',
    host: null,
    port: null,
    queue: null,
    model: null,
  },
  onExitRequest: null,
  stdinWasRaw: false,
  originalStdoutWrite: null,
  originalStderrWrite: null,
  bypassInterception: false,
  keypressHandler: null,
};

function isTerminalModeEnabled() {
  return process.argv.includes('--terminal-ui');
}

function hasInteractiveTTY() {
  return Boolean(process.stdout?.isTTY && process.stdin?.isTTY);
}

function levelToTag(level) {
  const normalized = String(level || 'info').toLowerCase();
  if (normalized === 'error' || normalized === 'fatal') return 'ERR';
  if (normalized === 'warn' || normalized === 'warning') return 'WRN';
  if (normalized === 'debug') return 'DBG';
  if (normalized === 'trace') return 'TRC';
  return 'INF';
}

function levelToColor(level) {
  const normalized = String(level || 'info').toLowerCase();
  if (normalized === 'error' || normalized === 'fatal') return `${ESC}31m`;
  if (normalized === 'warn' || normalized === 'warning') return `${ESC}33m`;
  if (normalized === 'debug') return `${ESC}36m`;
  if (normalized === 'trace') return `${ESC}90m`;
  return `${ESC}32m`;
}

function stripAnsi(input) {
  if (!input) return '';
  return String(input)
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function truncateToWidth(text, width) {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function padToWidth(text, width) {
  if (text.length >= width) return text;
  return `${text}${' '.repeat(width - text.length)}`;
}

function getLogAreaHeight(rows) {
  const reserved = 6;
  return Math.max(4, rows - reserved);
}

function withBypassInterception(fn) {
  state.bypassInterception = true;
  try {
    fn();
  } finally {
    state.bypassInterception = false;
  }
}

function writeToRealStdout(data) {
  const writer = state.originalStdoutWrite || process.stdout.write.bind(process.stdout);
  writer(data);
}

function appendLogEntry(entry) {
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
  }
}

function requestRender(force = false) {
  if (!state.active) return;

  const now = Date.now();
  if (!force && now - state.lastRenderAt < 50) {
    if (!state.renderScheduled) {
      state.renderScheduled = true;
      setTimeout(() => {
        state.renderScheduled = false;
        render();
      }, 50);
    }
    return;
  }

  render();
}

function formatStatusLine(width) {
  const uptimeSeconds = Math.max(0, Math.floor((Date.now() - state.startTime) / 1000));
  const hostPort = state.status.host && state.status.port
    ? `${state.status.host}:${state.status.port}`
    : 'starting';
  const parts = [
    `phase:${state.status.phase || 'running'}`,
    `http:${hostPort}`,
    `uptime:${uptimeSeconds}s`,
  ];

  if (state.status.model) {
    parts.push(`model:${state.status.model}`);
  }
  if (state.status.queue !== null && state.status.queue !== undefined) {
    parts.push(`queue:${state.status.queue}`);
  }

  return truncateToWidth(parts.join(' | '), width);
}

function getVisibleLogs(areaHeight, width) {
  const maxOffset = Math.max(0, state.logs.length - areaHeight);
  if (state.scrollOffset > maxOffset) {
    state.scrollOffset = maxOffset;
  }

  const endExclusive = Math.max(0, state.logs.length - state.scrollOffset);
  const startInclusive = Math.max(0, endExclusive - areaHeight);
  const slice = state.logs.slice(startInclusive, endExclusive);

  return slice.map((entry) => {
    const modulePart = entry.module ? `[${entry.module}] ` : '';
    const timePart = entry.time ? `${entry.time} ` : '';
    const tag = levelToTag(entry.level);
    const prefix = `${timePart}${tag} ${modulePart}`;
    const availableWidth = Math.max(8, width - stripAnsi(prefix).length);
    const message = truncateToWidth(entry.message, availableWidth);
    const color = levelToColor(entry.level);
    return `${color}${prefix}${ESC}0m${message}`;
  });
}

function render() {
  if (!state.active || !state.hasTty) return;

  const cols = process.stdout.columns || 120;
  const rows = process.stdout.rows || 30;
  const logAreaHeight = getLogAreaHeight(rows);
  const visibleLogs = getVisibleLogs(logAreaHeight, cols);
  const maxOffset = Math.max(0, state.logs.length - logAreaHeight);
  const scrollHint = state.scrollOffset > 0
    ? `scroll:${state.scrollOffset}/${maxOffset}`
    : 'live';

  const header = padToWidth(`${ESC}1m${state.title}${ESC}0m  terminal-ui`, cols);
  const status = padToWidth(formatStatusLine(cols), cols);
  const controls = padToWidth('keys: up/down pgup/pgdn home/end | q or ctrl+c to exit', cols);
  const divider = '-'.repeat(Math.max(0, cols));
  const footer = padToWidth(`logs:${state.logs.length} | ${scrollHint}`, cols);

  const body = [];
  for (let i = 0; i < logAreaHeight; i += 1) {
    body.push(padToWidth(visibleLogs[i] || '', cols));
  }

  const frame = [header, status, controls, divider, ...body, divider, footer].join('\n');

  withBypassInterception(() => {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    writeToRealStdout(frame);
  });

  state.lastRenderAt = Date.now();
}

function handleCapturedOutput(chunk, source = 'stdio') {
  const text = stripAnsi(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || ''));
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return;

  const time = new Date().toISOString().split('T')[1].slice(0, 12);
  lines.forEach((line) => {
    appendLogEntry({
      level: source === 'stderr' ? 'warn' : 'info',
      module: source,
      message: line,
      time,
    });
  });

  requestRender();
}

function installStdIoInterception() {
  if (state.originalStdoutWrite || state.originalStderrWrite) return;

  state.originalStdoutWrite = process.stdout.write.bind(process.stdout);
  state.originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk, encoding, callback) => {
    if (!state.active || state.bypassInterception) {
      return state.originalStdoutWrite(chunk, encoding, callback);
    }

    handleCapturedOutput(chunk, 'stdout');
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };

  process.stderr.write = (chunk, encoding, callback) => {
    if (!state.active || state.bypassInterception) {
      return state.originalStderrWrite(chunk, encoding, callback);
    }

    handleCapturedOutput(chunk, 'stderr');
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };
}

function uninstallStdIoInterception() {
  if (state.originalStdoutWrite) {
    process.stdout.write = state.originalStdoutWrite;
    state.originalStdoutWrite = null;
  }
  if (state.originalStderrWrite) {
    process.stderr.write = state.originalStderrWrite;
    state.originalStderrWrite = null;
  }
}

function installKeyboardHandler() {
  if (!process.stdin?.isTTY || state.keypressHandler) return;

  readline.emitKeypressEvents(process.stdin);
  state.stdinWasRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  state.keypressHandler = (_, key = {}) => {
    if (!state.active) return;

    const rows = process.stdout.rows || 30;
    const logAreaHeight = getLogAreaHeight(rows);
    const maxOffset = Math.max(0, state.logs.length - logAreaHeight);

    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      if (typeof state.onExitRequest === 'function') {
        state.onExitRequest();
      } else {
        process.kill(process.pid, 'SIGINT');
      }
      return;
    }

    if (key.name === 'up') {
      state.scrollOffset = Math.min(maxOffset, state.scrollOffset + 1);
      requestRender(true);
      return;
    }
    if (key.name === 'down') {
      state.scrollOffset = Math.max(0, state.scrollOffset - 1);
      requestRender(true);
      return;
    }
    if (key.name === 'pageup') {
      state.scrollOffset = Math.min(maxOffset, state.scrollOffset + logAreaHeight);
      requestRender(true);
      return;
    }
    if (key.name === 'pagedown') {
      state.scrollOffset = Math.max(0, state.scrollOffset - logAreaHeight);
      requestRender(true);
      return;
    }
    if (key.name === 'home') {
      state.scrollOffset = maxOffset;
      requestRender(true);
      return;
    }
    if (key.name === 'end') {
      state.scrollOffset = 0;
      requestRender(true);
    }
  };

  process.stdin.on('keypress', state.keypressHandler);
}

function uninstallKeyboardHandler() {
  if (state.keypressHandler && process.stdin) {
    process.stdin.off('keypress', state.keypressHandler);
    state.keypressHandler = null;
  }

  if (process.stdin?.isTTY) {
    if (!state.stdinWasRaw && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }
}

function enterAlternateScreen() {
  withBypassInterception(() => {
    writeToRealStdout(`${ESC}?1049h${ESC}?25l`);
  });
}

function leaveAlternateScreen() {
  withBypassInterception(() => {
    writeToRealStdout(`${ESC}?25h${ESC}?1049l`);
  });
}

export function initializeTerminalUI(options = {}) {
  if (state.initialized) return state.active;

  state.initialized = true;
  state.hasTty = hasInteractiveTTY();

  if (!isTerminalModeEnabled() || !state.hasTty) {
    state.active = false;
    return false;
  }

  state.active = true;
  state.startTime = Date.now();
  state.title = options.title || state.title;
  state.onExitRequest = options.onExitRequest || null;

  installStdIoInterception();
  installKeyboardHandler();
  enterAlternateScreen();

  appendLogEntry({
    level: 'info',
    module: 'terminal-ui',
    message: 'Terminal UI initialized',
    time: new Date().toISOString().split('T')[1].slice(0, 12),
  });

  state.renderTimer = setInterval(() => {
    requestRender();
  }, 500);

  process.stdout.on('resize', requestRender);
  requestRender(true);
  return true;
}

export function shutdownTerminalUI() {
  if (!state.active) {
    uninstallStdIoInterception();
    return;
  }

  state.active = false;

  if (state.renderTimer) {
    clearInterval(state.renderTimer);
    state.renderTimer = null;
  }

  process.stdout.off('resize', requestRender);
  uninstallKeyboardHandler();
  leaveAlternateScreen();
  uninstallStdIoInterception();
}

export function setTerminalUIStatus(partialStatus) {
  if (!state.active) return;
  state.status = { ...state.status, ...partialStatus };
  requestRender();
}

export function addTerminalUILog(log) {
  if (!state.active || !log) return;

  const time = log.time
    ? String(log.time).split('T').pop().slice(0, 12)
    : new Date().toISOString().split('T')[1].slice(0, 12);

  appendLogEntry({
    level: log.level || 'info',
    module: log.module || null,
    message: stripAnsi(log.message || log.msg || ''),
    time,
  });

  requestRender();
}

export function createTerminalUiPinoStream(defaultModule = null) {
  if (!isTerminalModeEnabled()) return null;

  initializeTerminalUI();
  if (!state.active) return null;

  return {
    write(chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          addTerminalUILog({
            level: entry.level || 'info',
            module: entry.module || defaultModule,
            message: entry.msg || entry.stdout || entry.stderr || JSON.stringify(entry),
            time: entry.time,
          });
        } catch {
          addTerminalUILog({
            level: 'info',
            module: defaultModule,
            message: line,
          });
        }
      }
    },
  };
}

export function getTerminalUIRecentLogs(limit = 50) {
  if (limit <= 0) return [];
  return state.logs.slice(-limit).map((entry) => ({ ...entry }));
}

export function isTerminalUIActive() {
  return state.active;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const { spawnMock, children } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  children: [],
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

vi.mock('../backend/utils/logger.js', () => ({
  logCliCommand: vi.fn(),
  logCliOutput: vi.fn(),
  logCliError: vi.fn(),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  getSdCppLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../backend/services/websocket.js', () => ({
  broadcastTerminalLog: vi.fn(),
}));

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = vi.fn((signal = 'SIGTERM') => {
    child.killed = true;
    if (signal === 'SIGKILL') {
      child.signalCode = 'SIGKILL';
    }
    return true;
  });
  return child;
}

describe('CLI generation cancellation', () => {
  let cliHandler;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    spawnMock.mockReset();
    children.length = 0;
    spawnMock.mockImplementation(() => {
      const child = createChild();
      children.push(child);
      return child;
    });

    const module = await import('../backend/services/cliHandler.js');
    cliHandler = new module.default();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends SIGTERM to the active sd.cpp process and escalates to SIGKILL after 30 seconds', () => {
    cliHandler.executeCommand(['./bin/sd-cli', '--version'], 'generation-1').catch(() => {});

    expect(cliHandler.cancelGeneration('generation-1')).toBe(true);
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');

    vi.advanceTimersByTime(29999);
    expect(children[0].kill).not.toHaveBeenCalledWith('SIGKILL');

    vi.advanceTimersByTime(1);
    expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not escalate when the process exits during the grace period', () => {
    cliHandler.executeCommand(['./bin/sd-cli', '--version'], 'generation-2').catch(() => {});

    expect(cliHandler.cancelGeneration('generation-2')).toBe(true);
    children[0].signalCode = 'SIGTERM';
    children[0].emit('close', null, 'SIGTERM');

    vi.advanceTimersByTime(30000);
    expect(children[0].kill).not.toHaveBeenCalledWith('SIGKILL');
  });
});

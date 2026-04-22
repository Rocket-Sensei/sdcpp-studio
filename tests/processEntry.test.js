/**
 * Tests for ProcessEntry utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessEntry } from '../backend/utils/processEntry.js';
import { ModelStatus } from '../backend/services/modelManager.js';

describe('ProcessEntry', () => {
  let mockProcess;

  beforeEach(() => {
    mockProcess = {
      pid: 12345,
      killed: false,
      exitCode: null,
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a ProcessEntry with default values', () => {
    const entry = new ProcessEntry('test-model', mockProcess, 8080, 'server');
    
    expect(entry.modelId).toBe('test-model');
    expect(entry.process).toBe(mockProcess);
    expect(entry.port).toBe(8080);
    expect(entry.execMode).toBe('server');
    expect(entry.pid).toBe(12345);
    expect(entry.status).toBe(ModelStatus.STARTING);
    expect(entry.exitCode).toBeNull();
    expect(entry.signal).toBeNull();
    expect(entry.outputBuffer).toEqual([]);
    expect(entry.errorBuffer).toEqual([]);
    expect(entry.command).toBe('');
    expect(entry.args).toEqual([]);
    expect(entry.autoStopTimeout).toBeNull();
    expect(entry.autoStopTimeoutMs).toBeNull();
  });

  it('should create a ProcessEntry with options', () => {
    const options = {
      startedAt: Date.now() - 5000,
      status: ModelStatus.RUNNING,
      command: './bin/sd-server',
      args: ['--model', 'test.gguf'],
    };
    
    const entry = new ProcessEntry('test-model', mockProcess, 8080, 'server', options);
    
    expect(entry.status).toBe(ModelStatus.RUNNING);
    expect(entry.command).toBe('./bin/sd-server');
    expect(entry.args).toEqual(['--model', 'test.gguf']);
  });

  it('should handle null process (API mode)', () => {
    const entry = new ProcessEntry('api-model', null, null, 'api', {
      status: ModelStatus.RUNNING,
    });
    
    expect(entry.pid).toBeNull();
    expect(entry.process).toBeNull();
    expect(entry.port).toBeNull();
  });

  describe('getUptime', () => {
    it('should return 0 for newly created entry', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      expect(entry.getUptime()).toBe(0);
    });

    it('should return correct uptime after time passes', () => {
      const startTime = Date.now();
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server', {
        startedAt: startTime,
      });
      
      vi.advanceTimersByTime(5000);
      expect(entry.getUptime()).toBe(5);
      
      vi.advanceTimersByTime(55000);
      expect(entry.getUptime()).toBe(60);
    });
  });

  describe('appendOutput', () => {
    it('should append output to buffer', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      entry.appendOutput(Buffer.from('Server starting...'));
      expect(entry.outputBuffer.length).toBe(1);
      expect(entry.outputBuffer[0]).toContain('Server starting...');
    });

    it('should not append empty output', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      entry.appendOutput(Buffer.from(''));
      entry.appendOutput(Buffer.from('   '));
      expect(entry.outputBuffer.length).toBe(0);
    });

    it('should limit buffer size to 50 entries', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      for (let i = 0; i < 110; i++) {
        entry.appendOutput(Buffer.from(`Line ${i}`));
      }
      
      expect(entry.outputBuffer.length).toBeLessThanOrEqual(100);
    });
  });

  describe('appendError', () => {
    it('should append errors to buffer', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      entry.appendError(Buffer.from('Error: something went wrong'));
      expect(entry.errorBuffer.length).toBe(1);
      expect(entry.errorBuffer[0]).toContain('Error: something went wrong');
    });

    it('should limit error buffer size', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      for (let i = 0; i < 110; i++) {
        entry.appendError(Buffer.from(`Error ${i}`));
      }
      
      expect(entry.errorBuffer.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getRecentOutput', () => {
    it('should return recent output lines', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      for (let i = 0; i < 20; i++) {
        entry.appendOutput(Buffer.from(`Line ${i}`));
      }
      
      const recent = entry.getRecentOutput(5);
      expect(recent.length).toBe(5);
      expect(recent[0]).toContain('Line 15');
      expect(recent[4]).toContain('Line 19');
    });

    it('should return all lines if fewer than requested', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      entry.appendOutput(Buffer.from('Line 1'));
      entry.appendOutput(Buffer.from('Line 2'));
      
      const recent = entry.getRecentOutput(10);
      expect(recent.length).toBe(2);
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent error lines', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      for (let i = 0; i < 15; i++) {
        entry.appendError(Buffer.from(`Error ${i}`));
      }
      
      const recent = entry.getRecentErrors(3);
      expect(recent.length).toBe(3);
      expect(recent[2]).toContain('Error 14');
    });
  });

  describe('clearAutoStop', () => {
    it('should clear auto-stop timeout', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      entry.autoStopTimeout = setTimeout(() => {}, 1000);
      entry.autoStopTimeoutMs = 5000;
      
      entry.clearAutoStop();
      
      expect(entry.autoStopTimeout).toBeNull();
      expect(entry.autoStopTimeoutMs).toBeNull();
    });

    it('should handle null timeout gracefully', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      
      expect(() => entry.clearAutoStop()).not.toThrow();
    });
  });

  describe('getAutoStopRemaining', () => {
    it('should return null when no auto-stop configured', () => {
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server');
      expect(entry.getAutoStopRemaining()).toBeNull();
    });

    it('should return remaining time', () => {
      const startTime = Date.now();
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server', {
        startedAt: startTime,
      });
      entry.autoStopTimeoutMs = 60000;
      
      expect(entry.getAutoStopRemaining()).toBe(60);
      
      vi.advanceTimersByTime(30000);
      expect(entry.getAutoStopRemaining()).toBe(30);
    });

    it('should return 0 when time is up', () => {
      const startTime = Date.now();
      const entry = new ProcessEntry('test', mockProcess, 8080, 'server', {
        startedAt: startTime,
      });
      entry.autoStopTimeoutMs = 10000;
      
      vi.advanceTimersByTime(15000);
      expect(entry.getAutoStopRemaining()).toBe(0);
    });
  });
});

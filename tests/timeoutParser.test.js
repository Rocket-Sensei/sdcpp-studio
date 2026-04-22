/**
 * Tests for timeoutParser utility
 */

import { describe, it, expect } from 'vitest';
import { parseTimeout, formatDuration } from '../backend/utils/timeoutParser.js';

describe('timeoutParser', () => {
  describe('parseTimeout', () => {
    it('should return null for invalid inputs', () => {
      expect(parseTimeout(null)).toBeNull();
      expect(parseTimeout(undefined)).toBeNull();
      expect(parseTimeout('')).toBeNull();
      expect(parseTimeout(123)).toBeNull();
      expect(parseTimeout('invalid')).toBeNull();
      expect(parseTimeout('abc123')).toBeNull();
    });

    it('should parse plain numbers as milliseconds', () => {
      expect(parseTimeout('500')).toBe(500);
      expect(parseTimeout('1000')).toBe(1000);
      expect(parseTimeout('0')).toBe(0); // 0 is parsed as 0ms
      expect(parseTimeout('-100')).toBeNull(); // negative is invalid
    });

    it('should parse milliseconds', () => {
      expect(parseTimeout('500ms')).toBe(500);
      expect(parseTimeout('1000 ms')).toBe(1000);
      expect(parseTimeout('1 millisecond')).toBe(1);
      expect(parseTimeout('10 milliseconds')).toBe(10);
    });

    it('should parse seconds', () => {
      expect(parseTimeout('1s')).toBe(1000);
      expect(parseTimeout('5 s')).toBe(5000);
      expect(parseTimeout('1 sec')).toBe(1000);
      expect(parseTimeout('2 seconds')).toBe(2000);
      expect(parseTimeout('1 second')).toBe(1000);
    });

    it('should parse minutes', () => {
      expect(parseTimeout('1m')).toBe(60000);
      expect(parseTimeout('5 m')).toBe(300000);
      expect(parseTimeout('1 min')).toBe(60000);
      expect(parseTimeout('2 minutes')).toBe(120000);
      expect(parseTimeout('1 minute')).toBe(60000);
    });

    it('should parse hours', () => {
      expect(parseTimeout('1h')).toBe(3600000);
      expect(parseTimeout('2 h')).toBe(7200000);
      expect(parseTimeout('1 hr')).toBe(3600000);
      expect(parseTimeout('2 hours')).toBe(7200000);
      expect(parseTimeout('1 hour')).toBe(3600000);
    });

    it('should parse days', () => {
      expect(parseTimeout('1d')).toBe(86400000);
      expect(parseTimeout('2 days')).toBe(172800000);
      expect(parseTimeout('1 day')).toBe(86400000);
    });

    it('should handle decimal values', () => {
      expect(parseTimeout('1.5s')).toBe(1500);
      expect(parseTimeout('0.5m')).toBe(30000);
      expect(parseTimeout('1.5h')).toBe(5400000);
    });

    it('should handle whitespace', () => {
      expect(parseTimeout('  5m  ')).toBe(300000);
      expect(parseTimeout('10 s')).toBe(10000);
    });

    it('should handle case insensitivity', () => {
      expect(parseTimeout('5M')).toBe(300000);
      expect(parseTimeout('1H')).toBe(3600000);
      expect(parseTimeout('10S')).toBe(10000);
    });

    it('should return null for unknown units', () => {
      expect(parseTimeout('5x')).toBeNull();
      expect(parseTimeout('10years')).toBeNull();
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(3540000)).toBe('59m');
    });

    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(82800000)).toBe('23h');
    });

    it('should format days', () => {
      expect(formatDuration(86400000)).toBe('1d');
      expect(formatDuration(172800000)).toBe('2d');
    });
  });
});

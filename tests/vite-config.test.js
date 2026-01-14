/**
 * Tests for Vite Configuration
 *
 * Verifies that the allowedHosts configuration logic works correctly
 * for proxy domains and custom hostnames.
 *
 * Note: We test the logic directly rather than importing the vite config
 * because ES modules cannot be easily reloaded with different env vars in tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Replicate the allowedHosts logic from vite.config.js
 * This function mimics the exact logic used in the configuration
 */
function getAllowedHostsFromEnv(allowedHostsEnv) {
  if (allowedHostsEnv === 'all') {
    return 'all';
  }
  return (allowedHostsEnv || 'localhost,.localhost').split(',');
}

/**
 * Helper function to check if a host would be allowed
 * Based on Vite's allowedHosts logic
 */
export function isHostAllowed(host, allowedHosts) {
  if (allowedHosts === 'all') {
    return true;
  }

  if (Array.isArray(allowedHosts)) {
    // Direct match
    if (allowedHosts.includes(host)) {
      return true;
    }

    // Wildcard subdomain match (starts with dot)
    for (const allowed of allowedHosts) {
      if (allowed.startsWith('.')) {
        const domain = allowed.slice(1);
        if (host === domain || host.endsWith('.' + domain)) {
          return true;
        }
      }
    }

    return false;
  }

  return false;
}

describe('Vite Config - allowedHosts logic', () => {
  describe('ALLOWED_HOSTS environment variable parsing', () => {
    it('should allow all hosts when ALLOWED_HOSTS is set to "all"', () => {
      const result = getAllowedHostsFromEnv('all');
      expect(result).toBe('all');
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('anything.example.com', result)).toBe(true);
    });

    it('should parse comma-separated hosts when ALLOWED_HOSTS is set', () => {
      const result = getAllowedHostsFromEnv('studio.rscx.ru,example.com,.localhost');
      expect(result).toEqual(['studio.rscx.ru', 'example.com', '.localhost']);
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('example.com', result)).toBe(true);
      expect(isHostAllowed('test.localhost', result)).toBe(true);
    });

    it('should use default localhost when ALLOWED_HOSTS is not set', () => {
      const result = getAllowedHostsFromEnv(undefined);
      expect(result).toEqual(['localhost', '.localhost']);
      expect(isHostAllowed('localhost', result)).toBe(true);
      expect(isHostAllowed('test.localhost', result)).toBe(true);
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(false);
    });

    it('should use default localhost when ALLOWED_HOSTS is empty string', () => {
      const result = getAllowedHostsFromEnv('');
      expect(result).toEqual(['localhost', '.localhost']);
    });

    it('should handle single host without comma', () => {
      const result = getAllowedHostsFromEnv('studio.rscx.ru');
      expect(result).toEqual(['studio.rscx.ru']);
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('other.com', result)).toBe(false);
    });
  });

  describe('Wildcard subdomain matching', () => {
    it('should allow subdomains when host starts with dot', () => {
      const allowed = ['.rscx.ru'];
      expect(isHostAllowed('studio.rscx.ru', allowed)).toBe(true);
      expect(isHostAllowed('test.rscx.ru', allowed)).toBe(true);
      expect(isHostAllowed('rscx.ru', allowed)).toBe(true);
      expect(isHostAllowed('example.com', allowed)).toBe(false);
    });

    it('should include both root and wildcard when both specified', () => {
      const allowed = ['rscx.ru', '.rscx.ru'];
      expect(isHostAllowed('rscx.ru', allowed)).toBe(true);
      expect(isHostAllowed('studio.rscx.ru', allowed)).toBe(true);
      expect(isHostAllowed('test.rscx.ru', allowed)).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should work for the reported case: studio.rscx.ru with ALLOWED_HOSTS=all', () => {
      const result = getAllowedHostsFromEnv('all');
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('www.studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('any.subdomain.rscx.ru', result)).toBe(true);
    });

    it('should work for the reported case: studio.rscx.ru with specific host', () => {
      const result = getAllowedHostsFromEnv('studio.rscx.ru');
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('www.studio.rscx.ru', result)).toBe(false);
    });

    it('should work for the reported case: all subdomains of rscx.ru', () => {
      const result = getAllowedHostsFromEnv('.rscx.ru');
      expect(isHostAllowed('studio.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('www.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('api.rscx.ru', result)).toBe(true);
      expect(isHostAllowed('rscx.ru', result)).toBe(true);
      expect(isHostAllowed('example.com', result)).toBe(false);
    });

    it('should work for common proxy scenarios', () => {
      // Using wildcard for all subdomains
      const result = getAllowedHostsFromEnv('.example.com,.localhost');
      expect(isHostAllowed('app.example.com', result)).toBe(true);
      expect(isHostAllowed('admin.example.com', result)).toBe(true);
      expect(isHostAllowed('localhost', result)).toBe(true);
      expect(isHostAllowed('evil.com', result)).toBe(false);
    });
  });

  describe('Vite config file verification', () => {
    it('should contain the correct allowedHosts logic in vite.config.js', () => {
      const configPath = join(process.cwd(), 'frontend/vite.config.js');
      const configContent = readFileSync(configPath, 'utf-8');

      // Verify the allowedHosts configuration exists
      expect(configContent).toContain('allowedHosts:');
      expect(configContent).toContain("ALLOWED_HOSTS === 'all'");
      expect(configContent).toContain("ALLOWED_HOSTS || 'localhost,.localhost'");
      expect(configContent).toContain('.split(\',\')');
    });

    it('should have proxy configuration for WebSocket', () => {
      const configPath = join(process.cwd(), 'frontend/vite.config.js');
      const configContent = readFileSync(configPath, 'utf-8');

      expect(configContent).toContain('/ws');
      expect(configContent).toContain('ws: true');
    });

    it('should have changeOrigin for all proxy routes', () => {
      const configPath = join(process.cwd(), 'frontend/vite.config.js');
      const configContent = readFileSync(configPath, 'utf-8');

      // Count occurrences of changeOrigin
      const matches = configContent.match(/changeOrigin: true/g);
      expect(matches?.length).toBeGreaterThanOrEqual(4); // At least /api, /sdapi, /ws, /static
    });
  });
});

/**
 * Tests for API Key authentication feature
 * Tests both backend middleware and frontend utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authenticateRequest, isAuthEnabled } from '../backend/middleware/auth.js';

describe('Backend Auth Middleware', () => {
  let originalApiKey;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    // Save original API_KEY
    originalApiKey = process.env.API_KEY;

    // Setup mock request
    mockReq = {
      headers: {}
    };

    // Setup mock response
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    // Setup mock next function
    mockNext = vi.fn();
  });

  afterEach(() => {
    // Restore original API_KEY
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
  });

  describe('isAuthEnabled', () => {
    it('should return false when API_KEY is not set', () => {
      delete process.env.API_KEY;
      expect(isAuthEnabled()).toBe(false);
    });

    it('should return false when API_KEY is empty string', () => {
      process.env.API_KEY = '';
      expect(isAuthEnabled()).toBe(false);
    });

    it('should return true when API_KEY is set', () => {
      process.env.API_KEY = 'test-api-key';
      expect(isAuthEnabled()).toBe(true);
    });
  });

  describe('authenticateRequest', () => {
    it('should allow requests when API_KEY is not set', () => {
      delete process.env.API_KEY;
      authenticateRequest(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow requests when API_KEY is empty', () => {
      process.env.API_KEY = '';
      authenticateRequest(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject requests with missing Authorization header when API_KEY is set', () => {
      process.env.API_KEY = 'test-api-key';
      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: expect.stringContaining('Missing or invalid Authorization header')
      });
    });

    it('should reject requests with malformed Authorization header', () => {
      process.env.API_KEY = 'test-api-key';
      mockReq.headers.authorization = 'InvalidFormat token';

      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should reject requests with wrong API key', () => {
      process.env.API_KEY = 'correct-api-key';
      mockReq.headers.authorization = 'Bearer wrong-api-key';

      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Invalid API key'
      });
    });

    it('should accept requests with correct Bearer token', () => {
      process.env.API_KEY = 'correct-api-key';
      mockReq.headers.authorization = 'Bearer correct-api-key';

      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle case-sensitive API key comparison', () => {
      process.env.API_KEY = 'MySecretKey-123';
      mockReq.headers.authorization = 'Bearer MySecretKey-123';

      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject API key with wrong case', () => {
      process.env.API_KEY = 'MySecretKey-123';
      mockReq.headers.authorization = 'Bearer mysecretkey-123';

      authenticateRequest(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});

describe('Frontend API Utilities', () => {
  // Note: These tests would need to be run in a browser-like environment
  // or with jsdom to properly test localStorage and fetch behavior

  describe('localStorage operations', () => {
    beforeEach(() => {
      // Mock localStorage
      global.localStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
    });

    afterEach(() => {
      delete global.localStorage;
    });

    it('should save API key to localStorage', async () => {
      const { saveApiKey } = await import('../frontend/src/utils/api.js');
      const testKey = 'test-api-key';

      saveApiKey(testKey);

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'sd-cpp-studio-api-key',
        testKey
      );
    });

    it('should remove API key from localStorage when saving empty value', async () => {
      const { saveApiKey } = await import('../frontend/src/utils/api.js');

      saveApiKey('');

      expect(global.localStorage.removeItem).toHaveBeenCalledWith('sd-cpp-studio-api-key');
    });

    it('should get stored API key from localStorage', async () => {
      const testKey = 'stored-api-key';
      global.localStorage.getItem.mockReturnValue(testKey);

      const { getStoredApiKey } = await import('../frontend/src/utils/api.js');
      const result = getStoredApiKey();

      expect(global.localStorage.getItem).toHaveBeenCalledWith('sd-cpp-studio-api-key');
      expect(result).toBe(testKey);
    });

    it('should return null when localStorage throws error', async () => {
      global.localStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const { getStoredApiKey } = await import('../frontend/src/utils/api.js');
      const result = getStoredApiKey();

      expect(result).toBeNull();
    });
  });
});

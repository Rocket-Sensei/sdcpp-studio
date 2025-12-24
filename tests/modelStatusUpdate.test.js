/**
 * Vitest test for Model Status Update Issue
 *
 * This test reproduces the issue where ModelSelector.jsx doesn't properly
 * update model status because it accesses model.status.status instead of
 * model.status directly.
 *
 * The API returns status as a string directly (e.g., { status: "running" })
 * but the component expects a nested object (model.status.status).
 */

import { describe, it, expect } from 'vitest';

describe('Model Status Update Bug', () => {
  /**
   * Simulates the actual API response format from /api/models endpoint
   * based on backend/services/modelManager.js getAllModels() method
   */
  const API_RESPONSE_MODEL = {
    id: 'test-model',
    name: 'Test Model',
    exec_mode: 'server',
    mode: 'on_demand',
    isRunning: true,
    status: 'running',  // <-- status is a STRING directly
    pid: 12345,
    port: 8000
  };

  /**
   * Simulates the API response when model is stopped
   */
  const API_RESPONSE_MODEL_STOPPED = {
    id: 'test-model',
    name: 'Test Model',
    exec_mode: 'server',
    mode: 'on_demand',
    isRunning: false,
    status: 'stopped',  // <-- status is a STRING directly
    pid: null,
    port: null
  };

  /**
   * Simulates the response from /api/models/:id/status endpoint
   * based on backend/services/modelManager.js getModelStatus() method
   */
  const API_STATUS_RESPONSE_RUNNING = {
    exists: true,
    id: 'test-model',
    name: 'Test Model',
    status: 'running',  // <-- status is a STRING directly
    pid: 12345,
    port: 8000,
    execMode: 'server',
    mode: 'on_demand',
    uptime: 60,
    startedAt: 1234567890000,
    recentOutput: [],
    recentErrors: []
  };

  const API_STATUS_RESPONSE_STOPPED = {
    exists: true,
    id: 'test-model',
    name: 'Test Model',
    status: 'stopped',  // <-- status is a STRING directly
    execMode: 'server',
    mode: 'on_demand'
  };

  /**
   * BUGGY implementation - this is how ModelSelector.jsx currently accesses status
   * Line 171: return model?.status?.status || MODEL_STATUS.STOPPED;
   */
  function getModelStatus_BUGGY(models, modelId) {
    const model = models.find((m) => m.id === modelId);
    // BUG: This expects model.status.status but API returns model.status as string
    return model?.status?.status || 'stopped';
  }

  /**
   * CORRECT implementation - how it should be
   */
  function getModelStatus_CORRECT(models, modelId) {
    const model = models.find((m) => m.id === modelId);
    // Correct: status is a string directly on the model object
    return model?.status || 'stopped';
  }

  /**
   * BUGGY implementation for port access
   * Line 178: return model?.status?.port;
   */
  function getModelPort_BUGGY(models, modelId) {
    const model = models.find((m) => m.id === modelId);
    // BUG: This expects model.status.port but API returns model.port directly
    return model?.status?.port;
  }

  /**
   * CORRECT implementation for port access
   */
  function getModelPort_CORRECT(models, modelId) {
    const model = models.find((m) => m.id === modelId);
    // Correct: port is directly on the model object
    return model?.port;
  }

  describe('API Response Format', () => {
    it('should return status as a string directly on the model object', () => {
      expect(API_RESPONSE_MODEL.status).toBe('running');
      expect(typeof API_RESPONSE_MODEL.status).toBe('string');
    });

    it('should return port as a direct property on the model object', () => {
      expect(API_RESPONSE_MODEL.port).toBe(8000);
    });

    it('should have status endpoint response with status as string', () => {
      expect(API_STATUS_RESPONSE_RUNNING.status).toBe('running');
      expect(typeof API_STATUS_RESPONSE_RUNNING.status).toBe('string');
    });
  });

  describe('Bug: getModelStatus with Buggy Implementation', () => {
    const models = [API_RESPONSE_MODEL];

    it('returns "stopped" when status is "running" - BUG!', () => {
      const status = getModelStatus_BUGGY(models, 'test-model');
      // BUG: Because it tries to access model.status.status (undefined),
      // it falls back to 'stopped'
      expect(status).toBe('stopped');
      // But the actual API status is 'running'!
      expect(API_RESPONSE_MODEL.status).toBe('running');
    });

    it('returns undefined for port with buggy implementation', () => {
      const port = getModelPort_BUGGY(models, 'test-model');
      // BUG: Because it tries to access model.status.port (undefined)
      expect(port).toBeUndefined();
      // But the actual API port is 8000!
      expect(API_RESPONSE_MODEL.port).toBe(8000);
    });
  });

  describe('Fix: getModelStatus with Correct Implementation', () => {
    const models = [API_RESPONSE_MODEL];

    it('correctly returns "running" when status is "running"', () => {
      const status = getModelStatus_CORRECT(models, 'test-model');
      expect(status).toBe('running');
      expect(status).toBe(API_RESPONSE_MODEL.status);
    });

    it('correctly returns "stopped" when status is "stopped"', () => {
      const stoppedModels = [API_RESPONSE_MODEL_STOPPED];
      const status = getModelStatus_CORRECT(stoppedModels, 'test-model');
      expect(status).toBe('stopped');
    });

    it('correctly returns port from model object', () => {
      const port = getModelPort_CORRECT(models, 'test-model');
      expect(port).toBe(8000);
      expect(port).toBe(API_RESPONSE_MODEL.port);
    });

    it('returns null for port when model is stopped', () => {
      const stoppedModels = [API_RESPONSE_MODEL_STOPPED];
      const port = getModelPort_CORRECT(stoppedModels, 'test-model');
      expect(port).toBeNull();
    });
  });

  describe('Status Transition Scenario', () => {
    it('should detect status change from stopped to running', () => {
      const modelsStopped = [API_RESPONSE_MODEL_STOPPED];
      const modelsRunning = [API_RESPONSE_MODEL];

      // Buggy implementation - fails to detect the change
      const buggyStatusStopped = getModelStatus_BUGGY(modelsStopped, 'test-model');
      const buggyStatusRunning = getModelStatus_BUGGY(modelsRunning, 'test-model');
      expect(buggyStatusStopped).toBe('stopped');
      expect(buggyStatusRunning).toBe('stopped'); // BUG - still shows stopped!

      // Correct implementation - correctly detects the change
      const correctStatusStopped = getModelStatus_CORRECT(modelsStopped, 'test-model');
      const correctStatusRunning = getModelStatus_CORRECT(modelsRunning, 'test-model');
      expect(correctStatusStopped).toBe('stopped');
      expect(correctStatusRunning).toBe('running'); // FIXED - shows running!
    });
  });
});

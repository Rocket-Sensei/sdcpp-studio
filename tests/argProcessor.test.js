/**
 * Tests for argProcessor utility
 */

import { describe, it, expect } from 'vitest';
import { processArgs, isServerReady } from '../backend/utils/argProcessor.js';

describe('argProcessor', () => {
  describe('processArgs', () => {
    it('should replace {port} placeholder', () => {
      const args = ['--listen-port', '{port}'];
      const context = { port: 8080 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--listen-port', '8080']);
    });

    it('should replace ${port} placeholder', () => {
      const args = ['--port=${port}'];
      const context = { port: 3000 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--port=$3000']);
    });

    it('should replace multiple port placeholders', () => {
      const args = ['--listen-port', '{port}', '--port={port}'];
      const context = { port: 8080 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--listen-port', '8080', '--port=8080']);
    });

    it('should replace {model.id} placeholder', () => {
      const args = ['--model-id', '{model.id}'];
      const context = { 
        port: 8080,
        model: { id: 'flux-model' }
      };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--model-id', 'flux-model']);
    });

    it('should replace ${model.id} placeholder', () => {
      const args = ['--name=${model.id}'];
      const context = { 
        port: 8080,
        model: { id: 'test-model' }
      };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--name=$test-model']);
    });

    it('should handle args without placeholders', () => {
      const args = ['--model', 'test.gguf', '--steps', '20'];
      const context = { port: 8080 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--model', 'test.gguf', '--steps', '20']);
    });

    it('should handle empty args array', () => {
      const args = [];
      const context = { port: 8080 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual([]);
    });

    it('should handle missing model in context', () => {
      const args = ['--listen-port', '{port}'];
      const context = { port: 8080 };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual(['--listen-port', '8080']);
    });

    it('should handle mixed placeholders', () => {
      const args = [
        '--listen-port', '{port}',
        '--model-id', '{model.id}',
        '--name=${model.id}-server',
        '--port=${port}'
      ];
      const context = { 
        port: 8080,
        model: { id: 'my-model' }
      };
      
      const result = processArgs(args, context);
      
      expect(result).toEqual([
        '--listen-port', '8080',
        '--model-id', 'my-model',
        '--name=$my-model-server',
        '--port=$8080'
      ]);
    });
  });

  describe('isServerReady', () => {
    it('should detect "listening" pattern', () => {
      expect(isServerReady('Server listening on port 8080')).toBe(true);
      expect(isServerReady('Listening on http://localhost:3000')).toBe(true);
    });

    it('should detect "server ready" pattern', () => {
      expect(isServerReady('Server is ready')).toBe(true);
      expect(isServerReady('HTTP server ready')).toBe(true);
    });

    it('should detect "started on port" pattern', () => {
      expect(isServerReady('Server started on port 8080')).toBe(true);
    });

    it('should detect "serving HTTP" pattern', () => {
      expect(isServerReady('Now serving HTTP requests')).toBe(true);
    });

    it('should detect "accepting connections" pattern', () => {
      expect(isServerReady('Now accepting connections')).toBe(true);
    });

    it('should detect "ready to accept" pattern', () => {
      expect(isServerReady('Ready to accept connections')).toBe(true);
    });

    it('should detect Uvicorn pattern', () => {
      expect(isServerReady('Uvicorn running on http://127.0.0.1:8000')).toBe(true);
    });

    it('should detect application startup pattern', () => {
      expect(isServerReady('Application startup complete')).toBe(true);
    });

    it('should return false for non-ready output', () => {
      expect(isServerReady('Loading model...')).toBe(false);
      expect(isServerReady('Initializing...')).toBe(false);
      expect(isServerReady('Error: failed to start')).toBe(false);
      expect(isServerReady('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isServerReady('LISTENING ON PORT 8080')).toBe(true);
      expect(isServerReady('Server Ready')).toBe(true);
    });

    it('should handle partial matches', () => {
      expect(isServerReady('Not listening yet')).toBe(true); // contains "listening"
      expect(isServerReady('Preparing server ready state')).toBe(true); // contains "server ready"
    });
  });
});

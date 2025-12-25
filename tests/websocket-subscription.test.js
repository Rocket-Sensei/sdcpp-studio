/**
 * Tests for WebSocket Subscription Stability
 *
 * This test file verifies that WebSocket subscriptions happen only once
 * when a component mounts, not repeatedly on every render.
 *
 * The issue: If useWebSocket is called with a new options object on every render,
 * it causes constant subscribe/unsubscribe cycles which creates lag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getWebSocketContextSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/contexts/WebSocketContext.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

const getUnifiedQueueSource = () => {
  const sourcePath = join(__dirname, '../frontend/src/components/UnifiedQueue.jsx');
  return readFileSync(sourcePath, 'utf-8');
};

describe('WebSocket Subscription - Single Subscription Requirement', () => {
  it('should have stable channels using useMemo', () => {
    const source = getUnifiedQueueSource();

    // Check for useMemo pattern with webSocketOptions
    const hasUseMemo = source.includes('useMemo');
    const hasWebSocketOptions = source.includes('webSocketOptions');
    const hasUseMemoAssignment = source.match(/webSocketOptions\s*=\s*useMemo/) !== null;

    if (hasUseMemo && hasWebSocketOptions && hasUseMemoAssignment) {
      console.log('✓ Found useMemo for WebSocket options - stable reference!');
    } else {
      console.warn('✗ No useMemo found for WebSocket options');
    }

    expect(hasUseMemo && hasWebSocketOptions && hasUseMemoAssignment).toBe(true);
  });

  it('should not create new channels array on every render', () => {
    const source = getUnifiedQueueSource();

    // Check for two patterns:
    // 1. useWebSocket(webSocketOptions) where webSocketOptions is defined with useMemo
    // 2. useWebSocket({channels: [...]}) - the bad pattern (inline object)

    const hasUseMemoOptions = source.includes('useMemo') &&
                             source.includes('webSocketOptions') &&
                             source.includes('useWebSocket(webSocketOptions)');

    const hasInlineUseWebSocket = source.match(/useWebSocket\(\{[^}]*channels:/) !== null;

    if (hasUseMemoOptions) {
      console.log('✓ Found stable WebSocket options pattern (useMemo + variable)');
    } else if (hasInlineUseWebSocket) {
      console.warn('✗ Found inline useWebSocket options - creates new object every render');
    }

    // The good pattern is using useMemo
    expect(hasUseMemoOptions).toBe(true);
  });

  it('should use useMemo to stabilize options object', () => {
    const source = getUnifiedQueueSource();

    // Verify the key parts of the pattern exist
    const hasWebsocketOptionsVar = source.includes('webSocketOptions');
    const hasUseMemo = source.includes('useMemo');
    const hasChannels = source.includes('channels: [WS_CHANNELS.QUEUE, WS_CHANNELS.GENERATIONS]');
    const hasOnMessage = source.includes('onMessage: handleWebSocketMessage');
    const hasEmptyDeps = source.includes('] // Empty deps - options never change');

    // All these together indicate the correct pattern
    const hasCorrectPattern = hasWebsocketOptionsVar && hasUseMemo && hasChannels && hasOnMessage && hasEmptyDeps;

    if (hasCorrectPattern) {
      console.log('✓ Found correct useMemo pattern for WebSocket options!');
    } else {
      console.warn('✗ useMemo pattern incomplete:', {
        hasWebsocketOptionsVar,
        hasUseMemo,
        hasChannels,
        hasOnMessage,
        hasEmptyDeps
      });
    }

    expect(hasCorrectPattern).toBe(true);
  });
});

describe('WebSocketContext - useEffect Dependencies', () => {
  it('should use subscribe function in dependencies', () => {
    const source = getWebSocketContextSource();

    // The useEffect should have subscribe in dependencies
    expect(source).toMatch(/useEffect\(\(\)[\s\S]*\[subscribe/);
  });

  it('should have initialChannels in dependencies', () => {
    const source = getWebSocketContextSource();

    // Check that initialChannels is in the dependency array
    const useEffextMatch = source.match(/useEffect\(\(\)[\s\S]*\[\s*subscribe\s*,\s*([^\]]+)\]/);

    expect(useEffextMatch).toBeTruthy();
    const deps = useEffextMatch[1];
    expect(deps).toContain('initialChannels');
  });

  it('should have onMessage in dependencies', () => {
    const source = getWebSocketContextSource();

    // Check that onMessage is in the dependency array
    const useEffectMatch = source.match(/useEffect\(\(\)[\s\S]*\[subscribe,\s*initialChannels,\s*([^\]]+)\]/);

    expect(useEffectMatch).toBeTruthy();
    const lastDep = useEffectMatch[1];
    expect(lastDep).toContain('onMessage');
  });
});

describe('WebSocket Subscription - Fix Pattern', () => {
  it('should document the correct pattern for stable subscriptions', () => {
    const source = getUnifiedQueueSource();

    // The correct pattern is to use useMemo to create a stable options object
    const hasCorrectPattern =
      source.includes('useMemo') &&
      source.includes('channels:') &&
      source.includes('onMessage:');

    // This test documents what we expect to find after the fix
    if (!hasCorrectPattern) {
      console.warn('Expected pattern not found: useMemo for WebSocket options');
    }
  });
});

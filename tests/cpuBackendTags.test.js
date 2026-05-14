import { describe, it, expect, vi } from 'vitest';

describe('CPU-only backend tags', () => {
  it('marks CPU-only sd.cpp backend with a cpu-only tag', async () => {
    vi.resetModules();
    const { createBackendRegistry } = await import('../backend/services/backendRegistry.js');
    const registry = createBackendRegistry();

    const cpuBackend = registry.getBackend('sd-cli-cpu');
    expect(cpuBackend.command).toBe('./bin/sd-cli-cpu');
    expect(cpuBackend.tags).toContain('cpu-only');
  });

  it('does not let an untagged model inherit the CPU-only binary', async () => {
    vi.resetModules();
    const { createBackendRegistry } = await import('../backend/services/backendRegistry.js');
    const registry = createBackendRegistry();

    const resolved = registry.resolveModelConfig({
      id: 'untagged-model',
      name: 'Untagged Model',
      backend: 'sd-cli-cpu',
      exec_mode: 'cli',
      args: ['--diffusion-model', './models/test.gguf'],
    });

    expect(resolved.backend).toBeUndefined();
    expect(resolved.command).toBe('./bin/sd-cli');
  });

  it('keeps FLUX.2 Klein 9B Q8_0 on the normal sd.cpp binary', async () => {
    vi.resetModules();
    const { ModelManager } = await import('../backend/services/modelManager.js');
    const manager = new ModelManager();
    manager.loadConfig();

    const model = manager.getModel('flux2-klein-9b-q8');
    expect(model).toBeDefined();
    expect(model.tags || []).not.toContain('cpu-only');
    expect(model.backend).not.toBe('sd-cli-cpu');
    expect(model.command).toBe('./bin/sd-server');
  });
});

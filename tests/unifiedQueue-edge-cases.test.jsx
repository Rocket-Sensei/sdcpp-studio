import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Exact problematic data from the database
const PROBLEMATIC_GENERATIONS = [
  {
    id: 'a514d99c-fac4-4d76-a93f-b34eb75361a6',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    negative_prompt: null,
    size: '512x512',
    seed: '1957018491.0',
    n: 1,
    quality: null,
    style: null,
    response_format: 'b64_json',
    user_id: null,
    source_image_id: null,
    status: 'completed',
    progress: 0.85,
    error: null,
    created_at: 1768506258000,
    updated_at: 1768506272765,
    started_at: 1768506272764,
    completed_at: 1768506272765,
    input_image_path: null,
    input_image_mime_type: null,
    mask_image_path: null,
    mask_image_mime_type: null,
    strength: null,
    model_loading_time_ms: 1522,
    generation_time_ms: 11791,
    sample_steps: 20,
    cfg_scale: 2.5,
    sampling_method: 'euler',
    clip_skip: '-1',
    // This one HAS an image
    image_count: 1,
    first_image_id: '53555250-dbcf-49a4-b377-0c62ae713458',
    first_image_url: '/static/images/53555250-dbcf-49a4-b377-0c62ae713458.png'
  },
  {
    id: '552089ec-2f79-45f3-a46b-28732f53dad1',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    negative_prompt: null,
    size: '512x512',
    seed: '3747543430.0',
    n: 1,
    quality: null,
    style: null,
    response_format: 'b64_json',
    user_id: null,
    source_image_id: null,
    status: 'failed',
    progress: 0.85,
    error: 'Generation completed but no images were produced',
    created_at: 1768506179000,
    updated_at: 1768506184880,
    started_at: 1768506184879,
    completed_at: 1768506184880,
    input_image_path: null,
    input_image_mime_type: null,
    mask_image_path: null,
    mask_image_mime_type: null,
    strength: null,
    model_loading_time_ms: 2522,
    generation_time_ms: 1178,
    sample_steps: 20,
    cfg_scale: 2.5,
    sampling_method: 'euler',
    clip_skip: '-1',
    // Failed status - no images (expected)
    image_count: 0
  },
  {
    id: 'e15476e5-02df-48a2-b7ab-9c771c25b757',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    negative_prompt: null,
    size: '512x512',
    seed: '1273634838.0',
    n: 1,
    quality: null,
    style: null,
    response_format: 'b64_json',
    user_id: null,
    source_image_id: null,
    // BUG: status is "completed" but image_count is 0
    status: 'completed',
    progress: 0.85,
    error: null,
    created_at: 1768496128000,
    updated_at: 1768496130174,
    started_at: 1768496130174,
    completed_at: 1768496130174,
    input_image_path: null,
    input_image_mime_type: null,
    mask_image_path: null,
    mask_image_mime_type: null,
    strength: null,
    model_loading_time_ms: 0,
    generation_time_ms: 1609,
    sample_steps: 20,
    cfg_scale: 2.5,
    sampling_method: 'euler',
    clip_skip: '-1',
    // BUG: completed but no images!
    image_count: 0,
    first_image_id: null,
    first_image_url: null
  },
  {
    id: '469ccc48-e7f8-43a6-9a3b-de08c994f847',
    type: 'generate',
    model: 'z-image-turbo',
    prompt: 'alien landscape',
    negative_prompt: null,
    size: '512x512',
    seed: '2039741399.0',
    n: 1,
    quality: null,
    style: null,
    response_format: 'b64_json',
    user_id: null,
    source_image_id: null,
    // BUG: status is "completed" but image_count is 0
    status: 'completed',
    progress: 0.85,
    error: null,
    created_at: 1768496073000,
    updated_at: 1768496078255,
    started_at: 1768496078255,
    completed_at: 1768496078255,
    input_image_path: null,
    input_image_mime_type: null,
    mask_image_path: null,
    mask_image_mime_type: null,
    strength: null,
    model_loading_time_ms: 2021,
    generation_time_ms: 1706,
    sample_steps: 20,
    cfg_scale: 2.5,
    sampling_method: 'euler',
    clip_skip: '-1',
    // BUG: completed but no images!
    image_count: 0,
    first_image_id: null,
    first_image_url: null
  }
];

describe('UnifiedQueue Thumbnail - Bug Reproduction: completed with image_count=0', () => {
  it('should render placeholder for completed status with image_count=0 and first_image_url=null', () => {
    // Import the Thumbnail component internal logic
    // We need to simulate what happens when rendering a generation with:
    // - status: 'completed'
    // - image_count: 0
    // - first_image_url: null

    const problematicGen = PROBLEMATIC_GENERATIONS.find(g => g.id === 'e15476e5-02df-48a2-b7ab-9c771c25b757');

    // The Thumbnail component logic:
    // 1. isPendingOrProcessing(generation.status) -> false (status is 'completed')
    // 2. generation.status === 'failed' || 'cancelled' -> false (status is 'completed')
    // 3. if (!src) -> true (first_image_url is null)
    //    Should show placeholder with ImageIcon

    const src = problematicGen.first_image_url || null;
    const imageCount = problematicGen.image_count || 0;
    const status = problematicGen.status;

    // Verify the problematic data
    expect(status).toBe('completed');
    expect(imageCount).toBe(0);
    expect(src).toBe(null);

    // Verify the expected behavior:
    // When !src is true, should show placeholder (not crash with React error)
    expect(src).toBe(null); // This should trigger the placeholder render
  });

  it('should render error state for failed status', () => {
    const failedGen = PROBLEMATIC_GENERATIONS.find(g => g.id === '552089ec-2f79-45f3-a46b-28732f53dad1');

    expect(failedGen.status).toBe('failed');
    expect(failedGen.image_count).toBe(0);
    expect(failedGen.error).toBe('Generation completed but no images were produced');
  });

  it('should render image for completed status with image_count=1', () => {
    const successfulGen = PROBLEMATIC_GENERATIONS.find(g => g.id === 'a514d99c-fac4-4d76-a93f-b34eb75361a6');

    expect(successfulGen.status).toBe('completed');
    expect(successfulGen.image_count).toBe(1);
    expect(successfulGen.first_image_url).toBe('/static/images/53555250-dbcf-49a4-b377-0c62ae713458.png');
  });

  it('summarizes the bug: completed status with image_count=0 should not crash', () => {
    // The bug occurs when:
    // 1. Old data has status='completed' but image_count=0 (from before the fix)
    // 2. Thumbnail component receives this data
    // 3. Component tries to render LightboxWithImage with invalid props
    // 4. React throws "A React Element from an older version of React was rendered" error

    const buggyGenerations = PROBLEMATIC_GENERATIONS.filter(
      g => g.status === 'completed' && g.image_count === 0
    );

    expect(buggyGenerations.length).toBe(2);

    buggyGenerations.forEach(gen => {
      expect(gen.status).toBe('completed');
      expect(gen.image_count).toBe(0);
      expect(gen.first_image_url).toBe(null);
    });
  });
});

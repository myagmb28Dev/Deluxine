import { describe, expect, test } from 'bun:test';
import type { RenderHistoryItem } from '../types/api';
import { mergeRenderHistory, removeRenderHistoryItem } from './renderHistory';

const item = (jobId: string): RenderHistoryItem => ({
  job_id: jobId,
  session_id: `session-${jobId}`,
  session_title: `세션 ${jobId}`,
  output_image: `https://example.com/${jobId}.webp`,
  model: 'google/gemini-3.1-flash-image',
  prompt: '',
  created_at: '2026-07-11T09:00:00.000Z',
});

describe('mergeRenderHistory', () => {
  test('appends new jobs and removes duplicate job IDs', () => {
    expect(mergeRenderHistory([item('a'), item('b')], [item('b'), item('c')]).map((entry) => entry.job_id))
      .toEqual(['a', 'b', 'c']);
  });

  test('removes only the requested job', () => {
    expect(removeRenderHistoryItem([item('a'), item('b')], 'a').map((entry) => entry.job_id))
      .toEqual(['b']);
  });
});

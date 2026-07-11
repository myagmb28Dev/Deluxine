import { describe, expect, test } from 'bun:test';
import { estimateRenderProgress } from './renderProgress';

describe('estimateRenderProgress', () => {
  test('starts pending jobs above zero and caps them at 20 percent', () => {
    expect(estimateRenderProgress('pending', 0, 0)).toBe(8);
    expect(estimateRenderProgress('pending', 60_000, 0)).toBe(20);
  });

  test('advances running jobs toward 90 percent without completing them', () => {
    expect(estimateRenderProgress('running', 0, 8)).toBe(20);
    expect(estimateRenderProgress('running', 120_000, 20)).toBe(90);
  });

  test('never moves progress backward', () => {
    expect(estimateRenderProgress('pending', 0, 42)).toBe(42);
    expect(estimateRenderProgress('running', 0, 65)).toBe(65);
  });
});

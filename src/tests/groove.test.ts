import { describe, expect, it } from 'vitest';
import { analyzeGroove } from '../rhythm/engine/groove';

const evaluated = (errors: (number | null)[]) => errors.map((error, index) => ({
  expectedEventId: String(index),
  expectedTimeMs: index * 500,
  ...(error === null
    ? { status: 'missed' as const }
    : { actualTimeMs: index * 500 + error, errorMs: error, status: 'correct' as const }),
}));

describe('groove analysis', () => {
  it('identifies stable on-beat attacks', () => {
    const result = analyzeGroove(evaluated([0, 10, -10, 5, 0]));
    expect(result.classification).toBe('on-beat');
    expect(result.confidence).toBe(1);
  });

  it('preserves signed expressive-style offset without changing scores', () => {
    const result = analyzeGroove(evaluated([80, 85, 75, 90, 80]));
    expect(result.classification).toBe('consistent-offset');
    expect(result.medianOffsetMs).toBe(80);
    expect(result.warnings[0]).toMatch(/latencia/);
  });

  it('detects timing instability', () => {
    const result = analyzeGroove(evaluated([-110, -40, 0, 70, 140]));
    expect(result.classification).toBe('unstable');
  });

  it('withholds conclusions when too few attacks are matched', () => {
    const result = analyzeGroove(evaluated([null, 50, null, 55]));
    expect(result.classification).toBe('insufficient-data');
    expect(result.confidence).toBe(0.5);
    expect(result.medianOffsetMs).toBeNull();
  });

  it('is robust to a single outlier', () => {
    const result = analyzeGroove(evaluated([70, 72, 68, 74, 170]));
    expect(result.classification).toBe('consistent-offset');
    expect(result.medianOffsetMs).toBe(72);
  });

  it('rejects invalid thresholds', () => {
    expect(() => analyzeGroove(evaluated([0, 0, 0, 0]), { stabilityToleranceMs: -1 })).toThrow();
    expect(() => analyzeGroove(evaluated([0, 0, 0, 0]), { minimumMatches: 1 })).toThrow();
  });

  it('handles no events without fabricated confidence', () => {
    const result = analyzeGroove([]);
    expect(result.classification).toBe('insufficient-data');
    expect(result.confidence).toBe(0);
  });
});

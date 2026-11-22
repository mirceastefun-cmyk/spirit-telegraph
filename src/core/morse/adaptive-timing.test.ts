import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AdaptiveTiming } from './adaptive-timing';

describe('AdaptiveTiming', () => {
  it('starts with dot=unit, dash=3×unit and derives default thresholds', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 100 });
    expect(t.dotMean).toBe(100);
    expect(t.dashMean).toBe(300);
    expect(t.count).toBe(0);
    expect(t.unitMs).toBe(100);
    expect(t.thresholds.dotDashThreshold).toBeCloseTo(Math.sqrt(100 * 300));
    expect(t.thresholds.letterGapMin).toBeCloseTo(175);
    expect(t.thresholds.wordGapMin).toBeCloseTo(450);
    expect(t.thresholds.longHoldMs).toBe(3000);
  });

  it('keeps initial thresholds during the first warmUpCount-1 observations', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 100, warmUpCount: 6 });
    const initial = t.thresholds;
    for (let i = 0; i < 5; i++) {
      t.observe(60);
      expect(t.thresholds).toEqual(initial);
    }
    expect(t.dotMean).toBeLessThan(100); // EMA still accumulated
  });

  it('changes dotDashThreshold after warm-up', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 100, warmUpCount: 3 });
    const before = t.thresholds.dotDashThreshold;
    for (let i = 0; i < 3; i++) t.observe(50);
    expect(t.thresholds.dotDashThreshold).not.toBeCloseTo(before);
  });

  it('discards presses at or beyond longHoldMs', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 100 });
    t.observe(3000);
    expect(t.count).toBe(0);
    expect(t.dotMean).toBe(100);
  });

  it('classifies long presses into the dash cluster', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 100 });
    t.observe(500);
    expect(t.dashMean).toBeCloseTo(0.15 * 500 + 0.85 * 300);
    expect(t.dotMean).toBe(100);
  });

  it('reset restores the initial state', () => {
    const t = new AdaptiveTiming({ initialUnitMs: 120 });
    for (let i = 0; i < 10; i++) t.observe(70);
    t.reset();
    expect(t.dotMean).toBe(120);
    expect(t.dashMean).toBe(360);
    expect(t.count).toBe(0);
  });

  it('throws for invalid configuration', () => {
    expect(() => new AdaptiveTiming({ initialUnitMs: 39 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 3001 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, letterGapFactor: 1.4 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, letterGapFactor: 6.1 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, wordGapFactor: 2.9 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, wordGapFactor: 12.1 })).toThrow(RangeError);
    expect(
      () => new AdaptiveTiming({ initialUnitMs: 100, letterGapFactor: 4, wordGapFactor: 4 }),
    ).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, alpha: 0.6 })).toThrow(RangeError);
    expect(() => new AdaptiveTiming({ initialUnitMs: 100, warmUpCount: 1 })).toThrow(RangeError);
  });

  it('maintains clamp, separation and longHold invariants for any observations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 3000 }),
        fc.array(fc.integer({ min: 0, max: 20000 }), { maxLength: 60 }),
        (unit, durations) => {
          const t = new AdaptiveTiming({ initialUnitMs: unit });
          for (const d of durations) {
            t.observe(d);
            expect(t.dotMean).toBeGreaterThanOrEqual(40);
            expect(t.dotMean).toBeLessThanOrEqual(3000);
            expect(t.dashMean).toBeGreaterThanOrEqual(2 * t.dotMean - 1e-9);
            expect(t.thresholds.longHoldMs).toBeGreaterThanOrEqual(3000);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

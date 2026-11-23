import { describe, expect, it } from 'vitest';
import { TAP_GRID, tapPattern } from './tap-alphabet';

describe('TAP_GRID', () => {
  it('has expected entries', () => {
    expect(TAP_GRID[1][3]).toBe('C');
    expect(TAP_GRID[6][1]).toBe('SPACE');
  });

  it('covers 25 non-K letters plus 5 commands', () => {
    const letters: string[] = [];
    for (const r of [1, 2, 3, 4, 5] as const) {
      for (const c of [1, 2, 3, 4, 5] as const) letters.push(TAP_GRID[r][c]);
    }
    const expected = 'ABCDEFGHIJLMNOPQRSTUVWXYZ'.split('');
    expect([...letters].sort()).toEqual(expected);
    expect(letters).not.toContain('K');
    expect(Object.values(TAP_GRID[6])).toHaveLength(5);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TAP_GRID)).toBe(true);
    expect(Object.isFrozen(TAP_GRID[1])).toBe(true);
  });
});

describe('tapPattern', () => {
  it('maps K to C', () => {
    expect(tapPattern('K')).toEqual([1, 3]);
  });

  it('is case-insensitive', () => {
    expect(tapPattern('k')).toEqual(tapPattern('K'));
    expect(tapPattern('z')).toEqual([5, 5]);
  });

  it('returns undefined for unsupported input', () => {
    expect(tapPattern('1')).toBeUndefined();
    expect(tapPattern('.')).toBeUndefined();
    expect(tapPattern(' ')).toBeUndefined();
    expect(tapPattern('AB')).toBeUndefined();
    expect(tapPattern('')).toBeUndefined();
  });
});

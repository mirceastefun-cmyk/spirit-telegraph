import { describe, expect, it } from 'vitest';
import { tapEncode, tapEncodeTimeline } from './tap-encoder';

const timing = { knockIntervalMs: 200, groupPauseMs: 800, letterPauseMs: 1500 };

describe('tapEncode', () => {
  it('encodes A as [1,1]', () => {
    expect(tapEncode('A')).toEqual([[1, 1]]);
  });
  it('maps K to C', () => {
    expect(tapEncode('K')).toEqual([[1, 3]]);
    expect(tapEncode('k')).toEqual(tapEncode('K'));
  });
  it('skips unsupported characters', () => {
    expect(tapEncode('1')).toEqual([]);
    expect(tapEncode('')).toEqual([]);
    expect(tapEncode('a b!')).toEqual([[1, 1], [1, 2]]);
  });
});

describe('tapEncodeTimeline', () => {
  it('emits one row and one col pulse for A', () => {
    const ev = tapEncodeTimeline('A', timing);
    expect(ev).toEqual([
      { type: 'pulse', t: 0, source: 'knock', channel: 0 },
      { type: 'pulse', t: 800, source: 'knock', channel: 0 },
    ]);
  });
  it('spaces knocks within a group by knockIntervalMs', () => {
    const t = tapEncodeTimeline('G', timing).map((e) => e.t); // [2,2]
    expect(t).toEqual([0, 200, 1000, 1200]);
  });
  it('space emits no pulses and advances time by 2.5 x letterPauseMs', () => {
    expect(tapEncodeTimeline(' ', timing)).toEqual([]);
    const ev = tapEncodeTimeline('A B', timing); // A at 0,800; +1500; +3750; B
    expect(ev.map((e) => e.t)).toEqual([0, 800, 6050, 6850, 7050]);
  });
});

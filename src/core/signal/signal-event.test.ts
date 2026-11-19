import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildTimeline } from './signal-event';
import type { SignalEvent, SignalSource, TimelineDescriptor } from './signal-event';

describe('SignalEvent', () => {
  it('round-trips through JSON for any valid event (property)', () => {
    const sourceArb = fc.constantFrom<SignalSource>('switch', 'blink', 'knock');
    const typeArb = fc.constantFrom<'down' | 'up' | 'pulse'>('down', 'up', 'pulse');
    const channelArb = fc.constantFrom<0 | 1>(0, 1);

    fc.assert(
      fc.property(typeArb, fc.nat(), sourceArb, channelArb, (type, t, source, channel) => {
        const event: SignalEvent = { type, t, source, channel };
        const roundTripped = JSON.parse(JSON.stringify(event)) as SignalEvent;
        expect(roundTripped.type).toBe(type);
        expect(roundTripped.t).toBe(t);
        expect(roundTripped.source).toBe(source);
        expect(roundTripped.channel).toBe(channel);
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Integration smoke tests — Implements R1.2, R1.3
 */
describe('buildTimeline integration smoke tests', () => {
  it('zero-length timeline: empty descriptors with t0=0 returns an empty array', () => {
    const result = buildTimeline([], 0);
    expect(result).toEqual([]);
  });

  it('multi-event timeline: cumulative t values match hand-calculated expectations', () => {
    // dt values: 50, 150, 100, 200 → cumulative from t0=10: 60, 210, 310, 510
    const events = buildTimeline(
      [
        { type: 'down', dt: 50,  source: 'switch' },
        { type: 'up',   dt: 150, source: 'switch' },
        { type: 'down', dt: 100, source: 'blink'  },
        { type: 'pulse',dt: 200, source: 'knock'  },
      ],
      10,
    );
    expect(events).toHaveLength(4);
    expect(events[0]!.t).toBe(60);
    expect(events[1]!.t).toBe(210);
    expect(events[2]!.t).toBe(310);
    expect(events[3]!.t).toBe(510);
  });
});

describe('buildTimeline', () => {
  it('returns an empty array for an empty descriptor list', () => {
    expect(buildTimeline([])).toEqual([]);
    expect(buildTimeline([], 1000)).toEqual([]);
  });

  it('assigns t = t0 + dt for a single descriptor', () => {
    const events = buildTimeline(
      [{ type: 'down', dt: 100, source: 'switch' }],
      500,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.t).toBe(600);
    expect(events[0]!.type).toBe('down');
    expect(events[0]!.source).toBe('switch');
  });

  it('defaults channel to 0 when omitted', () => {
    const events = buildTimeline([{ type: 'down', dt: 0, source: 'switch' }]);
    expect(events[0]!.channel).toBe(0);
  });

  it('preserves an explicitly provided channel', () => {
    const events = buildTimeline([
      { type: 'pulse', dt: 0, source: 'blink', channel: 1 },
    ]);
    expect(events[0]!.channel).toBe(1);
  });

  it('computes cumulative t values correctly (monotonically non-decreasing)', () => {
    const descriptors: TimelineDescriptor[] = [
      { type: 'down', dt: 100, source: 'switch' },
      { type: 'up',   dt: 200, source: 'switch' },
      { type: 'down', dt: 50,  source: 'switch' },
      { type: 'up',   dt: 150, source: 'switch' },
    ];
    const events = buildTimeline(descriptors, 0);
    // Expected t values: 100, 300, 350, 500
    expect(events.map(e => e.t)).toEqual([100, 300, 350, 500]);
  });

  it('handles t0 > 0 and adds it to every cumulative offset', () => {
    const descriptors: TimelineDescriptor[] = [
      { type: 'down', dt: 10, source: 'knock' },
      { type: 'up',   dt: 20, source: 'knock' },
    ];
    const events = buildTimeline(descriptors, 1000);
    expect(events[0]!.t).toBe(1010);
    expect(events[1]!.t).toBe(1030);
  });

  it('allows dt = 0 (two events at the same timestamp)', () => {
    const events = buildTimeline([
      { type: 'down', dt: 100, source: 'switch' },
      { type: 'up',   dt: 0,   source: 'switch' },
    ]);
    expect(events[0]!.t).toBe(100);
    expect(events[1]!.t).toBe(100);
  });

  it('throws RangeError for a negative dt', () => {
    expect(() =>
      buildTimeline([{ type: 'down', dt: -1, source: 'switch' }]),
    ).toThrowError(new RangeError('dt must be a non-negative integer'));
  });

  it('throws RangeError when any descriptor (not just the first) has negative dt', () => {
    expect(() =>
      buildTimeline([
        { type: 'down', dt: 100, source: 'switch' },
        { type: 'up',   dt: -5,  source: 'switch' },
      ]),
    ).toThrowError(new RangeError('dt must be a non-negative integer'));
  });

  it('property: output is monotonically non-decreasing for any non-negative dts', () => {
    const descriptorArb = fc.record<TimelineDescriptor>({
      type: fc.constantFrom('down', 'up', 'pulse'),
      dt: fc.nat(),
      source: fc.constantFrom('switch', 'blink', 'knock'),
      channel: fc.option(fc.constantFrom<0 | 1>(0, 1), { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(descriptorArb, { minLength: 0, maxLength: 20 }),
        fc.nat(),
        (descriptors, t0) => {
          const events = buildTimeline(descriptors, t0);
          for (let i = 1; i < events.length; i++) {
            expect(events[i]!.t).toBeGreaterThanOrEqual(events[i - 1]!.t);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: cumulative sum matches t0 + sum of preceding dts', () => {
    const descriptorArb = fc.record<TimelineDescriptor>({
      type: fc.constantFrom('down', 'up', 'pulse'),
      dt: fc.nat(10000),
      source: fc.constantFrom('switch', 'blink', 'knock'),
      channel: fc.option(fc.constantFrom<0 | 1>(0, 1), { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(descriptorArb, { minLength: 1, maxLength: 20 }),
        fc.nat(100000),
        (descriptors, t0) => {
          const events = buildTimeline(descriptors, t0);
          let cumulative = t0;
          for (let i = 0; i < events.length; i++) {
            cumulative += descriptors[i]!.dt;
            expect(events[i]!.t).toBe(cumulative);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

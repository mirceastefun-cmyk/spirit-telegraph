# Design Document — signal-core

## Overview

`signal-core` is the deterministic heart of Spirit Telegraph. It lives entirely inside `src/core/` and contains no DOM references, no React imports, no timers, and no calls to `Date.now()` or any source of randomness. Every time-dependent decision receives its timestamp as an integer argument supplied by the caller. This constraint makes the entire module fully exercisable by synthetic timelines in unit and property-based tests.

The module is organised into six cohesive subsystems:

1. **Signal model** — the shared `SignalEvent` type and `buildTimeline` test helper.
2. **Morse subsystem** — alphabet lookup, encoder, one-switch and two-switch decoder, adaptive timing.
3. **Command table** — the seven named command patterns, shared by the Morse and Tap decoders.
4. **Tap code subsystem** — 6×5 Polybius grid, encoder, decoder.
5. **Yes/No decoder** — settle-window counter that emits `AnswerToken`.
6. **Composer** — pure text buffer that applies decoded tokens and emits structured UI events.

A single `index.ts` re-exports every public symbol so that the rest of the application imports from `@/core` only.

---

## Architecture

All data flows in one direction: sensors (outside `src/core/`) emit `SignalEvent` values → decoders consume them and emit `Token` values → the Composer applies tokens and emits `ComposerEvent` values → the UI reacts to those events.

```
Sensor (switch / blink / knock)
        │  SignalEvent
        ▼
 MorseDecoder / TapDecoder / YesNoDecoder
        │  Token[]
        ▼
     Composer
        │  ComposerEvent[]
        ▼
  UI / Store / Speech
```

No decoder knows which sensor produced a signal — the `source` field on `SignalEvent` exists so decoders can optionally filter by origin (e.g. `YesNoDecoder` with a configured `source`), but the decoding logic itself is source-agnostic.

The `AdaptiveTiming` class is an internal detail of `MorseDecoder`; it is exported from `src/core` only for testing purposes.

---

## Module Layout

```
src/core/
  signal/
    signal-event.ts           — SignalEvent type, SignalSource type, buildTimeline helper
    signal-event.test.ts      — unit and property tests for buildTimeline
  morse/
    morse-alphabet.ts         — 48-entry read-only lookup (A–Z, 0–9, 13 punctuation; NO "+")
    morse-encoder.ts          — encode(text, unitMs, source): SignalEvent[]
    morse-decoder.ts          — MorseDecoder class (one-switch and two-switch modes)
    adaptive-timing.ts        — AdaptiveTiming class
    morse-decoder.test.ts     — unit tests for MorseDecoder (examples and edge cases)
    morse-decoder.property.test.ts  — fast-check properties P1, P2, P4, P6, P9
    adaptive-timing.test.ts   — unit tests for AdaptiveTiming warm-up, clamp, reset
  commands/
    command-table.ts          — shared Command_Table used by both MorseDecoder and TapDecoder
    command-table.test.ts     — exhaustive P5 (no command collision)
  tapcode/
    tap-alphabet.ts           — 6×5 extended grid (rows 1–5 letters, row 6 commands)
    tap-encoder.ts            — tapEncode and tapEncodeTimeline
    tap-decoder.ts            — TapDecoder class
    tap-decoder.test.ts       — unit tests for TapDecoder (examples and edge cases)
    tap-decoder.property.test.ts    — fast-check properties P3, P10
  yesno/
    yesno-decoder.ts          — YesNoDecoder class
    yesno-decoder.test.ts     — unit and property tests (P7)
  composer/
    composer.ts               — Composer class
    composer.test.ts          — unit tests for every token kind
    composer.property.test.ts — fast-check properties P8
  index.ts                    — re-exports everything public
```

---

## Components and Interfaces

### TypeScript Type Definitions

```typescript
// signal/signal-event.ts

/** Implements signal-core R1.1 */
export type SignalSource = 'switch' | 'blink' | 'knock';

/** Implements signal-core R1.1 */
export interface SignalEvent {
  readonly type: 'down' | 'up' | 'pulse';
  /** Absolute timestamp in milliseconds, integer in [0, 2^53 − 1]. */
  readonly t: number;
  readonly source: SignalSource;
  /** Physical input channel; 0 = default/dot, 1 = dash. */
  readonly channel: 0 | 1;
}

/** Implements signal-core R1.2 */
export interface TimelineDescriptor {
  readonly type: 'down' | 'up' | 'pulse';
  /** Milliseconds of silence before this event (non-negative integer). */
  readonly dt: number;
  readonly source: SignalSource;
  readonly channel?: 0 | 1;
}
```

```typescript
// Core token and command types (re-exported from index.ts)

/** Implements signal-core R1 (Glossary) */
export type CommandName =
  | 'SPACE'
  | 'BACKSPACE'
  | 'SPEAK'
  | 'CLEAR'
  | 'ACCEPT_SUGGESTION'
  | 'NEXT_SUGGESTION'
  | 'HELP';

export type CharToken      = { readonly kind: 'char';    readonly value: string };
export type SpaceToken     = { readonly kind: 'space' };
export type CommandToken   = { readonly kind: 'command'; readonly name: CommandName };
export type UnknownToken   = { readonly kind: 'unknown' };
export type AnswerToken    = { readonly kind: 'answer';  readonly value: 'yes' | 'no' };

/** Implements signal-core R1 (Token discriminated union) */
export type Token =
  | CharToken
  | SpaceToken
  | CommandToken
  | UnknownToken
  | AnswerToken;
```

```typescript
// composer/composer.ts

/** Implements signal-core R10 */
export type ComposerEvent =
  | { readonly type: 'letter-added';     readonly char: string;   readonly buffer: string }
  | { readonly type: 'word-completed';   readonly word: string;   readonly buffer: string }
  | { readonly type: 'letter-removed';                            readonly buffer: string }
  | { readonly type: 'clear-requested';  readonly text: string }
  | { readonly type: 'speak-requested';  readonly text: string }
  | { readonly type: 'help-requested' }
  | { readonly type: 'suggestion-accept' }
  | { readonly type: 'suggestion-next' }
  | { readonly type: 'unknown-symbol' };
```

```typescript
// morse/morse-decoder.ts

/** Implements signal-core R4, R5 */
export interface MorseDecoderConfig {
  /** 'one-switch' classifies press duration; 'two-switch' uses channel. Default: 'one-switch'. */
  readonly mode?: 'one-switch' | 'two-switch';
  /** Channel index mapped to dot in two-switch mode. Default: 0. */
  readonly dotChannel?: 0 | 1;
  /** Channel index mapped to dash in two-switch mode. Default: 1. */
  readonly dashChannel?: 0 | 1;
  /** Starting unit duration in ms, also used during warm-up. Range [40, 3000]. */
  readonly initialUnitMs?: number;
  /** Emit a space token automatically on word-gap silence. Default: true. */
  readonly autoWordGap?: boolean;
  /** Silence multiplier for letter gap. Range [1.5, 6.0]. Default: 1.75. */
  readonly letterGapFactor?: number;
  /** Silence multiplier for word gap. Range [3.0, 12.0]. Default: 4.5. */
  readonly wordGapFactor?: number;
  /** Number of presses before adaptive estimates are trusted. Range [2, 20]. Default: 6. */
  readonly warmUpCount?: number;
  /** EMA smoothing factor. Range [0.05, 0.5]. Default: 0.15. */
  readonly alpha?: number;
}
```

```typescript
// morse/adaptive-timing.ts

/** Implements signal-core R6 */
export interface Thresholds {
  /** Geometric-mean boundary between dot and dash durations, in ms. */
  readonly dotDashThreshold: number;
  /** Minimum silence to flush a symbol, in ms. */
  readonly letterGapMin: number;
  /** Minimum silence to auto-emit a space token, in ms. */
  readonly wordGapMin: number;
  /** Minimum press duration to treat as a HELP long-hold, in ms. */
  readonly longHoldMs: number;
}
```

```typescript
// tapcode/tap-decoder.ts

/** Implements signal-core R8 */
export interface TapDecoderConfig {
  /** Initial mean time between pulses within a group, in ms. Default: 200. */
  readonly knockIntervalMs?: number;
  /** Initial mean pause between row and column groups, in ms. Default: 600. */
  readonly groupPauseMs?: number;
  /** Initial mean pause between characters, in ms. Default: 1800. */
  readonly letterPauseMs?: number;
}
```

```typescript
// yesno/yesno-decoder.ts

/** Implements signal-core R9 */
export interface YesNoDecoderConfig {
  /** Window duration after last signal before resolving, in ms. Range [500, 10000]. Default: 1500. */
  readonly settleMs?: number;
  /** If set, only events with this source are counted. */
  readonly source?: SignalSource;
}
```

---

## Data Models

### Morse Alphabet

The alphabet is a frozen `ReadonlyMap<string, string>` (or a `Readonly<Record<string, string>>`) with exactly 48 entries. Keys are lowercase single characters; values are non-empty strings over `{'.', '-'}`. Both `'a'` and `'A'` resolve to the same pattern because all lookups normalise the input to lowercase before querying.

Supported characters: A–Z (26), 0–9 (10), `. , ? ! / ' - ( ) : = @` (12). That is 48 entries total. The character `+` is intentionally excluded from the alphabet.

### Command Table

A frozen `ReadonlyMap<string, CommandName>` keyed by dot-dash pattern strings. It is defined once in `commands/command-table.ts` and imported by both `MorseDecoder` and `TapDecoder`'s flush logic.

### Tap Grid

A two-dimensional frozen lookup: `TAP_GRID[row][col]` where `row ∈ [1, 6]` and `col ∈ [1, 5]`. Rows 1–5 return a letter or null (K's slot is omitted; callers normalise K→C before lookup); row 6 returns a `CommandName`.

```
Row 1: A  B  C  D  E
Row 2: F  G  H  I  J
Row 3: L  M  N  O  P
Row 4: Q  R  S  T  U
Row 5: V  W  X  Y  Z
Row 6: SPACE  BACKSPACE  SPEAK  ACCEPT_SUGGESTION  NEXT_SUGGESTION
```

K is canonicalised to C (row 1, column 3) by the encoder and by the decoder's grid output.

### AdaptiveTiming Internal State

```typescript
interface AdaptiveState {
  dotMean:   number;  // clamped to [40, 3000]
  dashMean:  number;  // unclamped, but ≥ dotMean in practice
  count:     number;  // accepted observation count
}
```

### MorseDecoder Internal State

```typescript
type MorseState = 'IDLE' | 'PRESSING' | 'AFTER_UP' | 'HELP_FIRED';

interface MorseInternalState {
  state:              MorseState;
  symbolBuf:          string;    // accumulating dots and dashes
  downAt:             number;    // timestamp of active 'down', or -1
  lastUpAt:           number;    // timestamp of most recent 'up', or -1
  spaceSentThisSilence: boolean; // prevents duplicate space tokens
}
```

### TapDecoder Internal State

```typescript
type TapState = 'IDLE' | 'IN_GROUP_1' | 'BETWEEN_GROUPS' | 'IN_GROUP_2' | 'AFTER_CHAR';

interface TapInternalState {
  state:              TapState;
  group1Count:        number;
  group2Count:        number;
  lastPulseAt:        number;    // -1 if no pulse seen
  spaceSentThisSilence: boolean;
}
```

### YesNoDecoder Internal State

```typescript
interface YesNoState {
  count:        number;
  lastSignalT:  number | null;
  settled:      boolean;
}
```

---

## Command Reference Table

The Command_Table is checked before the Morse alphabet on every symbol flush. A buffer that matches a command pattern emits a `command` token and is never looked up in the alphabet.

| Command             | Pattern     | Elements                      | Notes                                            |
|---------------------|-------------|-------------------------------|--------------------------------------------------|
| `SPACE`             | `..--`      | 2 dots, 2 dashes              |                                                  |
| `BACKSPACE`         | `----`      | 4 dashes                      |                                                  |
| `ACCEPT_SUGGESTION` | `.-.-`      | dot-dash-dot-dash             |                                                  |
| `NEXT_SUGGESTION`   | `---.`      | 3 dashes, 1 dot               |                                                  |
| `SPEAK`             | `.-.-.`     | dot-dash-dot-dash-dot         | AR prosign (end of message)                      |
| `CLEAR`             | `........`  | 8 dots                        | HH prosign (error / cancel)                      |
| `HELP`              | `...---...` | 3 dots, 3 dashes, 3 dots      | SOS prosign; also fires on long hold ≥ longHoldMs |

No command pattern is present in the 48-entry Morse alphabet, and all seven patterns are mutually distinct. This invariant is verified exhaustively by property test P5.

---

## AdaptiveTiming Design

`AdaptiveTiming` maintains two exponential moving average (EMA) clusters that track the user's natural dot and dash durations independently. The initial state before any observations is:

- `dotMean  = initialUnitMs`
- `dashMean = 3 × initialUnitMs`

**Observation update** (called by `MorseDecoder` on each completed press):

1. If `d >= longHoldMs` (where `longHoldMs = max(3000, 3 × dashMean)`) → discard the duration; it represents a HELP long-hold, not a Morse element.
2. Assign `d` to the nearer cluster: compare `|d − dotMean|` with `|d − dashMean|`; ties go to dot.
3. Update the winning cluster: `mean = α × d + (1 − α) × mean`.
4. Clamp `dotMean` to [40, 3000] after the update.

**Threshold derivation** (recalculated after every update):

```
dotDashThreshold = sqrt(dotMean × dashMean)
letterGapMin     = letterGapFactor × dotMean        // default factor 1.75
wordGapMin       = wordGapFactor   × dotMean        // default factor 4.5
longHoldMs       = max(3000, 3 × dashMean)
```

The geometric-mean threshold keeps a symmetric multiplicative margin on both sides, so a press can jitter ±25% without crossing into the wrong cluster once the means are well-separated.

**Warm-up**: while `count < warmUpCount` (default 6), all threshold derivations use `initialUnitMs` as the dot mean and `3 × initialUnitMs` as the dash mean, regardless of observed durations. The counts still accumulate; observations during warm-up are still fed to the EMA.

**`reset()`**: sets both means back to their initial values, resets `count` to 0.

**Configuration validation**: if `initialUnitMs` is outside [40, 3000], the constructor throws before accepting any events.

---

## MorseDecoder State Machine

### States

| State        | Meaning                                                                 |
|--------------|-------------------------------------------------------------------------|
| `IDLE`       | No active press; symbol buffer may be non-empty (between elements).     |
| `PRESSING`   | A `'down'` has been received; waiting for the `'up'`.                   |
| `AFTER_UP`   | The last `'up'` has been received; silence is being timed.              |
| `HELP_FIRED` | A long-hold HELP was emitted; next `'up'` is to be ignored.             |

### Transitions

**`IDLE → PRESSING`**: on a `'down'` event. Record `downAt = event.t`. Clear any stale `downAt` from a previous orphaned press.

**`PRESSING → AFTER_UP`**: on an `'up'` event. Compute `d = up.t − downAt`. Pass `d` to `AdaptiveTiming.observe(d)`. Classify: if `d < dotDashThreshold` → append `'.'` to `symbolBuf`; else → append `'-'`. Record `lastUpAt = up.t`. Reset `spaceSentThisSilence = false`.

**`PRESSING → HELP_FIRED`**: inside `tick(nowMs)`, if `nowMs − downAt >= longHoldMs`. Emit `{ kind: 'command', name: 'HELP' }`. Transition to `HELP_FIRED`.

**`HELP_FIRED → IDLE`**: on the `'up'` event that ends the long hold. Discard the event (no dot or dash appended). Reset `downAt`.

**`AFTER_UP` silence checks inside `tick(nowMs)`**:

- `silence = nowMs − lastUpAt`
- If `silence < letterGapMin` → return `[]` (still accumulating).
- If `letterGapMin ≤ silence < wordGapMin` → flush `symbolBuf` using command-first lookup (see below); transition to `IDLE`; return the flushed token.
- If `silence ≥ wordGapMin`:
  - Flush `symbolBuf` as above (if non-empty).
  - If `autoWordGap` is `true` and `!spaceSentThisSilence` → also emit `{ kind: 'space' }`, set `spaceSentThisSilence = true`.
  - Transition to `IDLE`; return all emitted tokens.
  - Subsequent `tick` calls during the same silence return `[]`.

**Symbol flush algorithm** (command-first):

1. Look up `symbolBuf` in the Command_Table. If found → emit `{ kind: 'command', name }`.
2. Else look up in the Morse alphabet. If found → emit `{ kind: 'char', value: upperCaseLetter }`.
3. Else → emit `{ kind: 'unknown' }`.
4. Clear `symbolBuf`.

**Two-switch mode**: a `'pulse'` event (or a `'down'`/`'up'` pair) on `channel === dotChannel` appends `'.'` immediately; on `channel === dashChannel` appends `'-'` immediately. Press duration is irrelevant; `AdaptiveTiming` is not updated. Gap timing still governs letter and word boundaries. A `'down'` or `'pulse'` on an unrecognised channel is silently ignored.

---

## TapDecoder State Machine

The tap decoder processes `'pulse'` events from a `'knock'` source. Its state tracks two sequential knock groups that together encode one character (row count, then column count).

### States

| State             | Meaning                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `IDLE`            | No pulses received yet in this character.                               |
| `IN_GROUP_1`      | Accumulating row-count pulses.                                          |
| `BETWEEN_GROUPS`  | Row group complete; waiting for first column pulse.                     |
| `IN_GROUP_2`      | Accumulating column-count pulses.                                       |
| `AFTER_CHAR`      | Column group complete; character pending flush.                         |

### Timing Thresholds

The decoder maintains three EMA means (5-sample α ≈ 0.33, clamped to [100, 5000] ms):

- `knockIntervalMean` — time between consecutive pulses within a group (default 200 ms)
- `groupPauseMean` — pause between the row group and the column group (default 600 ms)
- `letterPauseMean` — pause between fully decoded characters (default 1800 ms)

Derived thresholds:

```
interGroupThreshold  = midpoint(knockIntervalMean, groupPauseMean)
interLetterThreshold = midpoint(groupPauseMean, letterPauseMean)
```

The constraint `interGroupThreshold < interLetterThreshold` is maintained by the clamped means.

### Transitions

**On `pulse` arrival** (elapsed = `pulse.t − lastPulseAt`):

- If this is the 8th or more pulse in the current group → emit `{ kind: 'command', name: 'HELP' }`, reset to `IDLE`. Do not append to any group count.
- If `elapsed < interGroupThreshold` (or no prior pulse) → increment the current group count. State stays `IN_GROUP_1` or `IN_GROUP_2`.
- If `interGroupThreshold ≤ elapsed < interLetterThreshold` → the previous group is complete; move to the next group. `IN_GROUP_1 → IN_GROUP_2` (record `group1Count`, reset `group2Count = 1`).
- If `elapsed ≥ interLetterThreshold` → an inter-letter pause elapsed before this pulse. Flush the previous character first (if any pending groups), then start a new character: set `group1Count = 1`, `group2Count = 0`, transition to `IN_GROUP_1`.

**On `tick(nowMs)` silence check** (elapsed = `nowMs − lastPulseAt`):

- If `elapsed ≥ interLetterThreshold` and there is a pending character (at least `group1Count > 0`) → flush the character and transition to `IDLE`.
- If `elapsed ≥ 2 × interLetterThreshold` and no pending character and `!spaceSentThisSilence` → emit `{ kind: 'space' }`, set `spaceSentThisSilence = true`. Subsequent ticks return `[]`.

**Character flush algorithm**:

1. If `group1Count ∈ [1,5]` and `group2Count ∈ [1,5]` → look up `TAP_GRID[group1Count][group2Count]`; emit `{ kind: 'char', value }`.
2. If `group1Count === 6` and `group2Count ∈ [1,5]` → look up `TAP_GRID[6][group2Count]`; emit `{ kind: 'command', name }`.
3. Otherwise → emit `{ kind: 'unknown' }`.
4. Reset both group counts, clear pending state.

---

## YesNoDecoder Design

A simple settle-window counter. The decoder accepts an optional `source` filter; when set, only events whose `source` field matches are counted.

**State**: `{ count: number, lastSignalT: number | null, settled: boolean }`

**On `feed(event)`**:
- If `event.type === 'up'` → ignore (count only initiating signals).
- If `source` is configured and `event.source !== config.source` → ignore.
- If `event.type === 'down'` or `'pulse'` and passes source filter → increment `count`; set `lastSignalT = event.t`; set `settled = false`.
- Return `null` (resolution is deferred to `tick`).

**On `tick(nowMs)`**:
- If `lastSignalT === null` or `settled` → return `null`.
- If `nowMs − lastSignalT >= settleMs` → resolve:
  - `count === 1` → return `{ kind: 'answer', value: 'yes' }`.
  - `count === 2` → return `{ kind: 'answer', value: 'no' }`.
  - Otherwise → return `null`.
  - Reset: `count = 0`, `lastSignalT = null`, `settled = true`.
- Else → return `null`.

The decoder emits at most one non-null token per window (R9.5), because `settled` is set to `true` immediately after resolution and prevents further non-null returns until a new signal arrives.

---

## Composer Design

`Composer` is a pure class with a single mutable `buffer: string` field. It has no side effects; callers react to the returned `ComposerEvent[]` array.

### `apply(token: Token): ComposerEvent[]`

| Token | Condition | Buffer mutation | Events returned |
|---|---|---|---|
| `char` | `buffer.length < 10000` | append `value` | `[{ type: 'letter-added', char: value, buffer }]` |
| `char` | `buffer.length === 10000` | none | `[]` |
| `space` or `command SPACE` | buffer non-empty and not ending with `' '` | append `' '` | `[{ type: 'word-completed', word: <last word>, buffer }]` |
| `space` or `command SPACE` | buffer empty or ends with `' '` | none | `[]` |
| `command BACKSPACE` | buffer non-empty | remove last char | `[{ type: 'letter-removed', buffer }]` |
| `command BACKSPACE` | buffer empty | none | `[]` |
| `command CLEAR` | any | none | `[{ type: 'clear-requested', text: buffer }]` |
| `command SPEAK` | any | none | `[{ type: 'speak-requested', text: buffer }]` |
| `command HELP` | any | none | `[{ type: 'help-requested' }]` |
| `command ACCEPT_SUGGESTION` | any | none | `[{ type: 'suggestion-accept' }]` |
| `command NEXT_SUGGESTION` | any | none | `[{ type: 'suggestion-next' }]` |
| `unknown` | any | none | `[{ type: 'unknown-symbol' }]` |
| `answer` | any | none | `[]` |

### Additional Methods

**`confirmClear(): void`** — sets `buffer = ''`; emits no events. Called by the UI after the user confirms a CLEAR dialog. Implements R10.7a.

**`reset(): void`** — sets `buffer = ''`; emits no events. For test use only. Implements R10.13.

**`readonly buffer: string`** — reflects the current buffer after every `apply` call. Implements R10.12.

---

## Test Helper: `decodeTimeline`

This helper is used by all property tests (P1–P3, P6, P9, P10) to drive a decoder with a synthetic event sequence and collect all emitted tokens.

```typescript
/**
 * Drives a decoder through a SignalEvent timeline and collects all tokens.
 * @param decoder    - any object with feed() and tick() returning Token[]
 * @param events     - ordered SignalEvent array (monotonically non-decreasing t)
 * @param finalGapMs - silence to tick after the last event (default: 10 × wordGapMin
 *                     if available, else 30000 ms)
 */
function decodeTimeline(
  decoder: { feed(e: SignalEvent): Token[]; tick(nowMs: number): Token[] },
  events: SignalEvent[],
  finalGapMs?: number,
): Token[]
```

**Algorithm**:

1. For each event in `events` (in order):
   a. Call `decoder.feed(event)` and collect returned tokens.
   b. Call `decoder.tick(event.t)` and collect returned tokens.
2. After the last event, call `decoder.tick(lastEvent.t + finalGapMs)` to flush any pending symbol. If `events` is empty, return `[]`.
3. Return all tokens concatenated in order.

The helper is defined in `src/core/signal/signal-event.ts` (or a sibling `timeline.ts`) and re-exported from `index.ts`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

All property tests use `fast-check` (already a dev dependency). No new dependencies are introduced by this spec. Each property test is configured for a minimum of 100 runs; failures print the failing seed via `fc.assert(fc.property(...), { seed: ... })`.

---

### Property 1: Morse round-trip

*For any* non-empty string composed solely of characters in the supported Morse alphabet (A–Z, 0–9, 13 punctuation marks) and *for any* `unitMs` value in [40, 3000], a `MorseDecoder` initialised with `initialUnitMs = unitMs` fed the output of `morseEncode(text, unitMs, 'switch')` and driven to completion via `decodeTimeline` SHALL produce a decoded string equal to `text.toUpperCase()` with consecutive spaces collapsed and leading/trailing spaces removed.

**Validates: Requirements 3, 4, 11.1**

---

### Property 2: Jitter tolerance

*For any* non-empty Morse-alphabet string and *for any* `unitMs` in [40, 3000], when each individual signal duration in the encoded timeline is independently scaled by a factor drawn uniformly from [0.75, 1.25], a `MorseDecoder` initialised with `initialUnitMs = unitMs` SHALL produce a fully correct decoded string from the first character.

**Validates: Requirements 6, 11.2**

---

### Property 3: Tap-code round-trip

*For any* non-empty string composed solely of tap-code alphabet characters (A–Z excluding K) and *for any* valid timing configuration `{ knockIntervalMs ∈ [100, 300], groupPauseMs ∈ [400, 800], letterPauseMs ∈ [1000, 3000] }` with the ordering constraint `knockIntervalMs < groupPauseMs < letterPauseMs`, a `TapDecoder` initialised with matching defaults fed the output of `tapEncodeTimeline(text, timing)` and driven to completion SHALL produce a decoded string equal to `text.toUpperCase()` with every K replaced by C.

**Validates: Requirements 8, 11.3**

---

### Property 4: No phantom letters before letter gap

*For any* `unitMs` in [40, 3000] and *for any* partial symbol sequence (a `'down'`/`'up'` pair appending at least one element to the symbol buffer), `MorseDecoder.tick(nowMs)` called with any `nowMs` strictly less than `lastUpTime + decoder.thresholds.letterGapMin` SHALL return an empty token array — no `char` or `command` token for the in-progress symbol.

**Validates: Requirements 4, 11.4**

---

### Property 5: No command–alphabet collision (exhaustive, not sampled)

The Command_Table patterns `..--`, `----`, `.-.-`, `---.`, `.-.-.`, `........`, `...---...` are mutually distinct and none appears among the 48 entries of the Morse alphabet (A–Z, 0–9, 13 punctuation marks). This invariant is verified by exhaustively iterating all 7 command patterns against all 48 alphabet entries in a deterministic unit test (not a property-based test).

**Validates: Requirements 7.4, 11.5**

---

### Property 6: HELP trigger correctness

*For any* `unitMs` in [40, 3000]:

- When a `MorseDecoder` is fed the SOS prosign as nine consecutive elements (`· · · − − − · · ·`) with inter-element silences of exactly `unitMs` ms (one unit), it SHALL emit exactly one `{ kind: 'command', name: 'HELP' }` token and no other tokens.
- When the same decoder is fed `"SOS"` encoded as three separate letter symbols with inter-letter silences of exactly `3 × unitMs` ms, it SHALL emit three `char` tokens (`'S'`, `'O'`, `'S'`) and zero HELP tokens.

**Validates: Requirements 7.5, 7.6, 7.7, 11.6**

---

### Property 7: Yes/No single answer per window

*For any* `settleMs` in [500, 5000] and *for any* signal count in [0, 10] where each of the `count` signals arrives at a spacing strictly less than `settleMs` ms from the previous one, the `YesNoDecoder` SHALL emit at most one non-null token after the settle window closes; that token SHALL be `{ kind: 'answer', value: 'yes' }` when `count === 1`, `{ kind: 'answer', value: 'no' }` when `count === 2`, and `null` when `count === 0` or `count ≥ 3`.

**Validates: Requirements 9, 11.7**

---

### Property 8: Composer BACKSPACE/CLEAR round-trip

*For any* Composer with any buffer string and *for any* single-character value appended via `apply({ kind: 'char', value })`, immediately calling `apply({ kind: 'command', name: 'BACKSPACE' })` SHALL return the buffer to the exact string it held before the insert. Additionally, *for any* buffer string, calling `confirmClear()` SHALL result in an empty buffer.

**Validates: Requirements 10, 11.8**

---

### Property 9: Tempo drift correction

*For any* initial unit length `u0` in [40, 3000] and *for any* Morse-alphabet text of at least 10 characters, when signal durations drift gradually such that the effective unit length changes by at most 5% per decoded character and stays within [0.5 × u0, 2 × u0] throughout the sequence, the `MorseDecoder` SHALL decode every character correctly without manual recalibration.

**Validates: Requirements 6, 11.9**

---

### Property 10: Tap command decoding

*For any* valid `TapDecoderConfig` within clamp bounds, the `TapDecoder` SHALL correctly decode each row-6 column `c ∈ {1, 2, 3, 4, 5}` to its corresponding command token (`SPACE`, `BACKSPACE`, `SPEAK`, `ACCEPT_SUGGESTION`, `NEXT_SUGGESTION` respectively), and a single group of 8 or more `pulse` events before any inter-group pause SHALL produce exactly one `{ kind: 'command', name: 'HELP' }` token.

**Validates: Requirements 8, 11.10**

## Error Handling

| Error condition | Throwing site | Error type | Message |
|---|---|---|---|
| `initialUnitMs` outside [40, 3000] | `AdaptiveTiming` constructor | `RangeError` | `"initialUnitMs must be in [40, 3000]"` |
| `unitMs` outside [40, 3000] | `morseEncode` | `RangeError` | `"unitMs must be in [40, 3000]"` |
| `dotChannel === dashChannel` | `MorseDecoder` constructor | `RangeError` | `"dotChannel and dashChannel must differ"` |
| Negative `dt` in `buildTimeline` | `buildTimeline` | `RangeError` | `"dt must be a non-negative integer"` |
| `settleMs` outside [500, 10000] | `YesNoDecoder` constructor | `RangeError` | `"settleMs must be in [500, 10000]"` |
| `letterGapFactor` outside [1.5, 6.0] | `AdaptiveTiming` constructor | `RangeError` | `"letterGapFactor must be in [1.5, 6.0]"` |
| `wordGapFactor` ≤ `letterGapFactor` | `AdaptiveTiming` constructor | `RangeError` | `"wordGapFactor must be strictly greater than letterGapFactor"` |

All error paths are tested via example-based unit tests (not property-based), since error triggering depends on specific boundary inputs rather than universal input variation.

Unknown characters passed to `morseEncode` or `tapEncode` are silently skipped (not errors), consistent with R3.4 and R8.3.

---

## Testing Strategy

All test files live next to the source files they test (e.g. `morse-decoder.ts` → `morse-decoder.test.ts` and `morse-decoder.property.test.ts`).

### Unit tests (example-based)

Unit tests cover specific examples, error conditions, edge cases, and integration points between components. They are intentionally lean — property tests handle broad input coverage.

Key unit test targets:

- `signal-event.test.ts`: `buildTimeline` output shape, monotonicity, negative-`dt` throw.
- `morse-alphabet.test.ts` (inline in `morse-encoder.test.ts` or separate): 48-entry count, case-insensitivity, unknown-char returns `undefined`, read-only enforcement.
- `morse-decoder.test.ts`: orphan `'up'` ignored, two-switch config error, channel-mismatch ignored, single-character round-trip, word-gap space emission, long-hold HELP ignores subsequent `'up'`.
- `adaptive-timing.test.ts`: warm-up behaviour, clamp to [40, 3000], `reset()`, `longHoldMs` derivation.
- `command-table.test.ts`: exhaustive P5 collision check.
- `tap-decoder.test.ts`: inter-group/inter-letter boundary examples, row-6 commands, 8-pulse HELP, unknown token on bad row/col.
- `yesno-decoder.test.ts`: source filter, settled window returns `null` until new signal, count 0 and ≥3 return `null`.
- `composer.test.ts`: all 13 rows of the token decision table, `confirmClear`, `reset`, buffer-full guard.

### Property-based tests (fast-check)

Each property test file uses `fc.assert(fc.property(...), { numRuns: 100, seed: fc.Random.noShrink() })`. On failure the seed is printed automatically by fast-check.

| File | Properties |
|---|---|
| `morse-decoder.property.test.ts` | P1, P2, P4, P6, P9 |
| `tap-decoder.property.test.ts` | P3, P10 |
| `yesno-decoder.test.ts` | P7 |
| `composer.property.test.ts` | P8 |
| `command-table.test.ts` | P5 (exhaustive, deterministic) |

**Generators used**:

- Morse-alphabet strings: `fc.string({ minLength: 1 }).filter(s => s.split('').every(c => morseAlphabet.has(c.toUpperCase())))`
- Tap-alphabet strings: `fc.string({ minLength: 1 }).filter(s => s.split('').every(c => tapAlphabet.has(c.toUpperCase())))`
- `unitMs`: `fc.integer({ min: 40, max: 3000 })`
- Jitter factor array: `fc.array(fc.float({ min: 0.75, max: 1.25 }), { minLength: eventCount, maxLength: eventCount })`
- Timing config: `fc.record({ knockIntervalMs: fc.integer({ min: 100, max: 300 }), groupPauseMs: fc.integer({ min: 400, max: 800 }), letterPauseMs: fc.integer({ min: 1000, max: 3000 }) })`
- Signal count: `fc.integer({ min: 0, max: 10 })`
- `settleMs`: `fc.integer({ min: 500, max: 5000 })`

Each property test carries a tag comment referencing the design property it implements:
```typescript
// Feature: signal-core, Property 1: Morse round-trip
```

### Dependencies

All property-based tests use `fast-check` (already a dev dependency). No new runtime or test dependencies are introduced by this spec.

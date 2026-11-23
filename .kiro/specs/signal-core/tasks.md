# Implementation Plan: signal-core

## Overview

Implement the deterministic, framework-free core of Spirit Telegraph inside `src/core/`. Every task leaves `npm test` passing. Tasks proceed in strict dependency order: shared types first, then each subsystem with its property tests immediately after the code they verify, finishing with the barrel export and a full test + lint pass.

The stack is TypeScript strict mode (`noUncheckedIndexedAccess`), Vitest, and fast-check. Test files live next to the source files they test.

## Tasks

- [x] 1. Shared types and `buildTimeline`
  - Update `src/core/signal/signal-event.ts` to add the `channel: 0 | 1` field to `SignalEvent`, add the `TimelineDescriptor` interface, and implement `buildTimeline(descriptors, t0)`. Throw `RangeError("dt must be a non-negative integer")` for negative `dt`. All exports are named; no default export.
  - Define `CommandName`, `CharToken`, `SpaceToken`, `CommandToken`, `UnknownToken`, `AnswerToken`, `Token`, `ComposerEvent`, and `Thresholds` in a new file `src/core/signal/types.ts` (or inline in `signal-event.ts` if preferred for brevity; either way all types must be re-exported from `src/core/index.ts` in Task 24).
  - Update `src/core/signal/signal-event.test.ts`: cover `buildTimeline` output shape (monotonically non-decreasing `t`), cumulative-sum correctness, optional `channel` defaulting to `0`, and the negative-`dt` throw.
  - _Implements R1.1, R1.2, R1.3, R1.4, R1.5_

- [x] 2. Command table and P5 collision test
  - Create `src/core/commands/command-table.ts` with a frozen `ReadonlyMap<string, CommandName>` containing the seven entries: `SPACE='..--'`, `BACKSPACE='----'`, `ACCEPT_SUGGESTION='.-.-'`, `NEXT_SUGGESTION='---.'`, `SPEAK='.-.-.`, `CLEAR='........'`, `HELP='...---...'`. No default export.
  - Create `src/core/commands/command-table.test.ts` with an **exhaustive deterministic unit test** (not a property-based test) for P5: iterate all 7 command patterns against all 48 Morse alphabet entries (once the alphabet exists in Task 5; stub with the 48 patterns inline for now if Task 5 is not yet complete) and assert that every command pattern differs from every alphabet pattern and that all command patterns are mutually distinct. The test iterates over concrete sets — no fast-check sampling.
  - _Implements R7.1, R7.2, R7.4, R11.5_

- [x] 3. `buildTimeline` helper — integration smoke test
  - Extend `src/core/signal/signal-event.test.ts` with two additional cases: a zero-length timeline (`t0` = 0, empty descriptors) and a multi-event timeline whose cumulative `t` values are verified against hand-calculated expectations. Confirm `npm test` passes after Task 1 and Task 2 land.
  - _Implements R1.2, R1.3_

- [x] 4. `decodeTimeline` helper
  - Add `decodeTimeline` to `src/core/signal/signal-event.ts` (or a sibling `src/core/signal/timeline.ts`). The function signature is:
    ```typescript
    function decodeTimeline(
      decoder: { feed(e: SignalEvent): Token[]; tick(nowMs: number): Token[] },
      events: SignalEvent[],
      finalGapMs?: number,
    ): Token[]
    ```
  - **Algorithm — tick-before-feed ordering**: for each event call `decoder.tick(event.t)` first, collect the returned tokens, then call `decoder.feed(event)` and collect its tokens. After the last event call `decoder.tick(lastEvent.t + finalGapMs)` (default `finalGapMs = 30000`). Return all tokens concatenated in arrival order.
  - **Why tick-before-feed**: calling `tick` before `feed` ensures any symbol that has been pending since the previous press is flushed before the new signal is processed. Without this ordering, `· [letter-gap] ·` (the sequence for E, E) could be presented as `··` to the decoder and decoded as `I` — the EE→I bug.
  - No dedicated tests for this helper; it is exercised by the property tests in Tasks 9–14 and 18–19.
  - _Implements the test helper referenced by R11.1–R11.10_

- [x] 5. Morse alphabet
  - Create `src/core/morse/morse-alphabet.ts` exporting `MORSE_ALPHABET` as a frozen `ReadonlyMap<string, string>` with exactly 48 entries: 26 letters A–Z (stored as lowercase keys), 10 digits 0–9, and 13 punctuation marks `. , ? ! / ' - ( ) : = @`. Values are non-empty strings over `{'.', '-'}`. The character `+` is intentionally absent. No default export.
  - Provide a lookup helper `morsePattern(char: string): string | undefined` that normalises the input to lowercase and returns `undefined` without throwing for unknown characters.
  - Create `src/core/morse/morse-alphabet.test.ts` covering: exact entry count is 48, case-insensitive resolution (`'A'` and `'a'` same pattern), unknown char returns `undefined`, read-only enforcement (attempting to mutate the map has no effect), and that every pattern string is non-empty and contains only `'.'` or `'-'`.
  - _Implements R2.1, R2.2, R2.3, R2.4, R2.5_

- [x] 6. Morse encoder
  - Create `src/core/morse/morse-encoder.ts` exporting `morseEncode(text: string, unitMs: number, source: SignalSource): SignalEvent[]`. Throw `RangeError("unitMs must be in [40, 3000]")` for out-of-range `unitMs`. Timing ratios: dot = `1 × unitMs`, dash = `3 × unitMs`, inter-element gap = `1 × unitMs`, inter-letter gap = `3 × unitMs`, inter-word gap = `7 × unitMs`. First event's `t` = 0. Unknown characters are silently skipped. Empty string returns `[]`. All events carry `channel: 0`. No default export.
  - Create `src/core/morse/morse-encoder.test.ts` covering: single-dot character produces one `down`/`up` pair of duration `unitMs`, single-dash character produces one pair of `3 × unitMs`, inter-element gaps, inter-letter gaps, inter-word gaps, skip of unknown character, empty string, out-of-range `unitMs` throws, and monotonically increasing timestamps.
  - _Implements R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7_

- [x] 7. `AdaptiveTiming`
  - Create `src/core/morse/adaptive-timing.ts` exporting `AdaptiveTiming` class and `Thresholds` interface (if not already in `types.ts`). Constructor validates `initialUnitMs ∈ [40, 3000]` (throw `RangeError`), `letterGapFactor ∈ [1.5, 6.0]`, and `wordGapFactor > letterGapFactor`. Initial state: `dotMean = initialUnitMs`, `dashMean = 3 × initialUnitMs`, `count = 0`.
  - `observe(d)`: if `d >= longHoldMs` discard; else classify via geometric threshold and EMA-update the winning cluster; clamp `dotMean` to [40, 3000]; enforce `dashMean = max(dashMean, 2 × dotMean)`; increment `count`.
  - During warm-up (`count < warmUpCount`): threshold derivations use `initialUnitMs` as `dotMean` and `3 × initialUnitMs` as `dashMean` even after updates.
  - Expose `thresholds: Thresholds` (readonly property): `dotDashThreshold = sqrt(dotMean × dashMean)`, `letterGapMin = letterGapFactor × dotMean`, `wordGapMin = wordGapFactor × dotMean`, `longHoldMs = max(3000, 3 × dashMean)`.
  - `reset()`: restore both means and `count` to initial values.
  - Create `src/core/morse/adaptive-timing.test.ts` covering: warm-up — thresholds use initial values during first `warmUpCount − 1` observations; post-warm-up update changes `dotDashThreshold`; clamp — `dotMean` never drops below 40 or exceeds 3000; `dashMean >= 2 × dotMean` after every update; `longHoldMs >= 3000` always; `reset()` restores initial state; constructor throws for bad `initialUnitMs`, bad `letterGapFactor`, bad `wordGapFactor`.
  - _Implements R6.1, R6.2, R6.3, R6.3a, R6.4, R6.4a, R6.5, R6.6, R6.7, R6.8, R6.9, R6.10_

- [x] 8. One-switch `MorseDecoder`
  - Create `src/core/morse/morse-decoder.ts` exporting `MorseDecoder` class. Implement one-switch mode: states `IDLE`, `PRESSING`, `AFTER_UP`, `HELP_FIRED`. On `down`: record `downAt`, transition to `PRESSING`. On `up` after `down`: compute duration, call `AdaptiveTiming.observe`, classify dot/dash, append to `symbolBuf`, record `lastUpAt`, reset `spaceSentThisSilence`, transition to `AFTER_UP`. On `tick`: flush if `silence >= letterGapMin`; additionally emit space if `silence >= wordGapMin` and `autoWordGap && !spaceSentThisSilence`; long-hold HELP if still `PRESSING` and `nowMs − downAt >= longHoldMs`. Flush-on-next-press in `feed` when `state === AFTER_UP` (the EE→I fix): check `silence >= letterGapMin` before processing the new `down`. Orphan `up` (no preceding `down`) returns `[]`. Flush algorithm: command-table first, then alphabet, then `unknown`. Word-gap space deduplication via `spaceSentThisSilence`. Expose `thresholds` property.
  - Create `src/core/morse/morse-decoder.test.ts` covering: single dot decodes to `'E'`; single dash decodes to `'T'`; dot-dash to `'A'`; flush-on-tick at letter gap; flush-on-tick at word gap emits space; flush-on-next-press (EE case); long-hold emits HELP; post-HELP `up` is ignored and no dot/dash appended; orphan `up` returns `[]`; word-gap space deduplication (two ticks across word-gap → one space); `autoWordGap: false` suppresses automatic space; command pattern `..--` decodes to `SPACE` command; unknown pattern `..` decodes to `unknown` token (since `..` = `I`, but verify a truly unknown buffer).
  - _Implements R4.1, R4.2, R4.3, R4.3a, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R4.10, R7.1, R7.3, R7.5_

- [x] 9. P1 — Morse round-trip property test
  - Add to `src/core/morse/morse-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 1: Morse round-trip
    ```
  - Generator: `fc.array(fc.constantFrom(...morseAlphabetChars, ' '), { minLength: 1 }).map(arr => arr.join(''))` where `morseAlphabetChars` is the 48 supported characters. Second generator: `fc.integer({ min: 40, max: 3000 })` for `unitMs`.
  - Encode with `morseEncode(text, unitMs, 'switch')`, decode with `decodeTimeline(new MorseDecoder({ initialUnitMs: unitMs }), events)`, compare decoded string to `text.toUpperCase()` with consecutive spaces collapsed and leading/trailing spaces stripped.
  - `fc.assert(fc.property(...), { numRuns: 100 })`. Fast-check prints seed and shrunk counterexample on failure automatically.
  - _Implements R11.1, validates R3, R4_

- [x] 10. P2 — Jitter tolerance property test
  - Add to `src/core/morse/morse-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 2: Jitter tolerance
    ```
  - Generators: same Morse-alphabet string and `unitMs` generators as P1. Jitter generator: `fc.double({ min: 0.75, max: 1.25, noNaN: true })` applied **independently** to each press duration (`down.t` to `up.t` span) and each inter-signal silence; round each result to the nearest whole millisecond before rebuilding the timeline. Apply jitter by scaling the `dt` values in the descriptor array before calling `buildTimeline`.
  - Reconstruct the event list from the jittered descriptors, then decode with `decodeTimeline`. Assert the decoded string matches the uppercased, space-normalised original.
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.2, validates R6_

- [x] 11. P4 — No phantom letters property test
  - Add to `src/core/morse/morse-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 4: No phantom letters before letter gap
    ```
  - Generators: `fc.integer({ min: 40, max: 3000 })` for `unitMs`; `fc.integer({ min: 1, max: 8 })` for the number of elements to press; `fc.array(fc.boolean(), { minLength: 1, maxLength: 8 })` to choose dot or dash for each element.
  - Build a synthetic down/up sequence for those elements (each element separated by `unitMs` intra-element gap), then call `tick(lastUpAt + letterGapMin - 1)` where `letterGapMin = decoder.thresholds.letterGapMin`. Assert the returned token array is empty — no `char` or `command` token for the pending symbol.
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.4, validates R4.7_

- [x] 12. Two-switch `MorseDecoder`
  - Extend `src/core/morse/morse-decoder.ts` to support `mode: 'two-switch'`. Constructor throws `RangeError("dotChannel and dashChannel must differ")` when `dotChannel === dashChannel`. On `pulse` (or `down`/`up` pair): map `channel === dotChannel` → `'.'`, `channel === dashChannel` → `'-'`; unrecognised channel is silently ignored. `AdaptiveTiming` is not updated in two-switch mode. After appending the element, record `lastUpAt = event.t` (a `pulse` acts as the end of an element for gap timing). The flush-on-next-press logic applies equally: when a `pulse` arrives in `AFTER_UP` check silence against thresholds and flush before appending. When a second `down` arrives on the other channel while one is active, ignore the new `down`.
  - Extend `src/core/morse/morse-decoder.test.ts` with: `dotChannel === dashChannel` throws; `pulse` on `dotChannel` appends `'.'`; `pulse` on `dashChannel` appends `'-'`; event on unrecognised channel returns `[]`; two-switch flush-on-pulse works correctly; two-switch word-gap space; simultaneous-press rule (second `down` ignored while first active).
  - _Implements R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7_

- [x] 13. P6 — HELP trigger correctness property test
  - Add to `src/core/morse/morse-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 6: HELP trigger correctness
    ```
  - Generator: `fc.integer({ min: 40, max: 3000 })` for `unitMs`.
  - **Continuous-SOS case**: build nine elements (`· · · − − − · · ·`) with intra-symbol `dt = unitMs` between all elements (inter-element gap = `unitMs`). Encode as a single `SignalEvent[]` without any letter-gap silence between elements. Decode with `decodeTimeline`. Assert exactly one `{ kind: 'command', name: 'HELP' }` token and no other tokens.
  - **Separate-SOS case** (deterministic, non-sampled, run once inside the same test): build `"SOS"` with `morseEncode("SOS", unitMs, 'switch')` using a fixed `unitMs` (e.g. 100). Decode. Assert three `char` tokens `'S'`, `'O'`, `'S'` and zero `HELP` tokens.
  - `fc.assert(fc.property(...), { numRuns: 100 })` for the continuous-SOS case.
  - _Implements R11.6, validates R7.6, R7.7_

- [x] 14. P9 — Tempo drift property test
  - Add to `src/core/morse/morse-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 9: Tempo drift correction
    ```
  - Generators: `fc.integer({ min: 40, max: 3000 })` for initial `u0`; `fc.array(fc.constantFrom(...morseAlphabetChars), { minLength: 10, maxLength: 20 }).map(arr => arr.join(''))` (no spaces, to avoid ambiguity) for the text string.
  - Build the timeline character-by-character, multiplying the current unit length by a drift factor drawn from `fc.double({ min: 0.95, max: 1.05, noNaN: true })` after each character. Clamp the drifted unit to `[0.5 × u0, 2 × u0]` at each step to satisfy the property constraint. Round all durations to whole milliseconds. Feed the full timeline through `decodeTimeline(new MorseDecoder({ initialUnitMs: u0 }), events)`.
  - Assert the decoded string matches `text.toUpperCase()`.
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.9, validates R6_

- [x] 15. Tap alphabet
  - Create `src/core/tapcode/tap-alphabet.ts` exporting `TAP_GRID` as a frozen two-dimensional structure `TAP_GRID[row][col]` where `row ∈ [1, 6]`, `col ∈ [1, 5]`. Rows 1–5 return a letter string; row 6 returns a `CommandName`. K is not a grid entry; callers normalise K→C. Also export `tapPattern(char: string): [number, number] | undefined` that returns the `[row, col]` pair for a supported character (case-insensitive, K→C), or `undefined` for unknown characters. No default export.
  - Create `src/core/tapcode/tap-alphabet.test.ts` covering: `TAP_GRID[1][3]` is `'C'`; `TAP_GRID[6][1]` is `'SPACE'`; `tapPattern('K')` returns `[1, 3]` (same as C); `tapPattern('k')` same as `tapPattern('K')`; `tapPattern('1')` returns `undefined`; total grid covers all 25 non-K letters plus 5 row-6 commands.
  - _Implements R8.1_

- [x] 16. Tap encoder
  - Create `src/core/tapcode/tap-encoder.ts` exporting `tapEncode(text: string): [number, number][]` and `tapEncodeTimeline(text: string, timingMs: { knockIntervalMs: number; groupPauseMs: number; letterPauseMs: number }): SignalEvent[]`.
  - `tapEncode`: case-insensitive, K→C, skip unsupported characters (digits, punctuation, whitespace), return `[row, col]` pairs.
  - `tapEncodeTimeline`: for each `[row, col]` pair emit `row` pulse events separated by `knockIntervalMs`, then a `groupPauseMs` gap, then `col` pulse events separated by `knockIntervalMs`, then a `letterPauseMs` gap. For a space character in the input emit no pulses but advance time by `2.5 × letterPauseMs` ms (this silent pause exceeds the double-letter-pause word-gap threshold and decodes as a `space` token). All events use `source: 'knock'` and `channel: 0`. First event `t = 0`.
  - Create `src/core/tapcode/tap-encoder.test.ts` covering: `tapEncode('A')` returns `[[1,1]]`; `tapEncode('K')` returns `[[1,3]]` (same as C); `tapEncode('k')` same as `tapEncode('K')`; `tapEncode('1')` returns `[]`; `tapEncode('')` returns `[]`; `tapEncodeTimeline` for `'A'` produces 2 pulses total (1 row + 1 col) with correct timing; space character produces no pulses but advances time by `2.5 × letterPauseMs`.
  - _Implements R8.2, R8.2a, R8.3, R8.9_

- [x] 17. `TapDecoder`
  - Create `src/core/tapcode/tap-decoder.ts` exporting `TapDecoder` class. States: `IDLE`, `IN_GROUP_1`, `BETWEEN_GROUPS`, `IN_GROUP_2`, `AFTER_CHAR`. Implements three EMA cluster means (`knockIntervalMean` default 200, `groupPauseMean` default 600, `letterPauseMean` default 1800), all clamped to [100, 5000] ms, α = 0.20. After each update enforce separations and recompute `interGroupThreshold = (knockIntervalMean + groupPauseMean) / 2`, `interLetterThreshold = (groupPauseMean + letterPauseMean) / 2`. On pulse: 8th-or-more pulse in current group → emit HELP, reset, enter post-HELP cooldown; otherwise classify by elapsed time and route to group 1 or group 2. On `tick`: flush pending character when `elapsed >= interLetterThreshold`; emit word-gap space when `elapsed >= 2 × interLetterThreshold` and `!spaceSentThisSilence`. Flush algorithm: `group1 ∈ [1,5] && group2 ∈ [1,5]` → `char`; `group1 === 6 && group2 ∈ [1,5]` → `command`; else `unknown`.
  - Create `src/core/tapcode/tap-decoder.test.ts` covering: `'A'` (1 row pulse, 1 col pulse) decodes to `char 'A'`; `'Z'` (5 row pulses, 5 col pulses) decodes correctly; `K` normalised to `C` at grid level (decoder emits `'C'` for `[1,3]`); row-6 col-1 decodes to `SPACE` command; row-6 col-5 decodes to `NEXT_SUGGESTION` command; 8-pulse burst emits HELP and post-HELP cooldown silences next pulses; row=7 emits `unknown`; col=0 (zero col pulses resolved) emits `unknown`; word-gap space deduplication (double-letter-pause → one space).
  - _Implements R8.4, R8.5, R8.5a, R8.6, R8.6a, R8.7, R8.7a, R8.8_

- [x] 18. P3 — Tap-code round-trip property test
  - Create `src/core/tapcode/tap-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 3: Tap-code round-trip
    ```
  - Generators:
    - Text: `fc.array(fc.constantFrom(...tapAlphabetChars, ' '), { minLength: 1 }).map(arr => arr.join(''))` where `tapAlphabetChars` = all 26 letters A–Z (including K).
    - Timing config: `fc.record({ knockIntervalMs: fc.integer({ min: 100, max: 300 }), groupPauseMs: fc.integer({ min: 400, max: 800 }), letterPauseMs: fc.integer({ min: 1000, max: 3000 }) })`.
  - Encode with `tapEncodeTimeline(text, timing)`, decode with `decodeTimeline(new TapDecoder(timing), events)`. Compare to `text.toUpperCase()` with every K replaced by C and spaces normalised (consecutive spaces collapsed, leading/trailing removed).
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.3, validates R8_

- [x] 19. P10 — Tap command decoding property test
  - Add to `src/core/tapcode/tap-decoder.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 10: Tap command decoding
    ```
  - Generators:
    - Timing config: same `fc.record` as P3 (ranges guarantee ordering constraint without filtering).
    - Row-6 column: `fc.integer({ min: 1, max: 5 })`.
    - HELP pulse count: `fc.integer({ min: 8, max: 15 })`.
  - **Row-6 command case**: for each `col ∈ {1,2,3,4,5}` build a timeline of 6 pulses (inter-group pause), then `col` pulses, with `knockIntervalMs` between each group and `groupPauseMs` between groups. Decode with a fresh `TapDecoder(timing)`. Assert exactly one command token with the expected `CommandName` for that column.
  - **HELP case**: build a timeline of `helpCount` pulses all within `knockIntervalMs` spacing. Decode. Assert exactly one `{ kind: 'command', name: 'HELP' }` token.
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.10, validates R8.5a, R8.6a_

- [x] 20. `YesNoDecoder`
  - Create `src/core/yesno/yesno-decoder.ts` exporting `YesNoDecoder` class. Constructor validates `settleMs ∈ [500, 10000]` (throw `RangeError("settleMs must be in [500, 10000]")`). State: `{ count, lastSignalT, settled }`. `feed`: ignore `'up'`; ignore mismatched `source`; on `'down'` or `'pulse'` matching source filter — increment `count`, set `lastSignalT = event.t`, clear `settled`. `tick`: if `lastSignalT === null || settled` return `null`; if `nowMs − lastSignalT >= settleMs` resolve: count=1→yes, count=2→no, else→null; set `settled=true`, reset `count=0`, `lastSignalT=null`.
  - Create `src/core/yesno/yesno-decoder.test.ts` covering: single `down` followed by settle → yes; two `down` events followed by settle → no; zero signals → null; three signals → null; source filter ignores non-matching source events; `settled=true` returns null until a new signal arrives; `settleMs` out-of-range throws.
  - _Implements R9.1, R9.2, R9.3, R9.4, R9.5, R9.6, R9.7_

- [x] 21. P7 — Yes/No single answer property test
  - Add to `src/core/yesno/yesno-decoder.test.ts`:
    ```typescript
    // Feature: signal-core, Property 7: Yes/No single answer per window
    ```
  - Generators:
    - `fc.integer({ min: 500, max: 5000 })` for `settleMs`.
    - `fc.integer({ min: 0, max: 10 })` for signal count.
    - `fc.integer({ min: 1, max: 499 })` for spacing between signals in ms (strictly less than `settleMs`).
  - Feed `count` down events spaced `spacing` ms apart starting at `t = 0`. Then call `tick(count * spacing + settleMs)` to close the window. Assert: exactly one non-null result from `tick`; that result is `yes` for count=1, `no` for count=2, `null` for count=0 or count≥3. Also call `tick` again (same `nowMs`) and assert it returns `null` (window is closed).
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.7, validates R9.5_

- [x] 22. `Composer`
  - Create `src/core/composer/composer.ts` exporting `Composer` class. `apply(token)` implements all 13 rows of the token decision table: `char` appends (guard buffer < 10000), `space`/`command SPACE` appends space if non-empty and not ending in space (emits `word-completed` with `word = lastWord`), `BACKSPACE` removes last char, `CLEAR` returns `clear-requested` without touching buffer, `SPEAK` returns `speak-requested`, `HELP` returns `help-requested`, `ACCEPT_SUGGESTION` returns `suggestion-accept`, `NEXT_SUGGESTION` returns `suggestion-next`, `unknown` returns `unknown-symbol`, `answer` returns `[]`. `confirmClear()` sets `buffer = ''`. `reset()` sets `buffer = ''`. Expose `readonly buffer`.
  - Create `src/core/composer/composer.test.ts` covering all 13 token kinds per the decision table: char append, char at capacity returns `[]`, space on empty returns `[]`, space when buffer ends with space returns `[]`, space on non-empty appends and returns `word-completed` with correct `word`, BACKSPACE on non-empty, BACKSPACE on empty returns `[]`, CLEAR returns `clear-requested` with current text (buffer unchanged), SPEAK returns `speak-requested`, HELP returns `help-requested`, ACCEPT_SUGGESTION, NEXT_SUGGESTION, unknown, answer returns `[]`, `confirmClear` empties buffer, `reset` empties buffer, buffer-full guard.
  - _Implements R10.1–R10.13_

- [ ] 23. P8 — Composer BACKSPACE/CLEAR property test
  - Create `src/core/composer/composer.property.test.ts`:
    ```typescript
    // Feature: signal-core, Property 8: Composer BACKSPACE/CLEAR round-trip
    ```
  - Generators:
    - Buffer string: `fc.string({ minLength: 0, maxLength: 9999 })` for the initial buffer (seed via `reset()` then apply chars individually, or set via a test-only constructor parameter).
    - Single character to append: `fc.char()` (any printable character to simulate a decoded letter).
  - **BACKSPACE round-trip**: record `bufferBefore`, call `apply({ kind: 'char', value: c })` (only if `bufferBefore.length < 10000`), then call `apply({ kind: 'command', name: 'BACKSPACE' })`. Assert `composer.buffer === bufferBefore`.
  - **confirmClear**: call `confirmClear()` on a Composer with any buffer. Assert `composer.buffer === ''`.
  - `fc.assert(fc.property(...), { numRuns: 100 })`.
  - _Implements R11.8, validates R10_

- [ ] 24. Final integration — `src/core/index.ts` exports, full test suite, lint
  - Create `src/core/index.ts` re-exporting every public symbol:
    - **Types**: `SignalSource`, `SignalEvent`, `TimelineDescriptor`, `CommandName`, `CharToken`, `SpaceToken`, `CommandToken`, `UnknownToken`, `AnswerToken`, `Token`, `ComposerEvent`, `Thresholds`, `MorseDecoderConfig`, `TapDecoderConfig`, `YesNoDecoderConfig`
    - **Encoder functions**: `morseEncode`, `tapEncode`, `tapEncodeTimeline`
    - **Decoder classes**: `MorseDecoder`, `TapDecoder`, `YesNoDecoder`
    - **Other classes and utilities**: `AdaptiveTiming`, `buildTimeline`, `decodeTimeline`
    - **Data**: `MORSE_ALPHABET`, `TAP_GRID` (if useful for consumers), `COMMAND_TABLE`
  - Run `npm test` and confirm all unit and property tests pass.
  - Run `npm run lint` and fix any ESLint warnings or errors (strict-mode type issues, `noUncheckedIndexedAccess` violations, missing TSDoc on public core functions per the `@/` alias convention).
  - Confirm `npm run build` succeeds (no TypeScript compile errors).
  - _Implements R1.5 (named exports only), all integration points_

## Notes

- Tasks 2 and 5 have a soft mutual dependency: Task 2's exhaustive P5 test references the 48 Morse alphabet patterns. Task 2 can stub the patterns inline; once Task 5 lands, update Task 2's test to import from `morse-alphabet.ts` directly.
- Property tests (Tasks 9, 10, 11, 13, 14, 18, 19, 21, 23) are **required correctness gates**, not optional. They must pass before the task is considered complete.
- `decodeTimeline` (Task 4) has no tests of its own; its correctness is established transitively by every property test that uses it.
- Keep each fast-check run count at 100 (`numRuns: 100`) to stay under the 2-second-per-test budget.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3", "4"] },
    { "id": 2, "tasks": ["5"] },
    { "id": 3, "tasks": ["6", "7", "15"] },
    { "id": 4, "tasks": ["8", "16"] },
    { "id": 5, "tasks": ["9", "10", "11", "12", "17"] },
    { "id": 6, "tasks": ["13", "14", "18", "19", "20"] },
    { "id": 7, "tasks": ["21", "22"] },
    { "id": 8, "tasks": ["23"] },
    { "id": 9, "tasks": ["24"] }
  ]
}
```

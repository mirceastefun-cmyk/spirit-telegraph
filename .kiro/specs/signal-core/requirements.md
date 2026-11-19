# Requirements Document

## Introduction

The `signal-core` module is the deterministic, framework-free heart of Spirit Telegraph. It lives entirely in `src/core/` and contains no DOM references, no React, no timers, and no calls to `Date.now()` or any source of randomness. All time is passed in as milliseconds by the caller.

The module covers six concerns: (1) a unified signal model and test-timeline helpers, (2) International Morse code encoding and decoding in both one-switch and two-switch modes with adaptive timing, (3) a command vocabulary that extends Morse with non-letter actions (SPACE, BACKSPACE, etc.) including the HELP alarm, (4) tap (knock) code encoding and decoding, (5) a Yes/No decoder, and (6) a text Composer that applies decoded tokens to a buffer.

Every subsystem exposes pure functions or deterministic state machines whose behavior can be fully exercised by property-based tests driven by synthetic timelines.

## Glossary

- **SignalEvent**: The common value emitted by every sensor. `{ type: 'down' | 'up' | 'pulse', t: number, source: 'switch' | 'blink' | 'knock' }`. `t` is an absolute timestamp in milliseconds supplied by the caller.
- **Source**: The physical origin of a SignalEvent: `'switch'` (key/button/touch), `'blink'` (webcam face landmark), or `'knock'` (microphone onset).
- **Unit**: The duration in milliseconds of a single Morse dot. All other Morse durations are integer multiples of the unit.
- **Symbol**: A sequence of dots and dashes that represents one character.
- **Prosign**: A Morse operating signal sent as one continuous symbol with no letter gap between elements. Example: SOS prosign is `...---...` without inter-letter gaps.
- **Token**: A value emitted by a decoder. Union of `{ kind: 'char', value: string }`, `{ kind: 'space' }`, `{ kind: 'command', name: CommandName }`, and `{ kind: 'unknown' }`.
- **CommandName**: One of `SPACE`, `BACKSPACE`, `SPEAK`, `CLEAR`, `ACCEPT_SUGGESTION`, `NEXT_SUGGESTION`, `HELP`.
- **MorseDecoder**: The one-switch or two-switch Morse state machine. Exposes `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`.
- **TapDecoder**: The tap (knock) code state machine. Exposes `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`.
- **YesNoDecoder**: The state machine that counts signals within a configurable window. Exposes `feed(event: SignalEvent): Token | null` and `tick(nowMs: number): Token | null`.
- **Composer**: The text buffer manager that applies tokens. Exposes `apply(token: Token): ComposerEvent[]`.
- **AdaptiveTiming**: The online timing estimator that updates dot/dash/gap thresholds from observed durations.
- **Timeline**: An ordered array of SignalEvents with monotonically increasing `t` values, used in tests to drive decoders without real time.
- **Warm-up**: The first N symbols decoded by AdaptiveTiming before its estimates are considered reliable. During warm-up the decoder uses the initial configured unit length.
- **Letter gap**: A silence of approximately 3 units between symbols within a word.
- **Word gap**: A silence of approximately 7 units between words.
- **TAP grid**: The 5×5 Polybius square used for tap code: row 1 = A B C/K D E, row 2 = F G H I J, row 3 = L M N O P, row 4 = Q R S T U, row 5 = V W X Y Z. K encodes as C (row 1, column 3).

## Requirements

### Requirement 1: Signal Model

**User Story:** As a decoder developer, I want a single typed value that every sensor produces, so that all decoding logic is sensor-agnostic and fully testable without real hardware.

#### Acceptance Criteria

1. THE Signal_Model SHALL define `SignalEvent` as a discriminated union with fields `type` (`'down' | 'up' | 'pulse'`), `t` (integer in the range 0 to 2^53−1 inclusive, in milliseconds), and `source` (`'switch' | 'blink' | 'knock'`).
2. THE Signal_Model SHALL provide a `buildTimeline` helper that accepts an array of `{ type, dt, source }` descriptors and a start time `t0` (integer ≥ 0, in milliseconds), and returns a `SignalEvent[]` with each event's `t` equal to `t0` plus the cumulative sum of preceding `dt` values.
3. WHEN `buildTimeline` is called with any descriptors and any `t0` ≥ 0, THE Signal_Model SHALL produce a timeline in which every event's `t` is greater than or equal to the previous event's `t` (monotonically non-decreasing).
4. IF `buildTimeline` is called with a descriptor whose `dt` is negative, THEN THE Signal_Model SHALL throw an error indicating that `dt` must be a non-negative integer.
5. THE Signal_Model SHALL export `SignalSource` and `SignalEvent` as named TypeScript types, and `buildTimeline` as a named function, with no default exports from this module.

---

### Requirement 2: Morse Alphabet

**User Story:** As a Morse encoder and decoder, I want a canonical lookup table for International Morse code, so that encoding and decoding share the same single source of truth.

#### Acceptance Criteria

1. THE Morse_Alphabet SHALL map each of the 26 Latin letters A–Z, digits 0–9, and the following 14 punctuation marks `. , ? ! / ' - ( ) : = + @` to a non-empty string consisting solely of `'.'` and `'-'` characters, yielding exactly 50 entries in total.
2. THE Morse_Alphabet SHALL treat letter lookup as case-insensitive: inputs `'A'` and `'a'` SHALL resolve to the identical dot-dash pattern string.
3. WHEN a caller looks up a character not among the 50 defined entries, THE Morse_Alphabet SHALL return `undefined` without throwing an exception and without altering any internal state.
4. THE Morse_Alphabet SHALL be a read-only structure such that any attempt to add, remove, or overwrite an entry at runtime produces no change to the stored patterns; the 50 entries present after module initialisation SHALL remain identical for the lifetime of the module.
5. WHEN the Morse_Alphabet is queried with a valid character, THE Morse_Alphabet SHALL return the pattern string in no more than O(1) time relative to alphabet size, verifiable by confirming the backing structure is a map or object lookup rather than a linear search.

---

### Requirement 3: Morse Encoder

**User Story:** As a test author and trainer module, I want to convert a text string into a SignalEvent timeline at a given unit length, so that decoders can be driven by realistic synthetic inputs.

#### Acceptance Criteria

1. WHEN `encode(text, unitMs, source)` is called with a supported text string and a `unitMs` value in [40, 3000], THE Morse_Encoder SHALL return a `SignalEvent[]` where each dot produces a `down`/`up` pair spanning exactly `unitMs` milliseconds, each dash produces a `down`/`up` pair spanning exactly `3 × unitMs` milliseconds, inter-element gaps (between signals within one character) are exactly `unitMs` milliseconds of silence, inter-letter gaps (between characters within one word) are exactly `3 × unitMs` milliseconds of silence, and inter-word gaps (between words) are exactly `7 × unitMs` milliseconds of silence.
2. WHEN `encode(text, unitMs, source)` is called with a `unitMs` value outside [40, 3000], THE Morse_Encoder SHALL throw an error indicating the value is out of the supported range and return no events.
3. WHEN `encode` is called with a text string containing only characters present in the Morse alphabet (after uppercasing), THE Morse_Encoder SHALL produce a `SignalEvent[]` in which the count of `down` events equals the total number of dots and dashes across all encoded characters, with each `down` event immediately followed by a corresponding `up` event before the next gap or signal begins.
4. WHEN `encode` is called with a character not present in the Morse alphabet (after uppercasing), THE Morse_Encoder SHALL skip that character, emit no events for it, and continue encoding the remaining characters without altering their timing relative to each other.
5. WHEN `encode` is called with an empty string, THE Morse_Encoder SHALL return an empty array.
6. THE Morse_Encoder SHALL accept a `source` parameter of type `SignalSource` and assign that value to the `source` field of every `SignalEvent` in the returned array.
7. WHEN `encode` is called with a valid text and `unitMs` value, THE Morse_Encoder SHALL assign monotonically increasing, non-overlapping timestamps to all events such that each event's `t` value equals the sum of the durations of all preceding signals and gaps, with the first event's `t` set to `0`.

---

### Requirement 4: One-Switch Morse Decoder

**User Story:** As a user operating with a single switch, I want the decoder to classify my press durations as dots or dashes and my silences as gaps, so that I can compose text with one input.

#### Acceptance Criteria

1. THE MorseDecoder in one-switch mode SHALL accept `SignalEvent` values where `source` is a single consistent value and classify each press as a dot when its duration is less than the current dash threshold, and as a dash when its duration is greater than or equal to the current dash threshold.
2. WHEN `feed(event)` is called with a `'down'` event, THE MorseDecoder SHALL record the press start time and discard any previously recorded unpaired `'down'` start time.
3. WHEN `feed(event)` is called with an `'up'` event following a `'down'` event, THE MorseDecoder SHALL compute press duration as `up.t − down.t` in milliseconds, classify the element as a dot or dash using the current dash threshold, append it to the current symbol buffer, and return an empty token array.
4. WHEN `tick(nowMs)` is called and the silence since the last `'up'` event is greater than or equal to the letter-gap threshold and less than the word-gap threshold, THE MorseDecoder SHALL look up the current symbol buffer in the Morse alphabet, emit a `char` token containing the matched character (or a `char` token with an `unknown` indicator if the sequence has no match), clear the symbol buffer, and return a token array containing exactly that one token.
5. WHEN `tick(nowMs)` is called and the silence since the last `'up'` event is greater than or equal to the word-gap threshold, THE MorseDecoder SHALL emit a `char` token for any pending symbol buffer (using the same lookup and `unknown` rule as criterion 4), then emit a `space` token, clear the symbol buffer, and return a token array containing those tokens in that order; if the symbol buffer is already empty, THE MorseDecoder SHALL emit only the `space` token.
6. WHILE a `'down'` event is active (a `'down'` has been received and no subsequent `'up'` has been received), THE MorseDecoder SHALL NOT emit any token from `feed()` or `tick()` unless the press duration exceeds the long-hold threshold (defined in the timing thresholds property), in which case `tick()` MAY emit a command token for that hold.
7. IF `tick(nowMs)` is called and the silence since the last `'up'` event is less than the letter-gap threshold, THE MorseDecoder SHALL return an empty token array without modifying the symbol buffer.
8. IF `feed(event)` is called with an `'up'` event and no prior `'down'` event has been recorded in the current session or since the last buffer clear, THE MorseDecoder SHALL ignore the event and return an empty token array.
9. THE MorseDecoder SHALL expose the current timing thresholds as a readable property containing four values in milliseconds: `dotMax` (maximum press duration classified as a dot, minimum 20 ms), `dashMin` (minimum press duration classified as a dash, equal to `dotMax + 1`), `letterGapMin` (minimum silence to flush a symbol, minimum 100 ms), and `wordGapMin` (minimum silence to emit a space, greater than `letterGapMin`).

---

### Requirement 5: Two-Switch Morse Decoder

**User Story:** As a user who can operate two distinct inputs (e.g., two switches or two blink patterns), I want one input to mean dot and the other to mean dash, so that I no longer need to control press duration.

#### Acceptance Criteria

1. WHEN `MorseDecoder` is configured in two-switch mode with a designated dot source and a designated dash source, THE MorseDecoder SHALL treat every `'pulse'` or `'down'`/`'up'` pair from the dot source as a dot element, and every `'pulse'` or `'down'`/`'up'` pair from the dash source as a dash element, regardless of the duration of the press.
2. WHEN in two-switch mode, THE MorseDecoder SHALL determine letter and word boundaries from inter-element silence only (gap timing), not from press duration.
3. WHEN in two-switch mode, THE MorseDecoder SHALL apply the same `tick(nowMs)` flush logic (letter gap → char token, word gap → space token) as one-switch mode, using the same configurable gap thresholds.
4. WHEN `MorseDecoder` is constructed, THE MorseDecoder SHALL accept a `mode` configuration of `'one-switch'` or `'two-switch'`, plus `dotSource` and `dashSource` fields that are only required when `mode` is `'two-switch'`.
5. IF `MorseDecoder` is constructed with `mode` set to `'two-switch'` and either `dotSource` or `dashSource` is absent or set to the same value as the other, THEN THE MorseDecoder SHALL throw a configuration error before accepting any signal events.
6. IF a `SignalEvent` is received in two-switch mode from a source that is neither `dotSource` nor `dashSource`, THEN THE MorseDecoder SHALL ignore that event and emit no token.
7. WHEN in two-switch mode and both a dot-source and a dash-source signal overlap in time (the second `'down'` arrives before the first `'up'`), THE MorseDecoder SHALL treat the first-received `'down'` event as the active element and ignore subsequent `'down'` events until the active element ends.

---

### Requirement 6: Adaptive Timing

**User Story:** As a user whose speed and rhythm change day to day, I want the decoder to learn my natural dot, dash and gap durations online, so that it remains accurate without manual recalibration.

#### Acceptance Criteria

1. THE AdaptiveTiming module SHALL maintain two running cluster estimates: one for dot durations and one for dash durations, updated using an exponential moving average with a smoothing factor configurable in the range [0.05, 0.5], defaulting to 0.15.
2. WHEN a new press duration is observed, THE AdaptiveTiming module SHALL assign it to the nearer cluster (dot or dash) based on absolute distance to each cluster mean and update that cluster's mean using the exponential moving average formula: `new_mean = α × duration + (1 − α) × old_mean`.
3. WHEN a new press duration is observed and the duration is more than 4 times the current dot cluster mean, THE AdaptiveTiming module SHALL discard it without updating either cluster.
4. THE AdaptiveTiming module SHALL derive the dot/dash decision threshold as the midpoint between the two cluster means: `(dot_mean + dash_mean) / 2`.
5. THE AdaptiveTiming module SHALL derive letter-gap and word-gap thresholds as `2.5 × dot_mean` and `5 × dot_mean` respectively, ensuring they scale with the user's tempo.
6. THE AdaptiveTiming module SHALL clamp the dot cluster mean to the range [40, 3000] ms after every update, before deriving any thresholds from it.
7. WHILE the number of accepted press observations is below the warm-up count (default: 6, configurable in the range [2, 20]), THE AdaptiveTiming module SHALL use the initial configured unit length for all thresholds.
8. THE AdaptiveTiming module SHALL expose the current estimated unit length, dot/dash decision threshold, letter-gap threshold, and word-gap threshold as readable properties, each expressed in milliseconds.
9. WHEN `reset()` is called, THE AdaptiveTiming module SHALL discard all observations, reset both cluster means to their initial configured values, and reset the observation count to zero.
10. IF the initial configured unit length is outside the range [40, 3000] ms, THEN THE AdaptiveTiming module SHALL reject the configuration with an error indicating the valid range.

---

### Requirement 7: Morse Commands

**User Story:** As a user communicating with Morse, I want dedicated command patterns for editing and control actions, so that I can backspace, speak, call for help, and navigate suggestions without leaving the Morse input mode.

#### Acceptance Criteria

1. THE Command_Table SHALL assign a unique Morse pattern to each command: SPACE (`/` — the standard Morse word separator), BACKSPACE (`........` — 8 dots), SPEAK (`.-.-.-` — the AR prosign), CLEAR (`.-.-..-.-.` — the AS prosign sent twice in immediate succession with no inter-letter gap between the two repetitions), ACCEPT_SUGGESTION (`.--.-.` — the AC pattern), NEXT_SUGGESTION (`.----` — the numeral-1 pattern, one dot followed by four dashes), and HELP (either the SOS prosign `...---...` sent as a continuous symbol per criterion 6, or a long hold per criterion 5).
2. THE Command_Table SHALL list all command patterns in a single reference table in `design.md`.
3. WHEN the MorseDecoder matches the symbol buffer against the Command_Table, THE MorseDecoder SHALL emit a `command` token with the matching `CommandName` instead of a `char` token.
4. THE Command_Table SHALL be constructed so that no command pattern matches any single-character Morse alphabet entry for A–Z and 0–9. This property SHALL be verified by a correctness property test (P5).
5. WHEN the MorseDecoder detects a long hold (a `'down'` event with no corresponding `'up'` after a duration of at least `max(3000, 3 × dash_threshold)` ms, where `dash_threshold` is the adaptive timing state value used by the decoder at the moment `tick(nowMs)` is called), THE MorseDecoder SHALL emit a `{ kind: 'command', name: 'HELP' }` token immediately without waiting for the `'up'` event.
6. WHEN the MorseDecoder receives the nine-element sequence `...---...` and each inter-element gap within that sequence is shorter than one dot duration (i.e., less than `dot_threshold` ms as held in the decoder's adaptive timing state at the time of receipt), THE MorseDecoder SHALL emit a `{ kind: 'command', name: 'HELP' }` token.
7. WHEN the letters S, O, S are sent as three separate symbols with inter-symbol gaps of at least one letter-gap duration (i.e., at least `letter_gap_threshold` ms as held in the decoder's adaptive timing state), THE MorseDecoder SHALL emit three `char` tokens (`'S'`, `'O'`, `'S'`) and SHALL NOT emit a HELP command. This property SHALL be verified by correctness property test P6.

---

### Requirement 8: Tap (Knock) Code

**User Story:** As a user who communicates by knocking on a surface, I want to encode and decode messages using the 5×5 tap code grid, so that I can spell out letters with groups of knocks.

#### Acceptance Criteria

1. THE TapCode_Alphabet SHALL implement the 5×5 Polybius square: row 1 = A B C D E, row 2 = F G H I J, row 3 = L M N O P, row 4 = Q R S T U, row 5 = V W X Y Z, with K mapping to C (row 1, column 3).
2. WHEN `tapEncode(text)` is called with a string of supported characters, THE Tap_Encoder SHALL return an array of `[row, col]` pairs (each 1-indexed, both values in [1, 5]) for each character, with K normalized to C, and an empty string input returning an empty array.
3. WHEN `tapEncode` is called with a character not in the tap alphabet (including digits, punctuation, and whitespace), THE Tap_Encoder SHALL skip that character and continue encoding the remaining characters without emitting a pair for the skipped character.
4. WHEN a `pulse` event from a `knock` source arrives and the elapsed time since the last pulse is less than the current inter-group threshold, THE TapDecoder SHALL increment the current group's knock count. WHEN the elapsed time since the last pulse is at least the inter-group threshold but less than the inter-letter threshold, THE TapDecoder SHALL record the completed group count and begin accumulating a new group.
5. WHEN the row and column counts are both in [1, 5], THE TapDecoder SHALL emit a `char` token for the corresponding letter (using the TAP grid, with position (1,3) emitting `'C'`).
6. IF a character boundary is reached and either the row count or the column count is outside [1, 5] or only one group was received before the inter-letter pause, THEN THE TapDecoder SHALL emit an `unknown` token and reset both group accumulators to zero.
7. THE TapDecoder SHALL expose `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`, where `tick` triggers resolution of any pending character whose inter-letter silence has elapsed, and both methods return an array of zero or more `Token` objects using the same interface contract as MorseDecoder.
8. THE TapDecoder SHALL maintain two separate adaptive thresholds: `interGroupPauseMs` (boundary between row and column groups) and `interLetterPauseMs` (boundary between characters), each updated as a 5-sample exponential moving average of observed pause durations, clamped to [100 ms, 5000 ms], with defaults of 500 ms and 1500 ms respectively, and `interLetterPauseMs` SHALL always be greater than `interGroupPauseMs`.
9. WHEN `tapEncode` is called with a mixed-case string, THE Tap_Encoder SHALL treat lowercase and uppercase letters identically, mapping both to the same `[row, col]` pair.

---

### Requirement 9: Yes/No Decoder

**User Story:** As a user who can answer questions with one or two signals, I want a dedicated decoder that interprets signal counts within a time window as YES or NO, so that caregivers can get quick answers without spelling.

#### Acceptance Criteria

1. THE YesNoDecoder SHALL accept a configurable `windowMs` parameter in the range 500–10000 ms (default: 2000 ms) and a configurable `source` parameter that filters signal events by their `source` field; when `source` is set, only events matching that source are counted.
2. WHEN the first signal event matching the configured `source` is received, THE YesNoDecoder SHALL open a counting window of exactly `windowMs` duration, counting that event and all subsequent matching signal events that arrive before the window closes.
3. WHEN `tick(nowMs)` is called and `nowMs` is greater than or equal to the window's start time plus `windowMs`, THE YesNoDecoder SHALL emit exactly one token: `{ kind: 'command', name: 'YES' }` if the count is exactly 1, `{ kind: 'command', name: 'NO' }` if the count is exactly 2, or `null` if the count is 0 or ≥ 3.
4. WHEN `tick(nowMs)` is called and the window has elapsed and a result has been emitted, THE YesNoDecoder SHALL reset its signal count to 0 and close the window so that the next matching signal event starts a new window.
5. THE YesNoDecoder SHALL emit at most one non-null answer per window. This property SHALL be verified by correctness property test P7.
6. IF `tick(nowMs)` is called before any signal event has been received, THEN THE YesNoDecoder SHALL return `null`.
7. IF `tick(nowMs)` is called after the current window has already been processed and before a new signal event is received, THEN THE YesNoDecoder SHALL return `null`.
8. IF a signal event is received whose `source` field does not match the configured `source`, THEN THE YesNoDecoder SHALL ignore that event without modifying the current count or window state.

---

### Requirement 10: Composer

**User Story:** As the application layer, I want a pure text buffer manager that accepts decoded tokens and produces structured events, so that the UI can update without containing any decoding logic.

#### Acceptance Criteria

1. THE Composer SHALL maintain a mutable text buffer (string, maximum length 10000 characters) and expose `apply(token: Token): ComposerEvent[]`.
2. WHEN `apply` receives a `{ kind: 'char', value }` token and the buffer length is less than 10000 characters, THE Composer SHALL append `value` to the buffer and return `[{ type: 'letter-added', char: value, buffer: <new buffer> }]`.
3. IF `apply` receives a `{ kind: 'char', value }` token and the buffer has reached 10000 characters, THEN THE Composer SHALL return an empty array without modifying the buffer.
4. WHEN `apply` receives a `{ kind: 'space' }` token and the buffer length is less than 10000 characters, THE Composer SHALL append a single space character to the buffer and return `[{ type: 'letter-added', char: ' ', buffer: <new buffer> }]`.
5. WHEN `apply` receives a `{ kind: 'command', name: 'BACKSPACE' }` token and the buffer is non-empty, THE Composer SHALL remove the last character from the buffer and return `[{ type: 'letter-removed', buffer: <new buffer> }]`.
6. IF `apply` receives a `{ kind: 'command', name: 'BACKSPACE' }` token and the buffer is empty, THEN THE Composer SHALL return an empty array without modifying the buffer.
7. WHEN `apply` receives a `{ kind: 'command', name: 'CLEAR' }` token, THE Composer SHALL set the buffer to an empty string and return `[{ type: 'buffer-cleared' }]`.
8. WHEN `apply` receives a `{ kind: 'command', name: 'SPEAK' }` token, THE Composer SHALL return `[{ type: 'speak-requested', text: <current buffer contents at time of call> }]` without modifying the buffer.
9. WHEN `apply` receives a `{ kind: 'command', name: 'HELP' }` token, THE Composer SHALL return `[{ type: 'help-requested' }]` without modifying the buffer.
10. WHEN `apply` receives a `{ kind: 'command', name: 'SPACE' }` token, THE Composer SHALL treat it identically to a `{ kind: 'space' }` token, applying the same buffer-length guard.
11. IF `apply` receives a token with an unrecognised `kind` or `name` value, THEN THE Composer SHALL return an empty array without modifying the buffer.
12. THE Composer SHALL expose a `readonly buffer: string` property that reflects the current buffer contents after every `apply` call.
13. THE Composer SHALL expose `reset(): void` that sets the buffer to an empty string without emitting or returning any events, for use in testing.

---

### Requirement 11: Correctness Properties (Property-Based Tests)

**User Story:** As a developer, I want every "for any input" rule expressed as a fast-check property test, so that edge cases are discovered automatically and the core logic is proven correct across the full input space.

#### Acceptance Criteria

1. **P1 — Morse round-trip**: THE system SHALL verify that for all non-empty strings composed solely of characters in the supported Morse alphabet (A–Z, 0–9, and the punctuation characters with assigned Morse codes) and for all `unitMs` values in [40, 3000], `morseDecoder.decode(morseEncoder.encode(text, unitMs))` equals the uppercased form of `text` with consecutive spaces collapsed to a single space and leading and trailing spaces removed. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

2. **P2 — Jitter tolerance**: THE system SHALL verify that for all non-empty strings composed solely of characters in the supported Morse alphabet and for all `unitMs` values in [40, 3000], when each individual signal duration is independently scaled by a factor drawn uniformly from [0.75, 1.25], the MorseDecoder produces a decoded output that, from the 7th decoded character onward, equals the corresponding characters of the uppercased input string. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

3. **P3 — Tap-code round-trip**: THE system SHALL verify that for all non-empty strings composed solely of characters in the tap-code alphabet, `tapDecoder.decode(tapEncoder.encode(text))` equals the uppercased form of `text` with every occurrence of K replaced by C. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

4. **P4 — No phantom letters**: THE system SHALL verify that for all `unitMs` values in [40, 3000] and for all sequences of `down`/`up` signal events where the final `up` event has not yet been followed by a silence interval of at least 3 × `unitMs` milliseconds (the letter-gap threshold), `MorseDecoder.tick(nowMs)` called with any `nowMs` value less than `lastUpTime + 3 × unitMs` SHALL NOT return any token of kind `char` or `command` for the in-progress symbol. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

5. **P5 — No command collision**: THE system SHALL exhaustively verify that no bit pattern in the Command_Table (the set of all signal patterns recognized as named commands) is identical to any Morse code pattern for the letters A–Z or the digits 0–9 as defined in the standard ITU Morse alphabet.

6. **P6 — HELP trigger correctness**: THE system SHALL verify that for all `unitMs` values in [40, 3000], the MorseDecoder emits exactly one HELP command token when fed the SOS prosign timeline, defined as the signal sequence `· · · − − − · · ·` encoded as a single unbroken run with no inter-letter gap (silence < 3 × `unitMs`) between the three-dot group and the three-dash group and between the three-dash group and the final three-dot group. THE system SHALL also verify that the MorseDecoder emits zero HELP command tokens when fed a timeline encoding "SOS" or "SOSIRE" as individually separated letter symbols, each separated by a silence of at least 3 × `unitMs`. The continuous-SOS case SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

7. **P7 — Yes/No single answer**: THE system SHALL verify that for all `windowMs` values in [500, 5000] and for all signal counts in [0, 10] within a single window, the YesNoDecoder emits at most one non-null token per window; that token SHALL be YES when count equals 1, NO when count equals 2, and null when count equals 0 or count is greater than or equal to 3. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

8. **P8 — Composer BACKSPACE/CLEAR**: THE system SHALL verify that for all non-empty buffer strings and for all single-character values appended via `apply({ kind: 'char', value })`, immediately calling `apply({ kind: 'command', name: 'BACKSPACE' })` returns the buffer to the exact string it held before the `apply({ kind: 'char', value })` call. THE system SHALL also verify that calling `apply({ kind: 'command', name: 'CLEAR' })` on any buffer of any length results in an empty string. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

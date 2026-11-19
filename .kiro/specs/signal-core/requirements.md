# Requirements Document

## Introduction

The `signal-core` module is the deterministic, framework-free heart of Spirit Telegraph. It lives entirely in `src/core/` and contains no DOM references, no React, no timers, and no calls to `Date.now()` or any source of randomness. All time is passed in as milliseconds by the caller.

The module covers six concerns: (1) a unified signal model and test-timeline helpers, (2) International Morse code encoding and decoding in both one-switch and two-switch modes with adaptive timing, (3) a command vocabulary that extends Morse with non-letter actions (SPACE, BACKSPACE, etc.) including the HELP alarm, (4) tap (knock) code encoding and decoding, (5) a Yes/No decoder, and (6) a text Composer that applies decoded tokens to a buffer.

Every subsystem exposes pure functions or deterministic state machines whose behavior can be fully exercised by property-based tests driven by synthetic timelines.

## Glossary

- **SignalEvent**: The common value emitted by every sensor. `{ type: 'down' | 'up' | 'pulse', t: number, source: 'switch' | 'blink' | 'knock', channel: 0 | 1 }`. `t` is an absolute timestamp in milliseconds supplied by the caller. `channel` defaults to `0` when not specified.
- **Channel**: An integer (`0` or `1`) carried on every `SignalEvent` that identifies which of two physical inputs produced it. Used in two-switch mode to distinguish dot and dash inputs that share the same `source`.
- **Source**: The physical origin of a SignalEvent: `'switch'` (key/button/touch), `'blink'` (webcam face landmark), or `'knock'` (microphone onset).
- **Unit**: The duration in milliseconds of a single Morse dot. All other Morse durations are integer multiples of the unit.
- **Symbol**: A sequence of dots and dashes that represents one character.
- **Prosign**: A Morse operating signal sent as one continuous symbol with no letter gap between elements. Example: SOS prosign is `...---...` without inter-letter gaps.
- **Token**: A value emitted by a decoder. Union of `{ kind: 'char', value: string }`, `{ kind: 'space' }`, `{ kind: 'command', name: CommandName }`, `{ kind: 'unknown' }`, and `{ kind: 'answer', value: 'yes' | 'no' }`.
- **CommandName**: One of `SPACE`, `BACKSPACE`, `SPEAK`, `CLEAR`, `ACCEPT_SUGGESTION`, `NEXT_SUGGESTION`, `HELP`. (`YES` and `NO` are no longer CommandNames; they are carried by `AnswerToken`.)
- **MorseDecoder**: The one-switch or two-switch Morse state machine. Exposes `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`.
- **TapDecoder**: The tap (knock) code state machine. Exposes `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`.
- **YesNoDecoder**: The state machine that counts `'down'`/`'pulse'` events within a settle window. Exposes `feed(event: SignalEvent): Token | null` and `tick(nowMs: number): Token | null`.
- **AnswerToken**: `{ kind: 'answer', value: 'yes' | 'no' }`. Emitted by YesNoDecoder.
- **Composer**: The text buffer manager that applies tokens. Exposes `apply(token: Token): ComposerEvent[]`.
- **AdaptiveTiming**: The online timing estimator that updates dot/dash/gap thresholds from observed durations.
- **Timeline**: An ordered array of SignalEvents with monotonically increasing `t` values, used in tests to drive decoders without real time.
- **Warm-up**: The first N symbols decoded by AdaptiveTiming before its estimates are considered reliable. During warm-up the decoder uses the initial configured unit length.
- **Letter gap**: A silence of approximately 2× dot mean (default multiplier) between symbols within a word.
- **Word gap**: A silence of approximately 5× dot mean (default multiplier) between words.
- **TAP grid**: The 6×5 extended Polybius square used for tap code. Rows 1–5 are the standard letters: row 1 = A B C/K D E, row 2 = F G H I J, row 3 = L M N O P, row 4 = Q R S T U, row 5 = V W X Y Z. K encodes as C (row 1, column 3). Row 6 is the command row: (6,1) = SPACE, (6,2) = BACKSPACE, (6,3) = SPEAK, (6,4) = ACCEPT_SUGGESTION, (6,5) = NEXT_SUGGESTION.

## Requirements

### Requirement 1: Signal Model

**User Story:** As a decoder developer, I want a single typed value that every sensor produces, so that all decoding logic is sensor-agnostic and fully testable without real hardware.

#### Acceptance Criteria

1. THE Signal_Model SHALL define `SignalEvent` as a type with fields `type` (`'down' | 'up' | 'pulse'`), `t` (integer in the range 0 to 2^53−1 inclusive, in milliseconds), `source` (`'switch' | 'blink' | 'knock'`), and `channel` (integer `0` or `1`, defaulting to `0` when not specified).
2. THE Signal_Model SHALL provide a `buildTimeline` helper that accepts an array of `{ type, dt, source, channel? }` descriptors (where `channel` is an optional integer `0` or `1`, defaulting to `0`) and a start time `t0` (integer ≥ 0, in milliseconds), and returns a `SignalEvent[]` with each event's `t` equal to `t0` plus the cumulative sum of preceding `dt` values.
3. WHEN `buildTimeline` is called with any descriptors and any `t0` ≥ 0, THE Signal_Model SHALL produce a timeline in which every event's `t` is greater than or equal to the previous event's `t` (monotonically non-decreasing).
4. IF `buildTimeline` is called with a descriptor whose `dt` is negative, THEN THE Signal_Model SHALL throw an error indicating that `dt` must be a non-negative integer.
5. THE Signal_Model SHALL export `SignalSource` and `SignalEvent` as named TypeScript types, and `buildTimeline` as a named function, with no default exports from this module.

---

### Requirement 2: Morse Alphabet

**User Story:** As a Morse encoder and decoder, I want a canonical lookup table for International Morse code, so that encoding and decoding share the same single source of truth.

#### Acceptance Criteria

1. THE Morse_Alphabet SHALL map each of the 26 Latin letters A–Z, digits 0–9, and the following 13 punctuation marks `. , ? ! / ' - ( ) : = @` to a non-empty string consisting solely of `'.'` and `'-'` characters, yielding exactly 48 entries in total.
2. THE Morse_Alphabet SHALL treat letter lookup as case-insensitive: inputs `'A'` and `'a'` SHALL resolve to the identical dot-dash pattern string.
3. WHEN a caller looks up a character not among the 48 defined entries, THE Morse_Alphabet SHALL return `undefined` without throwing an exception and without altering any internal state.
4. THE Morse_Alphabet SHALL be a read-only structure such that any attempt to add, remove, or overwrite an entry at runtime produces no change to the stored patterns; the 48 entries present after module initialisation SHALL remain identical for the lifetime of the module.
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
4. WHEN `tick(nowMs)` is called and the silence since the last `'up'` event is greater than or equal to `letterGapMin` and less than `wordGapMin`, THE MorseDecoder SHALL flush the current symbol buffer: if the buffer matches a pattern in the Command_Table the decoder SHALL emit a `command` token; otherwise if the buffer matches a pattern in the Morse alphabet the decoder SHALL emit a `char` token; otherwise the decoder SHALL emit an `{ kind: 'unknown' }` token. The decoder SHALL then clear the symbol buffer.
5. WHEN `tick(nowMs)` is called and the silence since the last `'up'` event is greater than or equal to `wordGapMin`, THE MorseDecoder SHALL: (a) if the symbol buffer is non-empty, flush it using the same command-table-first lookup as criterion 4 and emit the resulting token; (b) if `autoWordGap` is `true` (default) and no `space` token has already been emitted for this silence period, emit a `{ kind: 'space' }` token; then clear the symbol buffer and mark this silence period as having produced a space. Subsequent `tick` calls within the same silence period SHALL return an empty array.
6. WHILE a `'down'` event is active (a `'down'` has been received and no subsequent `'up'` has been received), THE MorseDecoder SHALL NOT emit any token from `feed()` or `tick()` unless the elapsed press duration reaches `timing.longHoldMs`, in which case `tick()` SHALL emit a `{ kind: 'command', name: 'HELP' }` token immediately.
7. IF `tick(nowMs)` is called and the silence since the last `'up'` event is less than the letter-gap threshold, THE MorseDecoder SHALL return an empty token array without modifying the symbol buffer.
8. IF `feed(event)` is called with an `'up'` event and no prior `'down'` event has been recorded in the current session or since the last buffer clear, THE MorseDecoder SHALL ignore the event and return an empty token array.
9. THE MorseDecoder SHALL expose the current timing thresholds as a readable property `thresholds` containing: `dotDashThreshold` (the geometric-mean boundary between dot and dash durations, in ms), `letterGapMin` (minimum silence to flush a symbol, in ms), and `wordGapMin` (minimum silence to emit a space, in ms). These values SHALL reflect the current AdaptiveTiming state at the time of access.
10. WHEN the MorseDecoder has emitted a HELP command token due to a long hold, THE MorseDecoder SHALL ignore the `'up'` event that ends that hold and SHALL NOT append a dot or dash element to the symbol buffer for it.

---

### Requirement 5: Two-Switch Morse Decoder

**User Story:** As a user who can operate two distinct inputs (e.g., two switches or two blink patterns), I want one input to mean dot and the other to mean dash, so that I no longer need to control press duration.

#### Acceptance Criteria

1. WHEN `MorseDecoder` is configured in two-switch mode with a designated `dotChannel` (default `0`) and `dashChannel` (default `1`), THE MorseDecoder SHALL treat every `'pulse'` or `'down'`/`'up'` pair whose `channel` field equals `dotChannel` as a dot element, and every `'pulse'` or `'down'`/`'up'` pair whose `channel` field equals `dashChannel` as a dash element, regardless of the event's `source` field.
2. WHEN in two-switch mode, THE MorseDecoder SHALL determine letter and word boundaries from inter-element silence only (gap timing), not from press duration.
3. WHEN in two-switch mode, THE MorseDecoder SHALL apply the same `tick(nowMs)` flush logic (letter gap → char token, word gap → space token) as one-switch mode, using the same configurable gap thresholds.
4. WHEN `MorseDecoder` is constructed, THE MorseDecoder SHALL accept a `mode` configuration of `'one-switch'` or `'two-switch'`, plus `dotChannel` (integer `0` or `1`, default `0`) and `dashChannel` (integer `0` or `1`, default `1`) fields that are only relevant when `mode` is `'two-switch'`.
5. IF `MorseDecoder` is constructed with `mode` set to `'two-switch'` and `dotChannel` equals `dashChannel`, THEN THE MorseDecoder SHALL throw a configuration error before accepting any signal events.
6. IF a `SignalEvent` is received in two-switch mode whose `channel` field is neither `dotChannel` nor `dashChannel`, THEN THE MorseDecoder SHALL ignore that event and emit no token.
7. WHEN in two-switch mode and a `'down'` event arrives on one channel while a press on the other channel is already active (no `'up'` has been received for the first press), THE MorseDecoder SHALL treat the first-received `'down'` event as the active element and ignore the new `'down'` event until the active press ends.

---

### Requirement 6: Adaptive Timing

**User Story:** As a user whose speed and rhythm change day to day, I want the decoder to learn my natural dot, dash and gap durations online, so that it remains accurate without manual recalibration.

#### Acceptance Criteria

1. THE AdaptiveTiming module SHALL maintain two running cluster estimates: one for dot durations and one for dash durations, updated using an exponential moving average with a smoothing factor configurable in the range [0.05, 0.5], defaulting to 0.15.
2. WHEN a new press duration is observed, THE AdaptiveTiming module SHALL assign it to the nearer cluster (dot or dash) based on absolute distance to each cluster mean and update that cluster's mean using the exponential moving average formula: `new_mean = α × duration + (1 − α) × old_mean`.
3. WHEN a new press duration is observed and the duration is greater than or equal to `max(3000, 3 × dash_mean)` ms (i.e., it has reached the long-hold threshold), THE AdaptiveTiming module SHALL discard it without updating either cluster, because such a press is interpreted as a HELP command rather than a Morse element.
3a. THE AdaptiveTiming module SHALL expose `longHoldMs` as a readable property defined as `max(3000, 3 × dash_mean)` ms, recalculated after every update to the dash cluster mean.
4. THE AdaptiveTiming module SHALL derive `dotDashThreshold` as the geometric mean of the two cluster means: `sqrt(dot_mean × dash_mean)`. This keeps a symmetric multiplicative margin on both sides of the threshold, so a press can jitter ±25% without crossing into the wrong cluster once the means are well-separated.
5. THE AdaptiveTiming module SHALL derive `letterGapMin` as `letterGapFactor × dot_mean` and `wordGapMin` as `wordGapFactor × dot_mean`, where `letterGapFactor` is configurable in the range [1.5, 6.0] (default `1.75`, the approximate geometric mean of 1 and 3) and `wordGapFactor` is configurable in the range [3.0, 12.0] (default `4.5`, the approximate geometric mean of 3 and 7), with the constraint that `wordGapFactor` is always strictly greater than `letterGapFactor`. These configurable multipliers allow slow or irregular users to adjust gap sensitivity.
6. THE AdaptiveTiming module SHALL clamp the dot cluster mean to the range [40, 3000] ms after every update, before deriving any thresholds from it.
7. WHILE the number of accepted press observations is below the warm-up count (default: 6, configurable in the range [2, 20]), THE AdaptiveTiming module SHALL use the initial configured unit length for all thresholds.
8. THE AdaptiveTiming module SHALL expose the current estimated unit length, `dotDashThreshold`, `letterGapMin`, and `wordGapMin` as readable properties, each expressed in milliseconds.
9. WHEN `reset()` is called, THE AdaptiveTiming module SHALL discard all observations, reset both cluster means to their initial configured values, and reset the observation count to zero.
10. IF the initial configured unit length is outside the range [40, 3000] ms, THEN THE AdaptiveTiming module SHALL reject the configuration with an error indicating the valid range.

---

### Requirement 7: Morse Commands

**User Story:** As a user communicating with Morse, I want dedicated command patterns for editing and control actions, so that I can backspace, speak, call for help, and navigate suggestions without leaving the Morse input mode.

#### Acceptance Criteria

1. THE Command_Table SHALL assign a unique dot-dash pattern to each named command as follows: `SPACE` = `..--` (two dots, two dashes), `BACKSPACE` = `----` (four dashes), `ACCEPT_SUGGESTION` = `.-.-` (alternating dot-dash-dot-dash), `NEXT_SUGGESTION` = `---.` (three dashes, one dot), `SPEAK` = `.-.-.` (AR prosign — dot-dash-dot-dash-dot), `CLEAR` = `........` (HH prosign — eight dots), `HELP` = `...---...` (SOS prosign — three dots, three dashes, three dots) or a long hold per criterion 5. The symbol buffer is compared against the Command_Table before the Morse alphabet; a buffer matching a command pattern SHALL emit a `command` token and SHALL NOT be looked up in the alphabet.
2. THE Command_Table SHALL list all command patterns in a single reference table in `design.md`.
3. WHEN the MorseDecoder matches the symbol buffer against the Command_Table, THE MorseDecoder SHALL emit a `command` token with the matching `CommandName` instead of a `char` token.
4. THE Command_Table SHALL be constructed so that no command pattern is identical to any entry in the Morse alphabet for letters A–Z, digits 0–9, or any of the 13 supported punctuation marks, and no two command patterns are identical to each other. This property SHALL be verified exhaustively by correctness property test P5.
5. WHEN the MorseDecoder detects a long hold (a `'down'` event with no corresponding `'up'` after a duration of at least `timing.longHoldMs` ms, as reported by the decoder's AdaptiveTiming instance at the moment `tick(nowMs)` is called), THE MorseDecoder SHALL emit a `{ kind: 'command', name: 'HELP' }` token immediately without waiting for the `'up'` event.
6. WHEN the MorseDecoder's symbol buffer contains exactly the nine-element sequence `...---...` and the buffer is flushed (letter-gap or word-gap silence elapses), THE MorseDecoder SHALL match it against the Command_Table and emit a `{ kind: 'command', name: 'HELP' }` token.
7. WHEN S, O, S are sent as three separate symbols each terminated by a letter-gap or word-gap silence, THE MorseDecoder SHALL flush each symbol individually: `...` → `char 'S'`, `---` → `char 'O'`, `...` → `char 'S'`. No HELP token SHALL be emitted. This property SHALL be verified by correctness property test P6.

---

### Requirement 8: Tap (Knock) Code

**User Story:** As a user who communicates by knocking on a surface, I want to encode and decode messages using the 5×5 tap code grid, so that I can spell out letters with groups of knocks.

#### Acceptance Criteria

1. THE TapCode_Grid SHALL implement a 6×5 extended Polybius square. Rows 1–5 are the standard letters: row 1 = A B C D E, row 2 = F G H I J, row 3 = L M N O P, row 4 = Q R S T U, row 5 = V W X Y Z, with K mapping to C (row 1, column 3). Row 6 is the command row: (6,1) = SPACE, (6,2) = BACKSPACE, (6,3) = SPEAK, (6,4) = ACCEPT_SUGGESTION, (6,5) = NEXT_SUGGESTION.
2. WHEN `tapEncode(text)` is called with a string of supported characters, THE Tap_Encoder SHALL return an array of `[row, col]` pairs where `row` is in [1, 6] and `col` is in [1, 5] for each character, with K normalized to C, and an empty string input returning an empty array.
2a. THE Tap_Encoder SHALL provide a `tapEncodeTimeline(text, timingMs)` function that accepts a text string and a timing configuration `{ knockIntervalMs, groupPauseMs, letterPauseMs }`, and returns a `SignalEvent[]` of `'pulse'` events on the `'knock'` source that encodes each character using the row and column counts from `tapEncode`, with `knockIntervalMs` silence between pulses within a group and `groupPauseMs` silence between the row group and the column group and `letterPauseMs` silence between characters.
3. WHEN `tapEncode` is called with a character not in the tap alphabet (including digits, punctuation, and whitespace), THE Tap_Encoder SHALL skip that character and continue encoding the remaining characters without emitting a pair for the skipped character.
4. WHEN a `pulse` event from a `knock` source arrives and the elapsed time since the last pulse is less than the current inter-group threshold, THE TapDecoder SHALL increment the current group's knock count. WHEN the elapsed time since the last pulse is at least the inter-group threshold but less than the inter-letter threshold, THE TapDecoder SHALL record the completed group count and begin accumulating a new group.
5. WHEN the row and column counts are both in [1, 5], THE TapDecoder SHALL emit a `char` token for the corresponding letter (using the TAP grid, with position (1,3) emitting `'C'`).
5a. WHEN the row count is exactly 6 and the column count is in [1, 5], THE TapDecoder SHALL emit a `command` token for the corresponding row-6 entry: column 1 → `SPACE`, column 2 → `BACKSPACE`, column 3 → `SPEAK`, column 4 → `ACCEPT_SUGGESTION`, column 5 → `NEXT_SUGGESTION`.
6. IF a character boundary is reached and either the row count is outside [1, 6] or the column count is outside [1, 5] or only one group was received before the inter-letter pause, THEN THE TapDecoder SHALL emit an `{ kind: 'unknown' }` token and reset both group accumulators to zero.
6a. WHEN a single group of 8 or more `pulse` events is received before any inter-group pause, THE TapDecoder SHALL discard any partial row count and emit a `{ kind: 'command', name: 'HELP' }` token, then reset.
7. THE TapDecoder SHALL expose `feed(event: SignalEvent): Token[]` and `tick(nowMs: number): Token[]`, where `tick` triggers resolution of any pending character whose inter-letter silence has elapsed, and both methods return an array of zero or more `Token` objects using the same interface contract as MorseDecoder.
7a. WHEN `tick(nowMs)` is called and the silence since the last `pulse` event is greater than or equal to twice the current `interLetterPauseMs` threshold, the buffer holds no pending character in progress, and no `space` token has already been emitted for this silence period, THE TapDecoder SHALL emit a `{ kind: 'space' }` token and mark this silence period as having produced a space. Subsequent `tick` calls within the same silence period SHALL return an empty array.
8. THE TapDecoder SHALL maintain three cluster means: `knockIntervalMean` (time between pulses within a group), `groupPauseMean` (pause between row and column groups within a character), and `letterPauseMean` (pause between characters). Each mean is updated using a 5-sample exponential moving average of observed intervals. The inter-group threshold is set to the midpoint between `knockIntervalMean` and `groupPauseMean`; the inter-letter threshold is set to the midpoint between `groupPauseMean` and `letterPauseMean`. All three means are clamped to [100, 5000] ms and the inter-group threshold SHALL always be strictly less than the inter-letter threshold. Default values: `knockIntervalMean` = 200 ms, `groupPauseMean` = 600 ms, `letterPauseMean` = 1800 ms.
9. WHEN `tapEncode` is called with a mixed-case string, THE Tap_Encoder SHALL treat lowercase and uppercase letters identically, mapping both to the same `[row, col]` pair.

---

### Requirement 9: Yes/No Decoder

**User Story:** As a user who can answer questions with one or two signals, I want a dedicated decoder that interprets signal counts followed by a settle period as YES or NO, so that caregivers can get quick answers without spelling and slow users are never cut off.

#### Acceptance Criteria

1. THE YesNoDecoder SHALL accept a configurable `settleMs` parameter in the range 500–10000 ms (default 1500 ms) and a configurable `source` parameter; when `source` is set, only events whose `source` field matches are counted.
2. WHEN the first matching `'down'` or `'pulse'` event is received and no window is open, THE YesNoDecoder SHALL open a counting window, counting that event as the first signal.
3. WHEN a subsequent matching `'down'` or `'pulse'` event is received while the window is open, THE YesNoDecoder SHALL increment the signal count. `'up'` events SHALL NOT increment the count.
4. WHEN `tick(nowMs)` is called and the time elapsed since the last matching signal event is greater than or equal to `settleMs`, THE YesNoDecoder SHALL resolve the window: return `{ kind: 'answer', value: 'yes' }` if the count is exactly 1, `{ kind: 'answer', value: 'no' }` if the count is exactly 2, or `null` if the count is 0 or ≥ 3; then reset the count and close the window.
5. THE YesNoDecoder SHALL emit at most one non-null answer per window. This property SHALL be verified by correctness property test P7.
6. IF `tick(nowMs)` is called before any signal event has been received or after the window has been resolved and before a new signal arrives, THEN THE YesNoDecoder SHALL return `null`.
7. IF a signal event is received whose `source` field does not match the configured `source`, THEN THE YesNoDecoder SHALL ignore that event without modifying the current count or window state.

---

### Requirement 10: Composer

**User Story:** As the application layer, I want a pure text buffer manager that accepts decoded tokens and produces structured events, so that the UI can update without containing any decoding logic.

#### Acceptance Criteria

1. THE Composer SHALL maintain a mutable text buffer (string, maximum length 10000 characters) and expose `apply(token: Token): ComposerEvent[]`.
2. WHEN `apply` receives a `{ kind: 'char', value }` token and the buffer length is less than 10000 characters, THE Composer SHALL append `value` to the buffer and return `[{ type: 'letter-added', char: value, buffer: <new buffer> }]`.
3. IF `apply` receives a `{ kind: 'char', value }` token and the buffer has reached 10000 characters, THEN THE Composer SHALL return an empty array without modifying the buffer.
4. WHEN `apply` receives a `{ kind: 'space' }` token or a `{ kind: 'command', name: 'SPACE' }` token and the buffer does not end with a space character and the buffer is non-empty, THE Composer SHALL append a single space character to the buffer and return `[{ type: 'word-completed', word: <the word just finished>, buffer: <new buffer> }]`.
4a. IF `apply` receives a `{ kind: 'space' }` token or a `{ kind: 'command', name: 'SPACE' }` token and the buffer is empty or already ends with a space character, THEN THE Composer SHALL return an empty array without modifying the buffer.
5. WHEN `apply` receives a `{ kind: 'command', name: 'BACKSPACE' }` token and the buffer is non-empty, THE Composer SHALL remove the last character from the buffer and return `[{ type: 'letter-removed', buffer: <new buffer> }]`.
6. IF `apply` receives a `{ kind: 'command', name: 'BACKSPACE' }` token and the buffer is empty, THEN THE Composer SHALL return an empty array without modifying the buffer.
7. WHEN `apply` receives a `{ kind: 'command', name: 'CLEAR' }` token, THE Composer SHALL return `[{ type: 'clear-requested', text: <current buffer contents> }]` without modifying the buffer. The buffer SHALL only be emptied when `confirmClear()` is subsequently called.
7a. THE Composer SHALL expose `confirmClear(): void` that sets the buffer to an empty string without emitting or returning any events.
8. WHEN `apply` receives a `{ kind: 'command', name: 'SPEAK' }` token, THE Composer SHALL return `[{ type: 'speak-requested', text: <current buffer contents at time of call> }]` without modifying the buffer.
9. WHEN `apply` receives a `{ kind: 'command', name: 'HELP' }` token, THE Composer SHALL return `[{ type: 'help-requested' }]` without modifying the buffer.
10. WHEN `apply` receives a `{ kind: 'command', name: 'ACCEPT_SUGGESTION' }` token, THE Composer SHALL return `[{ type: 'suggestion-accept' }]` without modifying the buffer.
10a. WHEN `apply` receives a `{ kind: 'command', name: 'NEXT_SUGGESTION' }` token, THE Composer SHALL return `[{ type: 'suggestion-next' }]` without modifying the buffer.
11. WHEN `apply` receives a `{ kind: 'unknown' }` token, THE Composer SHALL return `[{ type: 'unknown-symbol' }]` without modifying the buffer.
11a. IF `apply` receives a `{ kind: 'answer' }` token, THEN THE Composer SHALL return an empty array without modifying the buffer.
12. THE Composer SHALL expose a `readonly buffer: string` property that reflects the current buffer contents after every `apply` call.
13. THE Composer SHALL expose `reset(): void` that sets the buffer to an empty string without emitting or returning any events, for use in testing.

---

### Requirement 11: Correctness Properties (Property-Based Tests)

**User Story:** As a developer, I want every "for any input" rule expressed as a fast-check property test, so that edge cases are discovered automatically and the core logic is proven correct across the full input space.

#### Acceptance Criteria

1. **P1 — Morse round-trip**: THE system SHALL verify that for all non-empty strings composed solely of characters in the supported Morse alphabet (A–Z, 0–9, and the 13 supported punctuation characters) and for all `unitMs` values in [40, 3000], a `MorseDecoder` initialised with `initialUnitMs = unitMs` fed the output of `morseEncode(text, unitMs)` and ticked to completion produces a decoded string equal to the uppercased form of `text` with consecutive spaces collapsed to a single space and leading and trailing spaces removed. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

2. **P2 — Jitter tolerance**: THE system SHALL verify that for all non-empty strings composed solely of characters in the supported Morse alphabet and for all `unitMs` values in [40, 3000], when each individual signal duration is independently scaled by a factor drawn uniformly from [0.75, 1.25], a `MorseDecoder` initialised with `initialUnitMs = unitMs` produces a fully correct decoded string from the first character. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

3. **P3 — Tap-code round-trip**: THE system SHALL verify that for all non-empty strings composed solely of characters in the tap-code alphabet and for all valid timing configurations `{ knockIntervalMs, groupPauseMs, letterPauseMs }` within clamp bounds, a `TapDecoder` initialised with matching defaults fed the output of `tapEncodeTimeline(text, timing)` and ticked to completion produces a decoded string equal to the uppercased form of `text` with every K replaced by C. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

4. **P4 — No phantom letters**: THE system SHALL verify that for all `unitMs` values in [40, 3000] and for all sequences of `down`/`up` signal events where the final `up` event has not been followed by a silence of at least `decoder.thresholds.letterGapMin` milliseconds, `MorseDecoder.tick(nowMs)` called with any `nowMs` value less than `lastUpTime + decoder.thresholds.letterGapMin` SHALL NOT return any token of kind `char` or `command` for the in-progress symbol. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

5. **P5 — No command collision**: THE system SHALL exhaustively verify that no pattern in the Command_Table is identical to any entry in the Morse alphabet (A–Z, 0–9, or any of the 13 supported punctuation marks), and that all patterns within the Command_Table are mutually distinct.

6. **P6 — HELP trigger correctness**: THE system SHALL verify that for all `unitMs` values in [40, 3000], a `MorseDecoder` initialised with `initialUnitMs = unitMs` emits exactly one HELP command token when fed the SOS prosign defined as nine elements (`· · · − − − · · ·`) with inter-element silences of exactly `unitMs` ms (one unit, the standard intra-symbol gap). THE system SHALL also verify that the same decoder emits zero HELP tokens when fed "SOS" or "SOSIRE" encoded as separate letter symbols with inter-letter silences of exactly `3 × unitMs` ms. The continuous-SOS case SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

7. **P7 — Yes/No single answer**: THE system SHALL verify that for all `settleMs` values in [500, 5000] and for all signal counts in [0, 10] where each signal arrives at a spacing strictly less than `settleMs` ms from the previous one (so all signals fall within one window), the `YesNoDecoder` emits at most one non-null token per window after the last signal has been followed by `settleMs` of silence; that token SHALL be `{ kind: 'answer', value: 'yes' }` when count equals 1, `{ kind: 'answer', value: 'no' }` when count equals 2, and `null` when count equals 0 or count is ≥ 3. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

8. **P8 — Composer BACKSPACE/CLEAR**: THE system SHALL verify that for all non-empty buffer strings and for all single-character values appended via `apply({ kind: 'char', value })`, immediately calling `apply({ kind: 'command', name: 'BACKSPACE' })` returns the buffer to the exact string it held before the insert. THE system SHALL also verify that calling `confirmClear()` on a Composer with any buffer results in an empty string. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

9. **P9 — Tempo drift**: THE system SHALL verify that for all initial unit lengths `u0` in [40, 3000] and for all text strings in the Morse alphabet of at least 10 characters, when signal durations drift gradually such that the effective unit length changes by at most 5% per decoded character and stays within [0.5 × u0, 2 × u0] throughout the sequence, the `MorseDecoder` decodes every character correctly. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

10. **P10 — Tap commands**: THE system SHALL verify that for all valid timing configurations within clamp bounds, the `TapDecoder` correctly decodes each row-6 code (6,1) through (6,5) to its corresponding command token (SPACE, BACKSPACE, SPEAK, ACCEPT_SUGGESTION, NEXT_SUGGESTION respectively), and that a single group of 8 or more pulses decodes to a HELP command token. This SHALL be tested with at least 100 fast-check runs, and the random seed SHALL be printed to the test output on any failure.

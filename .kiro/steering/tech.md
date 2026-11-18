---
inclusion: always
---

# Tech stack and engineering rules

## Stack
- **Language:** TypeScript in strict mode (plus `noUncheckedIndexedAccess`), ES2022 target.
- **App:** React + Vite. Single-page, static build, no backend.
- **State:** React state plus a small store (Zustand) for settings and the composer. Pure logic lives outside React.
- **Styling:** plain CSS with CSS custom properties (design tokens in `src/ui/theme/tokens.css`). No CSS framework.
- **Testing:**
  - Vitest for unit tests.
  - **fast-check** for property-based tests of all pure logic in `src/core/**` (codecs, timing classifier, decoders, prediction, command parsing).
  - @testing-library/react for components.
  - Playwright for end-to-end smoke tests (keyboard-only flows) and axe accessibility checks.
- **Browser APIs:**
  - Switch: Pointer Events and Keyboard Events.
  - Blink: `@mediapipe/tasks-vision` FaceLandmarker with `outputFaceBlendshapes: true` (use the `eyeBlinkLeft` / `eyeBlinkRight` scores), running on-device. Self-host the `.task` model and the WASM files under `public/` so the app works offline.
  - Knock: Web Audio API (`getUserMedia` → `AudioWorklet` or `AnalyserNode`) with adaptive onset detection.
  - Speech: Web Speech API `speechSynthesis`; pick voices by BCP-47 language (`en-*`, `ro-RO`).
  - Sounds (telegraph sounder, bell): generated in code with Web Audio. No recorded or copyrighted audio.
- **PWA:** `vite-plugin-pwa` (precache the app shell, model, fonts and word lists).
- **Lint/format:** ESLint (typescript-eslint, eslint-plugin-jsx-a11y) and Prettier.
- **Deploy:** GitHub Pages via a GitHub Actions workflow on every push to `main`. Vite `base` must match the repository name (`/spirit-telegraph/`).
- **Dev environment:** Windows 11, Node.js LTS. npm scripts must work in PowerShell (no bash-only syntax such as `rm -rf` or `&&`-chained env vars).

## Architecture rules
1. **Pure core.** `src/core/**` contains only deterministic, side-effect-free TypeScript: no DOM, no React, no timers, no `Date.now()`, no randomness. Time is always passed in as milliseconds. This is what makes property-based testing possible.
2. **One signal pipeline.** Every sensor emits the same `SignalEvent` type: `{ type: 'down' | 'up' | 'pulse', t: number, source: 'switch' | 'blink' | 'knock' }`. Decoders consume signal events; sensors never know which code is in use.
3. **Decoders are state machines** with explicit `feed(event)` and `tick(nowMs)` methods that return tokens (`char`, `command`, `answer`), so tests can drive them with synthetic timelines.
4. **Adapters at the edges.** Browser APIs (camera, microphone, speech, storage) are wrapped in small adapters behind interfaces so they can be faked in tests.
5. **Accessibility is a feature, not a polish step.** See `accessibility.md`.
6. **No network calls at runtime** except loading the app's own static assets: no third-party analytics, CDN fonts or trackers.

## Dependencies
- Prefer the platform. Every new dependency needs a one-line reason in the spec's design document.
- Only permissive licenses for code (MIT, Apache-2.0, BSD, ISC). Data files may be CC BY-SA 4.0 if attributed in `data/README.md`. Fonts must be OFL or Apache-2.0 and self-hosted.

## Testing rules
- Every requirement that can be stated as "for any input..." becomes a **correctness property** with a fast-check test (for example: Morse round-trip at any tempo, tap-code round-trip, a decoder never emits a letter from an incomplete symbol).
- Keep each property test fast (under 2 seconds, 100–200 runs by default) and print the seed on failure.
- No test may depend on real time; use the decoder's injected clock.

## Commands (keep these working)
- `npm run dev`: local dev server
- `npm test`: unit and property tests (Vitest, run mode)
- `npm run test:e2e`: Playwright
- `npm run lint`: ESLint
- `npm run build`: production build

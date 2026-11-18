---
inclusion: always
---

# Project structure and conventions

```
spirit-telegraph/
├─ .kiro/                  # Kiro specs, steering, hooks, agents, MCP settings (never gitignored)
├─ .github/workflows/      # CI + GitHub Pages deploy
├─ public/
│  ├─ models/              # MediaPipe face_landmarker.task (self-hosted)
│  ├─ wasm/                # MediaPipe WASM runtime (self-hosted)
│  └─ fonts/               # self-hosted fonts + their licenses
├─ data/                   # word-frequency lists, phrase packs, data/README.md with sources and licenses
├─ scripts/                # build-time scripts (for example, word-list builder)
├─ src/
│  ├─ core/                # PURE logic, no DOM: fully unit- and property-tested
│  │  ├─ signal/           # SignalEvent types, timeline helpers
│  │  ├─ morse/            # alphabet, encoder, decoder, adaptive timing
│  │  ├─ tapcode/          # 5×5 knock/tap code encoder and decoder
│  │  ├─ yesno/            # 1 = yes, 2 = no decoder
│  │  ├─ commands/         # SPACE, BACKSPACE, SPEAK, CLEAR, HELP, suggestion commands
│  │  ├─ composer/         # text buffer and command application
│  │  └─ prediction/       # word completion, personal vocabulary, diacritics restore
│  ├─ sensors/             # switch.ts, blink.ts (MediaPipe), knock.ts (Web Audio) → SignalEvent
│  ├─ output/              # speech.ts (TTS), sounder.ts (telegraph clicks), alarm.ts
│  ├─ app/                 # screens, routing, stores, wiring
│  ├─ ui/                  # components and theme (tokens.css, themes)
│  └─ i18n/                # en.json, ro.json
├─ tests/
│  └─ e2e/                 # Playwright specs
├─ docs/                   # screenshots, architecture diagram, kiro-journal.md
├─ README.md
└─ LICENSE                 # MIT
```

## Conventions
- File names: `kebab-case.ts`; React components: `PascalCase.tsx`; one component per file.
- Tests live next to the code: `morse-decoder.ts` → `morse-decoder.test.ts` and `morse-decoder.property.test.ts`.
- Imports: relative inside a folder, the `@/` alias for `src/` across folders.
- Public functions in `src/core` get a TSDoc comment naming the requirement they satisfy (for example `/** Implements signal-core R2.3 */`).
- No default exports except React components.
- User-facing strings come from `src/i18n/*.json`; never hard-code UI text.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) and name the spec task, for example `feat(morse): adaptive timing (signal-core task 3)`.

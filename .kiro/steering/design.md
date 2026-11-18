---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**", "src/app/**", "**/*.tsx", "**/*.css"]
---

# Design language: "The Telegraph Parlor"

A Victorian telegraph office crossed with a séance parlor, lit by candlelight: warm, mysterious and calm. Spooky, never gory. Every ornament has a job.

## Themes
1. **Séance (default, dark):** background `#120d0b` (ink-black mahogany), panels `#1e1512`, brass accents `#c9a227`, candle glow `#ffb347`, ectoplasm green for YES/success `#7fffb2`, blood orange for NO/alerts `#ff6b3d`, parchment text `#f3e9d2`.
2. **Daylight (high contrast, light):** for wards and bright rooms. Background `#fffdf7`, text `#111111`, accent `#7a4b00`. Same layout, no textures.

Both themes are built from tokens in `src/ui/theme/tokens.css`; components never hard-code colors. Check every text/background pair for contrast before using it.

## Typography
- Message display and telegrams: a typewriter face such as "Special Elite" (Apache-2.0) or "Courier Prime" (OFL), at least 48 px, scaling up to fill the caregiver view.
- UI text: "Atkinson Hyperlegible" (OFL), designed for low-vision readers, at least 18 px.
- Self-host fonts (no CDN) and ship their license files.

## Signature elements (spooky and functional)
- **Ticker tape:** a paper strip that scrolls as the user signals, printing dots and dashes (or knock counts). It is the primary input feedback.
- **Candle:** flares on every detected signal; a steady flame means "listening"; a guttering flame means "calibration needed". Respect reduced motion; no fast flicker.
- **Telegram card:** a completed message appears as a telegram ("SPIRIT TELEGRAPH — MESSAGE RECEIVED") in huge type, then is spoken.
- **Yes/No:** a giant YES (ectoplasm green with ✓) or NO (blood orange with ✕), with distinct shapes and sounds.
- **Spirit bell (Help):** a full-screen pulsing border (at most 2 pulses per second), a bell sound and large "HELP NEEDED" text. Dismissing it requires a deliberate action.
- **Morse tree and tap-code grid:** ornamental but readable cheat sheets.
- Textures (paper grain, brass bevels) are CSS gradients only; no heavy images.

## Sound design
- Telegraph sounder click-clack for dots and dashes, a soft knock echo, and a bell for Help, all generated with Web Audio. Every sound is optional and volume-controlled.

## Layout
- Three zones on the main screen: **input feedback** (tape and candle), **message** (huge), **suggestions/phrases** (a scannable list).
- Tablet first for bedside use (landscape tablet is the primary demo device); phone and desktop reuse the same zones.
- Generous spacing; never more than 5–7 choices visible at once.

## Microcopy tone
- Short, warm, plain English and Romanian. Spooky flavor belongs in headings and idle states ("The spirits are listening…"); errors stay plain ("Camera not available. Use a switch or knock instead.").

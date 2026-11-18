---
inclusion: always
---

# Accessibility rules (AAC-grade)

Spirit Telegraph is assistive technology. Treat these rules as acceptance criteria for every UI change.

## Baseline
- Meet **WCAG 2.2 AA** everywhere; aim for AAA contrast (at least 7:1) on the message display and the Yes/No answers.
- Fully operable by keyboard alone and by a **single switch** (Space/Enter). No hover-only or drag-only interactions.
- A visible focus indicator (at least 3 px, high contrast) on every focusable element, in a logical order.
- Touch/click targets of at least 48×48 px; primary actions at least 96 px tall.
- Every control has an accessible name. Live regions (`aria-live="polite"`) announce decoded letters and words; the Help alarm uses `aria-live="assertive"`.
- Respect `prefers-reduced-motion` (no flicker or scrolling animations), `prefers-contrast`, and the in-app "High contrast" and "Large text" settings.
- **Photosensitive safety:** nothing flashes more than 3 times per second (WCAG 2.3.1). This includes the Help alarm and candle effects.
- Never convey meaning by color alone; pair color with text, an icon or a shape.
- Text resizes to 200% without loss of content; the message display can fill the whole screen ("caregiver view").

## AAC-specific rules
- **No time pressure:** no action may fail because the user was slow. Time-outs are user-configurable and generous by default.
- **Calibrate, don't assume:** timing thresholds (dot/dash, letter gap, word gap) adapt to the user and can be tuned in Settings.
- **Every mode works with one switch;** two-switch mode is an alternative, not a requirement.
- **Cheap undo:** BACKSPACE is always available; CLEAR asks for confirmation; nothing is lost on an accidental reload (persist the draft in localStorage).
- **Feedback for every signal:** visual (ticker tape, candle), optional sound (sounder click) and optional vibration (`navigator.vibrate`). Each can be turned off.
- **Fatigue-aware:** favor prediction and phrases over long spelling; surface the most likely next actions.
- **Dignity:** copy is plain, adult and respectful. Never joke about anyone's condition; the spooky flavor lives in visuals and ambience, not in mocking language.

## Speech
- Speak completed messages and Yes/No answers. Users choose voice, rate, pitch and language.
- If no voice exists for the selected language, fall back gracefully and say so on screen for the caregiver.

## Testing
- Enable `jsx-a11y` lint rules. Run axe on every screen in the Playwright tests.
- Manual checklist for each feature: keyboard only, single switch, screen reader smoke test (NVDA on Windows), 200% zoom, reduced motion.

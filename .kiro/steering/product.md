---
inclusion: always
---

# Product: Spirit Telegraph

> "Knock twice if you can hear me."

## One-liner
Spirit Telegraph is a free, open-source, browser-based communication aid that turns **one reliable movement** (a knock, a blink, or a press of a single switch) into text and speech. It resurrects two 19th-century "dead" technologies, **Morse code** and the **knock (tap) code**, for people who cannot speak or type.

## The problem
- Many people lose the ability to speak or type but keep one controllable movement: people living with ALS/MND, brainstem stroke or locked-in syndrome, cerebral palsy or advanced MS, and patients who temporarily cannot speak (for example, intubated in intensive care).
- Dedicated AAC (augmentative and alternative communication) devices are expensive and slow to obtain. Families and hospital staff often fall back on alphabet boards and guessing games.
- A laptop, tablet or phone with a browser is already in almost every home and ward. Morse code needs only one or two inputs, can be learned in an afternoon, and has been used as an assistive method with switches for decades.

## The Kiroween story (theme, used respectfully)
- In 1848 the Fox sisters of Hydesville, New York, started the Spiritualist craze by claiming that spirits answered their questions with knocks. Spiritualists soon spoke of a "spiritual telegraph", a nod to Morse's electric telegraph, then only four years old.
- Our twist: **the Victorians wanted the dead to talk through knocks; we built it for the living.**
- The spooky aesthetic (telegraph office, séance parlor, candlelight, ticker tape) must always serve a function and must never mock or trivialize disability. Copy speaks *with* users, not *about* them.

## Users
1. **Primary: the speaker.** A person who can make at least one deliberate movement (press, tap, blink, knock). They may be tired or slow, have a tremor, limited endurance, or abilities that change from day to day.
2. **Secondary: the listener/caregiver.** A family member, nurse or speech-language therapist. They set things up, read the large transcript, ask Yes/No questions and respond to the Help alarm.
3. **Tertiary: learners and tinkerers.** Anyone learning Morse or tap code with the built-in trainer.

## Core jobs (MVP, in priority order)
1. **Yes / No:** answer a question with 1 signal (YES) or 2 signals (NO). The app shows and speaks the answer.
2. **Call for help:** a dedicated pattern that is hard to trigger by accident (Morse SOS or a long hold) raises an audible and visual alarm.
3. **Spell a message:** Morse (one switch using press duration, or two switches for dot and dash) or tap code. Word prediction reduces effort. The message is shown in huge type and spoken aloud.
4. **Quick phrases:** a caregiver-editable phrase board ("I'm in pain", "Water, please", "Thank you", "I love you"...) reachable with very few signals (scanning or short codes).
5. **Practice:** learn the code with sound and visual feedback.

## Input channels (all produce the same abstract signal events)
- **Switch:** any key (Space/Enter, which most assistive switches emulate), a mouse click, or a touch.
- **Blink:** webcam plus an on-device face landmark model. Long, deliberate blinks are signals; natural blinks are ignored.
- **Knock:** microphone onset detection. Knock counts drive tap code and Yes/No.

## Product principles (non-negotiable)
1. **One movement is enough.** Every feature must be operable with a single switch. Never require precise timing without a calibration step or a two-switch alternative.
2. **No time pressure.** The user sets the pace; timing adapts to the user, not the other way round.
3. **Private by design.** Camera and microphone are processed locally in the browser. No accounts, no servers, no analytics; no data leaves the device.
4. **Free and offline.** A static web app, installable as a PWA, that works without internet after the first visit.
5. **Errors are cheap.** Undo is always one command away. Nothing is spoken without the user's intent, except the Help alarm, which errs on the side of safety.
6. **Readable from across the room.** Output text is huge and high-contrast for the caregiver.
7. **Bilingual from day one:** English and Romanian (UI, prediction, speech). Morse has no codes for ă, â, î, ș, ț, so prediction restores Romanian diacritics.

## Out of scope (for the hackathon)
- Medical claims, diagnosis or clinical certification. This is an assistive communication tool, not a medical device.
- User accounts, cloud sync, remote caregiver apps.
- Eye-gaze cursor control and full on-screen keyboards.

## Success criteria for the demo
- A person can answer Yes/No by knocking on a table within 1 minute of opening the app.
- A first-time user can spell "WATER" with one switch in under 2 minutes, using the trainer and prediction.
- The Help alarm triggers reliably with the SOS pattern and never from normal spelling.
- Lighthouse accessibility score of at least 95, and the app works offline.

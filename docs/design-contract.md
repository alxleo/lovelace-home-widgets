# Design contract

This is the current reusable contract. Replace a rule when measured real-device
evidence proves a better one; do not append conversational history.

## Mobile grammar

- Design and accept at 390 x 844 first. Current state and its next useful action
  should not be displaced by decorative headings or large empty cards.
- Prefer one dense explanatory surface to repeated metric strips. Interactive
  controls remain at least 40 px high and use text as well as colour.
- Use Home Assistant theme variables and readable focus/disabled/error states.
  Reduced-motion users must not depend on animation for meaning.

## History

- Time is the long vertical axis; temperature is the shorter horizontal axis.
- Day and Week are zoom scales. Scrolling upward requests older recorder pages,
  preserves the scroll anchor, caches prior pages, and never implies that seven
  days is the retention limit.
- Actual, target, and heating-request signals share one time coordinate.
  Weather occupies an aligned secondary lane so its wider range cannot flatten
  indoor changes.
- Labels sit beside their latest valid values. Pointer/touch inspection gives
  exact values at one time. Do not reserve permanent space for a legend.
- Missing data remains missing. Label precipitation as an estimate unless the
  supplied entity is a physical observation.
- “Heating requested” describes a thermostat request; it does not assert that a
  boiler or receiver fired.

## Timed away

- Present one temporary Away intent, not competing Away and Off modes.
- Offer 1h, 4h, and 8h30 shortcuts plus a non-linear, approximate 30m–48h
  scrubber. Show both duration and end time before one Apply.
- Active state shows the end time and one Cancel. Action failure leaves the
  picker open and says that heating was not changed.
- The card calls configured Home Assistant actions and displays configured
  state only. Backend automation owns authorization, safety setpoints, receiver
  readback, expiry, restart recovery, rollback, and schedule restoration.

## Visual acceptance

- The deterministic preview covers dark day history, light week history, the
  complete duration picker, active/cancel, and action failure at 390 x 844.
- Screenshots are CI/release artifacts with SHA-256 metadata, never Git blobs.
- A preview proves layout and the frontend contract. Production acceptance still
  requires the real signed-in route, real entity state, and physical readback
  for mutating controls.

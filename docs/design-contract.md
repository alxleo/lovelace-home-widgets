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
- Target temperatures are held values: draw vertical held segments and
  horizontal transitions, never diagonal interpolation. Heating-request draws
  held on intervals and its direct label reports the latest held state in the
  visible viewport, including an off transition. Unknown or unavailable
  samples terminate held geometry; do not bridge a gap or extend a stale final
  value through it.
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
- A configured backend mode entity, optionally through one attribute, is the
  authority for Schedule, Applying away, Away, Restoring, and Fault. For this
  contract, an idle timer never proves Schedule. Contradictory, missing, or
  unknown Schedule/Away mode-and-timer combinations render as mismatch instead
  of optimistic success.
- The v0.1.0 `active_entity` field remains a compatibility input when no mode
  entity is configured; active/idle map to Away/Schedule, while every uncertain
  value maps to mismatch. A configured mode entity always takes precedence.
- Away requires an active timer and a valid timer-owned end time, then shows
  that end time and one Cancel. Fault and mismatch offer the same configured
  resume/cancel action. An in-flight action is separate progress UI and never
  replaces the last authoritative backend mode. Apply failure leaves the
  picker open; failed resume keeps Fault or mismatch visible and says that
  heating was not changed.
- The card calls configured Home Assistant actions and displays configured
  state only. Backend automation owns authorization, safety setpoints, receiver
  readback, expiry, restart recovery, rollback, and schedule restoration.

## Visual acceptance

- The deterministic preview covers dark day history, light week history, the
  complete duration picker, active/cancel, backend fault/recovery, and action
  failure at 390 x 844.
- Screenshots are CI/release artifacts with SHA-256 metadata, never Git blobs.
- A preview proves layout and the frontend contract. Production acceptance still
  requires the real signed-in route, real entity state, and physical readback
  for mutating controls.

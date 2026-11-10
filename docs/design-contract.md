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

```text
Heating                         [Day | Week]
←                 Last 24 hours            →
Actual ━    Target ┄    Heat requested ▧
┌ Room A                         Set ──────┐
│ Now 21.4°C                  − 21.0°C +  │
│ actual + held target + heat bands       │
│  14:00          02:00          14:00     │
├ Room B                         Set ──────┤
│ Now 20.8°C                  − 21.0°C +  │
│ actual + held target + heat bands       │
└ Outside    13.2°C now · latest estimate ▾┘
```

| Household question | Presentation and behavior |
| --- | --- |
| What is each room doing now? | Room-local **Now** and **Set**; both rooms stay visible. Off/unavailable remain explicit. Room heading opens native details for rare settings. |
| How did it warm up? | Time runs left to right. Each room has its own actual/held-target chart on the same indoor temperature scale. Full-height background bands mark heating requests. One shared key. |
| What happened earlier? | Day means the last 24 hours, Week the last 7 days. Earlier/Later changes one explicit window. Older successful pages are cached; every request remains bounded. Seven days is a fetch bound, never a retention limit. |
| What about outside? | Inline weather disclosure keeps its own labelled temperature scale. Rain is a separate mm estimate series; the collapsed reading is the latest estimate, never a sum of forecast snapshots. |
| What was the exact reading? | Pointer/touch or keyboard arrows inspect a shared timestamp. Reserved readout rows avoid reflow and obscure no traces. Escape clears inspection. |

- Actual samples draw linear segments; target values draw held horizontal steps.
  Unknown/unavailable terminates every trace and heating band. No path bridges
  a known gap or extends a stale final reading through it.
- `temperature_controls` defaults to false. Opting in adds native target-temperature
  actions only for one unambiguous climate target series per room. Grouping can
  use `room`; ambiguous target climates fail closed. Native capability, minimum,
  maximum and step are required. Controls clamp to those bounds.
- The displayed target always comes from Home Assistant. A service response does
  not prove a device accepted it: controls wait for state readback, show progress,
  and time out visibly. Refusal and unavailability retain the reported target.
  Adjusting a setpoint never implies that heating is on. When a climate reports
  Off, Set says **Off** and its controls disable; off-state target sentinels are
  gaps in target history and never distort the indoor scale. Actual readings
  remain visible.
- Room controls do not replace backend policy or authorization. “Heat requested”
  describes thermostat demand, never an assertion that a boiler fired.
- Narrow cards stack room journals; wider cards place them side by side. There
  is no inner scrolling history viewport or resize-triggered history paging.
- While visible, the latest window refreshes through the same recorder owner
  every 30 seconds and five seconds after reported source changes. A two-minute
  overlap accommodates recorder commit delay. Historical windows stay fixed;
  Later returns to the current latest window. Retry repeats the failed page or
  live-tail operation. Disconnect/config changes dispose requests and timers.
- Dates, time format and timezone follow the Home Assistant user’s locale
  preferences, including server versus local time. Round civil-clock ticks
  remain aligned through daylight-saving changes.

## Light rows

```text
[capability/power] [Living ·72%████░░] [Scene ▾] [Adjust] [lights ▾]
  [capability/power] [Ceiling ·68%██░] [Adjust ▴]
                       [White | Colour]
                       White tone               3000K
                       warm ━━━━━●━━━━━━━━━━━━ cool
```

| Intent | Contract |
| --- | --- |
| Find and dim a light | Name and reported percentage share one native range bar; power has its own44px recognisable power button with a small registry/capability indicator. No extra ornamental icon or repeated heading. A theme-aware handle sits behind the label, so0%/low values cannot cover the name. The percentage stays visible when a long name truncates. |
| Tune white or colour | One labelled **Adjust** disclosure. Identity stays visible. White/Colour changes editor mode without a device command. White tone uses native Kelvin bounds, warm on the left. Colour and Colour strength are labelled keyboard/touch ranges. |
| Control a room | Explicit `group: true` enables a native room `scene_entity` and optional `cards`. HA's native card helpers render member cards. One member is represented by the primary row; multiple members get one separately labelled disclosure. Auto Entities can populate `cards`, retaining dynamic membership ownership. |
| Know whether it worked | Draft percentage says preview inside the same bar. Pending shows reported values with an ellipsis and an aria-live explanation. Neither creates a new status row or changes ordinary card height. A service response is not confirmation: relevant light attributes must change and match the request. Failure expands a useful inline error. |

- Fixed-white dimmers get brightness; on/off plugs get power; white/colour
  controls appear only for supported colour modes. Registry icons take
  precedence over capability defaults. `name_prefix` removes redundant room
  prefixes from native friendly names without changing any entity identifier.
- Unknown readings are labelled **Not reported**. No invented current Kelvin,
  hue or strength is shown. Choosing a colour with unknown/zero strength
  requests100% strength so the chosen colour is visible; otherwise strength is
  retained. Strength remains disabled until a colour is reported.
- Scenes exist on explicit room rows only. Native selector state owns the
  displayed active scene; requesting a scene never fabricates an active option.
- Commands use `brightness_pct`, `color_temp_kelvin` and `hs_color`. Release
  commits a slider command; dragging does not flood the device. Readback
  tolerances accommodate device quantisation without accepting an unchanged
  baseline. New requests have identities; late promises cannot clear newer ones.
- Closing/removing/reconfiguring a room disposes child cards. Asynchronous card
  helper results are generation-guarded. Children receive current HA state and
  their own native lifecycle owns subscriptions. No generic rendering framework,
  global interaction blocker, helper entity or new dashboard resource is added.
- Rare device details use the native power-button context menu. There is no
  repeated visible details button or nested modal in ordinary control paths.

## Timed away and heating pause

```text
On schedule                                      [Close]
  [15m] [30m] [1h] [2h]
  [47 min]     until Sun 15:47           [Pause heating]

Heating paused                         [Resume schedule]
Paused until Sun 15:47
```

| Intent | Existing card configuration | Duration defaults |
| --- | --- | --- |
| Temporary Away | `intent: away` (default), existing configured actions | 1h, 4h, 8h30 presets; 30m–48h; initial8h30 |
| Temporary heating pause | `intent: pause`, configured start/resume actions | 15m, 30m, 1h, 2h presets; 1m–48h; initial1h |

- Both intents use one inline duration disclosure, never a modal, backdrop or
  browser-owned countdown. The existing card/resource is extended. Pause uses
  one preset row and one exact-minutes/end-time/apply row. Close in the summary
  is the sole dismissal. Away retains its approximate logarithmic scrubber;
  exact whole minutes and presets remain exact. Show the localised end time
  before Apply, without repeating a duration readout or permanent range prose.
- `duration` optionally configures `min_minutes`, `max_minutes`, `presets` and
  `default_minutes`. Invalid, blank or out-of-range exact input disables Apply
  without silently clamping the typed value. Supported bounds are whole minutes;
  backend policy must independently enforce them.
- A configured backend mode entity, optionally through one attribute, is the
  authority for Schedule, Applying away, Away, Applying pause, Paused, Restoring
  and Fault. Either intent understands both active modes when a backend shares
  one timer. An idle timer never proves Schedule. Contradictory, missing or
  unknown mode-and-timer combinations render as mismatch.
- The existing `active_entity` field remains usable when no mode entity is
  configured. A configured mode entity always takes precedence. Heating paused
  is distinct from a timer's paused state: Away/Paused require an **active**
  timer and valid timer-owned end time. Unknown or paused timers are mismatch.
- Active state shows its authoritative end time and one Cancel/Resume schedule.
  Fault and mismatch offer the same configured recovery action. In-flight progress
  never replaces the reported backend mode. A service response alone does not
  confirm the change: controls wait for reported applying/active/restoring/schedule
  state, with a visible timeout. Apply refusal retains the picker; failed resume
  retains the reported Fault or mismatch. Late request results cannot clear a
  newer request; disconnect/config change clears owned timers and pending work.
- Default titles show the current mode without repeating an extra Away/Heating
  heading. An explicit custom title retains its meaning; the status below it
  still exposes the backend mode. Inputs/buttons use native semantics and44px
  targets. Escape closes the inline picker and returns focus to its disclosure.
- Backend automation owns authorization, whole-home policy, safety setpoints,
  receiver readback, expiry, restart recovery, rollback and schedule restoration.
  The card calls configured actions only and does not assert physical success.

## PC power

- One dense row reports the power switch and its next useful action: wake from
  off, delay while on. The switch state is the only authority for on and off.
- Instant power is one explicit toggle; a delayed shutdown is a separate,
  deliberate sheet offering configured presets and a non-linear 5m–4h scrubber
  that shows both duration and shutdown time before one Start.
- A configured timer entity is the countdown authority. An active timer shows
  its own remaining time and one Cancel; a paused timer or an active countdown
  on an off PC renders as mismatch with one Cancel, never as optimistic
  success. A missing or unavailable optional timer degrades to a plain toggle.
- The card calls the switch's turn_on/turn_off and timer start/cancel only.
  Backend automation owns the shutdown press at expiry, restart recovery, and
  cancellation when the PC drops off the network.

## Visual acceptance

| Release check | Policy |
| --- | --- |
| Dependency audit | Report every severity; fail CI and release for moderate, high or critical findings. The current low-severity [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no patched release and affects the existing build resolver. It remains visible in audit output. |

- The deterministic preview covers dark day history, light week history, the
  inline Away and pause pickers, exact duration, active/resume, backend fault/recovery, and action
  failure at 390 x 844. It also covers the PC power picker, live countdown,
  mismatch, and refused actions.
- Screenshots are CI/release artifacts with SHA-256 metadata, never Git blobs.
- A preview proves layout and the frontend contract. Production acceptance still
  requires the real signed-in route, real entity state, and physical readback
  for mutating controls.

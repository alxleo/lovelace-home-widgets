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
  Adjusting a setpoint never implies that heating is on.
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
  complete duration picker, active/cancel, backend fault/recovery, and action
  failure at 390 x 844. It also covers the PC power picker, live countdown,
  mismatch, and refused actions.
- Screenshots are CI/release artifacts with SHA-256 metadata, never Git blobs.
- A preview proves layout and the frontend contract. Production acceptance still
  requires the real signed-in route, real entity state, and physical readback
  for mutating controls.

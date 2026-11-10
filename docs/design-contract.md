# Design contract

This is the current reusable contract. Replace a rule when measured real-device
evidence proves a better one; do not append conversational history.

## Visual approval and before/after evidence

| Stage | Required decision and evidence |
| --- | --- |
| Scope | A request to fix room groups, membership or behavior does not authorize changing the visual language or replacing controls. Existing implementation is not proof of user approval. |
| Before merge/deployment | Show the human owner comparable before/after views and obtain explicit approval for the exact visual change before it merges, publishes or reaches the household dashboard. Keep the change unmerged until approved. |
| Comparison | Use the same scenario, viewport, theme and relevant state on the current baseline and proposed version. Like gitlab-pane, make what changed easy to inspect; include a focused delta when useful. A polished after-only screen is insufficient. |
| Release notes | Embed the approved before/after images inline in the release notes. Do not upload PNG/JPEG screenshots as downloadable release assets or CI artifact bundles. Runtime assets contain only files the product needs. |
| Privacy | Public widget notes use fictional fixtures. Real household captures belong only in the private consuming repository's release notes; their documentation backing files are outside frontend/runtime assets. |
| Rollback | An explicit request to restore a previous design authorizes that scoped restoration. Preserve subsequent device, integration and membership repairs; do not use rollback as another redesign. |

The household Lights baseline is the earlier Bubble Card controls with existing
room grouping and room-only scenes. The ALX light-row component contract below
describes an available implementation, not approval to replace that baseline.

## Shared interaction principles

```text
Light    [power] [Ceiling · 68% ██████░░] [Adjust]
Heating  On schedule
         Pause [15m] [30m] [1h] [2h] [Custom]
Paused   Until Tue 15:47              [Resume schedule]
```

| Principle | Required design decision |
| --- | --- |
| Keep identity and value together | Put the light name and reported percentage in its brightness bar. Keep heating mode, active end time or requested duration beside the control they explain. Adjusting must not replace the identity with an anonymous slider. |
| Make frequent actions direct | A common pause duration starts with one tap from the resting card. A visible light dims in its named bar. Do not hide the submit action needed for every ordinary use behind Open → choose → Apply. Keep backend authorization and physical safety policy intact. |
| Disclose secondary complexity | Custom duration, colour tuning and room members may expand inline. Progressive disclosure hides secondary complexity while primary useful actions remain visible. Keep one disclosure per purpose and no nested pop-ups in ordinary use. |
| Remove duplication | One room primary row, no duplicate single-bulb child. Do not repeat a heading, duration, state or instruction strip when the same control already communicates it. Use one meaningful dismissal. |
| Make actions recognisable | Label groups and uncommon controls. An icon must explain an action or capability; ornamental icons and unexplained inventories do not earn space. Use native keyboard/touch semantics and 44 px targets for controls. |
| Preserve layout while acting | Preview, pending and confirmation use existing rows. Names and values stay legible at all slider positions. Ordinary progress must not add blank strips, reflow the room or move the next control. A real error may expand inline. |
| Report reality | Distinguish draft, requested and reported state. A service reply is not physical confirmation. Unknown, unavailable, fault and inconsistent state remain explicit; never show a fabricated successful mode or active scene. |
| Reuse the native owner | Prefer existing components, entity capabilities, theme variables and backend actions. Add a component only when the user can forget an existing responsibility; keep household policy and identifiers outside this public bundle. |

| Representative path from the resting view | Earlier interaction | Required path |
| --- | --- | --- |
| Dim an individual light in a room | Open room → open bulb details → adjust (3 interactions) | Expand members if hidden → named brightness bar (2); an already visible light needs 1 gesture |
| Pause for 30 minutes | Open picker → choose 30 m → Apply (3 taps) | Tap 30 m (1 tap) |
| Pause for the default hour | Open picker → Apply (2 taps) | Tap 1 h (1 tap) |
| Use a rare exact pause duration | Reveal duration → enter minutes → Apply | Custom → exact minutes → Apply, all inline |

These principles govern every widget change. The examples describe interaction
structure, not extra headings to copy into the interface. Verify a representative
real path, including action count and reported outcome, rather than accepting a
compact screenshot that still requires repeated navigation.

## Mobile grammar

- Design and accept at 390 x 844 first. Current state and its next useful action
  should not be displaced by decorative headings or large empty cards.
- Prefer one dense explanatory surface to repeated metric strips. Interactive
  controls remain at least 44 px high and use text as well as colour.
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
| Find and dim a light | Name and reported percentage share one native range bar; power has its own 44 px recognisable power button with a small registry/capability indicator. No extra ornamental icon or repeated heading. A theme-aware handle sits behind the label, so 0%/low values cannot cover the name. The percentage stays visible when a long name truncates. |
| Tune white or colour | One labelled **Adjust** disclosure. Identity stays visible. White/Colour changes editor mode without a device command. White tone uses native Kelvin bounds, warm on the left. Colour and Colour strength are labelled keyboard/touch ranges. |
| Control a room | Explicit `group: true` enables a native room `scene_entity` and optional `cards`. HA's native card helpers render member cards. One member is represented by the primary row; multiple members get one separately labelled disclosure. Auto Entities can populate `cards`, retaining dynamic membership ownership. |
| Know whether it worked | Draft percentage says preview inside the same bar. Pending shows reported values with an ellipsis and an aria-live explanation. Neither creates a new status row or changes ordinary card height. A service response is not confirmation: relevant light attributes must change and match the request. Failure expands a useful inline error. |

- Fixed-white dimmers get brightness; on/off plugs get power; white/colour
  controls appear only for supported colour modes. Registry icons take
  precedence over capability defaults. `name_prefix` removes redundant room
  prefixes from native friendly names without changing any entity identifier.
- Unknown readings are labelled **Not reported**. No invented current Kelvin,
  hue or strength is shown. Choosing a colour with unknown/zero strength
  requests 100% strength so the chosen colour is visible; otherwise strength is
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
On schedule
Pause [15m] [30m] [1h] [2h] [Custom]

Custom only:
[47 min]     until Sun 15:47           [Pause heating]

Heating paused                         [Resume schedule]
Until Sun 15:47
```

| Intent | Existing card configuration | Duration defaults |
| --- | --- | --- |
| Temporary Away | `intent: away` (default), existing configured actions | 1 h, 4 h, 8 h 30 m presets; 30 m–48 h; initial 8 h 30 m |
| Temporary heating pause | `intent: pause`, configured start/resume actions | 15 m, 30 m, 1 h, 2 h direct actions; 1 m–48 h custom range; initial 1 h |

- Pause presets are direct native actions, always visible while on schedule.
  The group is labelled **Pause**, and each button includes its duration. One
  click/tap sends exactly one request; there is no picker or Apply for common
  durations. These are action buttons, not selected/pressed options.
- **Custom** expands only exact minutes, localised end time and Apply inline.
  It never repeats the direct presets. Close is the only dismissal. Pending
  keeps the requested duration and reported mode in existing rows, disables
  repeated requests and does not reflow the card.
- Away retains its deliberate choose-and-apply flow and approximate logarithmic
  scrubber. Both intents use the existing resource, with no modal, backdrop,
  browser-owned countdown, duplicate duration readout or permanent range prose.
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
  state, with a visible timeout. A custom Apply refusal retains the picker; a direct refusal retains the visible presets; failed resume
  retains the reported Fault or mismatch. Late request results cannot clear a
  newer request; disconnect/config change clears owned timers and pending work.
- Default titles show the current mode without repeating an extra Away/Heating
  heading. An explicit custom title retains its meaning; the status below it
  still exposes the backend mode. Inputs/buttons use native semantics and 44 px
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
- Approved before/after screenshots are rendered inline in release notes, not
  attached as image assets. Keep private household captures out of this public
  repository and out of the frontend bundle.
- A preview proves layout and the frontend contract. Production acceptance still
  requires the real signed-in route, real entity state, and physical readback
  for mutating controls.

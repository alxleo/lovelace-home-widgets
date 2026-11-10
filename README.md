# Lovelace Home Widgets

Mobile-first Home Assistant dashboard cards distributed as one HACS Dashboard
plugin.

![Fictional mobile heating-history preview](https://github.com/alxleo/lovelace-home-widgets/releases/download/v0.1.0/history-day-now-dark.png)

Visual changes require the human owner's explicit approval of comparable
before/after views before merge or deployment; see the
[design contract](docs/design-contract.md#visual-approval-and-beforeafter-evidence).
Approved comparison images are embedded in [release notes](https://github.com/alxleo/lovelace-home-widgets/releases),
not uploaded as downloadable image assets. Releases attach the installable
JavaScript bundle only.

## Install

Add `https://github.com/alxleo/lovelace-home-widgets` as a HACS custom
repository in the Dashboard category, then install **ALX Home Widgets**. Pin
`v0.1.0` when reproducible installations are required.

The first stable release was promoted only after the consuming Home Assistant
deployment proved the timed-away start/cancel journey and physical receiver
readback. For local evaluation, run `npm run preview` and open
`http://127.0.0.1:4173/preview/`.

The bundle registers:

- `custom:alx-light-row-card` — compact named brightness bars with labelled
  inline White/Colour adjustments and optional room-only scenes/member controls.
- `custom:alx-heating-history-card` — room-by-room temperature,
  target and heating history, with inline weather and opt-in native setpoint controls.
- `custom:alx-timed-away-card` — temporary Away or whole-home heating pause,
  with inline presets, exact minutes and authoritative resume state.
- `custom:alx-pc-power-card` — wake a PC with a magic packet and shut it down
  now or after a configurable delay, with a live countdown and one-cancel abort.

See [`examples/cards.yaml`](examples/cards.yaml) for fictional configuration
and [`docs/design-contract.md`](docs/design-contract.md) for the stable UX
contract. This repository does not contain household configuration or Home
Assistant backend automation.

The history card stays read-only by default. Set `temperature_controls: true`
to show −/+ beside each room target. Native capability, bounds and step are
required; a target change remains pending until Home Assistant reports it.
Use an optional matching `room` label to group series from separate entities.

The light row uses native light capabilities and reported state. Brightness stays
inside the named bar; **Adjust** reveals white tone or colour/strength inline.
Commands are sent on release and stay pending until changed relevant readback
confirms them. Off/unknown/unavailable remain explicit. A room row can bind a
native `select` scene entity and receive member card configurations from Auto
Entities. A single member is represented by the primary row, avoiding duplication.

The timed card keeps Away as its default. Set `intent: pause` to use Pause heating
terminology and defaults of 1–2880 minutes with 15 m / 30 m / 1 h / 2 h presets. Its optional
`duration` object sets `min_minutes`, `max_minutes`, `presets` and `default_minutes`.
Common pause presets start with one tap from the resting card; only Custom
expands an exact-duration form inline. Both intents display the configured backend mode and
timer, including Applying pause/Paused, and call only configured actions. The
backend owns authorization, physical confirmation, expiry and recovery.

## Develop

```bash
npm ci
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/preview/` or append `?view=lights` for light rows or `?view=pause` for the inline heating-pause
fixture. Set `WIDGET_PREVIEW_PORT` when another preview already owns4173. Source comparisons are reproducible via
`npm run sources:fetch` and `npm run sources:search -- "getConfigElement"`.

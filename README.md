# Lovelace Home Widgets

Mobile-first Home Assistant dashboard cards distributed as one HACS Dashboard
plugin.

![Fictional mobile heating-history preview](https://github.com/alxleo/lovelace-home-widgets/releases/download/v0.1.0/history-day-now-dark.png)

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
- `custom:alx-timed-away-card` — a fast, explicit temporary heating-away
  control.
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

## Develop

```bash
npm ci
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/preview/` or append `?view=lights` for the light-row
fixture. Set `WIDGET_PREVIEW_PORT` when another preview already owns4173. Source comparisons are reproducible via
`npm run sources:fetch` and `npm run sources:search -- "getConfigElement"`.

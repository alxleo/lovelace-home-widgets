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

- `custom:alx-heating-history-card` — vertically scrolling temperature,
  demand, and weather history.
- `custom:alx-timed-away-card` — a fast, explicit temporary heating-away
  control.

See [`examples/cards.yaml`](examples/cards.yaml) for fictional configuration
and [`docs/design-contract.md`](docs/design-contract.md) for the stable UX
contract. This repository does not contain household configuration or Home
Assistant backend automation.

## Develop

```bash
npm ci
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/preview/`. Source comparisons are reproducible via
`npm run sources:fetch` and `npm run sources:search -- "getConfigElement"`.

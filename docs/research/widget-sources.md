# Widget source decisions

Research is reproducible from [`source-lock.json`](source-lock.json): run
`npm run sources:fetch`, search with `npm run sources:search -- <term>`, and
render the compact comparison with `npm run sources:board`.

## Useful patterns

- [Boilerplate Card](https://github.com/custom-cards/boilerplate-card/tree/400e118f7add31f5727729f3e92f3314e43e74e4)
  is the implementation skeleton: Lit 3, editor discovery, picker registration,
  Rollup, HACS metadata, and a release asset.
- [Bubble Card](https://github.com/Clooos/Bubble-Card/tree/2c3b43d1168ca05701be15fd96e416609601ecfa)
  proves that one HACS Dashboard repository can own multiple independent cards
  and editors. Its compact control density is useful; its dispatcher and broad
  module system are not needed here.
- [Button Card](https://github.com/custom-cards/button-card/tree/dfa304f93ab73b41011b624960657c568672e9c9)
  contributes release discipline and local HA fixtures. User-supplied JavaScript
  templates are deliberately excluded.
- [ApexCharts Card](https://github.com/RomRider/apexcharts-card/tree/6d3f1e9843f2d58ff73098128e78be8f57a5272b)
  contributes typed history/config thinking. Explicit units, held steps and gap handling inform the room charts. A second
  chart engine would duplicate this card’s existing bounded recorder owner.

## Product references

- [Hive](https://apps.apple.com/gb/app/hive/id712829172): explicit temporary
  state, remaining time, and Stop.
- [tado climate report](https://support.tado.com/en/articles/5086312-where-can-i-find-a-history-of-my-heating-or-cooling-activity): temperature,
  weather, demand, and state events on one inspectable timeline.
- [Netatmo Energy](https://apps.apple.com/gb/app/netatmo-energy/id730893725):
  actual, stepped target, and heating activity in one compact history view.
- [Beestat demo](https://demo.beestat.io/): runtime and weather context without
  pretending that thermostat demand is measured boiler activity.

The links are the visual source of truth. Image bytes are intentionally not
copied into Git.

## Exact visual references inspected

| Visual | Exact upstream screenshot | Adopted | Rejected |
| --- | --- | --- | --- |
| Hive dashboard | [App Store asset](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/64/00/86/6400868f-247f-c0b4-eb69-8fe523e57816/iPhone-6.7-02.jpg/320x480bb.jpg) | Actual temperature, explicit temporary state, remaining time, Stop | Full-screen dial and large empty control area |
| Hive insights | [App Store asset](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/1b/16/c3/1b16c321-575a-b92b-0835-de09407c5d7e/iPhone-6.7-04.png/320x480bb.jpg) | Weather beside heating history | Cost claims and subscription framing |
| tado timeline | [Support asset](https://downloads.intercomcdn.com/i/o/882521328/29215034c4c8a6c4352a1bd3/DEFAULT+%281%29.png) | Room-local inspection, aligned weather context and full-height demand bands | Colour-only states and unrelated traces on a shared indoor/outdoor scale |
| tado demand | [Support asset](https://downloads.intercomcdn.com/i/o/882522652/16230657e19ff806ef208299/DEFAULT+%2B+HR+%281%29.png) | Heating-request context | Implying thermostat demand proves appliance firing |
| Netatmo history | [App Store asset](https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/70/af/fe/70affeed-a9d6-6fa4-6b52-17e71f852e58/pr_source.png/392x696bb.png) | Room-local actual, stepped target and demand aligned in time | Ambiguous axes, redundant controls, and energy claims not supported by the supplied data |

Signed CDN links can expire; the adjacent product/support page remains the
stable provenance. The workshop never downloads these images into the repo.

The room-journal layout is a design judgment informed by these sources: both
rooms remain visible, current values sit beside their own history, and weather
is disclosed inline on its own labelled scale. Native controls are an explicit
opt-in extension; no new dashboard component or chart engine is required.

Native datetime behavior follows Home Assistant’s [frontend locale contract](https://github.com/home-assistant/frontend/blob/dev/src/data/translation.ts)
and [time formatter](https://github.com/home-assistant/frontend/blob/dev/src/common/datetime/format_time.ts):
respect 12/24-hour preference, locale language, and server/local timezone.
The implementation uses the browser’s Intl API and adds no formatting dependency.

## Lighting control decisions

| Primary source | Adopted | Rejected / boundary |
| --- | --- | --- |
| [HA light contract](https://www.home-assistant.io/integrations/light/) and [colour capabilities](https://developers.home-assistant.io/docs/core/entity/light/) | Native percentages, Kelvin bounds, colour modes and reported state | Mired action values, invented supported controls, service acceptance presented as physical confirmation |
| [HA Tile](https://www.home-assistant.io/dashboards/tile/) / [features](https://www.home-assistant.io/dashboards/features/) | Capability-driven inline controls and clear native actions | Stacking every feature under every light, which makes routine room lists too tall |
| [Philips Hue app](https://www.philips-hue.com/en-us/explore-hue/apps/bridge) | Room-level scene and brightness ownership on the same surface | A global scene inventory or scene menu attached to individual bulbs |
| [HA Hue scene selection](https://www.home-assistant.io/integrations/hue/#scene-selection) | Existing native room-bound selectors and their option/state contracts | Copied scene lists or fabricated per-bulb scene entities |
| Bubble Card3.4.3, locked above | Compact name/brightness bar and release-only updates | Real-screen audit showed repeated three-icon inventories and overlays removing the light name. The replacement retains identity and uses labelled native HTML ranges. |
| [Expander7.3.7 source](https://github.com/MelleD/lovelace-expander-card/blob/7.3.7/src/ExpanderCard.svelte) | Inline member disclosure | Centring a room disclosure beside an expanded title-card editor; no alignment override is added. The same light-row owns its own header/member disclosure. |

The optional child-card boundary uses HA's native `loadCardHelpers` /
`createCardElement`; Auto Entities remains the membership owner. The bundle
adds one card, no dependency or separately installed component. Preview icons
are unchanged licensed [Material Design Icons7.4.47](https://www.npmjs.com/package/@mdi/svg/v/7.4.47)
assets under `preview/icons`; production uses Home Assistant's native icon
renderer and registry overrides. Private screenshots and household entities
never enter the public repository.

## Timed heating intent

| Primary source | Adopted | Boundary |
| --- | --- | --- |
| [HA Timer](https://www.home-assistant.io/integrations/timer/) — locked documentation revision in the source board, Timer integration page under `source/_integrations/` | Timer-owned end time; active, idle and paused are distinct; expiry during downtime needs backend recovery | A timer returning idle does not distinguish expiry, cancellation or never-started. It cannot prove heating is following its schedule. |
| [HA custom-card lifecycle](https://contributors.home-assistant.io/frontend/custom-ui/card/) | Report authoritative `hass` updates, native Sections automatic height and disconnect cleanup | Browser timeouts are confirmation feedback, never heating expiry/restore policy. |
| Existing shipped timed-away surface and [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) | One labelled button expands inline controls using `aria-expanded` / `aria-controls`; focus stays in the page | A modal sheet, overlay or second duration component is unnecessary for this small form. |

The direct-preset choice is a design judgment extending the shipped card.
The [WAI button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
distinguishes action buttons from pressed/toggle state; pause presets send
actions immediately, while Custom remains a disclosure. The exact inspected
button/disclosure source paths and revision are locked together in the source
board. Exact minutes
replace precision dragging for pause, while15m/30m/1h/2h serve routine use.
Away retains its approximate scrubber. Primary pause actions are visible on
the resting card; only the exact-duration form is secondary. Pause has no duplicate duration readout,
range prose or second dismissal. Pause
terminology is opt-in; existing Away action/configuration remains valid. Both
active modes are backend states, not inferred from an idle timer or service reply.

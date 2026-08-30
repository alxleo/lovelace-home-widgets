# Widget source decisions

Research is reproducible from [`source-lock.json`](source-lock.json): run
`npm run sources:fetch`, search with `npm run sources:search -- <term>`, and
render the compact comparison with `npm run sources:board`.

## Useful patterns

- [Boilerplate Card](https://github.com/custom-cards/boilerplate-card/tree/400e118f7add31f5727729f3e92f3314e43e74e4)
  is the implementation skeleton: Lit 3, editor discovery, picker registration,
  Rollup, HACS metadata, and a release asset.
- [Bubble Card](https://github.com/Clooos/Bubble-Card/tree/22f052b9d087abb36651a410814ee4c42298ff17)
  proves that one HACS Dashboard repository can own multiple independent cards
  and editors. Its compact control density is useful; its dispatcher and broad
  module system are not needed here.
- [Button Card](https://github.com/custom-cards/button-card/tree/dfa304f93ab73b41011b624960657c568672e9c9)
  contributes release discipline and local HA fixtures. User-supplied JavaScript
  templates are deliberately excluded.
- [ApexCharts Card](https://github.com/RomRider/apexcharts-card/tree/6d3f1e9843f2d58ff73098128e78be8f57a5272b)
  contributes typed history/config thinking. Its chart engine would outweigh
  this small, purpose-built vertical timeline.

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
| tado timeline | [Support asset](https://downloads.intercomcdn.com/i/o/882521328/29215034c4c8a6c4352a1bd3/DEFAULT+%281%29.png) | Weather and state events on one inspectable time coordinate | Colour-only states |
| tado demand | [Support asset](https://downloads.intercomcdn.com/i/o/882522652/16230657e19ff806ef208299/DEFAULT+%2B+HR+%281%29.png) | Heating-request context | Implying thermostat demand proves appliance firing |
| Netatmo history | [App Store asset](https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/70/af/fe/70affeed-a9d6-6fa4-6b52-17e71f852e58/pr_source.png/392x696bb.png) | Actual, stepped target, and activity in one compact chart | Ambiguous unlabelled axes |

Signed CDN links can expire; the adjacent product/support page remains the
stable provenance. The workshop never downloads these images into the repo.

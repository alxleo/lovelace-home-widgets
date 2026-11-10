# Repository contract

- This public repository owns generic Lovelace cards, tests, public examples,
  research provenance, and release artifacts. It never owns household entities,
  dashboard configuration, credentials, heating policy, or authorization.
- All visual changes require the human owner's explicit approval of comparable before/after
  evidence before merge, publication or household deployment. A request about
  groups is not authorization to replace the control design.
- Start visual work from `docs/design-contract.md` and refine that contract in
  place after measured evidence. Its shared interaction principles govern every
  widget change: primary actions stay visible, disclosure is secondary, and
  names/values remain together. Do not add conversational design logs.
- Search exact upstream sources through `tools/source-workshop.mjs`. Update the
  locked revision, inspected paths, and adopted/rejected decisions together.
- Use fictional entities from `examples/public-entities.json`. Run
  `npm run privacy`; generated screenshots stay ignored. Approved release-note backing images
  belong under docs/release-notes, outside runtime assets. Put them inline in notes; do not attach images as downloadable release or CI assets.
- Run `npm run check`. Named scenarios should cover the main journey and the
  important failure, not every implementation branch.
- A preview proves frontend behavior only. Do not publish a stable interactive
  release until the consuming Home Assistant deployment proves authorization,
  recovery, and physical readback.

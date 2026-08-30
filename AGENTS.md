# Repository contract

- This public repository owns generic Lovelace cards, tests, public examples,
  research provenance, and release artifacts. It never owns household entities,
  dashboard configuration, credentials, heating policy, or authorization.
- Start visual work from `docs/design-contract.md` and refine that contract in
  place after measured evidence; do not add conversational design logs.
- Search exact upstream sources through `tools/source-workshop.mjs`. Update the
  locked revision, inspected paths, and adopted/rejected decisions together.
- Use fictional entities from `examples/public-entities.json`. Run
  `npm run privacy`; screenshots stay ignored and are uploaded by CI/releases.
- Run `npm run check`. Named scenarios should cover the main journey and the
  important failure, not every implementation branch.
- A preview proves frontend behavior only. Do not publish a stable interactive
  release until the consuming Home Assistant deployment proves authorization,
  recovery, and physical readback.

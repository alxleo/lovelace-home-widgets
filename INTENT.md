# Intent: public Home Assistant dashboard widgets

## Purpose

Own reusable dashboard code, tests, examples, design decisions, and compact
source research outside any private deployment repository. Homelab consumes a
versioned HACS artifact and supplies only household entities and backend
actions.

## Success

- One public HACS Dashboard bundle registers independent, visually editable
  cards.
- The heating timeline remains dense and useful on a 390 x 844 viewport.
- Day and week select scroll scale rather than limiting available history.
- Interactive cards invoke configurable Home Assistant actions; they never
  implement heating policy or authorization.
- Release evidence contains current screenshots without committing binaries.
- A deterministic check rejects private estate data and unapproved entity IDs.

## Anti-success

- A second copy of household dashboards, automations, users, or secrets.
- A bespoke card framework that ignores established Home Assistant patterns.
- Screenshots or research dumps committed as permanent source.
- A green preview that never exercised recorder paging or action failures.

## Removal criteria

Remove a widget when Home Assistant core or a maintained community card meets
the same design contract with a safe migration path. Preserve only the release
and decision record needed to explain existing configurations.

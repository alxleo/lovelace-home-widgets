# 0001: one HACS Dashboard bundle

Status: accepted

## Decision

Publish one `alx-home-widgets.js` HACS Dashboard artifact that registers small,
independent `alx-*` custom elements. Keep backend integrations and household
automation outside this repository.

## Why

HACS expects one declared category and filename per repository. Related cards
can share types, history paging, editor conventions, preview fixtures, and one
release without becoming one runtime component. This follows the official
boilerplate’s Lit/editor/release pattern and Bubble Card’s multi-card ownership
shape.

## Consequences

- Each card keeps a narrow, fail-closed configuration parser and visual editor.
- The bundle may grow with future dashboard widgets, but not `custom_components`
  integrations or private dashboards.
- Homelab pins a release/checksum and owns real entity/action configuration.
- A card can be removed independently even though release cadence is shared.
- Keep the deterministic minified bundle under `dist/` as well as attaching it
  to releases. HACS validates a branch only when the declared JavaScript exists
  in root/`dist` or a non-prerelease asset; the committed bundle permits safe
  pre-release review without pretending an unverified release is stable. CI
  rebuilds it and rejects drift.
